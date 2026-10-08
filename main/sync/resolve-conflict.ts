/**
 * Apply Keep local / Keep remote for rows in sync_conflicts.
 * Resolves all open conflicts for the same school + table + record in one click
 * (repeated syncs often create duplicate open rows for one record).
 */
import type Database from 'better-sqlite3'
import { enqueueSync } from './queue'
import { SUPPORTED_SYNC_TABLES } from './tables'
import type { SyncOperation } from '../db/types'

export type ConflictResolution = 'local' | 'remote'

type ConflictRow = {
  id: string
  school_id: string
  table_name: string
  record_id: string
  local_json: string | null
  remote_json: string | null
  status: string
}

function parseJson(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function isKnownTable(table: string): boolean {
  return (SUPPORTED_SYNC_TABLES as readonly string[]).includes(table)
}

function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return cols.some((c) => c.name === column)
}

function extractCloudVersion(remote: Record<string, unknown> | null): number | null {
  if (!remote) return null
  const n = Number(remote.cloudVersion ?? remote.cloud_version)
  return Number.isFinite(n) && n > 0 ? n : null
}

function extractRemoteEntityVersion(remote: Record<string, unknown> | null): number | null {
  if (!remote || remote.id == null) return null
  const n = Number(remote.version)
  return Number.isFinite(n) && n > 0 ? n : null
}

function isPushConflictResponse(remote: Record<string, unknown> | null): boolean {
  if (!remote) return false
  if (remote.conflict === true) return true
  const hasCloudVersion =
    remote.cloudVersion != null || remote.cloud_version != null
  return hasCloudVersion && remote.id == null
}

function bumpLocalVersion(
  db: Database.Database,
  table: string,
  recordId: string,
  minVersion?: number
): number | null {
  if (!isKnownTable(table) || !tableHasColumn(db, table, 'version')) return null
  const row = db
    .prepare(`SELECT version FROM ${table} WHERE id = ?`)
    .get(recordId) as { version: number } | undefined
  if (!row) return null
  const current = Number(row.version) || 1
  const version = minVersion == null ? current + 1 : Math.max(current, minVersion)
  const now = new Date().toISOString()
  if (tableHasColumn(db, table, 'sync_status')) {
    db.prepare(
      `UPDATE ${table}
       SET version = ?, updated_at = ?, sync_status = 'pending'
       WHERE id = ?`
    ).run(version, now, recordId)
  } else if (tableHasColumn(db, table, 'updated_at')) {
    db.prepare(
      `UPDATE ${table}
       SET version = ?, updated_at = ?
       WHERE id = ?`
    ).run(version, now, recordId)
  } else {
    db.prepare(`UPDATE ${table} SET version = ? WHERE id = ?`).run(version, recordId)
  }
  return version
}

function restoreRowFromSnapshot(
  db: Database.Database,
  table: string,
  recordId: string,
  snapshot: Record<string, unknown>,
  version: number
): boolean {
  if (!isKnownTable(table)) return false
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  const colNames = cols.map((c) => c.name).filter((name) => name !== 'id')
  const now = new Date().toISOString()
  const values: Record<string, unknown> = { id: recordId }
  for (const name of colNames) {
    if (name in snapshot) values[name] = snapshot[name]
  }
  if ('version' in values || tableHasColumn(db, table, 'version')) {
    values.version = version
  }
  if ('updated_at' in values || tableHasColumn(db, table, 'updated_at')) {
    values.updated_at = now
  }
  if ('sync_status' in values || tableHasColumn(db, table, 'sync_status')) {
    values.sync_status = 'pending'
  }
  const sets = colNames.filter((name) => name in values).map((name) => `${name} = @${name}`)
  if (sets.length === 0) return false
  db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = @id`).run(values)
  return true
}

function requeueFailedWithVersion(
  db: Database.Database,
  recordId: string,
  version: number | null
): number {
  const rows = db
    .prepare(
      `SELECT id, payload FROM sync_queue
       WHERE record_id = ? AND status = 'failed'`
    )
    .all(recordId) as Array<{ id: string; payload: string }>

  let updated = 0
  for (const row of rows) {
    const payload = parseJson(row.payload) ?? {}
    if (version != null) payload.version = version
    payload.updated_at = new Date().toISOString()
    db.prepare(
      `UPDATE sync_queue
       SET payload = ?, status = 'pending', retry_count = 0, last_attempt_at = NULL
       WHERE id = ?`
    ).run(JSON.stringify(payload), row.id)
    updated += 1
  }
  return updated
}

function abandonOutboxForRecord(db: Database.Database, recordId: string): number {
  const result = db
    .prepare(
      `UPDATE sync_queue
       SET status = 'synced', last_attempt_at = ?
       WHERE record_id = ? AND status IN ('failed', 'pending')`
    )
    .run(new Date().toISOString(), recordId)
  return result.changes
}

function enqueueCurrentRow(
  db: Database.Database,
  table: string,
  recordId: string
): void {
  if (!isKnownTable(table)) return
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(recordId) as
    | Record<string, unknown>
    | undefined
  if (!row) return
  const operation: SyncOperation = row.deleted_at ? 'DELETE' : 'UPDATE'
  enqueueSync(db, table, recordId, operation, row)
}

/**
 * Resolve one open conflict (and siblings for the same record).
 */
export function applyConflictResolution(
  db: Database.Database,
  params: {
    schoolId: string
    conflictId: string
    resolution: ConflictResolution
    userId: string | null
  }
): { id: string; resolvedCount: number } {
  const conflict = db
    .prepare(
      `SELECT * FROM sync_conflicts
       WHERE id = ? AND school_id = ? AND status = 'open'`
    )
    .get(params.conflictId, params.schoolId) as ConflictRow | undefined

  if (!conflict) {
    throw new Error('Conflict not found or already resolved.')
  }

  const table = String(conflict.table_name)
  const recordId = String(conflict.record_id)
  const local = parseJson(conflict.local_json)
  const remote = parseJson(conflict.remote_json)
  const now = new Date().toISOString()

  if (params.resolution === 'local') {
    const cloudVersion = extractCloudVersion(remote)
    const remoteEntityVersion = extractRemoteEntityVersion(remote)
    const minNext =
      cloudVersion != null
        ? cloudVersion + 1
        : remoteEntityVersion != null
          ? remoteEntityVersion + 1
          : null

    // Pull conflicts already overwrote local — restore the saved local snapshot first.
    if (local && String(local.id ?? '') === recordId && !isPushConflictResponse(remote)) {
      const versionFloor = minNext ?? (Number(local.version) || 1) + 1
      restoreRowFromSnapshot(db, table, recordId, local, versionFloor)
    }

    const bumped = bumpLocalVersion(db, table, recordId, minNext ?? undefined)

    const requeued = requeueFailedWithVersion(db, recordId, bumped)
    if (requeued === 0) {
      enqueueCurrentRow(db, table, recordId)
    }
  } else {
    abandonOutboxForRecord(db, recordId)
    if (
      isKnownTable(table) &&
      tableHasColumn(db, table, 'sync_status') &&
      remote &&
      String(remote.id ?? '') === recordId
    ) {
      db.prepare(`UPDATE ${table} SET sync_status = 'synced' WHERE id = ?`).run(recordId)
    }
  }

  const result = db
    .prepare(
      `UPDATE sync_conflicts
       SET status = 'resolved',
           resolution = ?,
           resolved_by = ?,
           resolved_at = ?
       WHERE school_id = ?
         AND table_name = ?
         AND record_id = ?
         AND status = 'open'`
    )
    .run(
      params.resolution,
      params.userId,
      now,
      params.schoolId,
      table,
      recordId
    )

  return { id: params.conflictId, resolvedCount: result.changes }
}
