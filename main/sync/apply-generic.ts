/**
 * Generic pull apply for multi-desk MVP tables.
 * Never re-enqueues into sync_queue (echo-loop prevention).
 */
import type { Database } from 'better-sqlite3'
import { recordSyncConflict } from './queue'
import {
  GENERIC_TABLE_COLUMNS,
  isGenericSyncTable,
  type GenericSyncTable,
} from './tables'

export type GenericApplyResult = 'applied' | 'skipped' | 'conflict'

function existingColumns(db: Database, table: string): Set<string> {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string
    }>
    return new Set(rows.map((r) => r.name))
  } catch {
    return new Set()
  }
}

function coerceValue(column: string, value: unknown): unknown {
  if (value === undefined) return null
  if (
    [
      'is_current',
      'is_active',
      'is_system',
      'must_change_password',
      'enable_ranking',
      'show_class_average',
      'show_teacher_remarks',
      'term_number',
      'sort_order',
      'capacity',
      'failed_login_count',
      'version',
    ].includes(column)
  ) {
    if (value === null || value === undefined) return null
    if (typeof value === 'boolean') return value ? 1 : 0
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (['weight_percent', 'coefficient', 'min_score', 'max_score'].includes(column)) {
    if (value === null || value === undefined) return null
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return value
}

/**
 * If a permission name already exists under a different id (local seed),
 * drop local duplicate FKs, remove the local row, and return role_permission
 * rows to reattach after the remote permission is upserted.
 */
function remapPermissionIdentity(
  db: Database,
  remoteId: string,
  name: string
): Array<Record<string, unknown>> {
  const local = db
    .prepare(
      `SELECT id FROM permissions WHERE name = ? AND id <> ? AND deleted_at IS NULL`
    )
    .get(name, remoteId) as { id: string } | undefined
  if (!local) return []

  const rps = db
    .prepare(`SELECT * FROM role_permissions WHERE permission_id = ?`)
    .all(local.id) as Array<Record<string, unknown>>
  db.prepare(`DELETE FROM role_permissions WHERE permission_id = ?`).run(local.id)
  db.prepare(`DELETE FROM permissions WHERE id = ?`).run(local.id)
  return rps.map((r) => ({ ...r, permission_id: remoteId }))
}

function upsertRow(
  db: Database,
  table: GenericSyncTable,
  payload: Record<string, unknown>,
  remoteVersion: number,
  operation: string
): void {
  const recordId = String(payload.id || '')
  if (!recordId) throw new Error(`Missing id for ${table}`)

  let reattachRolePermissions: Array<Record<string, unknown>> = []
  if (table === 'permissions' && typeof payload.name === 'string') {
    reattachRolePermissions = remapPermissionIdentity(db, recordId, payload.name)
  }

  const allowed = GENERIC_TABLE_COLUMNS[table]
  const present = existingColumns(db, table)
  const cols = allowed.filter((c) => present.has(c) && c !== 'sync_status')
  if (!cols.includes('id')) cols.unshift('id')

  const now = new Date().toISOString()
  const values: Record<string, unknown> = {}
  for (const col of cols) {
    if (col === 'id') {
      values.id = recordId
      continue
    }
    if (col === 'version') {
      values.version = remoteVersion
      continue
    }
    if (col === 'updated_at') {
      values.updated_at = payload.updated_at || now
      continue
    }
    if (col === 'created_at') {
      values.created_at = payload.created_at || now
      continue
    }
    if (col === 'deleted_at') {
      values.deleted_at =
        operation === 'DELETE'
          ? payload.deleted_at || now
          : payload.deleted_at ?? null
      continue
    }
    if (col === 'class_id' && table === 'subjects') {
      values.class_id =
        payload.class_id !== undefined && payload.class_id !== null
          ? payload.class_id
          : ''
      continue
    }
    if (col === 'first_name' || col === 'last_name') {
      values[col] = payload[col] != null ? String(payload[col]) : ''
      continue
    }
    if (col === 'failed_login_count' || col === 'must_change_password') {
      values[col] = coerceValue(col, payload[col] ?? 0)
      continue
    }
    if (col === 'status' && table === 'users') {
      values.status = payload.status != null ? String(payload.status) : 'active'
      continue
    }
    values[col] = coerceValue(col, payload[col])
  }

  if (present.has('sync_status')) {
    cols.push('sync_status')
    values.sync_status = 'synced'
  }

  const placeholders = cols.map((c) => `@${c}`).join(', ')
  const updates = cols
    .filter((c) => c !== 'id' && c !== 'created_at')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ')

  db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updates}`
  ).run(values)

  for (const rp of reattachRolePermissions) {
    const rpCols = existingColumns(db, 'role_permissions')
    const keys = [
      'id',
      'role_id',
      'permission_id',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_status',
      'version',
    ].filter((k) => rpCols.has(k))
    const row: Record<string, unknown> = {}
    for (const k of keys) {
      row[k] = rp[k] ?? (k === 'sync_status' ? 'synced' : null)
    }
    if (row.sync_status == null) row.sync_status = 'synced'
    if (row.version == null) row.version = 1
    db.prepare(
      `INSERT INTO role_permissions (${keys.join(', ')})
       VALUES (${keys.map((k) => `@${k}`).join(', ')})
       ON CONFLICT(id) DO UPDATE SET permission_id = excluded.permission_id`
    ).run(row)
  }
}

/**
 * Apply one generic sync_changes row into local SQLite.
 */
export function applyGenericPulledChange(
  db: Database,
  change: {
    table_name: string
    record_id: string
    operation: string
    version: number | string
    payload: Record<string, unknown>
  },
  schoolId: string
): GenericApplyResult {
  if (!isGenericSyncTable(change.table_name)) return 'skipped'

  const table = change.table_name
  const recordId = change.record_id
  const remoteVersion = Number(change.version) || 1
  const payload = { ...change.payload, id: change.payload.id || recordId }

  // Soft tenant guard when payload carries school_id
  if (
    payload.school_id != null &&
    String(payload.school_id) !== schoolId &&
    table !== 'permissions'
  ) {
    return 'skipped'
  }

  const existing = db
    .prepare(`SELECT * FROM ${table} WHERE id = ?`)
    .get(recordId) as Record<string, unknown> | undefined

  if (existing) {
    const localVersion = Number(existing.version) || 1
    if (remoteVersion < localVersion) return 'skipped'
    if (remoteVersion === localVersion) {
      if (change.operation === 'DELETE' && !existing.deleted_at) {
        upsertRow(db, table, payload, remoteVersion, 'DELETE')
        return 'applied'
      }
      return 'skipped'
    }

    const pendingOutbox = db
      .prepare(
        `SELECT id FROM sync_queue WHERE record_id = ? AND status = 'pending' LIMIT 1`
      )
      .get(recordId)
    if (pendingOutbox) {
      recordSyncConflict(db, {
        schoolId,
        tableName: table,
        recordId,
        localJson: JSON.stringify(existing),
        remoteJson: JSON.stringify(payload),
      })
      upsertRow(db, table, payload, remoteVersion, change.operation)
      return 'conflict'
    }

    upsertRow(db, table, payload, remoteVersion, change.operation)
    return 'applied'
  }

  upsertRow(db, table, payload, remoteVersion, change.operation)
  return 'applied'
}
