import {
  calculateGpa,
  calculateOverall,
  calculateSubjectScore,
  canActivateProfile,
  evaluatePromotion,
  gradeForScore,
  hashConfig,
  mapComponentInputs,
  profileLabel,
  rankStudents,
  resolveSubjectConfig,
  roundValue,
  type CalculationConfig,
  type NamedAssessmentInput,
  type ScoreInput,
  type SubjectCalculation,
} from '../../domain/results-calculation'

export interface ClassStudentInput {
  id: string
}

export interface ClassSubjectInput {
  id: string
  name: string
}

export interface StudentSubjectScores {
  studentId: string
  subjectId: string
  ca: NamedAssessmentInput[]
  exam: NamedAssessmentInput | null
}

export interface CalculatedSubjectRow {
  student_id: string
  subject_id: string
  ca_score: number
  exam_score: number
  total: number
  grade: string | null
  incomplete: boolean
  passed: boolean | null
  detail: SubjectCalculation
}

export interface CalculatedSummaryRow {
  student_id: string
  average: number
  total: number
  grade: string | null
  position: number | null
  remark: string | null
  gpa: number | null
  failed_subjects: number
  promotion_outcome: string
}

export function previewSubject(
  config: CalculationConfig,
  scores: ScoreInput[],
  subjectId: string | null
) {
  const result = calculateSubjectScore(config, scores, subjectId)
  return {
    inputs: result.contributions.map((c) => ({
      name: c.name,
      display: c.raw == null ? c.status : `${c.raw}/${c.max}`,
      contribution: c.contribution,
      normalized: c.normalized,
    })),
    final_score: result.score,
    grade: result.grade,
    pass_fail:
      result.incomplete ? 'Incomplete' : result.passed ? 'Pass' : 'Fail',
    remark: result.remark,
    incomplete: result.incomplete,
  }
}

export function calculateClass(
  config: CalculationConfig,
  students: ClassStudentInput[],
  subjects: ClassSubjectInput[],
  scores: StudentSubjectScores[]
): {
  subject_rows: CalculatedSubjectRow[]
  summaries: CalculatedSummaryRow[]
  hash: string
} {
  const lookup = new Map<string, StudentSubjectScores>()
  for (const s of scores) lookup.set(`${s.studentId}:${s.subjectId}`, s)

  const subjectRows: CalculatedSubjectRow[] = []
  const perStudent = new Map<
    string,
    SubjectCalculation[]
  >()

  for (const student of students) {
    const list: SubjectCalculation[] = []
    for (const subject of subjects) {
      const pack = lookup.get(`${student.id}:${subject.id}`)
      const resolvedCfg = resolveSubjectConfig(config, subject.id)
      const components = mapComponentInputs(
        resolvedCfg.components,
        pack?.ca ?? [],
        pack?.exam ?? null
      )
      const resolved = calculateSubjectScore(config, components, subject.id)
      list.push(resolved)
      const caComp = resolved.contributions.find((c) =>
        /ca|continuous/i.test(c.name)
      )
      const examComp = resolved.contributions.find((c) =>
        /exam/i.test(c.name)
      )
      subjectRows.push({
        student_id: student.id,
        subject_id: subject.id,
        ca_score: caComp?.contribution ?? caComp?.normalized ?? 0,
        exam_score: examComp?.contribution ?? examComp?.normalized ?? 0,
        total: resolved.score ?? 0,
        grade: resolved.grade,
        incomplete: resolved.incomplete,
        passed: resolved.passed,
        detail: resolved,
      })
    }
    perStudent.set(student.id, list)
  }

  const summaryBase = students.map((student) => {
    const list = perStudent.get(student.id) ?? []
    const average = calculateOverall(
      config.overall.method,
      list.map((s) => ({
        score: s.score,
        incomplete: s.incomplete,
        include_in_average: s.include_in_average,
        optional: s.optional,
        gpa_credits: s.gpa_credits,
      }))
    )
    const total = list
      .filter((s) => s.score != null && !s.incomplete)
      .reduce((sum, s) => sum + (s.score as number), 0)
    const failed = list.filter((s) => s.passed === false).length
    const passed = list.filter((s) => s.passed === true).length
    const requiredFailed = list.some((s, i) => {
      const sid = subjects[i]?.id
      return (
        sid &&
        config.promotion.required_subject_ids.includes(sid) &&
        s.passed === false
      )
    })
    const presented =
      average == null ? 0 : roundValue(average, config.rounding)
    const band = gradeForScore(presented, config.grading)
    const promo = evaluatePromotion(config.promotion, {
      average: presented,
      failed_subjects: failed,
      passed_subjects: passed,
      required_failed: requiredFailed,
    })
    return {
      student_id: student.id,
      average: presented,
      total: roundValue(total, config.rounding),
      grade: band?.grade ?? null,
      remark: promo.reasons[0] ?? band?.remark ?? null,
      gpa: config.use_gpa ? calculateGpa(list) : null,
      failed_subjects: failed,
      promotion_outcome: promo.outcome,
    }
  })

  let ranked: Array<{ id: string; rank: number }> = []
  if (config.ranking.enabled && config.ranking.scope !== 'none') {
    ranked = rankStudents(
      summaryBase.map((s) => ({
        id: s.student_id,
        value: config.ranking.by === 'total' ? s.total : s.average,
      })),
      config.ranking.ties
    )
  }
  const rankMap = new Map(ranked.map((r) => [r.id, r.rank]))

  const summaries: CalculatedSummaryRow[] = summaryBase.map((s) => ({
    ...s,
    position: config.ranking.enabled ? rankMap.get(s.student_id) ?? null : null,
  }))

  return { subject_rows: subjectRows, summaries, hash: hashConfig(config) }
}

export { canActivateProfile, profileLabel, mapComponentInputs, hashConfig }
