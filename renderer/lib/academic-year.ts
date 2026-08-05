/** Academic year setup types + IPC helpers. */

export type CalendarEventType = 'holiday' | 'vacation'

export interface AcademicTermDto {
  id: string
  term_number: number
  name: string
  start_date: string
  end_date: string
}

export interface CalendarEventDto {
  id: string
  type: CalendarEventType
  title: string
  start_date: string
  end_date: string
}

export interface AcademicYearSetup {
  id: string
  school_id: string
  name: string
  start_date: string
  end_date: string
  terms: AcademicTermDto[]
  events: CalendarEventDto[]
}

export interface AcademicYearSetupInput {
  name: string
  start_date: string
  end_date: string
  terms: Array<{
    term_number: number
    name?: string
    start_date: string
    end_date: string
  }>
  events: Array<{
    id?: string | null
    type: CalendarEventType
    title: string
    start_date: string
    end_date: string
  }>
}

export type AcademicYearResult =
  | { ok: true; setup: AcademicYearSetup | null }
  | { ok: false; error: string }

export type AcademicYearSaveResult =
  | { ok: true; setup: AcademicYearSetup }
  | { ok: false; error: string }

export const TERM_LABELS = [
  'First Term',
  'Second Term',
  'Third Term',
] as const

export async function fetchAcademicYearSetup(): Promise<AcademicYearResult> {
  return (await window.ipc.invoke('academic-year:get')) as AcademicYearResult
}

export async function saveAcademicYearSetup(
  input: AcademicYearSetupInput
): Promise<AcademicYearSaveResult> {
  return (await window.ipc.invoke(
    'academic-year:save',
    input
  )) as AcademicYearSaveResult
}
