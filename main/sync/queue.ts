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
    WHEN 'student_settings' THEN 1
    WHEN 'calendar_events' THEN 1
    WHEN 'report_settings' THEN 1
    WHEN 'classes' THEN 2
    WHEN 'subjects' THEN 2
    WHEN 'subject_classes' THEN 2
    WHEN 'permissions' THEN 2
    WHEN 'roles' THEN 2
    WHEN 'role_permissions' THEN 2
    WHEN 'users' THEN 3
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
    WHEN 'admissions' THEN 5
    WHEN 'student_transfers' THEN 5
    WHEN 'student_documents' THEN 5
    WHEN 'promotion_runs' THEN 5
    WHEN 'promotion_mappings' THEN 5
    WHEN 'attendance_sessions' THEN 6
    WHEN 'attendance_records' THEN 6
    WHEN 'gate_attendance' THEN 6
    WHEN 'staff_attendance' THEN 6
    WHEN 'ca_assessments' THEN 6
    WHEN 'ca_scores' THEN 6
    WHEN 'exam_sessions' THEN 6
    WHEN 'exam_papers' THEN 6
    WHEN 'exam_scores' THEN 6
    WHEN 'result_calculation_profiles' THEN 7
    WHEN 'result_calculation_profile_versions' THEN 7
    WHEN 'result_calculation_class_assignments' THEN 7
    WHEN 'result_subject_coefficients' THEN 7
    WHEN 'result_runs' THEN 7
    WHEN 'result_subject_rows' THEN 7
    WHEN 'result_student_summaries' THEN 7
    WHEN 'report_cards' THEN 7
    WHEN 'teaching_syllabi' THEN 7
    WHEN 'syllabus_topics' THEN 7
    WHEN 'teaching_logs' THEN 7
    WHEN 'announcements' THEN 8
    WHEN 'internal_notices' THEN 8
    WHEN 'communication_settings' THEN 8
    WHEN 'notification_templates' THEN 8
    WHEN 'communication_deliveries' THEN 8
    WHEN 'parent_message_threads' THEN 8
    WHEN 'parent_messages' THEN 8
    WHEN 'staff_notifications' THEN 8
    WHEN 'leave_balances' THEN 8
    WHEN 'leave_requests' THEN 8
    WHEN 'finance_settings' THEN 9
    WHEN 'fee_categories' THEN 9
    WHEN 'fee_amounts' THEN 9
    WHEN 'fee_structures' THEN 9
    WHEN 'fee_structure_lines' THEN 9
    WHEN 'fee_discounts' THEN 9
    WHEN 'student_fee_discounts' THEN 10
    WHEN 'invoices' THEN 10
    WHEN 'invoice_lines' THEN 10
    WHEN 'payments' THEN 11
    WHEN 'receipts' THEN 11
    WHEN 'student_credits' THEN 11
    WHEN 'document_templates' THEN 12
    WHEN 'document_number_sequences' THEN 12
    WHEN 'document_signatories' THEN 12
    WHEN 'issued_documents' THEN 12
    WHEN 'issued_document_versions' THEN 12
    WHEN 'document_audit_log' THEN 12
    WHEN 'student_id_card_templates' THEN 12
    WHEN 'id_card_template_versions' THEN 12
    WHEN 'id_card_settings' THEN 12
    WHEN 'id_card_sequences' THEN 12
    WHEN 'student_id_cards' THEN 12
    WHEN 'id_card_generation_jobs' THEN 12
    WHEN 'id_card_generation_items' THEN 12
    WHEN 'id_card_print_history' THEN 12
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
  // Never put credentials in the outbox / cloud mirror.
  const safePayload =
    tableName === 'users'
      ? (() => {
          const copy = { ...payload }
          delete copy.password_hash
          return copy
        })()
      : payload

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
    payload: JSON.stringify(safePayload),
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

function tableColumns(db: Database.Database, table: string): Set<string> {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string
    }>
    return new Set(rows.map((r) => r.name))
  } catch {
    return new Set()
  }
}

/**
 * Enqueue domain rows that are still `sync_status='pending'` but never made it
 * into `sync_queue` (seed data, pre-allowlist tables, missed repository writes).
 * Caps per call so Sync Now stays responsive; remaining rows enqueue next click.
 */
export function enqueueOrphanedPendingRows(
  db: Database.Database,
  options?: { limit?: number }
): number {
  const limit = options?.limit ?? 5000
  let enqueued = 0
  const pendingExists = db.prepare(
    `SELECT 1 AS ok FROM sync_queue
     WHERE table_name = ? AND record_id = ? AND status = 'pending'
     LIMIT 1`
  )

  for (const table of SUPPORTED_SYNC_TABLES) {
    if (enqueued >= limit) break
    const cols = tableColumns(db, table)
    if (!cols.has('id') || !cols.has('sync_status')) continue

    const whereDeleted = cols.has('deleted_at')
      ? `AND deleted_at IS NULL`
      : ''
    let rows: Array<Record<string, unknown>> = []
    try {
      rows = db
        .prepare(
          `SELECT * FROM ${table}
           WHERE sync_status = 'pending' ${whereDeleted}
           LIMIT ?`
        )
        .all(limit - enqueued) as Array<Record<string, unknown>>
    } catch {
      continue
    }

    // Permissions are a global catalog seeded on every desk — do not re-push locals.
    if (table === 'permissions') continue

    for (const row of rows) {
      if (enqueued >= limit) break
      const recordId = String(row.id || '')
      if (!recordId) continue
      if (pendingExists.get(table, recordId)) continue
      enqueueSync(db, table, recordId, 'INSERT', row)
      enqueued += 1
    }
  }

  return enqueued
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
export function markFailed(
  db: Database.Database,
  id: string,
  error?: string | null
): void {
  const message = (error ?? '').trim().slice(0, 2000) || null
  db.prepare(
    `UPDATE sync_queue
     SET status = 'failed',
         retry_count = retry_count + 1,
         last_attempt_at = ?,
         last_error = ?
     WHERE id = ?`
  ).run(new Date().toISOString(), message, id)
}

export type FailedSyncItem = {
  id: string
  table_name: string
  record_id: string
  operation: string
  retry_count: number
  last_attempt_at: string | null
  last_error: string | null
  created_at: string
}

/** Failed Phase 1 outbox rows with the last error message for admin UI. */
export function listFailedSyncItems(
  db: Database.Database,
  limit = 100
): FailedSyncItem[] {
  const rows = db
    .prepare(
      `SELECT id, table_name, record_id, operation, retry_count,
              last_attempt_at, last_error, created_at
       FROM sync_queue
       WHERE status = 'failed'
         AND table_name IN (${SUPPORTED_IN_LIST})
       ORDER BY COALESCE(last_attempt_at, created_at) DESC
       LIMIT ?`
    )
    .all(Math.max(1, Math.min(500, limit))) as FailedSyncItem[]
  return rows.map((r) => ({
    ...r,
    retry_count: Number(r.retry_count) || 0,
    last_error: r.last_error || null,
  }))
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
         SET status = 'pending', last_error = NULL
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
       SET status = 'pending', last_error = NULL
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
