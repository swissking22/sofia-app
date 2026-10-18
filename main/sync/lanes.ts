/**
 * Sync lanes: what must leave the outbox first vs what can wait.
 *
 *   critical    — school, RBAC, users, staff, assignments, timetable
 *   operational — academics structure, students/admissions, grading setup
 *   bulk        — attendance, CA/exams/results, communication, finance, documents
 *
 * Drain order is still table-priority within a lane (see queue.ts).
 * Lanes own UX (“Ready for mobile”) and future time-budget filters.
 */

export type SyncLane = 'critical' | 'operational' | 'bulk'

/** Lower = drains first. */
export const SYNC_LANE_RANK: Record<SyncLane, number> = {
  critical: 0,
  operational: 1,
  bulk: 2,
}

export const SYNC_LANES: SyncLane[] = ['critical', 'operational', 'bulk']

/** Tables that unblock mobile login + teaching desk essentials. */
export const CRITICAL_SYNC_TABLES = [
  'schools',
  'permissions',
  'roles',
  'role_permissions',
  'users',
  'staff',
  'staff_subjects',
  'staff_classes',
  'school_day_breaks',
  'timetable_slots',
] as const

/** Structure + roster needed for day-to-day desk work. */
export const OPERATIONAL_SYNC_TABLES = [
  'academic_years',
  'academic_terms',
  'academic_levels',
  'sections',
  'specializations',
  'departments',
  'student_settings',
  'calendar_events',
  'report_settings',
  'classes',
  'subjects',
  'subject_classes',
  'grading_systems',
  'assessment_types',
  'grade_bands',
  'students',
  'student_id_settings',
  'admissions',
  'student_transfers',
  'student_documents',
  'promotion_runs',
  'promotion_mappings',
] as const

const CRITICAL_SET = new Set<string>(CRITICAL_SYNC_TABLES)
const OPERATIONAL_SET = new Set<string>(OPERATIONAL_SYNC_TABLES)

export function syncLaneForTable(tableName: string): SyncLane {
  if (CRITICAL_SET.has(tableName)) return 'critical'
  if (OPERATIONAL_SET.has(tableName)) return 'operational'
  return 'bulk'
}

/** SQL CASE → 0 critical / 1 operational / 2 bulk (unknown → bulk). */
export const SYNC_LANE_CASE = `
  CASE table_name
    ${CRITICAL_SYNC_TABLES.map((t) => `WHEN '${t}' THEN 0`).join('\n    ')}
    ${OPERATIONAL_SYNC_TABLES.map((t) => `WHEN '${t}' THEN 1`).join('\n    ')}
    ELSE 2
  END
`

export type SyncLaneCounts = {
  critical: number
  operational: number
  bulk: number
  total: number
}

export function emptyLaneCounts(): SyncLaneCounts {
  return { critical: 0, operational: 0, bulk: 0, total: 0 }
}

/** Active push lane from remaining ready counts (lowest non-empty). */
export function activePushLane(counts: SyncLaneCounts): SyncLane {
  if (counts.critical > 0) return 'critical'
  if (counts.operational > 0) return 'operational'
  return 'bulk'
}

/** Critical lane empty → mobile membership / staff can land in cloud. */
export function isCriticalLaneReady(counts: SyncLaneCounts): boolean {
  return counts.critical <= 0
}

export function laneLabel(lane: SyncLane): string {
  switch (lane) {
    case 'critical':
      return 'Essential'
    case 'operational':
      return 'School data'
    case 'bulk':
      return 'History'
  }
}

/**
 * Human message for the progress bar while uploading.
 * Callers pass overall percent + push counts from SyncProgressTracker.
 */
export function pushLaneMessage(
  counts: SyncLaneCounts,
  pushDone: number,
  pushTotal: number,
  percent: number
): string {
  const lane = activePushLane(counts)
  const countsPart =
    pushTotal > 0 ? `${pushDone} of ${pushTotal}` : String(pushDone)

  if (lane === 'critical') {
    return `Uploading essential data (${countsPart})… ${percent}%`
  }
  if (lane === 'operational') {
    return `Ready for mobile · uploading school data (${countsPart})… ${percent}%`
  }
  return `Ready for mobile · syncing history (${countsPart})… ${percent}%`
}

export function doneLaneMessage(counts: SyncLaneCounts): string {
  if (counts.total > 0) {
    if (counts.critical > 0) {
      return 'Sync paused — essential data still pending.'
    }
    if (counts.operational > 0) {
      return 'Ready for mobile · more school data remains — Sync Now again.'
    }
    return 'Ready for mobile · history still syncing — Sync Now again.'
  }
  return 'Sync finished.'
}
