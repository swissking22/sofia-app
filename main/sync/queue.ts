import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { SyncOperation } from '../db/types'
import { SUPPORTED_SYNC_TABLES } from './tables'

/** @deprecated Use SUPPORTED_SYNC_TABLES — kept for older imports/tests. */
export const PHASE1_SYNC_TABLES = SUPPORTED_SYNC_TABLES

const SUPPORTED_IN_LIST = SUPPORTED_SYNC_TABLES.map((t) => `'${t}'`).join(', ')

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
 * Drain Phase-1-unsupported pending rows locally without calling the cloud RPC.
 * Prevents sync storms where every Sync Now burns a batch of 50 on invoices/roles/etc.
 */
export function markUnsupportedPendingAsFailed(
  db: Database.Database
): number {
  const result = db
    .prepare(
      `UPDATE sync_queue
       SET status = 'failed',
           retry_count = retry_count + 1,
           last_attempt_at = ?
       WHERE status = 'pending'
         AND table_name NOT IN (${SUPPORTED_IN_LIST})`
    )
    .run(new Date().toISOString())
  return result.changes
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
 */
export function getPendingSyncItems(
  db: Database.Database,
  limit = 50
): Array<Record<string, unknown>> {
  return db
    .prepare(
      `SELECT * FROM sync_queue
       WHERE status = 'pending'
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
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>
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
 * Bulk retry only requeues Phase 1 tables — unsupported tables stay failed
 * so "Retry failed" cannot restart the RPC storm.
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
