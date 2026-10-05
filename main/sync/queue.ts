import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { SyncOperation } from '../db/types'
import { SUPPORTED_SYNC_TABLES } from './tables'

/** @deprecated Use SUPPORTED_SYNC_TABLES — kept for older imports/tests. */
export const PHASE1_SYNC_TABLES = SUPPORTED_SYNC_TABLES

const SUPPORTED_IN_LIST = SUPPORTED_SYNC_TABLES.map((t) => `'${t}'`).join(', ')

/**
 * Teacher / structure tables sync before large finance backlogs so mobile
 * readiness is not stuck behind thousands of invoice_lines.
 */
const SYNC_PRIORITY_CASE = `
  CASE table_name
    WHEN 'schools' THEN 0
    WHEN 'academic_years' THEN 1
    WHEN 'academic_terms' THEN 1
    WHEN 'academic_levels' THEN 1
    WHEN 'sections' THEN 1
    WHEN 'specializations' THEN 1
    WHEN 'departments' THEN 1
    WHEN 'classes' THEN 2
    WHEN 'subjects' THEN 2
    WHEN 'subject_classes' THEN 2
    WHEN 'staff' THEN 3
    WHEN 'staff_subjects' THEN 3
    WHEN 'staff_classes' THEN 3
    WHEN 'school_day_breaks' THEN 3
    WHEN 'timetable_slots' THEN 4
    WHEN 'grading_systems' THEN 4
    WHEN 'assessment_types' THEN 4
    WHEN 'grade_bands' THEN 4
    WHEN 'students' THEN 5
    WHEN 'student_id_settings' THEN 5
    WHEN 'attendance_sessions' THEN 6
    WHEN 'attendance_records' THEN 6
    WHEN 'ca_assessments' THEN 6
    WHEN 'ca_scores' THEN 6
    WHEN 'announcements' THEN 7
    ELSE 40
  END
`

const READY_PENDING_WHERE = `
  status = 'pending'
    AND table_name IN (${SUPPORTED_IN_LIST})
    AND (
      last_attempt_at IS NULL
      OR (
        (julianday('now') - julianday(last_attempt_at)) * 86400.0
        >= CASE
          WHEN COALESCE(retry_count, 0) <= 0 THEN 0
          WHEN retry_count = 1 THEN 5
          WHEN retry_count = 2 THEN 15
          WHEN retry_count = 3 THEN 60
          WHEN retry_count = 4 THEN 300
          ELSE 900
        END
      )
    )
`

/**
 * Enqueue a full-record snapshot for future sync.
 * MUST be called on every create / update / soft-delete.
 */
export function enqueueSync(
  db: Database.Database,
  tableName: string,
  recordId: string,
  operation: SyncOperation,
  payload: Record<string, unknown>
): void {
  // Payload must include id + updated_at (full record snapshot)
  const stmt = db.prepare(`
    INSERT INTO sync_queue (
      id, table_name, record_id, operation, payload, status, retry_count, last_attempt_at, created_at
    ) VALUES (
      @id, @table_name, @record_id, @operation, @payload, 'pending', 0, NULL, @created_at
    )
  `)

  stmt.run({
    id: randomUUID(),
    table_name: tableName,
    record_id: recordId,
    operation,
    payload: JSON.stringify(payload),
    created_at: new Date().toISOString(),
  })
}

/**
 * Discard Phase-1-unsupported outbox rows locally without calling the cloud RPC.
 * Marks pending + historically failed unsupported tables as synced so they neither
 * block Sync Now batches nor inflate the Failed counter / Retry storm.
 */
export function discardUnsupportedSyncItems(db: Database.Database): number {
  const result = db
    .prepare(
      `UPDATE sync_queue
       SET status = 'synced',
           last_attempt_at = ?
       WHERE status IN ('pending', 'failed')
         AND table_name NOT IN (${SUPPORTED_IN_LIST})`
    )
    .run(new Date().toISOString())
  return result.changes
}

/** @deprecated Prefer discardUnsupportedSyncItems — kept for call-site clarity during rename. */
export function markUnsupportedPendingAsFailed(
  db: Database.Database
): number {
  return discardUnsupportedSyncItems(db)
}

/**
 * After expanding SUPPORTED_SYNC_TABLES, re-queue rows that were failed only
 * because they were previously unsupported so historical Setup data can push.
 */
export function requeueFailedSupportedTables(db: Database.Database): number {
  const result = db
    .prepare(
      `UPDATE sync_queue
       SET status = 'pending',
           retry_count = 0,
           last_attempt_at = NULL
       WHERE status = 'failed'
         AND table_name IN (${SUPPORTED_IN_LIST})`
    )
    .run()
  return result.changes
}

/**
 * Fetch pending Phase 1 sync items (used by the sync worker / push).
 * Applies exponential backoff on last_attempt_at so network failures
 * do not create a tight retry loop.
 * Teacher/structure tables are ordered ahead of large finance backlogs.
 */
export function getPendingSyncItems(
  db: Database.Database,
  limit = 50
): Array<Record<string, unknown>> {
  return db
    .prepare(
      `SELECT * FROM sync_queue
       WHERE ${READY_PENDING_WHERE}
       ORDER BY ${SYNC_PRIORITY_CASE} ASC, created_at ASC
       LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>
}

/** Count supported pending rows that are eligible to push right now (backoff elapsed). */
export function countReadyPendingSyncItems(db: Database.Database): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM sync_queue WHERE ${READY_PENDING_WHERE}`
    )
    .get() as { n: number }
  return Number(row.n) || 0
}

/** Mark a sync_queue row as synced (simulated — no real API). */
export function markSynced(db: Database.Database, id: string): void {
  db.prepare(
    `UPDATE sync_queue SET status = 'synced', last_attempt_at = ? WHERE id = ?`
  ).run(new Date().toISOString(), id)
}

/** Mark a sync_queue row as failed and bump retry_count. */
export function markFailed(db: Database.Database, id: string): void {
  db.prepare(
    `UPDATE sync_queue
     SET status = 'failed',
         retry_count = retry_count + 1,
         last_attempt_at = ?
     WHERE id = ?`
  ).run(new Date().toISOString(), id)
}

/**
 * Mark failed items as pending so they can be retried.
 * Bulk retry only requeues Phase 1 tables — unsupported tables are discarded
 * as synced by discardUnsupportedSyncItems, so they never re-enter the RPC path.
 */
export function retryFailed(db: Database.Database, ids?: string[]): number {
  if (ids?.length) {
    const placeholders = ids.map(() => '?').join(',')
    const result = db
      .prepare(
        `UPDATE sync_queue
         SET status = 'pending'
         WHERE status = 'failed'
           AND table_name IN (${SUPPORTED_IN_LIST})
           AND id IN (${placeholders})`
      )
      .run(...ids)
    return result.changes
  }
  const result = db
    .prepare(
      `UPDATE sync_queue
       SET status = 'pending'
       WHERE status = 'failed'
         AND table_name IN (${SUPPORTED_IN_LIST})`
    )
    .run()
  return result.changes
}

export function countByStatus(
  db: Database.Database,
  status: string
): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE status = ?`)
    .get(status) as { n: number }
  return row.n
}

/** Pending Phase 1 rows ready for cloud push (ignores unsupported tables). */
export function countPendingPhase1(db: Database.Database): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM sync_queue
       WHERE status = 'pending'
         AND table_name IN (${SUPPORTED_IN_LIST})`
    )
    .get() as { n: number }
  return row.n
}

/** Failed Phase 1 rows that Retry failed can requeue. */
export function countFailedPhase1(db: Database.Database): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM sync_queue
       WHERE status = 'failed'
         AND table_name IN (${SUPPORTED_IN_LIST})`
    )
    .get() as { n: number }
  return row.n
}

/** Pending/failed Phase 1 counts grouped by table_name for admin health UI. */
export function queueStatsByTable(
  db: Database.Database
): Array<{ table_name: string; pending: number; failed: number; synced: number }> {
  const rows = db
    .prepare(
      `SELECT table_name,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) AS synced
       FROM sync_queue
       WHERE table_name IN (${SUPPORTED_IN_LIST})
       GROUP BY table_name
       HAVING pending > 0 OR failed > 0 OR synced > 0
       ORDER BY failed DESC, pending DESC, table_name ASC`
    )
    .all() as Array<{
    table_name: string
    pending: number
    failed: number
    synced: number
  }>
  return rows.map((r) => ({
    table_name: r.table_name,
    pending: Number(r.pending) || 0,
    failed: Number(r.failed) || 0,
    synced: Number(r.synced) || 0,
  }))
}

/**
 * Handle network error during push:
 * Increments retry_count, updates last_attempt_at, but PRESERVES status as 'pending'
 * so it can be retried automatically when connectivity restores.
 */
export function markNetworkError(db: Database.Database, id: string): void {
  db.prepare(
    `UPDATE sync_queue
     SET retry_count = retry_count + 1,
         last_attempt_at = ?
     WHERE id = ?`
  ).run(new Date().toISOString(), id)
}

/**
 * Record a conflict in sync_conflicts table for future conflict resolution UI.
 */
export function recordSyncConflict(
  db: Database.Database,
  params: {
    schoolId: string
    tableName: string
    recordId: string
    localJson?: string
    remoteJson?: string
  }
): void {
  try {
    db.prepare(
      `INSERT INTO sync_conflicts (
        id, school_id, table_name, record_id, local_json, remote_json, status, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, 'open', ?
      )`
    ).run(
      randomUUID(),
      params.schoolId,
      params.tableName,
      params.recordId,
      params.localJson ?? null,
      params.remoteJson ?? null,
      new Date().toISOString()
    )
  } catch {
    // Ignore if table not present in test db
  }
}
