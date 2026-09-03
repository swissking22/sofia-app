import { round2 } from '../domain/finance'
import {
  attendanceRate,
  budgetThresholdInsight,
  collectionRate,
  cohortPassRate,
  emptyAging,
  gradeDistribution,
  mean,
  academicDeclineInsight,
  attendanceThresholdInsight,
  outstandingIncreaseInsight,
  reportAgingBucket,
  scopeBySchool,
  type GeneratedInsight,
} from '../domain/reports'

export type ReportFilters = {
  academic_year_id?: string | null
  term_id?: string | null
  department_id?: string | null
  class_id?: string | null
  subject_id?: string | null
  gender?: string | null
  assessment?: 'results' | 'ca' | 'exam' | null
  from?: string | null
  to?: string | null
  fee_type?: string | null
  payment_method?: string | null
  expense_category?: string | null
  student_id?: string | null
  attendance_threshold?: number | null
}

export type StudentSummaryFact = {
  school_id: string
  student_id: string
  student_name: string
  class_id: string
  class_name: string
  gender: string | null
  average: number
  grade: string | null
  position: number | null
  term_id: string | null
  term_name: string | null
  term_number: number | null
}

export type SubjectScoreFact = {
  school_id: string
  student_id: string
  class_id: string
  class_name: string
  subject_id: string
  subject_name: string
  ca_score: number
  exam_score: number
  total: number
  grade: string | null
}

export function filterAcademic(
  schoolId: string,
  rows: StudentSummaryFact[],
  filters: ReportFilters = {}
): StudentSummaryFact[] {
  return scopeBySchool(rows, schoolId).filter((r) => {
    if (filters.class_id && r.class_id !== filters.class_id) return false
    if (filters.term_id && r.term_id !== filters.term_id) return false
    if (filters.gender && (r.gender || '').toLowerCase() !== filters.gender.toLowerCase())
      return false
    if (filters.student_id && r.student_id !== filters.student_id) return false
    return true
  })
}

export function getAcademicPerformance(
  schoolId: string,
  summaries: StudentSummaryFact[],
  subjects: SubjectScoreFact[],
  passMark: number,
  filters: ReportFilters = {}
) {
  const rows = filterAcademic(schoolId, summaries, filters)
  const subjectRows = scopeBySchool(subjects, schoolId).filter((s) => {
    if (filters.class_id && s.class_id !== filters.class_id) return false
    if (filters.subject_id && s.subject_id !== filters.subject_id) return false
    if (filters.student_id && s.student_id !== filters.student_id) return false
    return true
  })

  const byClass = new Map<string, StudentSummaryFact[]>()
  for (const r of rows) {
    const list = byClass.get(r.class_id) ?? []
    list.push(r)
    byClass.set(r.class_id, list)
  }

  const classRows = [...byClass.entries()].map(([class_id, list]) => {
    const averages = list.map((r) => r.average)
    return {
      class_id,
      class_name: list[0]?.class_name ?? '—',
      students: list.length,
      average: mean(averages),
      pass_rate: cohortPassRate(list, passMark),
      highest: averages.length ? Math.max(...averages) : 0,
      lowest: averages.length ? Math.min(...averages) : 0,
    }
  })
  classRows.sort((a, b) => b.average - a.average)

  const bySubject = new Map<string, SubjectScoreFact[]>()
  for (const s of subjectRows) {
    const list = bySubject.get(s.subject_id) ?? []
    list.push(s)
    bySubject.set(s.subject_id, list)
  }
  const subjectStats = [...bySubject.entries()].map(([subject_id, list]) => {
    const totals = list.map((r) => r.total)
    return {
      subject_id,
      subject_name: list[0]?.subject_name ?? '—',
      average: mean(totals),
      pass_rate: cohortPassRate(
        list.map((r) => ({ average: r.total, grade: r.grade })),
        passMark
      ),
      highest: totals.length ? Math.max(...totals) : 0,
      lowest: totals.length ? Math.min(...totals) : 0,
    }
  })
  subjectStats.sort((a, b) => a.average - b.average)

  const byTerm = new Map<string, number[]>()
  const termMeta = new Map<string, { name: string; number: number }>()
  for (const r of rows) {
    const key = r.term_id || r.term_name || 'unknown'
    const list = byTerm.get(key) ?? []
    list.push(r.average)
    byTerm.set(key, list)
    termMeta.set(key, {
      name: r.term_name || 'Term',
      number: r.term_number || 99,
    })
  }
  const trend = [...byTerm.entries()]
    .map(([term_id, values]) => ({
      term_id,
      term_name: termMeta.get(term_id)?.name ?? 'Term',
      term_number: termMeta.get(term_id)?.number ?? 99,
      average: mean(values),
    }))
    .sort((a, b) => a.term_number - b.term_number)

  const ranked = [...rows]
    .sort((a, b) => b.average - a.average)
    .slice(0, 50)
    .map((r, i) => ({
      position: r.position || i + 1,
      student_id: r.student_id,
      student_name: r.student_name,
      class_id: r.class_id,
      class_name: r.class_name,
      average: r.average,
      grade: r.grade,
    }))

  const best = classRows[0] ?? null
  const lowest = classRows.length ? classRows[classRows.length - 1] : null
  const weakSubject = subjectStats[0] ?? null

  return {
    overall_average: mean(rows.map((r) => r.average)),
    pass_rate: cohortPassRate(rows, passMark),
    students: rows.length,
    subjects: bySubject.size,
    best_class: best,
    lowest_class: lowest,
    weak_subject: weakSubject,
    by_class: classRows,
    by_subject: subjectStats,
    trend,
    grade_distribution: gradeDistribution(rows.map((r) => r.grade)),
    ranking: ranked,
    pass_mark: passMark,
  }
}

export type InvoiceFact = {
  school_id: string
  id: string
  student_id: string
  student_name?: string | null
  class_id?: string | null
  class_name?: string | null
  academic_term_id?: string | null
  term_name?: string | null
  net_payable: number
  amount_paid: number
  balance: number
  status: string
  issue_date: string
  due_date: string | null
}

export type PaymentFact = {
  school_id: string
  amount: number
  method: string
  paid_at: string
  student_id: string
  class_id?: string | null
  class_name?: string | null
  academic_term_id?: string | null
  term_name?: string | null
  fee_type?: string | null
}

export type ExpenseFact = {
  school_id: string
  amount: number
  category: string
  expense_date: string
}

export function getFinancialSummary(
  schoolId: string,
  invoices: InvoiceFact[],
  payments: PaymentFact[],
  expenses: ExpenseFact[],
  today: string
) {
  const inv = scopeBySchool(invoices, schoolId).filter(
    (i) => i.status !== 'cancelled'
  )
  const pays = scopeBySchool(payments, schoolId)
  const exps = scopeBySchool(expenses, schoolId)
  const billed = round2(inv.reduce((s, i) => s + i.net_payable, 0))
  const collected = round2(pays.reduce((s, p) => s + p.amount, 0))
  const outstandingRows = inv.filter((i) => i.balance > 0.0001)
  const outstanding = round2(
    outstandingRows.reduce((s, i) => s + i.balance, 0)
  )
  const expenseTotal = round2(exps.reduce((s, e) => s + e.amount, 0))
  const aging = emptyAging()
  const owing = new Set<string>()
  for (const i of outstandingRows) {
    aging[reportAgingBucket(i.due_date, today)] = round2(
      aging[reportAgingBucket(i.due_date, today)] + i.balance
    )
    owing.add(i.student_id)
  }
  return {
    billed,
    collected,
    outstanding,
    expenses: expenseTotal,
    net: round2(collected - expenseTotal),
    collection_rate: collectionRate(collected, billed),
    students_owing: owing.size,
    aging,
  }
}

export function revenueBreakdowns(schoolId: string, payments: PaymentFact[]) {
  const pays = scopeBySchool(payments, schoolId)
  const group = (keyFn: (p: PaymentFact) => string) => {
    const map = new Map<string, number>()
    for (const p of pays) {
      const k = keyFn(p) || 'Other'
      map.set(k, round2((map.get(k) || 0) + p.amount))
    }
    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
  }
  return {
    by_term: group((p) => p.term_name || 'Unassigned'),
    by_class: group((p) => p.class_name || 'Unassigned'),
    by_fee_type: group((p) => p.fee_type || 'Other'),
    by_method: group((p) => p.method || 'other'),
  }
}

export function expenseBreakdowns(schoolId: string, expenses: ExpenseFact[]) {
  const rows = scopeBySchool(expenses, schoolId)
  const byCategory = new Map<string, number>()
  const byMonth = new Map<string, number>()
  for (const e of rows) {
    byCategory.set(e.category, round2((byCategory.get(e.category) || 0) + e.amount))
    const month = e.expense_date.slice(0, 7)
    byMonth.set(month, round2((byMonth.get(month) || 0) + e.amount))
  }
  return {
    by_category: [...byCategory.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount),
    by_month: [...byMonth.entries()]
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  }
}

export type AttendanceMarkFact = {
  school_id: string
  student_id: string
  student_name: string
  class_id: string
  class_name: string
  status: string
  session_date: string
}

export function getAttendanceAnalytics(
  schoolId: string,
  marks: AttendanceMarkFact[],
  threshold: number
) {
  const rows = scopeBySchool(marks, schoolId)
  const tally = { present: 0, absent: 0, late: 0, excused: 0 }
  const byStudent = new Map<string, AttendanceMarkFact[]>()
  const byClass = new Map<string, AttendanceMarkFact[]>()
  const byDay = new Map<string, AttendanceMarkFact[]>()
  for (const m of rows) {
    const status = m.status as keyof typeof tally
    if (status in tally) tally[status] += 1
    else if (m.status === 'present') tally.present += 1
    const sl = byStudent.get(m.student_id) ?? []
    sl.push(m)
    byStudent.set(m.student_id, sl)
    const cl = byClass.get(m.class_id) ?? []
    cl.push(m)
    byClass.set(m.class_id, cl)
    const day = m.session_date.slice(0, 10)
    const dl = byDay.get(day) ?? []
    dl.push(m)
    byDay.set(day, dl)
  }

  const ratesFor = (list: AttendanceMarkFact[]) => {
    const present = list.filter((x) => x.status === 'present').length
    const late = list.filter((x) => x.status === 'late').length
    const absent = list.filter((x) => x.status === 'absent').length
    const excused = list.filter((x) => x.status === 'excused').length
    const rate = attendanceRate({ present, late, absent, excused })
    return { present, late, absent, excused, rate, total: list.length }
  }

  const classRows = [...byClass.entries()].map(([class_id, list]) => {
    const stats = ratesFor(list)
    const studentCount = new Set(list.map((x) => x.student_id)).size
    return {
      class_id,
      class_name: list[0]?.class_name ?? '—',
      students: studentCount,
      attendance_rate: stats.rate,
      absence_rate: round2(100 - stats.rate),
    }
  })
  classRows.sort((a, b) => a.attendance_rate - b.attendance_rate)

  const atRisk = [...byStudent.entries()]
    .map(([student_id, list]) => {
      const stats = ratesFor(list)
      return {
        student_id,
        student_name: list[0]?.student_name ?? '—',
        class_id: list[0]?.class_id ?? '',
        class_name: list[0]?.class_name ?? '—',
        attendance_pct: stats.rate,
        days_absent: stats.absent,
        days_late: stats.late,
        days_present: stats.present,
      }
    })
    .filter((s) => s.attendance_pct < threshold)
    .sort((a, b) => a.attendance_pct - b.attendance_pct)

  const overall = ratesFor(rows)
  const daily = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, rate: ratesFor(list).rate }))

  const weeklyMap = new Map<string, number[]>()
  for (const d of daily) {
    const dt = new Date(`${d.date}T00:00:00`)
    const year = dt.getUTCFullYear()
    const onejan = new Date(Date.UTC(year, 0, 1))
    const week = Math.ceil(((dt.getTime() - onejan.getTime()) / 86400000 + onejan.getUTCDay() + 1) / 7)
    const key = `${year}-W${String(week).padStart(2, '0')}`
    const arr = weeklyMap.get(key) ?? []
    arr.push(d.rate)
    weeklyMap.set(key, arr)
  }
  const weekly = [...weeklyMap.entries()].map(([week, values]) => ({
    week,
    rate: mean(values),
  }))

  const monthlyMap = new Map<string, number[]>()
  for (const d of daily) {
    const key = d.date.slice(0, 7)
    const arr = monthlyMap.get(key) ?? []
    arr.push(d.rate)
    monthlyMap.set(key, arr)
  }
  const monthly = [...monthlyMap.entries()].map(([month, values]) => ({
    month,
    rate: mean(values),
  }))

  return {
    overall_rate: overall.rate,
    present: overall.present,
    absent: overall.absent,
    late: overall.late,
    excused: overall.excused,
    at_risk_count: atRisk.length,
    threshold,
    by_class: classRows,
    at_risk: atRisk,
    daily,
    weekly,
    monthly,
  }
}

export function getStudentAcademicSlice(
  schoolId: string,
  studentId: string,
  summaries: StudentSummaryFact[],
  subjects: SubjectScoreFact[]
) {
  const mine = filterAcademic(schoolId, summaries, { student_id: studentId }).filter(
    (r) => r.student_id === studentId
  )
  const subjectRows = scopeBySchool(subjects, schoolId).filter(
    (s) => s.student_id === studentId
  )
  return { summaries: mine, subjects: subjectRows }
}

export function buildInsights(input: {
  generatedAt: string
  classAverages: Array<{
    class_id: string
    class_name: string
    current: number
    previous: number
  }>
  outstandingCurrent: number
  outstandingPrevious: number
  atRiskCount: number
  attendanceThreshold: number
  budgets: Array<{ name: string; key: string; utilization: number }>
}): GeneratedInsight[] {
  const insights: GeneratedInsight[] = []
  for (const c of input.classAverages) {
    const hit = academicDeclineInsight({
      entityName: c.class_name,
      entityId: c.class_id,
      currentAvg: c.current,
      previousAvg: c.previous,
      generatedAt: input.generatedAt,
    })
    if (hit) insights.push(hit)
  }
  const fee = outstandingIncreaseInsight({
    current: input.outstandingCurrent,
    previous: input.outstandingPrevious,
    generatedAt: input.generatedAt,
  })
  if (fee) insights.push(fee)
  const attendance = attendanceThresholdInsight({
    count: input.atRiskCount,
    threshold: input.attendanceThreshold,
    generatedAt: input.generatedAt,
  })
  if (attendance) insights.push(attendance)
  for (const b of input.budgets) {
    const hit = budgetThresholdInsight({
      categoryName: b.name,
      categoryKey: b.key,
      utilization: b.utilization,
      generatedAt: input.generatedAt,
    })
    if (hit) insights.push(hit)
  }
  const rank: Record<GeneratedInsight['severity'], number> = {
    CRITICAL: 0,
    WARNING: 1,
    INFO: 2,
  }
  return insights.sort((a, b) => rank[a.severity] - rank[b.severity])
}
