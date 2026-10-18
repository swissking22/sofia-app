/**
 * Local watermark: skip pushing outbox rows that already have a synced
 * outbox acknowledgement for the same record version (unchanged replay).
 */
import type Database from 'better-sqlite3'

/**
 * True when a prior synced INSERT for this record carries the same
 * payload.version — safe no-op (unchanged replay). UPDATE/DELETE always push
 * so version conflicts can still surface from the cloud.
 */
export function isUnchangedAlreadySynced(
  db: Database.Database,
  tableName: string,
  recordId: string,
  payload: Record<string, unknown>,
  operation?: string
): boolean {
  const op = (operation || 'INSERT').toUpperCase()
  if (op !== 'INSERT') return false

  const payloadVersion = Number(payload.version)
  if (!Number.isFinite(payloadVersion) || payloadVersion <= 0) return false

  try {
    const row = db
      .prepare(
        `SELECT payload FROM sync_queue
         WHERE table_name = ?
           AND record_id = ?
           AND status = 'synced'
         ORDER BY COALESCE(last_attempt_at, created_at) DESC
         LIMIT 1`
      )
      .get(tableName, recordId) as { payload: string } | undefined
    if (!row?.payload) return false
    let prev: { version?: unknown }
    try {
      prev = JSON.parse(row.payload) as { version?: unknown }
    } catch {
      return false
    }
    return Number(prev.version) === payloadVersion
  } catch {
    return false
  }
}

/** @deprecated no-op kept for tests that cleared a column cache. */
export function clearWatermarkColumnCacheForTests(): void {
  /* no column cache anymore */
}
