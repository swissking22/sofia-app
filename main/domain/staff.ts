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

export type TeachingAssignment = { class_id: string; subject_id: string }

export function teachingAssignmentKey(a: TeachingAssignment): string {
  return `${a.class_id}::${a.subject_id}`
}

export function normalizeTeachingAssignments(
  pairs: TeachingAssignment[],
  offeredBySubject: Map<string, string[]>
): TeachingAssignment[] {
  const seen = new Set<string>()
  const out: TeachingAssignment[] = []
  for (const pair of pairs) {
    const class_id = pair.class_id?.trim()
    const subject_id = pair.subject_id?.trim()
    if (!class_id || !subject_id) continue
    const offered = offeredBySubject.get(subject_id)
    if (offered && offered.length > 0 && !offered.includes(class_id)) continue
    const key = teachingAssignmentKey({ class_id, subject_id })
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ class_id, subject_id })
  }
  return out
}

/**
 * Legacy independent subject + class lists become class×subject pairs.
 * A pair is kept only when the subject is offered in that class (if offerings exist).
 */
export function expandLegacyTeachingAssignments(
  subjectIds: string[],
  classIds: string[],
  offeredBySubject: Map<string, string[]>
): TeachingAssignment[] {
  const pairs: TeachingAssignment[] = []
  for (const subject_id of subjectIds) {
    const offered = offeredBySubject.get(subject_id) ?? []
    const classes =
      classIds.length > 0
        ? classIds.filter((id) => offered.length === 0 || offered.includes(id))
        : offered
    for (const class_id of classes) {
      pairs.push({ class_id, subject_id })
    }
  }
  return normalizeTeachingAssignments(pairs, offeredBySubject)
}

export function formatTeachingAssignmentLabel(
  a: TeachingAssignment,
  className?: string | null,
  subjectName?: string | null
): string {
  const subject = subjectName?.trim() || 'Subject'
  const cls = className?.trim() || 'Class'
  return `${subject} · ${cls}`
}

/** One card in the assignment builder: a class with its subject IDs. */
export type ClassAssignmentGroup = {
  class_id: string
  subject_ids: string[]
}

export function groupAssignmentsByClass(
  pairs: TeachingAssignment[]
): ClassAssignmentGroup[] {
  const map = new Map<string, string[]>()
  for (const pair of pairs) {
    const class_id = pair.class_id?.trim()
    const subject_id = pair.subject_id?.trim()
    if (!class_id || !subject_id) continue
    const list = map.get(class_id) ?? []
    if (!list.includes(subject_id)) list.push(subject_id)
    map.set(class_id, list)
  }
  return [...map.entries()].map(([class_id, subject_ids]) => ({
    class_id,
    subject_ids,
  }))
}

export function flattenClassAssignmentGroups(
  groups: ClassAssignmentGroup[]
): TeachingAssignment[] {
  const pairs: TeachingAssignment[] = []
  for (const g of groups) {
    for (const subject_id of g.subject_ids) {
      pairs.push({ class_id: g.class_id, subject_id })
    }
  }
  return pairs
}

export function summarizeTeachingAssignments(pairs: TeachingAssignment[]): {
  classes: number
  subjects: number
  assignments: number
} {
  const classIds = new Set<string>()
  const subjectIds = new Set<string>()
  for (const p of pairs) {
    if (p.class_id) classIds.add(p.class_id)
    if (p.subject_id) subjectIds.add(p.subject_id)
  }
  return {
    classes: classIds.size,
    subjects: subjectIds.size,
    assignments: pairs.length,
  }
}

/** Subjects offered in a class (from subject.class_ids). */
export function subjectsOfferedInClass<
  T extends { id: string; class_ids: string[] }
>(classId: string, subjects: T[]): T[] {
  if (!classId) return []
  return subjects.filter((s) => s.class_ids.includes(classId))
}

/**
 * Replace all pairs for `previousClassId` with `next` (for that class),
 * then normalize against offerings.
 */
export function upsertClassAssignment(
  existing: TeachingAssignment[],
  previousClassId: string | null,
  next: { class_id: string; subject_ids: string[] },
  offeredBySubject: Map<string, string[]>
): TeachingAssignment[] {
  const kept =
    previousClassId != null
      ? existing.filter((p) => p.class_id !== previousClassId)
      : existing.filter((p) => p.class_id !== next.class_id)
  const added = next.subject_ids.map((subject_id) => ({
    class_id: next.class_id,
    subject_id,
  }))
  return normalizeTeachingAssignments([...kept, ...added], offeredBySubject)
}

/**
 * Copy selected subjects onto target classes, merging without duplicates.
 * Only keeps pairs that are offered in the target class.
 */
export function copySubjectsToClasses(
  existing: TeachingAssignment[],
  subjectIds: string[],
  targetClassIds: string[],
  offeredBySubject: Map<string, string[]>
): TeachingAssignment[] {
  const additions: TeachingAssignment[] = []
  for (const class_id of targetClassIds) {
    for (const subject_id of subjectIds) {
      additions.push({ class_id, subject_id })
    }
  }
  return normalizeTeachingAssignments(
    [...existing, ...additions],
    offeredBySubject
  )
}

export function buildOfferedBySubjectMap(
  subjects: Array<{ id: string; class_ids: string[] }>
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const s of subjects) {
    map.set(s.id, s.class_ids ?? [])
  }
  return map
}

