import {
  gradeForScore,
  hashConfig,
  rankStudents,
  roundValue,
  validateWeights,
  type CalculationConfig,
  type GradeBandConfig,
  type GroupMethod,
  type MissingPolicy,
  type AbsentPolicy,
  type RoundingConfig,
  type ScoreStatus,
} from '../../domain/results-calculation'

export interface SequenceScoreInput {
  name?: string
  raw: number | null
  max?: number
  status?: ScoreStatus
  weight?: number
}

export interface ExamScoreInput {
  name?: string
  raw: number | null
  max?: number
  status?: ScoreStatus
}

export interface SequenceBreakdownItem {
  name: string
  raw: number | null
  max: number
  normalized: number | null
  status: ScoreStatus
  included: boolean
  treatAsZero: boolean
}

export interface SubjectResultBreakdown {
  subject_id: string
  subject_name?: string
  sequence_details: SequenceBreakdownItem[]
  ca_average: number | null
  ca_weight: number
  ca_contribution: number | null
  exam_raw: number | null
  exam_max: number
  exam_normalized: number | null
  exam_weight: number
  exam_contribution: number | null
  subject_mark: number | null
  subject_mark_rounded: number | null
  coefficient: number
  weighted_mark: number | null
  weighted_mark_rounded: number | null
  grade: string | null
  grade_point: number | null
  remark: string
  passed: boolean | null
  incomplete: boolean
  scale: number
}

export interface StudentTermResult {
  student_id: string
  student_name?: string
  student_code?: string | null
  subject_results: SubjectResultBreakdown[]
  total_weighted_marks: number
  total_coefficients: number
  term_average: number | null
  term_average_rounded: number | null
  grade: string | null
  remark: string | null
  status: 'PASSED' | 'FAILED' | 'INCOMPLETE'
  position: number | null
  passed_subjects: number
  failed_subjects: number
  incomplete_subjects: number
  gpa: number | null
  promotion_outcome: string
}

export interface ClassResultsOutcome {
  class_id: string
  term_id: string | null
  academic_year_id: string | null
  config: CalculationConfig
  config_hash: string
  total_students: number
  processed_students: number
  incomplete_students: number
  passed_students: number
  failed_students: number
  class_average: number | null
  highest_average: number | null
  lowest_average: number | null
  student_results: StudentTermResult[]
}

export interface CalculationValidationIssue {
  type: 'blocking' | 'warning'
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface CalculationValidationResult {
  ok: boolean
  blocking_issues: CalculationValidationIssue[]
  warnings: CalculationValidationIssue[]
  total_students: number
  total_subjects: number
  assessment_weights_total: number
}

/**
 * Normalizes a score from its maximum to the target scale (e.g. 20/20 or 100/100).
 */
export function normalizeScore(
  raw: number,
  max: number,
  targetScale: number = 20
): number {
  if (!max || max <= 0) return 0
  return (raw / max) * targetScale
}

/**
 * Resolves score status fallback.
 */
export function resolveScoreStatus(
  raw: number | null,
  status?: ScoreStatus
): ScoreStatus {
  if (status && status !== 'recorded') return status
  if (raw == null) return 'missing'
  return 'recorded'
}

/**
 * Step 1: Calculate the Average of Sequences / Continuous Assessment.
 * Supports flexible sequence counts (1, 2, 3, 4, etc.), score normalization to target scale,
 * and configurable absent/missing handling.
 */
export function calculateCAAverage(
  scores: SequenceScoreInput[],
  options?: {
    method?: GroupMethod
    bestN?: number | null
    missingPolicy?: MissingPolicy
    absentPolicy?: AbsentPolicy
    targetScale?: number
  }
): {
  average: number | null
  count: number
  total: number
  incomplete: boolean
  details: SequenceBreakdownItem[]
} {
  const targetScale = options?.targetScale ?? 20
  const missingPolicy = options?.missingPolicy ?? 'exclude'
  const absentPolicy = options?.absentPolicy ?? 'exclude'
  const method = options?.method ?? 'simple_average'
  const bestN = options?.bestN ?? null

  const details: SequenceBreakdownItem[] = []
  let hasIncomplete = false

  for (let i = 0; i < scores.length; i++) {
    const s = scores[i]
    const max = s.max && s.max > 0 ? s.max : targetScale
    const status = resolveScoreStatus(s.raw ?? null, s.status)
    const name = s.name || `Sequence ${i + 1}`

    let included = false
    let treatAsZero = false
    let normalized: number | null = null

    if (status === 'na' || status === 'excused') {
      included = false
    } else if (status === 'absent') {
      if (absentPolicy === 'zero') {
        included = true
        treatAsZero = true
        normalized = 0
      } else {
        // 'exclude' or 'separate': exclude absent score from average
        included = false
      }
    } else if (status === 'missing') {
      if (missingPolicy === 'zero') {
        included = true
        treatAsZero = true
        normalized = 0
      } else if (missingPolicy === 'exclude') {
        included = false
      } else {
        // 'incomplete' or 'resolve'
        included = false
        hasIncomplete = true
      }
    } else {
      // recorded
      if (s.raw != null) {
        included = true
        normalized = normalizeScore(s.raw, max, targetScale)
      } else {
        if (missingPolicy === 'zero') {
          included = true
          treatAsZero = true
          normalized = 0
        } else if (missingPolicy === 'exclude') {
          included = false
        } else {
          hasIncomplete = true
        }
      }
    }

    details.push({
      name,
      raw: s.raw ?? null,
      max,
      normalized,
      status,
      included,
      treatAsZero,
    })
  }

  const includedItems = details.filter((d) => d.included && d.normalized != null)

  if (!includedItems.length) {
    return {
      average: null,
      count: 0,
      total: 0,
      incomplete: hasIncomplete,
      details,
    }
  }

  let average: number | null = null

  if (method === 'best_n') {
    const n = Math.min(bestN ?? includedItems.length, includedItems.length)
    const top = [...includedItems]
      .sort((a, b) => (b.normalized as number) - (a.normalized as number))
      .slice(0, n)
    const sum = top.reduce((acc, it) => acc + (it.normalized as number), 0)
    average = sum / top.length
  } else if (method === 'weighted') {
    // Weighted sequences if weights provided, else fallback to equal weights
    let weightSum = 0
    let weightedScoreSum = 0
    for (let i = 0; i < details.length; i++) {
      const d = details[i]
      if (!d.included || d.normalized == null) continue
      const w = scores[i]?.weight && scores[i].weight! > 0 ? scores[i].weight! : 1
      weightSum += w
      weightedScoreSum += d.normalized * w
    }
    average = weightSum > 0 ? weightedScoreSum / weightSum : null
  } else {
    // 'simple_average' or 'sum'
    const sum = includedItems.reduce((acc, it) => acc + (it.normalized as number), 0)
    average = sum / includedItems.length
  }

  const total = includedItems.reduce((acc, it) => acc + (it.normalized as number), 0)

  return {
    average,
    count: includedItems.length,
    total,
    incomplete: hasIncomplete,
    details,
  }
}

/**
 * Step 2: Calculate the Subject Mark.
 * Subject Mark = (Average CA × CA Weight) + (Exam Mark × Exam Weight)
 */
export function calculateSubjectMark(
  caAverage: number | null,
  examScore: number | null,
  caWeightPercent: number = 40,
  examWeightPercent: number = 60,
  options?: {
    examMax?: number
    targetScale?: number
    examStatus?: ScoreStatus
    missingPolicy?: MissingPolicy
    absentPolicy?: AbsentPolicy
  }
): {
  subjectMark: number | null
  caContribution: number | null
  examContribution: number | null
  examNormalized: number | null
  incomplete: boolean
} {
  const targetScale = options?.targetScale ?? 20
  const examMax = options?.examMax && options.examMax > 0 ? options.examMax : targetScale
  const examStatus = resolveScoreStatus(examScore, options?.examStatus)
  const missingPolicy = options?.missingPolicy ?? 'exclude'
  const absentPolicy = options?.absentPolicy ?? 'exclude'

  let examNormalized: number | null = null
  let examIncomplete = false

  if (examStatus === 'recorded' && examScore != null) {
    examNormalized = normalizeScore(examScore, examMax, targetScale)
  } else if (examStatus === 'absent') {
    if (absentPolicy === 'zero') {
      examNormalized = 0
    } else if (examWeightPercent > 0) {
      examIncomplete = true
    }
  } else if (examStatus === 'missing') {
    if (missingPolicy === 'zero') {
      examNormalized = 0
    } else if (examWeightPercent > 0) {
      // Missing exam only blocks when the profile actually weights exams.
      examIncomplete = true
    }
  } else if (examStatus === 'excused' || examStatus === 'na') {
    examNormalized = null
  }

  const caWeight = caWeightPercent / 100
  const examWeight = examWeightPercent / 100

  const caContribution = caAverage != null ? caAverage * caWeight : null
  const examContribution = examNormalized != null ? examNormalized * examWeight : null

  let subjectMark: number | null = null
  let incomplete = examWeightPercent > 0 ? examIncomplete : false

  if (caContribution != null && examContribution != null) {
    subjectMark = caContribution + examContribution
  } else if (caContribution != null && examWeight === 0) {
    subjectMark = caContribution
  } else if (examContribution != null && caWeight === 0) {
    subjectMark = examContribution
  } else {
    incomplete = true
  }

  return {
    subjectMark,
    caContribution,
    examContribution,
    examNormalized,
    incomplete,
  }
}

/**
 * Step 3: Apply Subject Coefficient.
 * Weighted Subject Score = Subject Mark × Subject Coefficient
 */
export function calculateWeightedSubjectMark(
  subjectMark: number | null,
  coefficient: number
): number | null {
  if (subjectMark == null) return null
  return subjectMark * coefficient
}

/**
 * Step 4 & 5 & 6: Calculate Total Weighted Marks, Total Coefficients, and Term Average.
 * Term Average = Total Weighted Marks / Total Coefficients
 */
export function calculateTermAverage(
  subjects: Array<{
    weightedMark: number | null
    coefficient: number
    includeInAverage?: boolean
    incomplete?: boolean
  }>
): {
  totalWeightedMarks: number
  totalCoefficients: number
  termAverage: number | null
} {
  const usable = subjects.filter(
    (s) =>
      s.weightedMark != null &&
      !s.incomplete &&
      (s.includeInAverage ?? true) &&
      s.coefficient > 0
  )

  const totalWeightedMarks = usable.reduce(
    (acc, s) => acc + (s.weightedMark as number),
    0
  )
  const totalCoefficients = usable.reduce((acc, s) => acc + s.coefficient, 0)
  const termAverage =
    totalCoefficients > 0 ? totalWeightedMarks / totalCoefficients : null

  return {
    totalWeightedMarks,
    totalCoefficients,
    termAverage,
  }
}

/**
 * Step 7: Determine Pass / Fail based on configurable pass mark.
 * Pass Mark default is 10/20 (or 50/100).
 */
export function determinePassFail(
  average: number | null,
  passMark: number = 10
): 'PASSED' | 'FAILED' | 'INCOMPLETE' {
  if (average == null) return 'INCOMPLETE'
  return average >= passMark ? 'PASSED' : 'FAILED'
}

/**
 * Complete subject calculation for a student.
 */
export function calculateSubjectResult(input: {
  subjectId: string
  subjectName?: string
  sequences: SequenceScoreInput[]
  exam: ExamScoreInput | null
  coefficient: number
  caWeight?: number
  examWeight?: number
  passMark?: number
  targetScale?: number
  grading?: GradeBandConfig[]
  rounding?: RoundingConfig
  missingPolicy?: MissingPolicy
  absentPolicy?: AbsentPolicy
  sequenceMethod?: GroupMethod
  bestN?: number | null
}): SubjectResultBreakdown {
  const targetScale = input.targetScale ?? 20
  const caWeight = input.caWeight ?? 40
  const examWeight = input.examWeight ?? 60
  const rounding = input.rounding ?? { places: 2, half: 'standard' }
  const coefficient = input.coefficient > 0 ? input.coefficient : 1
  const passMark = input.passMark ?? (targetScale === 20 ? 10 : 50)

  const caResult = calculateCAAverage(input.sequences, {
    method: input.sequenceMethod,
    bestN: input.bestN,
    missingPolicy: input.missingPolicy,
    absentPolicy: input.absentPolicy,
    targetScale,
  })

  const markResult = calculateSubjectMark(
    caResult.average,
    input.exam?.raw ?? null,
    caWeight,
    examWeight,
    {
      examMax: input.exam?.max ?? targetScale,
      targetScale,
      examStatus: input.exam?.status,
      missingPolicy: input.missingPolicy,
      absentPolicy: input.absentPolicy,
    }
  )

  const incomplete = caResult.incomplete || markResult.incomplete
  const subjectMark = markResult.subjectMark
  const weightedMark = calculateWeightedSubjectMark(subjectMark, coefficient)

  const subjectMarkRounded =
    subjectMark != null ? roundValue(subjectMark, rounding) : null
  const weightedMarkRounded =
    weightedMark != null ? roundValue(weightedMark, rounding) : null

  const bands = input.grading ?? []
  const band =
    subjectMarkRounded != null
      ? gradeForScore(
          targetScale === 20
            ? subjectMarkRounded
            : (subjectMarkRounded / targetScale) * 100,
          bands
        )
      : null

  const passed =
    subjectMarkRounded != null ? subjectMarkRounded >= passMark : null

  return {
    subject_id: input.subjectId,
    subject_name: input.subjectName,
    sequence_details: caResult.details,
    ca_average: caResult.average,
    ca_weight: caWeight,
    ca_contribution: markResult.caContribution,
    exam_raw: input.exam?.raw ?? null,
    exam_max: input.exam?.max ?? targetScale,
    exam_normalized: markResult.examNormalized,
    exam_weight: examWeight,
    exam_contribution: markResult.examContribution,
    subject_mark: subjectMark,
    subject_mark_rounded: subjectMarkRounded,
    coefficient,
    weighted_mark: weightedMark,
    weighted_mark_rounded: weightedMarkRounded,
    grade: band?.grade ?? null,
    grade_point: band?.grade_point ?? null,
    remark: band?.remark ?? (passed ? 'Pass' : 'Fail'),
    passed,
    incomplete,
    scale: targetScale,
  }
}

/**
 * Complete student term calculation.
 */
export function calculateStudentTermResult(input: {
  studentId: string
  studentName?: string
  studentCode?: string | null
  subjectResults: SubjectResultBreakdown[]
  passMark?: number
  targetScale?: number
  rounding?: RoundingConfig
  grading?: GradeBandConfig[]
}): StudentTermResult {
  const targetScale = input.targetScale ?? 20
  const passMark = input.passMark ?? (targetScale === 20 ? 10 : 50)
  const rounding = input.rounding ?? { places: 2, half: 'standard' }

  const termAvgData = calculateTermAverage(
    input.subjectResults.map((sr) => ({
      weightedMark: sr.weighted_mark,
      coefficient: sr.coefficient,
      incomplete: sr.incomplete,
    }))
  )

  const termAverageRounded =
    termAvgData.termAverage != null
      ? roundValue(termAvgData.termAverage, rounding)
      : null

  const passedCount = input.subjectResults.filter((s) => s.passed === true).length
  const failedCount = input.subjectResults.filter((s) => s.passed === false).length
  const incompleteCount = input.subjectResults.filter((s) => s.incomplete).length

  const status =
    incompleteCount > 0 && termAvgData.termAverage == null
      ? 'INCOMPLETE'
      : determinePassFail(termAverageRounded, passMark)

  const bands = input.grading ?? []
  const band =
    termAverageRounded != null
      ? gradeForScore(
          targetScale === 20
            ? termAverageRounded
            : (termAverageRounded / targetScale) * 100,
          bands
        )
      : null

  return {
    student_id: input.studentId,
    student_name: input.studentName,
    student_code: input.studentCode,
    subject_results: input.subjectResults,
    total_weighted_marks: roundValue(termAvgData.totalWeightedMarks, rounding),
    total_coefficients: termAvgData.totalCoefficients,
    term_average: termAvgData.termAverage,
    term_average_rounded: termAverageRounded,
    grade: band?.grade ?? null,
    remark: band?.remark ?? (status === 'PASSED' ? 'Passed' : 'Failed'),
    status,
    position: null,
    passed_subjects: passedCount,
    failed_subjects: failedCount,
    incomplete_subjects: incompleteCount,
    gpa: null,
    promotion_outcome: status === 'PASSED' ? 'promoted' : 'not_promoted',
  }
}

/**
 * Pre-calculation validation for class results.
 */
export function validateClassCalculation(input: {
  config: CalculationConfig
  students: Array<{ id: string; name?: string }>
  subjects: Array<{ id: string; name: string }>
  coefficientsMap: Map<string, number>
  caAssessments: Array<{ subject_id: string; max_score: number; scores: Array<{ student_id: string; score: number | null }> }>
  examPapers: Array<{ subject_id: string; max_score: number; scores: Array<{ student_id: string; score: number | null }> }>
}): CalculationValidationResult {
  const blocking: CalculationValidationIssue[] = []
  const warnings: CalculationValidationIssue[] = []

  // 1. Assessment weights validation
  const wCheck = validateWeights(input.config)
  const caExamTotal =
    input.config.ca_weight != null && input.config.exam_weight != null
      ? input.config.ca_weight + input.config.exam_weight
      : null
  if (!wCheck.ok || (caExamTotal != null && Math.abs(caExamTotal - 100) > 0.05)) {
    blocking.push({
      type: 'blocking',
      code: 'WEIGHTS_NOT_100',
      message:
        (!wCheck.ok ? wCheck.error : null) ??
        `Assessment weights total ${caExamTotal}%. They must total 100%.`,
    })
  }

  // 2. Students enrolled
  if (!input.students.length) {
    blocking.push({
      type: 'blocking',
      code: 'NO_STUDENTS',
      message: 'No enrolled students in this class.',
    })
  }

  // 3. Subjects configured
  if (!input.subjects.length) {
    blocking.push({
      type: 'blocking',
      code: 'NO_SUBJECTS',
      message: 'No subjects configured for this class.',
    })
  }

  // 4. Subject coefficients configured
  for (const subject of input.subjects) {
    const coeff = input.coefficientsMap.get(subject.id)
    if (coeff == null || coeff <= 0) {
      warnings.push({
        type: 'warning',
        code: 'MISSING_COEFFICIENT',
        message: `Subject "${subject.name}" does not have an explicit coefficient (defaulting to 1).`,
        details: { subject_id: subject.id, subject_name: subject.name },
      })
    }
  }

  // 5. Check missing exam / CA assessments (skip exams when weight is 0 — MINESEC sequences)
  const examWeight =
    input.config.exam_weight ??
    input.config.components?.find((c) => c.source === 'exam' || c.type === 'final_exam')
      ?.weight_percent ??
    60
  if (examWeight > 0) {
    for (const subject of input.subjects) {
      const paper = input.examPapers.find((p) => p.subject_id === subject.id)
      if (!paper) {
        warnings.push({
          type: 'warning',
          code: 'NO_EXAM_PAPER',
          message: `Subject "${subject.name}" has no exam paper created.`,
          details: { subject_id: subject.id },
        })
      }
    }
  }

  const expectedSeqs = input.config.expected_sequences ?? 0
  if (expectedSeqs > 0) {
    for (const subject of input.subjects) {
      const count = input.caAssessments.filter((a) => a.subject_id === subject.id)
        .length
      if (count < expectedSeqs) {
        warnings.push({
          type: 'warning',
          code: 'MISSING_SEQUENCES',
          message: `Subject "${subject.name}" has ${count} sequence(s); expected ${expectedSeqs}.`,
          details: { subject_id: subject.id, found: count, expected: expectedSeqs },
        })
      }
    }
  }

  // 6. Check for out-of-range scores
  for (const a of input.caAssessments) {
    for (const sc of a.scores) {
      if (sc.score != null && sc.score > a.max_score) {
        blocking.push({
          type: 'blocking',
          code: 'SCORE_EXCEEDS_MAX',
          message: `CA score (${sc.score}) exceeds maximum (${a.max_score}).`,
          details: { assessment_id: a.subject_id, student_id: sc.student_id },
        })
      }
    }
  }

  for (const p of input.examPapers) {
    for (const sc of p.scores) {
      if (sc.score != null && sc.score > p.max_score) {
        blocking.push({
          type: 'blocking',
          code: 'SCORE_EXCEEDS_MAX',
          message: `Exam score (${sc.score}) exceeds maximum (${p.max_score}).`,
          details: { paper_id: p.subject_id, student_id: sc.student_id },
        })
      }
    }
  }

  return {
    ok: blocking.length === 0,
    blocking_issues: blocking,
    warnings,
    total_students: input.students.length,
    total_subjects: input.subjects.length,
    assessment_weights_total: wCheck.total,
  }
}

/**
 * Calculates results for an entire class.
 */
export function calculateClassResults(input: {
  classId: string
  termId: string | null
  academicYearId: string | null
  config: CalculationConfig
  students: Array<{ id: string; name?: string; student_code?: string | null }>
  subjects: Array<{ id: string; name: string; department_id?: string | null }>
  coefficientsMap: Map<string, number>
  scoresLookup: Map<
    string,
    {
      sequences: SequenceScoreInput[]
      exam: ExamScoreInput | null
    }
  >
}): ClassResultsOutcome {
  const config = input.config
  const targetScale = config.scale ?? 20
  const passMark = config.pass_mark ?? (targetScale === 20 ? 10 : 50)
  const rounding = config.rounding ?? { places: 2, half: 'standard' }

  // Extract weights from config
  const caComponent = config.components?.find((c) => c.source === 'ca' || c.type === 'continuous_assessment')
  const examComponent = config.components?.find((c) => c.source === 'exam' || c.type === 'final_exam')
  const caWeight = config.ca_weight ?? caComponent?.weight_percent ?? 40
  const examWeight = config.exam_weight ?? examComponent?.weight_percent ?? 60

  const studentResults: StudentTermResult[] = []

  for (const student of input.students) {
    const subjectResults: SubjectResultBreakdown[] = []

    for (const subject of input.subjects) {
      const pack = input.scoresLookup.get(`${student.id}:${subject.id}`)
      const coeff = input.coefficientsMap.get(subject.id) ?? 1

      const res = calculateSubjectResult({
        subjectId: subject.id,
        subjectName: subject.name,
        sequences: pack?.sequences ?? [],
        exam: pack?.exam ?? null,
        coefficient: coeff,
        caWeight,
        examWeight,
        passMark,
        targetScale,
        grading: config.grading,
        rounding,
        missingPolicy: config.missing_policy ?? 'exclude',
        absentPolicy: config.absent_policy ?? 'exclude',
        sequenceMethod: config.sequence_method ?? 'simple_average',
        bestN: config.best_n,
      })

      subjectResults.push(res)
    }

    const studentTermRes = calculateStudentTermResult({
      studentId: student.id,
      studentName: student.name,
      studentCode: student.student_code,
      subjectResults,
      passMark,
      targetScale,
      rounding,
      grading: config.grading,
    })

    studentResults.push(studentTermRes)
  }

  // Ranking
  if (config.ranking?.enabled) {
    const rankRows = studentResults
      .filter((s) => s.term_average_rounded != null)
      .map((s) => ({
        id: s.student_id,
        value:
          config.ranking.by === 'total'
            ? s.total_weighted_marks
            : (s.term_average_rounded as number),
      }))

    const tiesMethod = config.ranking.ties ?? 'competition'
    const ranked = rankStudents(rankRows, tiesMethod)
    const rankMap = new Map(ranked.map((r) => [r.id, r.rank]))

    for (const sr of studentResults) {
      sr.position = rankMap.get(sr.student_id) ?? null
    }
  }

  // Class aggregates
  const validAvgs = studentResults
    .map((s) => s.term_average_rounded)
    .filter((v): v is number => v != null)

  const classAverage =
    validAvgs.length > 0
      ? roundValue(validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length, rounding)
      : null

  const highestAverage =
    validAvgs.length > 0 ? Math.max(...validAvgs) : null
  const lowestAverage =
    validAvgs.length > 0 ? Math.min(...validAvgs) : null

  const passedStudents = studentResults.filter((s) => s.status === 'PASSED').length
  const failedStudents = studentResults.filter((s) => s.status === 'FAILED').length
  const incompleteStudents = studentResults.filter((s) => s.status === 'INCOMPLETE').length

  return {
    class_id: input.classId,
    term_id: input.termId,
    academic_year_id: input.academicYearId,
    config,
    config_hash: hashConfig(config),
    total_students: input.students.length,
    processed_students: studentResults.length,
    incomplete_students: incompleteStudents,
    passed_students: passedStudents,
    failed_students: failedStudents,
    class_average: classAverage,
    highest_average: highestAverage,
    lowest_average: lowestAverage,
    student_results: studentResults,
  }
}
