import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { SyncOperation } from '../db/types'

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

/** Fetch pending sync items (used later by the sync worker). */
export function getPendingSyncItems(
  db: Database.Database,
  limit = 50
): Array<Record<string, unknown>> {
  return db
    .prepare(
      `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`
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

/** Mark failed items as pending so they can be retried. */
export function retryFailed(db: Database.Database, ids?: string[]): number {
  if (ids?.length) {
    const placeholders = ids.map(() => '?').join(',')
    const result = db
      .prepare(
        `UPDATE sync_queue SET status = 'pending' WHERE status = 'failed' AND id IN (${placeholders})`
      )
      .run(...ids)
    return result.changes
  }
  const result = db
    .prepare(`UPDATE sync_queue SET status = 'pending' WHERE status = 'failed'`)
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
