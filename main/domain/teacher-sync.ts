/**
 * Shared Teacher sync rules (desktop + documentation for mobile).
 * Cloud RPCs must enforce the same ownership / mark bounds.
 */

/** Tables the Teacher app may push via teacher_push_entity. */
export const TEACHER_WRITABLE_TABLES = [
  'attendance_sessions',
  'attendance_records',
  'ca_scores',
] as const

export type TeacherWritableTable = (typeof TEACHER_WRITABLE_TABLES)[number]

/** Manifest of entities the Teacher bootstrap / sync surface covers. */
export const TEACHER_SYNC_MANIFEST = [
  'teacher',
  'school',
  'academicYear',
  'terms',
  'classes',
  'sections',
  'departments',
  'subjects',
  'teacherAssignments',
  'students',
  'timetable',
  'attendanceSessions',
  'attendanceRecords',
  'assessments',
  'marks',
  'announcements',
  'schoolConfiguration',
  'daySchedule',
] as const

export type TeacherSyncManifestEntity = (typeof TEACHER_SYNC_MANIFEST)[number]

/** Entities intentionally deferred (desktop-only until Phase C+). */
export const TEACHER_SYNC_DEFERRED = [
  'lessonRecords',
  'examScoresWrite',
  'pushNotifications',
  'mobileDeltaCursor',
] as const

export function isTeacherWritableTable(name: string): name is TeacherWritableTable {
  return (TEACHER_WRITABLE_TABLES as readonly string[]).includes(name)
}

export type AssignmentPair = { class_id: string; subject_id: string }

export function teacherOwnsClass(
  assignments: AssignmentPair[],
  classId: string | null | undefined
): boolean {
  if (!classId) return false
  return assignments.some((a) => a.class_id === classId)
}

export function teacherOwnsClassSubject(
  assignments: AssignmentPair[],
  classId: string | null | undefined,
  subjectId: string | null | undefined
): boolean {
  if (!classId || !subjectId) return false
  return assignments.some(
    (a) => a.class_id === classId && a.subject_id === subjectId
  )
}

export function validateMarkScore(
  score: number | null | undefined,
  maxScore: number | null | undefined
): { ok: true } | { ok: false; code: 'MARK_OUT_OF_RANGE'; message: string } {
  if (score == null || Number.isNaN(Number(score))) {
    return {
      ok: false,
      code: 'MARK_OUT_OF_RANGE',
      message: 'Score is required.',
    }
  }
  const s = Number(score)
  if (s < 0) {
    return {
      ok: false,
      code: 'MARK_OUT_OF_RANGE',
      message: 'Score cannot be negative.',
    }
  }
  if (maxScore != null && Number.isFinite(Number(maxScore)) && s > Number(maxScore)) {
    return {
      ok: false,
      code: 'MARK_OUT_OF_RANGE',
      message: `Score cannot exceed maximum (${maxScore}).`,
    }
  }
  return { ok: true }
}

/** Notification event names for a future FCM/APNs bridge (no provider wired). */
export const TEACHER_NOTIFICATION_EVENTS = [
  'announcement.published',
  'timetable.changed',
  'class.changed',
  'assessment.created',
  'assessment.deadline',
  'admin.message',
] as const

export type TeacherNotificationEvent = (typeof TEACHER_NOTIFICATION_EVENTS)[number]
