/** Result calculation configuration IPC helpers. */

export type ProfileStatus = 'draft' | 'active' | 'archived'

export interface CalculationConfig {
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
