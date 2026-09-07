/** Result calculation configuration IPC helpers. */

export type ProfileStatus = 'draft' | 'active' | 'archived'

export interface CalculationConfig {
  scale?: number
  ca_weight?: number
  exam_weight?: number
  expected_sequences?: number
  sequence_method?: 'weighted' | 'simple_average' | 'sum' | 'best_n'
  method: 'weighted' | 'simple_average' | 'sum' | 'best_n'
  best_n: number | null
  components: Array<{
    id: string
    name: string
    code: string
    type: string
    source: 'ca' | 'exam' | 'named'
    max_score: number
    weight_percent: number
    order: number
    required: boolean
    group_id: string | null
  }>
  groups: Array<{
    id: string
    name: string
    weight_percent: number
    method: 'weighted' | 'simple_average' | 'sum' | 'best_n'
    best_n: number | null
    order: number
  }>
  grading: Array<{
    grade: string
    min_score: number
    max_score: number
    grade_point: number | null
    is_pass: boolean
    remark: string
    order: number
  }>
  use_gpa: boolean
  pass_mark: number
  rounding: { places: 'none' | 0 | 1 | 2; half: 'up' | 'down' | 'standard' }
  missing_policy: 'zero' | 'exclude' | 'incomplete' | 'resolve'
  absent_policy: 'zero' | 'exclude' | 'separate'
  overall: { method: 'average' | 'weighted' | 'total_ratio' | 'credit'; default_credit: number }
  ranking: {
    enabled: boolean
    by: 'average' | 'total'
    scope: 'class' | 'stream' | 'department' | 'level' | 'none'
    ties: 'competition' | 'dense' | 'sequential'
  }
  promotion: {
    enabled: boolean
    automatic: boolean
    min_average: number | null
    max_failed_subjects: number | null
    min_passed_subjects: number | null
    min_subject_score: number | null
    required_subject_ids: string[]
    attendance_threshold: number | null
  }
  annual: {
    method: 'average' | 'weighted' | 'best_n'
    term_weights: Array<{ term_number: number; weight_percent: number }>
    best_n: number | null
  }
  subject_overrides: Array<{
    subject_id: string
    pass_mark: number | null
    credit: number | null
    optional: boolean
    include_in_average: boolean
  }>
}

export interface ProfileDto {
  profile: {
    id: string
    name: string
    description: string
    academic_year_id: string | null
    period_mode: 'term' | 'annual'
    status: ProfileStatus
    created_at: string
    updated_at: string
  }
  version_number: number
  config_hash: string
  config: CalculationConfig
  assignments: Array<{
    id: string
    class_id: string | null
    academic_level_id: string | null
    department_id: string | null
    allow_overlap: number
  }>
  used_in_results: boolean
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function listCalculationProfiles() {
  return (await window.ipc.invoke('results-calc:list')) as Result<ProfileDto[]>
}

export async function getCalculationProfile(id: string) {
  return (await window.ipc.invoke('results-calc:get', { id })) as Result<ProfileDto>
}

export async function createCalculationProfile(input: {
  name: string
  description?: string
  period_mode?: 'term' | 'annual'
  config?: CalculationConfig
}) {
  return (await window.ipc.invoke('results-calc:create', input)) as Result<ProfileDto>
}

export async function saveCalculationProfile(input: {
  id: string
  name: string
  description?: string
  period_mode?: 'term' | 'annual'
  config: CalculationConfig
  assignments?: ProfileDto['assignments']
  create_new_version?: boolean
}) {
  return (await window.ipc.invoke('results-calc:save', input)) as Result<ProfileDto>
}

export async function activateCalculationProfile(id: string) {
  return (await window.ipc.invoke('results-calc:activate', { id })) as Result<ProfileDto>
}

export async function archiveCalculationProfile(id: string) {
  return (await window.ipc.invoke('results-calc:archive', { id })) as Result<ProfileDto>
}

export async function previewCalculation(input: Record<string, unknown>) {
  return (await window.ipc.invoke('results-calc:preview', input)) as Result<{
    inputs: Array<{ name: string; display: string; contribution: number | null; normalized: number | null }>
    final_score: number | null
    grade: string | null
    pass_fail: string
    remark: string
    incomplete: boolean
  }>
}

export async function fetchCalculationMeta() {
  return (await window.ipc.invoke('results-calc:meta')) as Result<{
    classes: Array<{ id: string; name: string; academic_level_id: string | null }>
    levels: Array<{ id: string; name: string }>
    departments: Array<{ id: string; name: string }>
    subjects: Array<{ id: string; name: string }>
    students: Array<{ id: string; name: string; class_id: string }>
    academic_year: { id: string; name: string } | null
  }>
}

export async function fetchCalculationDefaults() {
  return (await window.ipc.invoke('results-calc:defaults')) as Result<{ config: CalculationConfig }>
}

export interface SubjectCoefficientItem {
  subject_id: string
  subject_name: string
  subject_code: string
  department_id: string | null
  department_name: string | null
  class_id: string | null
  class_name: string | null
  academic_level_id: string | null
  academic_year_id: string | null
  base_coefficient: number
  override_coefficient: number | null
  effective_coefficient: number
  override_scope: 'class' | 'level' | 'default'
}

export async function fetchSubjectCoefficients(params?: {
  class_id?: string | null
  academic_year_id?: string | null
}) {
  return (await window.ipc.invoke(
    'results-calc:coefficients-list',
    params
  )) as Result<SubjectCoefficientItem[]>
}

export async function saveSubjectCoefficients(items: Array<{
  subject_id: string
  class_id?: string | null
  academic_level_id?: string | null
  academic_year_id?: string | null
  coefficient: number
}>) {
  return (await window.ipc.invoke(
    'results-calc:coefficients-save',
    { items }
  )) as Result<{ count: number }>
}

export interface ValidationIssue {
  type: 'blocking' | 'warning'
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface CalculationValidationResponse {
  validation: {
    ok: boolean
    blocking_issues: ValidationIssue[]
    warnings: ValidationIssue[]
    total_students: number
    total_subjects: number
    assessment_weights_total: number
  }
  profile_name: string
  config: CalculationConfig
}

export async function validateResultsCalculation(params: {
  class_id: string
  term_id?: string | null
}) {
  return (await window.ipc.invoke(
    'results-calc:validate',
    params
  )) as Result<CalculationValidationResponse>
}

export interface CalculationBreakdownData {
  student_id: string
  student_name: string
  student_code: string | null
  subject_id: string
  subject_name: string
  sequence_details: Array<{
    name: string
    raw: number | null
    max: number
    normalized: number | null
    status: string
    included: boolean
    treatAsZero: boolean
  }>
  ca_average: number | null
  ca_weight: number
  ca_contribution: number | null
  exam_raw: number | null
  exam_max: number
  exam_normalized: number | null
  exam_weight: number
  exam_contribution: number | null
  subject_mark: number | null
  coefficient: number
  weighted_mark: number | null
  grade: string | null
  remark: string
  passed: boolean | null
  scale: number
  status?: string
}

export async function fetchCalculationBreakdown(params: {
  class_id: string
  term_id?: string | null
  student_id: string
  subject_id: string
}) {
  return (await window.ipc.invoke(
    'results-calc:breakdown',
    params
  )) as Result<CalculationBreakdownData>
}

export interface StudentTermSummaryData {
  student_id: string
  student_name: string
  student_code: string | null
  class_name: string
  term_name: string
  year_name: string | null
  total_weighted_marks: number
  total_coefficients: number
  term_average: number
  pass_mark: number
  status: 'PASSED' | 'FAILED' | 'INCOMPLETE'
  position: number | null
  total_students: number
  subjects: Array<{
    subject_id: string
    subject_name: string
    ca_average: number | null
    exam_score: number | null
    subject_mark: number | null
    coefficient: number
    weighted_mark: number | null
    grade: string | null
    remark: string
  }>
}

export async function fetchStudentTermSummary(params: {
  class_id: string
  term_id?: string | null
  student_id: string
}) {
  return (await window.ipc.invoke(
    'results-calc:student-summary',
    params
  )) as Result<StudentTermSummaryData>
}
