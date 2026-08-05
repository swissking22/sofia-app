/** Grading system setup types + IPC helpers. */

export interface AssessmentTypeDto {
  id: string
  name: string
  weight_percent: number
  sort_order: number
}

export interface GradeBandDto {
  id: string
  grade: string
  min_score: number
  max_score: number
  sort_order: number
}

export interface GradingSystemSetup {
  id: string
  school_id: string
  enable_ranking: boolean
  show_class_average: boolean
  show_teacher_remarks: boolean
  assessment_types: AssessmentTypeDto[]
  grade_bands: GradeBandDto[]
}

export interface GradingSystemSetupInput {
  enable_ranking: boolean
  show_class_average: boolean
  show_teacher_remarks: boolean
  assessment_types: Array<{
    id?: string | null
    name: string
    weight_percent: number
  }>
  grade_bands: Array<{
    id?: string | null
    grade: string
    min_score: number
    max_score: number
  }>
}

type Result<T> = { ok: true; setup: T } | { ok: false; error: string }

export const DEFAULT_ASSESSMENT_TYPES = [
  { name: 'Continuous Assessment', weight_percent: 30 },
  { name: 'Examination', weight_percent: 70 },
] as const

export const DEFAULT_GRADE_BANDS = [
  { grade: 'A', min_score: 80, max_score: 100 },
  { grade: 'B', min_score: 70, max_score: 79 },
  { grade: 'C', min_score: 60, max_score: 69 },
  { grade: 'D', min_score: 50, max_score: 59 },
  { grade: 'E', min_score: 40, max_score: 49 },
  { grade: 'F', min_score: 0, max_score: 39 },
] as const

export async function fetchGradingSystemSetup(): Promise<
  Result<GradingSystemSetup>
> {
  return (await window.ipc.invoke(
    'grading-system:get'
  )) as Result<GradingSystemSetup>
}

export async function saveGradingSystemSetup(
  input: GradingSystemSetupInput
): Promise<Result<GradingSystemSetup>> {
  return (await window.ipc.invoke(
    'grading-system:save',
    input
  )) as Result<GradingSystemSetup>
}
