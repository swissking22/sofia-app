type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type GateScanOutcome =
  | 'recorded'
  | 'duplicate'
  | 'not_found'
  | 'invalid'
  | 'inactive'
  | 'error'

export type GateScanResultDto = {
  outcome: GateScanOutcome
  message: string
  tone: 'success' | 'warning' | 'error'
  student: {
    id: string
    name: string
    student_code: string
    class_name: string | null
    photo_url: string | null
    status: string
  } | null
  attendance: {
    id: string
    attendance_date: string
    scanned_at: string
    arrival_display: string
    status: string
    attendance_type: string
  } | null
  school_day: string
}

export type GateTodaySummaryDto = {
  attendance_date: string
  present: number
  total_active: number
  not_yet_scanned: number
  school_name: string
  clock: string
  local_day: string
}

export async function submitGateScan(raw: string) {
  return (await window.ipc.invoke('gate-attendance:scan', {
    raw,
  })) as Result<GateScanResultDto>
}

export async function fetchGateTodaySummary() {
  return (await window.ipc.invoke(
    'gate-attendance:today-summary'
  )) as Result<GateTodaySummaryDto>
}

/** Result panel auto-reset delay (keep in sync with main domain constant). */
export const GATE_RESULT_DISPLAY_MS = 2800
