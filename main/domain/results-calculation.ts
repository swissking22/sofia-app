import { createHash } from 'crypto'

/** Inputs → rules → calculated results. No school-name branching. */

export type ProfileStatus = 'draft' | 'active' | 'archived'
export type ScoreStatus = 'recorded' | 'missing' | 'absent' | 'excused' | 'na'
export type MissingPolicy = 'zero' | 'exclude' | 'incomplete' | 'resolve'
export type AbsentPolicy = 'zero' | 'exclude' | 'separate'
export type ComponentType =
  | 'continuous_assessment'
  | 'test'
  | 'assignment'
  | 'quiz'
  | 'classwork'
  | 'project'
  | 'practical'
  | 'mid_term'
  | 'final_exam'
  | 'oral'
  | 'other'
export type ComponentSource = 'ca' | 'exam' | 'named'
export type GroupMethod = 'weighted' | 'simple_average' | 'sum' | 'best_n'
export type OverallMethod =
  | 'average'
  | 'weighted'
  | 'total_ratio'
  | 'credit'
export type RankingBy = 'average' | 'total'
export type RankingScope = 'class' | 'stream' | 'department' | 'level' | 'none'
export type TieMethod = 'competition' | 'dense' | 'sequential'
export type RoundingPlaces = 'none' | 0 | 1 | 2
export type RoundingHalf = 'up' | 'down' | 'standard'
export type PromotionOutcome =
  | 'promoted'
  | 'not_promoted'
  | 'referred'
  | 'conditional'
  | 'pending_review'
export type AnnualMethod = 'average' | 'weighted' | 'best_n'

export interface GradeBandConfig {
  grade: string
  min_score: number
  max_score: number
  grade_point: number | null
  is_pass: boolean
  remark: string
  order: number
}

export interface AssessmentComponentConfig {
  id: string
  name: string
  code: string
  type: ComponentType
  source: ComponentSource
  max_score: number
  weight_percent: number
  order: number
  required: boolean
  group_id: string | null
  missing_policy?: MissingPolicy
}

export interface ComponentGroupConfig {
  id: string
  name: string
  weight_percent: number
  method: GroupMethod
  best_n: number | null
  order: number
}

export interface SubjectOverrideConfig {
  subject_id: string
  pass_mark: number | null
  credit: number | null
  optional: boolean
  include_in_average: boolean
  components?: AssessmentComponentConfig[]
  groups?: ComponentGroupConfig[]
}

export interface PromotionConfig {
  enabled: boolean
  automatic: boolean
  min_average: number | null
  max_failed_subjects: number | null
  min_passed_subjects: number | null
  min_subject_score: number | null
  required_subject_ids: string[]
  attendance_threshold: number | null
}

export interface RankingConfig {
  enabled: boolean
  by: RankingBy
  scope: RankingScope
  ties: TieMethod
}

export interface RoundingConfig {
  places: RoundingPlaces
  half: RoundingHalf
}

export interface AnnualConfig {
  method: AnnualMethod
  term_weights: Array<{ term_number: number; weight_percent: number }>
  best_n: number | null
}

export interface CalculationConfig {
  scale?: number
  ca_weight?: number
  exam_weight?: number
  expected_sequences?: number
  sequence_method?: GroupMethod
  method: GroupMethod
  best_n: number | null
  components: AssessmentComponentConfig[]
  groups: ComponentGroupConfig[]
  grading: GradeBandConfig[]
  use_gpa: boolean
  pass_mark: number
  rounding: RoundingConfig
  missing_policy: MissingPolicy
  absent_policy: AbsentPolicy
  overall: { method: OverallMethod; default_credit: number }
  ranking: RankingConfig
  promotion: PromotionConfig
  annual: AnnualConfig
  subject_overrides: SubjectOverrideConfig[]
}

export interface ScoreInput {
  componentId: string
  raw: number | null
  max?: number
  status?: ScoreStatus
}

export interface ComponentContribution {
  componentId: string
  name: string
  raw: number | null
  max: number
  normalized: number | null
  weight: number
  contribution: number | null
  included: boolean
  incomplete: boolean
  status: ScoreStatus
}

export interface SubjectCalculation {
  score: number | null
  grade: string | null
  grade_point: number | null
  remark: string
  passed: boolean | null
  incomplete: boolean
  contributions: ComponentContribution[]
  gpa_credits: number
  include_in_average: boolean
  optional: boolean
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

export function hashConfig(config: CalculationConfig): string {
  return createHash('sha256').update(stableStringify(config)).digest('hex')
}

export function roundValue(value: number, rounding: RoundingConfig): number {
  if (rounding.places === 'none') return value
  const places = rounding.places
  const factor = 10 ** places
  const scaled = value * factor
  const frac = scaled - Math.floor(scaled)
  const eps = 1e-10
  const isHalf = Math.abs(frac - 0.5) < eps
  let rounded: number
  if (isHalf && rounding.half === 'down') rounded = Math.floor(scaled)
  else if (isHalf && rounding.half === 'up') rounded = Math.ceil(scaled)
  else rounded = Math.round(scaled)
  return rounded / factor
}

export function resolveScoreStatus(
  raw: number | null,
  status?: ScoreStatus
): ScoreStatus {
  if (status && status !== 'recorded') return status
  if (raw == null) return 'missing'
  return 'recorded'
}

export function applyMissingPolicy(
  status: ScoreStatus,
  missing: MissingPolicy,
  absent: AbsentPolicy
): { include: boolean; treatAsZero: boolean; incomplete: boolean } {
  if (status === 'na' || status === 'excused') {
    return { include: false, treatAsZero: false, incomplete: false }
  }
  if (status === 'absent') {
    if (absent === 'zero') return { include: true, treatAsZero: true, incomplete: false }
    if (absent === 'exclude' || absent === 'separate') {
      return { include: false, treatAsZero: false, incomplete: false }
    }
  }
  if (status === 'missing') {
    if (missing === 'zero') return { include: true, treatAsZero: true, incomplete: false }
    if (missing === 'exclude') return { include: false, treatAsZero: false, incomplete: false }
    return { include: false, treatAsZero: false, incomplete: true }
  }
  return { include: true, treatAsZero: false, incomplete: false }
}

export function normalizeScore(raw: number, max: number): number {
  if (!max) return 0
  return (raw / max) * 100
}

export function gradeForScore(
  score: number,
  bands: GradeBandConfig[]
): GradeBandConfig | null {
  const ordered = [...bands].sort((a, b) => b.min_score - a.min_score)
  return (
    ordered.find((b) => score >= b.min_score && score <= b.max_score) ?? null
  )
}

export function weightTotal(
  items: Array<{ weight_percent: number }>
): number {
  return items.reduce((s, i) => s + i.weight_percent, 0)
}

export function validateWeights(config: CalculationConfig): {
  ok: boolean
  total: number
  error?: string
} {
  const groups = config.groups ?? []
  if (groups.length) {
    const total = Math.round(weightTotal(groups) * 1000) / 1000
    if (Math.abs(total - 100) > 0.05) {
      return {
        ok: false,
        total,
        error: `Assessment weights total ${total}%. They must total 100% before this calculation profile can be activated.`,
      }
    }
    for (const group of groups) {
      const children = config.components.filter((c) => c.group_id === group.id)
      if (!children.length) continue
      const ct = Math.round(weightTotal(children) * 1000) / 1000
      if (group.method === 'weighted' && Math.abs(ct - 100) > 0.05) {
        return {
          ok: false,
          total: ct,
          error: `"${group.name}" weights total ${ct}%. They must total 100%.`,
        }
      }
    }
    return { ok: true, total: 100 }
  }
  const total = Math.round(weightTotal(config.components) * 1000) / 1000
  if (Math.abs(total - 100) > 0.05) {
    return {
      ok: false,
      total,
      error: `Assessment weights total ${total}%. They must total 100% before this calculation profile can be activated.`,
    }
  }
  return { ok: true, total }
}

export function canActivateProfile(config: CalculationConfig): {
  ok: boolean
  errors: string[]
} {
  const errors: string[] = []
  const w = validateWeights(config)
  if (!w.ok && w.error) errors.push(w.error)
  if (!config.grading.length) errors.push('Add at least one grade band.')
  const maxMark = config.scale || 100
  if (config.pass_mark < 0 || config.pass_mark > maxMark) {
    errors.push(`Pass mark must be between 0 and ${maxMark}.`)
  }
  for (const band of config.grading) {
    if (band.min_score > band.max_score) {
      errors.push(`Grade ${band.grade} has an invalid score range.`)
    }
  }
  return { ok: errors.length === 0, errors }
}

function contributionFor(
  component: AssessmentComponentConfig,
  input: ScoreInput | undefined,
  config: CalculationConfig
): ComponentContribution {
  const status = resolveScoreStatus(input?.raw ?? null, input?.status)
  const policy = applyMissingPolicy(
    status,
    component.missing_policy ?? config.missing_policy,
    config.absent_policy
  )
  const max = input?.max ?? component.max_score
  const raw = policy.treatAsZero ? 0 : input?.raw ?? null
  const included = policy.include && raw != null
  const normalized = included ? normalizeScore(raw as number, max) : null
  const contribution =
    normalized == null ? null : (normalized * component.weight_percent) / 100
  return {
    componentId: component.id,
    name: component.name,
    raw: input?.raw ?? null,
    max,
    normalized,
    weight: component.weight_percent,
    contribution,
    included,
    incomplete: policy.incomplete && component.required,
    status,
  }
}

function combineNormalized(
  method: GroupMethod,
  bestN: number | null,
  parts: Array<{ normalized: number; weight: number }>
): number | null {
  if (!parts.length) return null
  if (method === 'simple_average') {
    return parts.reduce((s, p) => s + p.normalized, 0) / parts.length
  }
  if (method === 'sum') {
    return parts.reduce((s, p) => s + p.normalized, 0) / parts.length
  }
  if (method === 'best_n') {
    const n = Math.min(bestN ?? parts.length, parts.length)
    const top = [...parts].sort((a, b) => b.normalized - a.normalized).slice(0, n)
    return top.reduce((s, p) => s + p.normalized, 0) / top.length
  }
  const weightSum = parts.reduce((s, p) => s + p.weight, 0)
  if (!weightSum) return null
  return parts.reduce((s, p) => s + (p.normalized * p.weight) / weightSum, 0)
}

export function resolveSubjectConfig(
  config: CalculationConfig,
  subjectId: string | null
): {
  components: AssessmentComponentConfig[]
  groups: ComponentGroupConfig[]
  pass_mark: number
  credit: number
  optional: boolean
  include_in_average: boolean
} {
  const override = subjectId
    ? config.subject_overrides.find((o) => o.subject_id === subjectId)
    : undefined
  return {
    components: override?.components?.length
      ? override.components
      : config.components,
    groups: override?.groups?.length ? override.groups : config.groups,
    pass_mark: override?.pass_mark ?? config.pass_mark,
    credit: override?.credit ?? config.overall.default_credit,
    optional: override?.optional ?? false,
    include_in_average: override?.include_in_average ?? true,
  }
}

export function calculateSubjectScore(
  config: CalculationConfig,
  scores: ScoreInput[],
  subjectId: string | null = null
): SubjectCalculation {
  const resolved = resolveSubjectConfig(config, subjectId)
  const byId = new Map(scores.map((s) => [s.componentId, s]))
  const contributions = resolved.components.map((c) =>
    contributionFor(c, byId.get(c.id), config)
  )
  const incomplete = contributions.some((c) => c.incomplete)

  let score: number | null = null
  if (!incomplete) {
    if (resolved.groups.length) {
      const groupScores: Array<{ normalized: number; weight: number }> = []
      for (const group of [...resolved.groups].sort((a, b) => a.order - b.order)) {
        const children = contributions.filter((c) => {
          const def = resolved.components.find((x) => x.id === c.componentId)
          return def?.group_id === group.id && c.included && c.normalized != null
        })
        const parts = children.map((c) => ({
          normalized: c.normalized as number,
          weight: c.weight,
        }))
        const gScore = combineNormalized(group.method, group.best_n, parts)
        if (gScore == null) continue
        groupScores.push({ normalized: gScore, weight: group.weight_percent })
      }
      const combined = combineNormalized('weighted', null, groupScores)
      score = combined
    } else {
      const included = contributions.filter(
        (c) => c.included && c.normalized != null
      )
      if (config.method === 'weighted') {
        const used = included.filter((c) => c.contribution != null)
        const weightUsed = used.reduce((s, c) => s + c.weight, 0)
        if (weightUsed && Math.abs(weightUsed - 100) > 0.05) {
          score = used.reduce(
            (s, c) => s + ((c.normalized as number) * c.weight) / weightUsed,
            0
          )
        } else {
          score = used.reduce((s, c) => s + (c.contribution ?? 0), 0)
        }
      } else {
        score = combineNormalized(
          config.method,
          config.best_n,
          included.map((c) => ({
            normalized: c.normalized as number,
            weight: c.weight,
          }))
        )
      }
    }
  }

  const presented =
    score == null ? null : roundValue(score, config.rounding)
  const band = presented == null ? null : gradeForScore(presented, config.grading)
  const passed = presented == null ? null : presented >= resolved.pass_mark

  return {
    score: presented,
    grade: band?.grade ?? null,
    grade_point: band?.grade_point ?? null,
    remark: band?.remark ?? '',
    passed,
    incomplete,
    contributions,
    gpa_credits: resolved.credit,
    include_in_average: resolved.optional
      ? resolved.include_in_average
      : resolved.include_in_average,
    optional: resolved.optional,
  }
}

export function calculateOverall(
  method: OverallMethod,
  subjects: Array<{
    score: number | null
    incomplete: boolean
    include_in_average: boolean
    optional: boolean
    gpa_credits: number
    weight?: number
    max?: number
  }>
): number | null {
  const usable = subjects.filter(
    (s) =>
      s.score != null &&
      !s.incomplete &&
      s.include_in_average &&
      !(s.optional && !s.include_in_average)
  )
  if (!usable.length) return null
  if (method === 'weighted' || method === 'credit') {
    const den = usable.reduce(
      (s, x) => s + (method === 'credit' ? x.gpa_credits : x.weight ?? x.gpa_credits),
      0
    )
    if (!den) return null
    return (
      usable.reduce(
        (s, x) =>
          s +
          (x.score as number) *
            (method === 'credit' ? x.gpa_credits : x.weight ?? x.gpa_credits),
        0
      ) / den
    )
  }
  if (method === 'total_ratio') {
    const total = usable.reduce((s, x) => s + (x.score as number), 0)
    const max = usable.reduce((s, x) => s + (x.max ?? 100), 0)
    if (!max) return null
    return (total / max) * 100
  }
  return usable.reduce((s, x) => s + (x.score as number), 0) / usable.length
}

export function calculateGpa(
  subjects: Array<{
    grade_point: number | null
    gpa_credits: number
    incomplete: boolean
    include_in_average: boolean
  }>
): number | null {
  const usable = subjects.filter(
    (s) =>
      s.grade_point != null && s.include_in_average && !s.incomplete && s.gpa_credits
  )
  if (!usable.length) return null
  const credits = usable.reduce((s, x) => s + x.gpa_credits, 0)
  return (
    usable.reduce((s, x) => s + (x.grade_point as number) * x.gpa_credits, 0) /
    credits
  )
}

export function rankStudents(
  rows: Array<{ id: string; value: number }>,
  ties: TieMethod
): Array<{ id: string; rank: number }> {
  const sorted = [...rows].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
  const out: Array<{ id: string; rank: number }> = []
  let lastValue: number | null = null
  let lastRank = 0
  let index = 0
  for (const row of sorted) {
    index += 1
    let rank: number
    if (lastValue != null && row.value === lastValue) {
      rank = lastRank
      if (ties === 'sequential') rank = index
    } else if (ties === 'competition') {
      rank = index
    } else if (ties === 'dense') {
      rank = lastRank ? lastRank + 1 : 1
    } else {
      rank = index
    }
    lastValue = row.value
    lastRank = rank
    out.push({ id: row.id, rank })
  }
  return out
}

export function evaluatePromotion(
  promotion: PromotionConfig,
  input: {
    average: number | null
    failed_subjects: number
    passed_subjects: number
    required_failed: boolean
    attendance_percent?: number | null
  }
): { outcome: PromotionOutcome; reasons: string[] } {
  if (!promotion.enabled) {
    return { outcome: 'pending_review', reasons: ['Promotion rules are not enabled.'] }
  }
  const reasons: string[] = []
  let fail = false
  if (promotion.min_average != null) {
    if (input.average == null || input.average < promotion.min_average) {
      fail = true
      reasons.push(`Overall average must be at least ${promotion.min_average}%.`)
    }
  }
  if (
    promotion.max_failed_subjects != null &&
    input.failed_subjects > promotion.max_failed_subjects
  ) {
    fail = true
    reasons.push(
      `No more than ${promotion.max_failed_subjects} failed subject(s) allowed.`
    )
  }
  if (
    promotion.min_passed_subjects != null &&
    input.passed_subjects < promotion.min_passed_subjects
  ) {
    fail = true
    reasons.push(`At least ${promotion.min_passed_subjects} subject(s) must be passed.`)
  }
  if (input.required_failed) {
    fail = true
    reasons.push('A required subject was not passed.')
  }
  if (
    promotion.attendance_threshold != null &&
    (input.attendance_percent == null ||
      input.attendance_percent < promotion.attendance_threshold)
  ) {
    fail = true
    reasons.push(
      `Attendance must be at least ${promotion.attendance_threshold}%.`
    )
  }
  if (fail) return { outcome: 'not_promoted', reasons }
  if (!promotion.automatic) {
    return { outcome: 'pending_review', reasons: ['Meets criteria — pending review.'] }
  }
  return { outcome: 'promoted', reasons: [] }
}

export function calculateAnnual(
  termScores: number[],
  annual: AnnualConfig
): number | null {
  if (!termScores.length) return null
  if (annual.method === 'best_n') {
    const n = Math.min(annual.best_n ?? termScores.length, termScores.length)
    const top = [...termScores].sort((a, b) => b - a).slice(0, n)
    return top.reduce((s, v) => s + v, 0) / top.length
  }
  if (annual.method === 'weighted' && annual.term_weights.length) {
    const used = annual.term_weights.slice(0, termScores.length)
    const den = used.reduce((s, t) => s + t.weight_percent, 0)
    if (!den) return null
    return used.reduce((s, t, i) => s + (termScores[i] * t.weight_percent) / den, 0)
  }
  return termScores.reduce((s, v) => s + v, 0) / termScores.length
}

export function assertSchoolScope(rowSchoolId: string, sessionSchoolId: string): void {
  if (rowSchoolId !== sessionSchoolId) {
    throw new Error('This record belongs to another school.')
  }
}

export function assertUnlocked(status: string): void {
  if (status === 'locked') {
    throw new Error('Results are locked. Changing calculation settings will not alter them.')
  }
}

export function hasPermission(
  names: string[],
  needed: string[],
  isAdmin: boolean
): boolean {
  if (isAdmin) return true
  return needed.some((n) => names.includes(n))
}

export const STANDARD_BANDS: GradeBandConfig[] = [
  { grade: 'A', min_score: 80, max_score: 100, grade_point: 4, is_pass: true, remark: 'Excellent', order: 1 },
  { grade: 'B', min_score: 70, max_score: 79, grade_point: 3, is_pass: true, remark: 'Very good', order: 2 },
  { grade: 'C', min_score: 60, max_score: 69, grade_point: 2, is_pass: true, remark: 'Good', order: 3 },
  { grade: 'D', min_score: 50, max_score: 59, grade_point: 1, is_pass: true, remark: 'Credit', order: 4 },
  { grade: 'E', min_score: 40, max_score: 49, grade_point: 0, is_pass: false, remark: 'Weak', order: 5 },
  { grade: 'F', min_score: 0, max_score: 39, grade_point: 0, is_pass: false, remark: 'Fail', order: 6 },
]

export const GCE_STYLE_BANDS: GradeBandConfig[] = [
  { grade: 'A1', min_score: 90, max_score: 100, grade_point: 4, is_pass: true, remark: 'Excellent', order: 1 },
  { grade: 'A2', min_score: 80, max_score: 89, grade_point: 3.7, is_pass: true, remark: 'Very good', order: 2 },
  { grade: 'B', min_score: 70, max_score: 79, grade_point: 3, is_pass: true, remark: 'Good', order: 3 },
  { grade: 'C', min_score: 60, max_score: 69, grade_point: 2, is_pass: true, remark: 'Credit', order: 4 },
  { grade: 'D', min_score: 50, max_score: 59, grade_point: 1, is_pass: true, remark: 'Pass', order: 5 },
  { grade: 'F', min_score: 0, max_score: 49, grade_point: 0, is_pass: false, remark: 'Fail', order: 6 },
]

export const CAMEROON_20_BANDS: GradeBandConfig[] = [
  { grade: 'A', min_score: 16, max_score: 20, grade_point: 4, is_pass: true, remark: 'Excellent', order: 1 },
  { grade: 'B', min_score: 14, max_score: 15.999, grade_point: 3, is_pass: true, remark: 'Very Good', order: 2 },
  { grade: 'C', min_score: 12, max_score: 13.999, grade_point: 2, is_pass: true, remark: 'Good', order: 3 },
  { grade: 'D', min_score: 10, max_score: 11.999, grade_point: 1, is_pass: true, remark: 'Pass', order: 4 },
  { grade: 'E', min_score: 8, max_score: 9.999, grade_point: 0, is_pass: false, remark: 'Weak', order: 5 },
  { grade: 'F', min_score: 0, max_score: 7.999, grade_point: 0, is_pass: false, remark: 'Fail', order: 6 },
]

export function cameroonStandardSecondary20(overrides?: Partial<CalculationConfig>): CalculationConfig {
  const caWeight = overrides?.ca_weight ?? 40
  const examWeight = overrides?.exam_weight ?? 60
  return {
    scale: 20,
    ca_weight: caWeight,
    exam_weight: examWeight,
    expected_sequences: 3,
    sequence_method: 'simple_average',
    method: 'weighted',
    best_n: null,
    pass_mark: 10,
    rounding: { places: 2, half: 'standard' },
    missing_policy: 'exclude',
    absent_policy: 'exclude',
    overall: { method: 'credit', default_credit: 1 },
    ranking: { enabled: true, by: 'average', scope: 'class', ties: 'competition' },
    promotion: {
      enabled: true,
      automatic: false,
      min_average: 10,
      max_failed_subjects: 3,
      min_passed_subjects: null,
      min_subject_score: null,
      required_subject_ids: [],
      attendance_threshold: null,
    },
    annual: { method: 'average', term_weights: [], best_n: null },
    subject_overrides: [],
    grading: CAMEROON_20_BANDS,
    use_gpa: false,
    groups: [],
    components: [
      {
        id: 'ca',
        name: 'Continuous Assessment',
        code: 'CA',
        type: 'continuous_assessment',
        source: 'ca',
        max_score: 20,
        weight_percent: caWeight,
        order: 1,
        required: true,
        group_id: null,
      },
      {
        id: 'exam',
        name: 'Final Examination',
        code: 'EXAM',
        type: 'final_exam',
        source: 'exam',
        max_score: 20,
        weight_percent: examWeight,
        order: 2,
        required: true,
        group_id: null,
      },
    ],
    ...overrides,
  }
}

function baseConfig(partial: Partial<CalculationConfig>): CalculationConfig {
  return {
    method: 'weighted',
    best_n: null,
    components: [],
    groups: [],
    grading: STANDARD_BANDS,
    use_gpa: false,
    pass_mark: 50,
    rounding: { places: 1, half: 'standard' },
    missing_policy: 'incomplete',
    absent_policy: 'separate',
    overall: { method: 'average', default_credit: 1 },
    ranking: { enabled: true, by: 'average', scope: 'class', ties: 'competition' },
    promotion: {
      enabled: true,
      automatic: false,
      min_average: 50,
      max_failed_subjects: 2,
      min_passed_subjects: null,
      min_subject_score: null,
      required_subject_ids: [],
      attendance_threshold: null,
    },
    annual: { method: 'average', term_weights: [], best_n: null },
    subject_overrides: [],
    ...partial,
  }
}

export function demoStandard4060(): CalculationConfig {
  return baseConfig({
    components: [
      {
        id: 'ca',
        name: 'Continuous Assessment',
        code: 'CA',
        type: 'continuous_assessment',
        source: 'ca',
        max_score: 100,
        weight_percent: 40,
        order: 1,
        required: true,
        group_id: null,
      },
      {
        id: 'exam',
        name: 'Final Examination',
        code: 'EXAM',
        type: 'final_exam',
        source: 'exam',
        max_score: 100,
        weight_percent: 60,
        order: 2,
        required: true,
        group_id: null,
      },
    ],
  })
}

export function demoUpperSecondary(): CalculationConfig {
  return baseConfig({
    use_gpa: true,
    pass_mark: 50,
    grading: GCE_STYLE_BANDS,
    ranking: { enabled: true, by: 'average', scope: 'class', ties: 'dense' },
    promotion: {
      enabled: true,
      automatic: false,
      min_average: 60,
      max_failed_subjects: 1,
      min_passed_subjects: null,
      min_subject_score: null,
      required_subject_ids: [],
      attendance_threshold: null,
    },
    overall: { method: 'credit', default_credit: 1 },
    components: [
      {
        id: 't1',
        name: 'Test 1',
        code: 'T1',
        type: 'test',
        source: 'named',
        max_score: 20,
        weight_percent: 10,
        order: 1,
        required: true,
        group_id: null,
      },
      {
        id: 't2',
        name: 'Test 2',
        code: 'T2',
        type: 'test',
        source: 'named',
        max_score: 20,
        weight_percent: 10,
        order: 2,
        required: true,
        group_id: null,
      },
      {
        id: 'asg',
        name: 'Assignment',
        code: 'ASG',
        type: 'assignment',
        source: 'named',
        max_score: 20,
        weight_percent: 10,
        order: 3,
        required: true,
        group_id: null,
      },
      {
        id: 'cw',
        name: 'Classwork',
        code: 'CW',
        type: 'classwork',
        source: 'named',
        max_score: 20,
        weight_percent: 10,
        order: 4,
        required: true,
        group_id: null,
      },
      {
        id: 'exam',
        name: 'Final Examination',
        code: 'EXAM',
        type: 'final_exam',
        source: 'exam',
        max_score: 100,
        weight_percent: 60,
        order: 5,
        required: true,
        group_id: null,
      },
    ],
  })
}

export function emptyDraftConfig(): CalculationConfig {
  return demoStandard4060()
}

export function profileLabel(
  name: string,
  yearName: string | null,
  version: number
): string {
  const year = yearName ? ` - ${yearName}` : ''
  return `${name}${year} - Version ${version}`
}

export interface NamedAssessmentInput {
  name: string
  code?: string
  max: number
  score: number | null
  status?: ScoreStatus
}

function matchNamed(
  component: AssessmentComponentConfig,
  items: NamedAssessmentInput[]
): NamedAssessmentInput | undefined {
  const code = component.code.trim().toLowerCase()
  const name = component.name.trim().toLowerCase()
  return items.find((item) => {
    const n = item.name.trim().toLowerCase()
    const c = (item.code ?? '').trim().toLowerCase()
    return n === name || c === code || n === code || c === name
  })
}

/** Bind live CA/exam scores onto profile components without hard-coding schools. */
export function mapComponentInputs(
  components: AssessmentComponentConfig[],
  caItems: NamedAssessmentInput[],
  exam: NamedAssessmentInput | null
): ScoreInput[] {
  const caComponents = components.filter((c) => c.source === 'ca')
  const recordedCa = caItems.filter((i) => i.score != null)
  const caAverage: NamedAssessmentInput | null = recordedCa.length
    ? {
        name: 'CA',
        max: 100,
        score:
          recordedCa.reduce(
            (s, i) => s + normalizeScore(i.score as number, i.max),
            0
          ) / recordedCa.length,
        status: 'recorded',
      }
    : caItems.length
      ? { name: 'CA', max: 100, score: null, status: 'missing' }
      : null

  return components.map((component) => {
    if (component.source === 'exam' && exam) {
      return {
        componentId: component.id,
        raw: exam.score,
        max: exam.max,
        status: exam.status,
      }
    }
    if (component.source === 'named' || component.source === 'ca') {
      const named = matchNamed(component, caItems)
      if (named) {
        return {
          componentId: component.id,
          raw: named.score,
          max: named.max,
          status: named.status,
        }
      }
    }
    if (component.source === 'ca' && caComponents.length === 1 && caAverage) {
      return {
        componentId: component.id,
        raw: caAverage.score,
        max: 100,
        status: caAverage.status,
      }
    }
    if (component.source === 'exam') {
      return { componentId: component.id, raw: null, status: 'missing' }
    }
    return { componentId: component.id, raw: null, status: 'missing' }
  })
}
