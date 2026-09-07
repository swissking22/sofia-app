import {
  normalizeScore,
  calculateCAAverage,
  calculateSubjectMark,
  calculateWeightedSubjectMark,
  calculateTermAverage,
  determinePassFail,
  calculateSubjectResult,
  validateClassCalculation,
  calculateClassResults,
} from '../../main/services/results/result-calculation.service'
import {
  cameroonStandardSecondary20,
} from '../../main/domain/results-calculation'

describe('Result Calculation Formula & Pipeline Tests', () => {
  // TEST 1
  it('TEST 1: Calculates CA average of sequences and 40% CA + 60% Exam subject mark', () => {
    // Sequences: 12, 15, 14 -> CA Average: 13.6667
    const seqScores = [
      { name: 'Seq 1', raw: 12, max: 20 },
      { name: 'Seq 2', raw: 15, max: 20 },
      { name: 'Seq 3', raw: 14, max: 20 },
    ]
    const ca = calculateCAAverage(seqScores, { targetScale: 20, method: 'simple_average' })
    expect(ca.average).toBeCloseTo(13.6667, 3)

    // Exam: 16 -> Subject Mark: (13.6667 * 0.40) + (16 * 0.60) = 5.4667 + 9.60 = 15.0667
    const subjectMark = calculateSubjectMark(ca.average, 16, 40, 60)
    expect(subjectMark.subjectMark).toBeCloseTo(15.0667, 3)

    // Check contribution breakdown
    expect(subjectMark.caContribution).toBeCloseTo(5.4667, 3)
    expect(subjectMark.examContribution).toBeCloseTo(9.6, 2)
  })

  // TEST 2
  it('TEST 2: Calculates weighted subject mark from subject mark and coefficient', () => {
    // Subject Mark: 15, Coefficient: 5 -> Expected Weighted Mark: 75
    const weighted = calculateWeightedSubjectMark(15, 5)
    expect(weighted).toBe(75)
  })

  // TEST 3
  it('TEST 3: Calculates total weighted marks, total coefficients, and term average', () => {
    // Subjects:
    // Math: 15 × 5 = 75
    // English: 13 × 3 = 39
    // Physics: 14 × 4 = 56
    // History: 12 × 2 = 24
    // Total Weighted Marks: 194
    // Total Coefficients: 14
    // Expected Term Average: 13.8571/20
    const subjects = [
      { weightedMark: 15 * 5, coefficient: 5 },
      { weightedMark: 13 * 3, coefficient: 3 },
      { weightedMark: 14 * 4, coefficient: 4 },
      { weightedMark: 12 * 2, coefficient: 2 },
    ]

    const result = calculateTermAverage(subjects)
    expect(result.totalWeightedMarks).toBe(194)
    expect(result.totalCoefficients).toBe(14)
    expect(result.termAverage).toBeCloseTo(13.8571, 3)
  })

  // TEST 4
  it('TEST 4: Correctly determines pass/fail based on configurable pass mark', () => {
    // Default pass mark: 10/20
    expect(determinePassFail(10, 10)).toBe('PASSED')
    expect(determinePassFail(14.06, 10)).toBe('PASSED')
    expect(determinePassFail(9.99, 10)).toBe('FAILED')
    expect(determinePassFail(0, 10)).toBe('FAILED')

    // School configuring a stricter pass mark (e.g. 11/20)
    expect(determinePassFail(10.5, 11)).toBe('FAILED')
    expect(determinePassFail(11, 11)).toBe('PASSED')

    // School configuring a lenient pass mark (e.g. 8/20)
    expect(determinePassFail(8.5, 8)).toBe('PASSED')
    expect(determinePassFail(7.9, 8)).toBe('FAILED')
  })

  // TEST 5
  it('TEST 5: Multi-tenant school isolation: School A (40/60) and School B (30/70)', () => {
    const schoolAConfig = cameroonStandardSecondary20({
      ca_weight: 40,
      exam_weight: 60,
      pass_mark: 10,
    })

    const schoolBConfig = cameroonStandardSecondary20({
      ca_weight: 30,
      exam_weight: 70,
      pass_mark: 12, // School B requires 12/20 to pass
    })

    const scores = {
      caAverage: 12, // 12/20
      examScore: 16, // 16/20
    }

    // School A: (12 * 0.40) + (16 * 0.60) = 4.8 + 9.6 = 14.4
    const markA = calculateSubjectMark(
      scores.caAverage,
      scores.examScore,
      schoolAConfig.ca_weight!,
      schoolAConfig.exam_weight!
    )
    expect(markA.subjectMark).toBeCloseTo(14.4, 4)

    // School B: (12 * 0.30) + (16 * 0.70) = 3.6 + 11.2 = 14.8
    const markB = calculateSubjectMark(
      scores.caAverage,
      scores.examScore,
      schoolBConfig.ca_weight!,
      schoolBConfig.exam_weight!
    )
    expect(markB.subjectMark).toBeCloseTo(14.8, 4)

    // Different pass mark evaluation
    expect(determinePassFail(11.5, schoolAConfig.pass_mark)).toBe('PASSED')
    expect(determinePassFail(11.5, schoolBConfig.pass_mark)).toBe('FAILED')
  })

  // TEST 6
  it('TEST 6: Versioning & historical stability when coefficients change', () => {
    const config = cameroonStandardSecondary20()
    const subjectsList = [
      { id: 'math', name: 'Mathematics' },
      { id: 'eng', name: 'English' },
    ]

    const studentScores = new Map<string, { sequences: any[]; exam: any }>()
    studentScores.set('student-1:math', {
      sequences: [{ name: 'Seq 1', raw: 15, max: 20 }],
      exam: { raw: 15, max: 20 },
    })
    studentScores.set('student-1:eng', {
      sequences: [{ name: 'Seq 1', raw: 10, max: 20 }],
      exam: { raw: 10, max: 20 },
    })

    // Run 1: Mathematics = 5, English = 3
    const coeffsRun1 = new Map<string, number>([
      ['math', 5],
      ['eng', 3],
    ])

    const outcomeRun1 = calculateClassResults({
      classId: 'class-1',
      termId: 'term-1',
      academicYearId: 'year-1',
      config,
      students: [{ id: 'student-1', name: 'Alice' }],
      subjects: subjectsList,
      coefficientsMap: coeffsRun1,
      scoresLookup: studentScores,
    })

    const studentRun1 = outcomeRun1.student_results[0]
    // Math: 15 * 5 = 75. Eng: 10 * 3 = 30. Total: 105. Total Coeffs: 8. Avg: 105 / 8 = 13.125 -> 13.13
    expect(studentRun1.total_weighted_marks).toBe(105)
    expect(studentRun1.total_coefficients).toBe(8)
    expect(studentRun1.term_average).toBe(13.125)
    expect(studentRun1.term_average_rounded).toBe(13.13)

    // Later, school updates coefficient of Math to 4:
    const coeffsRun2 = new Map<string, number>([
      ['math', 4],
      ['eng', 3],
    ])

    const outcomeRun2 = calculateClassResults({
      classId: 'class-1',
      termId: 'term-1',
      academicYearId: 'year-1',
      config,
      students: [{ id: 'student-1', name: 'Alice' }],
      subjects: subjectsList,
      coefficientsMap: coeffsRun2,
      scoresLookup: studentScores,
    })

    const studentRun2 = outcomeRun2.student_results[0]
    // Math: 15 * 4 = 60. Eng: 10 * 3 = 30. Total: 90. Total Coeffs: 7. Avg: 90 / 7 = 12.857 -> 12.86
    expect(studentRun2.total_weighted_marks).toBe(90)
    expect(studentRun2.total_coefficients).toBe(7)
    expect(studentRun2.term_average_rounded).toBe(12.86)

    // Crucially, historical Run 1 results retained their values:
    expect(studentRun1.term_average_rounded).toBe(13.13)
    expect(studentRun1.total_weighted_marks).toBe(105)
  })

  // TEST 7
  it('TEST 7: Assessment normalization from different maximum marks to 20 scale', () => {
    // Sequence entered as 35/50 -> 14/20
    const normalizedSeq = normalizeScore(35, 50, 20)
    expect(normalizedSeq).toBe(14)

    // Exam entered as 75/100 -> 15/20
    const normalizedExam = normalizeScore(75, 100, 20)
    expect(normalizedExam).toBe(15)

    // Full calculation:
    // CA Average = 14/20. Exam = 15/20.
    // CA (40%): 14 * 0.40 = 5.6
    // Exam (60%): 15 * 0.60 = 9.0
    // Subject Mark: 5.6 + 9.0 = 14.6/20
    const subjectResult = calculateSubjectResult({
      subjectId: 'math',
      subjectName: 'Mathematics',
      sequences: [{ name: 'Seq 1', raw: 35, max: 50 }],
      exam: { raw: 75, max: 100 },
      coefficient: 5,
      caWeight: 40,
      examWeight: 60,
      targetScale: 20,
    })

    expect(subjectResult.ca_average).toBe(14)
    expect(subjectResult.exam_normalized).toBe(15)
    expect(subjectResult.ca_contribution).toBeCloseTo(5.6, 2)
    expect(subjectResult.exam_contribution).toBeCloseTo(9, 2)
    expect(subjectResult.subject_mark).toBeCloseTo(14.6, 2)
    expect(subjectResult.weighted_mark).toBe(73) // 14.6 * 5 = 73
  })

  // EDGE CASES & VALIDATIONS
  describe('Missing & Absent Policies and Pre-calculation Validation', () => {
    it('handles absent sequence by excluding it by default', () => {
      const scores = [
        { name: 'Seq 1', raw: 12, max: 20, status: 'recorded' as const },
        { name: 'Seq 2', raw: null, max: 20, status: 'absent' as const },
        { name: 'Seq 3', raw: 14, max: 20, status: 'recorded' as const },
      ]

      // Default: exclude absent -> (12 + 14) / 2 = 13/20
      const excluded = calculateCAAverage(scores, { absentPolicy: 'exclude' })
      expect(excluded.average).toBe(13)
      expect(excluded.details.find((s) => s.status === 'absent')?.included).toBe(false)

      // When configured as zero -> (12 + 0 + 14) / 3 = 26 / 3 = 8.6667
      const asZero = calculateCAAverage(scores, { absentPolicy: 'zero' })
      expect(asZero.average).toBeCloseTo(8.6667, 3)
    })

    it('validates assessment weights total 100% and catches missing coefficients', () => {
      const invalidWeightsConfig = cameroonStandardSecondary20({
        ca_weight: 40,
        exam_weight: 50, // Only 90%
      })

      const validation1 = validateClassCalculation({
        config: invalidWeightsConfig,
        students: [{ id: 'student-1' }],
        subjects: [{ id: 'math', name: 'Mathematics' }],
        coefficientsMap: new Map([['math', 5]]),
        caAssessments: [],
        examPapers: [],
      })

      expect(validation1.ok).toBe(false)
      expect(validation1.blocking_issues.some((i) => i.code === 'WEIGHTS_NOT_100')).toBe(true)

      // Missing coefficient warning
      const validWeightsConfig = cameroonStandardSecondary20()
      const validation2 = validateClassCalculation({
        config: validWeightsConfig,
        students: [{ id: 'student-1' }],
        subjects: [
          { id: 'math', name: 'Mathematics' },
          { id: 'phy', name: 'Physics' },
        ],
        coefficientsMap: new Map([['math', 5]]), // Physics is missing
        caAssessments: [],
        examPapers: [],
      })

      expect(validation2.ok).toBe(true)
      expect(validation2.warnings.some((w) => w.code === 'MISSING_COEFFICIENT')).toBe(true)
    })
  })
})
