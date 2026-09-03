import {
  academicDeclineInsight,
  attendanceRate,
  attendanceThresholdInsight,
  budgetThresholdInsight,
  collectionRate,
  cohortPassRate,
  gradeDistribution,
  mean,
  outstandingIncreaseInsight,
  passMarkFromBands,
  passRate,
  percentChange,
  reportAgingBucket,
  scopeBySchool,
} from '../../main/domain/reports'
import {
  buildInsights,
  getAcademicPerformance,
  getAttendanceAnalytics,
  getFinancialSummary,
  type InvoiceFact,
  type StudentSummaryFact,
  type SubjectScoreFact,
} from '../../main/services/reports'

const schoolA = 'school_a'
const schoolB = 'school_b'

function summary(
  overrides: Partial<StudentSummaryFact> & Pick<StudentSummaryFact, 'student_id' | 'average'>
): StudentSummaryFact {
  return {
    school_id: schoolA,
    student_name: 'Student',
    class_id: 'c1',
    class_name: 'Form 3',
    gender: 'female',
    grade: 'B',
    position: 1,
    term_id: 't1',
    term_name: 'Term 1',
    term_number: 1,
    ...overrides,
  }
}

describe('report calculations', () => {
  it('computes overall average and pass rate', () => {
    expect(mean([50, 70, 90])).toBe(70)
    expect(passRate([40, 39, 80], 40)).toBe(66.67)
    expect(cohortPassRate([{ average: 50, grade: 'D' }, { average: 20, grade: 'F' }], 40)).toBe(50)
  })

  it('aggregates class and subject averages and grade distribution', () => {
    const summaries = [
      summary({ student_id: 's1', average: 80, grade: 'A', class_id: 'c1', class_name: 'Form 4' }),
      summary({ student_id: 's2', average: 40, grade: 'E', class_id: 'c1', class_name: 'Form 4' }),
      summary({ student_id: 's3', average: 20, grade: 'F', class_id: 'c2', class_name: 'Form 3' }),
      summary({
        student_id: 'leak',
        average: 99,
        grade: 'A',
        school_id: schoolB,
        class_id: 'x',
        class_name: 'Other School',
      }),
    ]
    const subjects: SubjectScoreFact[] = [
      {
        school_id: schoolA,
        student_id: 's1',
        class_id: 'c1',
        class_name: 'Form 4',
        subject_id: 'math',
        subject_name: 'Mathematics',
        ca_score: 30,
        exam_score: 50,
        total: 80,
        grade: 'A',
      },
      {
        school_id: schoolA,
        student_id: 's2',
        class_id: 'c1',
        class_name: 'Form 4',
        subject_id: 'math',
        subject_name: 'Mathematics',
        ca_score: 10,
        exam_score: 30,
        total: 40,
        grade: 'E',
      },
    ]
    const report = getAcademicPerformance(schoolA, summaries, subjects, 40)
    expect(report.students).toBe(3)
    expect(report.overall_average).toBe(46.67)
    expect(report.by_class.find((c) => c.class_name === 'Form 4')?.average).toBe(60)
    expect(report.by_subject[0].subject_name).toBe('Mathematics')
    expect(report.by_subject[0].average).toBe(60)
    expect(report.grade_distribution).toEqual(gradeDistribution(['A', 'E', 'F']))
    expect(report.best_class?.class_name).toBe('Form 4')
    expect(report.lowest_class?.class_name).toBe('Form 3')
    expect(report.by_class.some((c) => c.class_name === 'Other School')).toBe(false)
  })

  it('uses grading bands for a default pass mark', () => {
    expect(
      passMarkFromBands([
        { grade: 'A', min_score: 80 },
        { grade: 'F', min_score: 0 },
        { grade: 'E', min_score: 40 },
      ])
    ).toBe(40)
  })
})

describe('student / finance / attendance reports', () => {
  it('keeps finance totals school-scoped', () => {
    const invoices: InvoiceFact[] = [
      {
        school_id: schoolA,
        id: 'i1',
        student_id: 's1',
        net_payable: 100_000,
        amount_paid: 40_000,
        balance: 60_000,
        status: 'partially_paid',
        issue_date: '2026-01-10',
        due_date: '2026-08-01',
      },
      {
        school_id: schoolB,
        id: 'i2',
        student_id: 'x',
        net_payable: 999_999,
        amount_paid: 0,
        balance: 999_999,
        status: 'pending',
        issue_date: '2026-01-10',
        due_date: '2026-01-01',
      },
    ]
    const summary = getFinancialSummary(
      schoolA,
      invoices,
      [
        {
          school_id: schoolA,
          amount: 40_000,
          method: 'cash',
          paid_at: '2026-02-01',
          student_id: 's1',
        },
      ],
      [
        {
          school_id: schoolA,
          amount: 10_000,
          category: 'utilities',
          expense_date: '2026-02-01',
        },
      ],
      '2026-08-17'
    )
    expect(summary.billed).toBe(100_000)
    expect(summary.collected).toBe(40_000)
    expect(summary.outstanding).toBe(60_000)
    expect(summary.expenses).toBe(10_000)
    expect(summary.net).toBe(30_000)
    expect(summary.collection_rate).toBe(40)
    expect(summary.aging.aging_30).toBe(60_000)
  })

  it('computes attendance percentage and at-risk students', () => {
    const marks = [
      {
        school_id: schoolA,
        student_id: 's1',
        student_name: 'Ada',
        class_id: 'c1',
        class_name: 'Form 1',
        status: 'present',
        session_date: '2026-08-01',
      },
      {
        school_id: schoolA,
        student_id: 's1',
        student_name: 'Ada',
        class_id: 'c1',
        class_name: 'Form 1',
        status: 'absent',
        session_date: '2026-08-02',
      },
      {
        school_id: schoolA,
        student_id: 's1',
        student_name: 'Ada',
        class_id: 'c1',
        class_name: 'Form 1',
        status: 'absent',
        session_date: '2026-08-03',
      },
      {
        school_id: schoolA,
        student_id: 's1',
        student_name: 'Ada',
        class_id: 'c1',
        class_name: 'Form 1',
        status: 'late',
        session_date: '2026-08-04',
      },
      {
        school_id: schoolB,
        student_id: 'other',
        student_name: 'Leak',
        class_id: 'z',
        class_name: 'Form X',
        status: 'absent',
        session_date: '2026-08-01',
      },
    ]
    const report = getAttendanceAnalytics(schoolA, marks, 75)
    expect(report.overall_rate).toBe(50)
    expect(report.at_risk).toHaveLength(1)
    expect(report.at_risk[0].student_name).toBe('Ada')
    expect(report.by_class[0].students).toBe(1)
    expect(report.at_risk.some((s) => s.student_name === 'Leak')).toBe(false)
    expect(attendanceRate({ present: 1, late: 1, absent: 2 })).toBe(50)
  })
})

describe('insights engine', () => {
  it('detects academic decline from real averages', () => {
    const hit = academicDeclineInsight({
      entityName: 'Form 4 General',
      entityId: 'c4',
      currentAvg: 52.8,
      previousAvg: 60,
      generatedAt: '2026-08-17',
    })
    expect(hit?.severity).toBe('WARNING')
    expect(hit?.description).toMatch(/12%/)
  })

  it('detects outstanding fee increase', () => {
    const hit = outstandingIncreaseInsight({
      current: 118_000,
      previous: 100_000,
      generatedAt: '2026-08-17',
    })
    expect(hit?.description).toMatch(/18%/)
  })

  it('detects attendance threshold and budget pressure', () => {
    expect(
      attendanceThresholdInsight({
        count: 14,
        threshold: 75,
        generatedAt: '2026-08-17',
      })?.description
    ).toMatch(/14 students/)
    expect(
      budgetThresholdInsight({
        categoryName: 'Maintenance',
        categoryKey: 'maintenance',
        utilization: 91,
        generatedAt: '2026-08-17',
      })?.description
    ).toMatch(/91%/)
  })

  it('does not invent insights when numbers are stable', () => {
    const insights = buildInsights({
      generatedAt: '2026-08-17',
      classAverages: [{ class_id: 'c1', class_name: 'Form 1', current: 61, previous: 60 }],
      outstandingCurrent: 100,
      outstandingPrevious: 100,
      atRiskCount: 0,
      attendanceThreshold: 75,
      budgets: [{ name: 'Utilities', key: 'utilities', utilization: 20 }],
    })
    expect(insights).toHaveLength(0)
  })
})

describe('school isolation', () => {
  it('never returns another school’s rows', () => {
    const mixed = [
      { school_id: schoolA, n: 1 },
      { school_id: schoolB, n: 2 },
    ]
    expect(scopeBySchool(mixed, schoolA)).toEqual([{ school_id: schoolA, n: 1 }])
  })
})

describe('helpers', () => {
  it('places overdue invoices into 90+ aging', () => {
    expect(reportAgingBucket('2026-01-01', '2026-08-17')).toBe('aging_90')
    expect(reportAgingBucket('2026-08-20', '2026-08-17')).toBe('current')
  })

  it('treats undeposited cash as collected minus deposited, never negative', () => {
    const undeposited = (cash: number, deposited: number) =>
      Math.max(0, cash - deposited)
    expect(undeposited(500_000, 450_000)).toBe(50_000)
    expect(undeposited(100, 150)).toBe(0)
    expect(collectionRate(80, 100)).toBe(80)
    expect(percentChange(88, 100)).toBe(-12)
  })
})
