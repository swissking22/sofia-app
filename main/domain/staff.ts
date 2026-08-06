/**
 * Pure staff domain helpers — leave days, overlap, attendance validation.
 */

export type StaffAttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'half_day'

export type LeaveType = 'sick' | 'casual' | 'paid' | 'unpaid'
export type LeaveRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'

export const ATTENDANCE_STATUSES: StaffAttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'half_day',
]

export const LEAVE_TYPES: LeaveType[] = ['sick', 'casual', 'paid', 'unpaid']

export const DEFAULT_LEAVE_ENTITLEMENTS: Record<LeaveType, number | null> = {
  sick: 10,
  casual: 5,
  paid: 15,
  unpaid: null,
}

/** Inclusive calendar-day count between ISO dates (YYYY-MM-DD). */
export function countLeaveDays(start: string, end: string): number {
  const a = new Date(start + 'T00:00:00')
  const b = new Date(end + 'T00:00:00')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1
}

export function isValidAttendanceStatus(
  value: string
): value is StaffAttendanceStatus {
  return (ATTENDANCE_STATUSES as string[]).includes(value)
}

export function isValidLeaveType(value: string): value is LeaveType {
  return (LEAVE_TYPES as string[]).includes(value)
}

/** True when [startA,endA] overlaps [startB,endB] (inclusive). */
export function leaveRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA <= endB && startB <= endA
}

export function hasOverlappingLeave(
  existing: Array<{
    start_date: string
    end_date: string
    status: LeaveRequestStatus
  }>,
  start: string,
  end: string
): boolean {
  return existing.some(
    (r) =>
      (r.status === 'pending' || r.status === 'approved') &&
      leaveRangesOverlap(r.start_date, r.end_date, start, end)
  )
}

export function canApplyLeave(input: {
  entitled: number | null
  used: number
  days: number
}): { ok: true } | { ok: false; error: string } {
  if (input.days <= 0) {
    return { ok: false, error: 'End date must be on or after start date.' }
  }
  if (
    input.entitled != null &&
    input.used + input.days > input.entitled
  ) {
    return { ok: false, error: 'Insufficient leave balance.' }
  }
  return { ok: true }
}

export function summarizeMonthlyAttendance(
  rows: Array<{ staff_id: string; status: StaffAttendanceStatus }>
): Record<
  string,
  { present: number; absent: number; late: number; half_day: number; total: number }
> {
  const out: Record<
    string,
    { present: number; absent: number; late: number; half_day: number; total: number }
  > = {}
  for (const row of rows) {
    const s = out[row.staff_id] || {
      present: 0,
      absent: 0,
      late: 0,
      half_day: 0,
      total: 0,
    }
    s[row.status] += 1
    s.total += 1
    out[row.staff_id] = s
  }
  return out
}
