/**
 * Generic pull apply for multi-desk MVP tables.
 * Never re-enqueues into sync_queue (echo-loop prevention).
 */
import type { Database } from 'better-sqlite3'
import { recordSyncConflict } from './queue'
import {
  GENERIC_TABLE_COLUMNS,
  isGenericSyncTable,
  preferResultRunStatus,
  SEQUENCE_MAX_BY_TABLE,
  type GenericSyncTable,
} from './tables'

export type GenericApplyResult = 'applied' | 'skipped' | 'conflict'

/** Schema-aligned defaults when a remote INSERT omits NOT NULL columns. */
function omittedColumnDefault(
  table: GenericSyncTable,
  column: string
): unknown {
  const byColumn: Record<string, unknown> = {
    show_logo: 1,
    show_stamp: 1,
    show_signature: 1,
    is_enabled: 1,
    is_default: 0,
    requires_approval: 0,
    show_photo: 1,
    validity_months: 12,
    is_system: 0,
    is_active: 1,
    is_mandatory: 0,
    is_adjustment: 0,
    is_recurring: 0,
    header_text: '',
    footer_text: '',
    body_text: '',
    signature_label: 'Principal',
    document_family: 'official',
    type_code: 'DOC',
    category: table === 'student_id_card_templates' ? 'Standard' : 'administrative',
    description: '',
    required_fields: '[]',
    number_pattern: '{SCHOOL_CODE}/{TYPE}/{YEAR}/{SEQUENCE}',
    signatory_role: 'principal',
    card_kind: 'new',
    status:
      table === 'student_id_cards' || table === 'issued_documents'
        ? 'generated'
        : table === 'student_id_card_templates'
          ? 'draft'
          : undefined,
    front_layout: 'classic',
    back_layout: 'info',
    orientation: 'landscape',
    unit: 'mm',
    width_mm: 85.6,
    height_mm: 53.98,
    current_version_number: 1,
    paper_size: 'A4',
    cards_per_row: 2,
    margin_mm: 10,
    gap_x_mm: 4,
    gap_y_mm: 4,
    crop_marks: 0,
    missing_photo_policy: 'generate_without',
    card_ids_json: '[]',
    settings_json: '{}',
    metadata_json: '{}',
    rendered_html: '',
    display_name: '',
    title: table === 'document_signatories' ? '' : undefined,
  }
  return byColumn[column]
}

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
      'is_mandatory',
      'is_adjustment',
      'is_recurring',
      'allow_credit',
      'require_full_deposit_reconciliation',
      'reprint_count',
      'invoice_next_number',
      'payment_next_number',
      'receipt_next_number',
      'expense_next_number',
      'day_of_week',
      'period_number',
      'position',
      'failed_subjects',
      'passed_subjects',
      'version_number',
      'allow_overlap',
      'calculation_version',
      'show_logo',
      'show_stamp',
      'show_signature',
      'is_enabled',
      'is_default',
      'requires_approval',
      'show_photo',
      'validity_months',
      'next_number',
      'total',
      'processed',
      'successful',
      'failed',
      'skipped',
      'cards_per_row',
      'crop_marks',
      'card_count',
      'current_version_number',
    ].includes(column)
  ) {
    if (value === null || value === undefined) return null
    if (typeof value === 'boolean') return value ? 1 : 0
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (
    [
      'weight_percent',
      'coefficient',
      'min_score',
      'max_score',
      'amount',
      'subtotal',
      'discount_total',
      'net_payable',
      'amount_paid',
      'balance',
      'credit_applied',
      'balance_remaining',
      'remaining',
      'late_fee_value',
      'discount_value',
      'debit',
      'credit',
      'allocated_amount',
      'alert_pct',
      'warning_pct',
      'critical_pct',
      'utilization',
      'spent',
      'allocated',
      'budget_alert_pct',
      'budget_warning_pct',
      'budget_critical_pct',
      'score',
      'total',
      'average',
      'ca_score',
      'exam_score',
      'ca_average',
      'subject_mark',
      'weighted_mark',
      'gpa',
      'total_coefficients',
      'total_weighted_marks',
      'width_mm',
      'height_mm',
      'margin_mm',
      'gap_x_mm',
      'gap_y_mm',
    ].includes(column)
  ) {
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

  const existingRow = db
    .prepare(`SELECT * FROM ${table} WHERE id = ?`)
    .get(recordId) as Record<string, unknown> | undefined

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
      values.created_at =
        payload.created_at ||
        (existingRow?.created_at as string) ||
        now
      continue
    }
    if (col === 'deleted_at') {
      values.deleted_at =
        operation === 'DELETE'
          ? payload.deleted_at || now
          : payload.deleted_at !== undefined
            ? payload.deleted_at
            : (existingRow?.deleted_at ?? null)
      continue
    }
    if (col === 'class_id' && table === 'subjects') {
      values.class_id =
        payload.class_id !== undefined && payload.class_id !== null
          ? payload.class_id
          : existingRow?.class_id != null
            ? existingRow.class_id
            : ''
      continue
    }
    if (col === 'first_name' || col === 'last_name') {
      values[col] =
        payload[col] != null
          ? String(payload[col])
          : existingRow?.[col] != null
            ? String(existingRow[col])
            : ''
      continue
    }
    if (col === 'failed_login_count' || col === 'must_change_password') {
      values[col] = coerceValue(
        col,
        payload[col] ?? existingRow?.[col] ?? 0
      )
      continue
    }
    if (col === 'status' && table === 'users') {
      values.status =
        payload.status != null
          ? String(payload.status)
          : existingRow?.status != null
            ? String(existingRow.status)
            : 'active'
      continue
    }
    // Prevent sequence counter back-sliding across desks
    const seqCols = SEQUENCE_MAX_BY_TABLE[table]
    if (seqCols && (seqCols as readonly string[]).includes(col)) {
      const remote = Number(payload[col])
      const local = Number(existingRow?.[col] ?? 0)
      values[col] = Math.max(
        Number.isFinite(local) ? local : 0,
        Number.isFinite(remote) ? remote : 0,
        1
      )
      continue
    }
    // Never regress published/locked result runs to draft/computed
    if (table === 'result_runs' && col === 'status') {
      values.status = preferResultRunStatus(existingRow?.status, payload.status)
      continue
    }
    // Preserve local NOT NULL / existing fields when remote payload omits them
    if (payload[col] === undefined && existingRow && existingRow[col] !== undefined) {
      values[col] = existingRow[col]
      continue
    }
    if (payload[col] === undefined) {
      const insertDefault = omittedColumnDefault(table, col)
      if (insertDefault !== undefined) {
        values[col] = insertDefault
        continue
      }
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
    // Locked result runs are immutable on pull (no soft-delete / rewrite races)
    if (
      table === 'result_runs' &&
      String(existing.status) === 'locked' &&
      change.operation === 'DELETE'
    ) {
      return 'skipped'
    }

    const localVersion = Number(existing.version) || 1
    // Tables without a local version column (e.g. profile versions) always apply
    const hasLocalVersion = Object.prototype.hasOwnProperty.call(existing, 'version')
    if (hasLocalVersion && remoteVersion < localVersion) return 'skipped'
    if (hasLocalVersion && remoteVersion === localVersion) {
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
