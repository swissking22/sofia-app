/**
 * Gate / entrance QR scanner attendance domain.
 * USB HID scanners act as keyboards; payload is permanent student_code only.
 */

export const GATE_ATTENDANCE_TYPE = 'gate' as const

/** Max accepted raw scan length (guards against paste floods). */
export const GATE_SCAN_MAX_RAW_LENGTH = 96

/** UI result display duration before returning to READY (ms). */
export const GATE_RESULT_DISPLAY_MS = 2800

/**
 * Inter-key gap above which input is treated as slow manual typing
 * (still accepted on Enter for keyboard test mode).
 */
export const GATE_SCAN_SLOW_TYPING_MS = 80

export type GateScanOutcome =
  | 'recorded'
  | 'duplicate'
  | 'not_found'
  | 'invalid'
  | 'inactive'
  | 'error'

export type GateScanFeedbackTone = 'success' | 'warning' | 'error'

export function localSchoolDayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatGateClockTime(isoTimestamp: string): string {
  try {
    const d = new Date(isoTimestamp)
    if (Number.isNaN(d.getTime())) return isoTimestamp
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return isoTimestamp
  }
}

/** Normalize raw HID wedge buffer before parse. */
export function normalizeGateScanRaw(raw: string): string {
  return String(raw || '')
    .replace(/\r/g, '')
    .trim()
}

export function isGateScanRawAcceptable(raw: string): boolean {
  const value = normalizeGateScanRaw(raw)
  if (!value) return false
  if (value.length > GATE_SCAN_MAX_RAW_LENGTH) return false
  return true
}

export function gateFeedbackTone(outcome: GateScanOutcome): GateScanFeedbackTone {
  if (outcome === 'recorded') return 'success'
  if (outcome === 'duplicate') return 'warning'
  return 'error'
}
