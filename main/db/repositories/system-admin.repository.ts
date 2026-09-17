import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { countByStatus, countFailedPhase1, countPendingPhase1, queueStatsByTable, retryFailed } from '../../sync/queue'
import {
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  moduleFromAction,
  parseAuditPayload,
} from '../../domain/system-admin'
import type { User, UserRole } from '../types'

export class SystemAdminRepository {
  constructor(private db: Database.Database) {}

  writeAudit(input: {
    school_id: string
    actor_user_id: string | null
    action: string
    module_key?: string
    entity_type?: string
    entity_id?: string
    description?: string
    result?: string
    before?: unknown
    after?: unknown
    payload?: unknown
  }): void {
    this.db
      .prepare(
        `INSERT INTO audit_events (
          id, school_id, actor_user_id, action, module_key, entity_type, entity_id,
          description, result, before_json, after_json, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        input.school_id,
        input.actor_user_id,
        input.action,
        input.module_key || moduleFromAction(input.action, input.entity_type),
        input.entity_type || '',
        input.entity_id || '',
        input.description || '',
        input.result || 'success',
        input.before ? JSON.stringify(input.before) : null,
        input.after ? JSON.stringify(input.after) : null,
        input.payload ? JSON.stringify(input.payload) : null,
        new Date().toISOString()
      )
  }

  overview(schoolId: string) {
    const users = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'active' AND deleted_at IS NULL THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN status != 'active' AND deleted_at IS NULL THEN 1 ELSE 0 END) AS inactive,
           COUNT(*) AS total
         FROM users WHERE school_id = ? AND deleted_at IS NULL`
      )
      .get(schoolId) as { active: number; inactive: number; total: number }
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const today = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT id FROM audit_events WHERE school_id = ? AND created_at >= ?
           UNION ALL
           SELECT id FROM finance_audit_log WHERE school_id = ? AND created_at >= ? AND deleted_at IS NULL
           UNION ALL
           SELECT id FROM document_audit_log WHERE school_id = ? AND created_at >= ? AND deleted_at IS NULL
         )`
      )
      .get(schoolId, start.toISOString(), schoolId, start.toISOString(), schoolId, start.toISOString()) as {
      n: number
    }
    const lastBackup = this.db
      .prepare(
        `SELECT created_at, status FROM backup_records
         WHERE school_id = ? AND status = 'successful' ORDER BY created_at DESC LIMIT 1`
      )
      .get(schoolId) as { created_at: string; status: string } | undefined
    const settings = this.ensureSettings(schoolId)
    const pending = countByStatus(this.db, 'pending')
    const failed = countByStatus(this.db, 'failed')
    const lastSync = this.db
      .prepare(
        `SELECT created_at, status FROM sync_runs WHERE school_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(schoolId) as { created_at: string; status: string } | undefined
    return {
      users: {
        active: users.active || 0,
        inactive: users.inactive || 0,
        total: users.total || 0,
      },
      audit_today: today.n || 0,
      last_backup_at: lastBackup?.created_at ?? null,
      last_sync_at: lastSync?.created_at ?? null,
      pending_sync: pending,
      failed_sync: failed,
      health: {
        database: 'healthy',
        storage: 'healthy',
        sync: failed > 0 ? 'attention' : pending > 0 ? 'pending' : 'connected',
        // Application version is supplied by IPC from app.getVersion() (package.json).
        version: '',
        timezone: settings.timezone,
        currency: DEFAULT_CURRENCY,
      },
    }
  }

  listUsers(
    schoolId: string,
    filters: { query?: string; role_id?: string; status?: string; page?: number; page_size?: number }
  ) {
    const page = Math.max(1, filters.page || 1)
    const pageSize = Math.min(100, Math.max(10, filters.page_size || 25))
    const clauses = [`u.school_id = @schoolId`, `u.deleted_at IS NULL`]
    const params: Record<string, unknown> = { schoolId }
    if (filters.role_id) {
      clauses.push(`u.role_id = @role_id`)
      params.role_id = filters.role_id
    }
    if (filters.status) {
      clauses.push(`u.status = @status`)
      params.status = filters.status
    }
    if (filters.query?.trim()) {
      clauses.push(
        `(u.email LIKE @q OR u.first_name LIKE @q OR u.last_name LIKE @q)`
      )
      params.q = `%${filters.query.trim()}%`
    }
    const where = clauses.join(' AND ')
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${where}`).get(params) as {
        n: number
      }
    ).n
    const rows = this.db
      .prepare(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.role_id, u.status,
                u.last_login_at, u.created_at, u.staff_id, u.must_change_password,
                r.name AS role_name
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE ${where}
         ORDER BY u.created_at DESC
         LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
      )
      .all(params)
    return { users: rows, total, page, page_size: pageSize }
  }

  getUser(schoolId: string, id: string) {
    const user = this.db
      .prepare(
        `SELECT u.*, r.name AS role_name
         FROM users u LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.id = ? AND u.school_id = ? AND u.deleted_at IS NULL`
      )
      .get(id, schoolId) as (User & { role_name: string | null }) | undefined
    if (!user) return null
    const sessions = this.db
      .prepare(
        `SELECT id, created_at, revoked_at FROM user_sessions
         WHERE user_id = ? AND school_id = ? ORDER BY created_at DESC LIMIT 20`
      )
      .all(id, schoolId)
    const activity = this.listAudit(schoolId, { user_id: id, page: 1, page_size: 15 })
    const { password_hash: _, ...safe } = user
    return { user: safe, sessions, activity: activity.events }
  }

  patchUser(
    schoolId: string,
    id: string,
    input: Partial<{
      first_name: string
      last_name: string
      phone: string | null
      role: UserRole
      role_id: string | null
      status: string
      staff_id: string | null
      password_hash: string
      last_login_at: string | null
      failed_login_count: number
      locked_until: string | null
      must_change_password: number
    }>
  ): void {
    const existing = this.db
      .prepare(`SELECT * FROM users WHERE id = ? AND school_id = ? AND deleted_at IS NULL`)
      .get(id, schoolId) as User | undefined
    if (!existing) throw new Error('User not found.')
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE users SET
           first_name = @first_name, last_name = @last_name, phone = @phone,
           role = @role, role_id = @role_id, status = @status, staff_id = @staff_id,
           password_hash = @password_hash, last_login_at = @last_login_at,
           failed_login_count = @failed_login_count, locked_until = @locked_until,
           must_change_password = @must_change_password,
           updated_at = @updated_at, version = version + 1, sync_status = 'pending'
         WHERE id = @id AND school_id = @school_id`
      )
      .run({
        id,
        school_id: schoolId,
        first_name: input.first_name ?? existing.first_name ?? '',
        last_name: input.last_name ?? existing.last_name ?? '',
        phone: input.phone === undefined ? existing.phone : input.phone,
        role: input.role ?? existing.role,
        role_id: input.role_id === undefined ? existing.role_id : input.role_id,
        status: input.status ?? existing.status,
        staff_id: input.staff_id === undefined ? existing.staff_id : input.staff_id,
        password_hash: input.password_hash ?? existing.password_hash,
        last_login_at: input.last_login_at === undefined ? existing.last_login_at : input.last_login_at,
        failed_login_count: input.failed_login_count ?? existing.failed_login_count,
        locked_until: input.locked_until === undefined ? existing.locked_until : input.locked_until,
        must_change_password:
          input.must_change_password ?? existing.must_change_password,
        updated_at: now,
      })
  }

  insertUser(record: {
    id: string
    school_id: string
    email: string
    password_hash: string
    role: UserRole
    role_id: string | null
    first_name: string
    last_name: string
    phone: string | null
    status: string
    staff_id: string | null
    must_change_password: number
  }): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO users (
          id, school_id, email, password_hash, role, role_id,
          first_name, last_name, phone, status, last_login_at, staff_id,
          failed_login_count, locked_until, must_change_password,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @email, @password_hash, @role, @role_id,
          @first_name, @last_name, @phone, @status, NULL, @staff_id,
          0, NULL, @must_change_password,
          @created_at, @updated_at, NULL, 'pending', 1
        )`
      )
      .run({ ...record, created_at: now, updated_at: now })
  }

  createSession(schoolId: string, userId: string): string {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO user_sessions (id, school_id, user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)`
      )
      .run(id, schoolId, userId, new Date().toISOString())
    return id
  }

  revokeSessions(schoolId: string, userId: string): void {
    this.db
      .prepare(
        `UPDATE user_sessions SET revoked_at = ? WHERE school_id = ? AND user_id = ? AND revoked_at IS NULL`
      )
      .run(new Date().toISOString(), schoolId, userId)
  }

  listAudit(
    schoolId: string,
    filters: {
      query?: string
      module?: string
      action?: string
      user_id?: string
      from?: string
      to?: string
      page?: number
      page_size?: number
    }
  ) {
    const page = Math.max(1, filters.page || 1)
    const pageSize = Math.min(100, Math.max(10, filters.page_size || 25))
    const extra: string[] = []
    const params: unknown[] = [schoolId, schoolId, schoolId]
    if (filters.user_id) {
      extra.push(`actor_id = ?`)
      params.push(filters.user_id)
    }
    if (filters.action) {
      extra.push(`action = ?`)
      params.push(filters.action)
    }
    if (filters.module) {
      extra.push(`module_key = ?`)
      params.push(filters.module)
    }
    if (filters.from) {
      extra.push(`created_at >= ?`)
      params.push(filters.from)
    }
    if (filters.to) {
      extra.push(`created_at <= ?`)
      params.push(filters.to)
    }
    if (filters.query?.trim()) {
      extra.push(`(action LIKE ? OR description LIKE ? OR entity_id LIKE ?)`)
      const q = `%${filters.query.trim()}%`
      params.push(q, q, q)
    }
    const whereExtra = extra.length ? `WHERE ${extra.join(' AND ')}` : ''
    const union = `
      SELECT id, created_at, actor_user_id AS actor_id, action,
             module_key, entity_type, entity_id, description, result,
             before_json, after_json, payload_json, 'audit_events' AS source
      FROM audit_events WHERE school_id = ?
      UNION ALL
      SELECT id, created_at, user_id AS actor_id, action,
             'Finance' AS module_key, entity_type, entity_id, '' AS description,
             'success' AS result, NULL AS before_json, payload_json AS after_json,
             payload_json, 'finance_audit_log' AS source
      FROM finance_audit_log WHERE school_id = ? AND deleted_at IS NULL
      UNION ALL
      SELECT id, created_at, user_id AS actor_id, action,
             'Documents' AS module_key, entity_type, entity_id, '' AS description,
             'success' AS result, NULL, payload_json, payload_json, 'document_audit_log'
      FROM document_audit_log WHERE school_id = ? AND deleted_at IS NULL
    `
    const wrapped = `SELECT * FROM (${union}) ${whereExtra}`
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM (${wrapped})`).get(...params) as { n: number }
    ).n
    const events = this.db
      .prepare(
        `${wrapped} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
      )
      .all(...params) as Array<Record<string, unknown>>
    const emails = this.db
      .prepare(`SELECT id, email, first_name, last_name FROM users WHERE school_id = ?`)
      .all(schoolId) as Array<{ id: string; email: string; first_name: string; last_name: string }>
    const byId = new Map(emails.map((u) => [u.id, u]))
    return {
      total,
      page,
      page_size: pageSize,
      events: events.map((e) => {
        const parsed = parseAuditPayload(
          (e.payload_json as string) || (e.after_json as string) || null
        )
        const actor = e.actor_id ? byId.get(String(e.actor_id)) : null
        return {
          ...e,
          user_email: actor?.email ?? null,
          user_name: actor
            ? `${actor.first_name} ${actor.last_name}`.trim() || actor.email
            : null,
          description: (e.description as string) || parsed.description,
          before: e.before_json ? JSON.parse(String(e.before_json)) : parsed.before,
          after: parsed.after,
          result: (e.result as string) || parsed.result,
        }
      }),
    }
  }

  getAudit(schoolId: string, id: string) {
    const row = this.db
      .prepare(
        `SELECT * FROM (
           SELECT id, created_at, actor_user_id AS actor_id, action, module_key, entity_type, entity_id,
                  description, result, before_json, after_json, payload_json
           FROM audit_events WHERE school_id = ?
           UNION ALL
           SELECT id, created_at, user_id, action, 'Finance', entity_type, entity_id, '', 'success', NULL, payload_json, payload_json
           FROM finance_audit_log WHERE school_id = ? AND deleted_at IS NULL
           UNION ALL
           SELECT id, created_at, user_id, action, 'Documents', entity_type, entity_id, '', 'success', NULL, payload_json, payload_json
           FROM document_audit_log WHERE school_id = ? AND deleted_at IS NULL
         ) WHERE id = ?`
      )
      .get(schoolId, schoolId, schoolId, id) as Record<string, unknown> | undefined
    return row || null
  }

  recordBackup(input: {
    school_id: string
    file_path: string
    backup_type: string
    created_by: string | null
    status?: string
    notes?: string
  }) {
    let size = 0
    try {
      size = fs.statSync(input.file_path).size
    } catch {
      size = 0
    }
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO backup_records (
          id, school_id, file_path, file_size, backup_type, status, verification_status,
          created_by, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'ok', ?, ?, ?)`
      )
      .run(
        id,
        input.school_id,
        input.file_path,
        size,
        input.backup_type,
        input.status || 'successful',
        input.created_by,
        input.notes || null,
        new Date().toISOString()
      )
    return this.db.prepare(`SELECT * FROM backup_records WHERE id = ?`).get(id)
  }

  listBackups(schoolId: string, page = 1, pageSize = 25) {
    const total = (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM backup_records WHERE school_id = ?`)
        .get(schoolId) as { n: number }
    ).n
    const rows = this.db
      .prepare(
        `SELECT * FROM backup_records WHERE school_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(schoolId, pageSize, (page - 1) * pageSize)
    return { backups: rows, total, page, page_size: pageSize }
  }

  getBackup(schoolId: string, id: string) {
    return this.db
      .prepare(`SELECT * FROM backup_records WHERE id = ? AND school_id = ?`)
      .get(id, schoolId) as { id: string; file_path: string; school_id: string } | undefined
  }

  recordSyncRun(input: {
    school_id: string
    processed: number
    successful: number
    failed: number
    conflicts: number
    duration_ms: number
    status: string
  }) {
    this.db
      .prepare(
        `INSERT INTO sync_runs (
          id, school_id, direction, processed, successful, failed, conflicts, duration_ms, status, created_at
        ) VALUES (?, ?, 'upload', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        input.school_id,
        input.processed,
        input.successful,
        input.failed,
        input.conflicts,
        input.duration_ms,
        input.status,
        new Date().toISOString()
      )
  }

  listSyncRuns(schoolId: string, page = 1, pageSize = 25) {
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM sync_runs WHERE school_id = ?`).get(schoolId) as {
        n: number
      }
    ).n
    const rows = this.db
      .prepare(
        `SELECT * FROM sync_runs WHERE school_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(schoolId, pageSize, (page - 1) * pageSize)
    return { runs: rows, total, page, page_size: pageSize }
  }

  syncDashboard(schoolId: string) {
    const settings = this.ensureSettings(schoolId)
    const openConflicts = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM sync_conflicts WHERE school_id = ? AND status = 'open'`
        )
        .get(schoolId) as { n: number }
    ).n
    return {
      pending: countPendingPhase1(this.db),
      synced: countByStatus(this.db, 'synced'),
      failed: countFailedPhase1(this.db),
      conflicts: openConflicts,
      timezone: settings.timezone,
      by_table: queueStatsByTable(this.db),
    }
  }

  listConflicts(schoolId: string) {
    return this.db
      .prepare(
        `SELECT * FROM sync_conflicts WHERE school_id = ? ORDER BY created_at DESC LIMIT 100`
      )
      .all(schoolId)
  }

  resolveConflict(
    schoolId: string,
    id: string,
    resolution: 'local' | 'remote',
    userId: string | null
  ) {
    const row = this.db
      .prepare(`SELECT * FROM sync_conflicts WHERE id = ? AND school_id = ? AND status = 'open'`)
      .get(id, schoolId) as { id: string } | undefined
    if (!row) throw new Error('Conflict not found or already resolved.')
    this.db
      .prepare(
        `UPDATE sync_conflicts SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?`
      )
      .run(resolution, userId, new Date().toISOString(), id)
  }

  retryFailedSync(ids?: string[]): number {
    return retryFailed(this.db, ids)
  }

  ensureSettings(schoolId: string) {
    const existing = this.db
      .prepare(`SELECT * FROM system_settings WHERE school_id = ?`)
      .get(schoolId) as Record<string, unknown> | undefined
    if (existing) return existing
    const now = new Date().toISOString()
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO system_settings (
          id, school_id, timezone, session_timeout_minutes, password_min_length,
          password_require_upper, password_require_digit, lockout_attempts, lockout_minutes,
          auto_sync, sync_interval_minutes, backup_retention_days,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (?, ?, ?, 480, 8, 1, 1, 5, 15, 0, 30, 30, ?, ?, NULL, 'pending', 1)`
      )
      .run(id, schoolId, DEFAULT_TIMEZONE, now, now)
    return this.db.prepare(`SELECT * FROM system_settings WHERE id = ?`).get(id) as Record<
      string,
      unknown
    >
  }

  saveSettings(
    schoolId: string,
    input: Partial<{
      timezone: string
      session_timeout_minutes: number
      password_min_length: number
      password_require_upper: boolean
      password_require_digit: boolean
      lockout_attempts: number
      lockout_minutes: number
      auto_sync: boolean
      sync_interval_minutes: number
      backup_retention_days: number
    }>
  ) {
    const current = this.ensureSettings(schoolId)
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE system_settings SET
           timezone = @timezone,
           session_timeout_minutes = @session_timeout_minutes,
           password_min_length = @password_min_length,
           password_require_upper = @password_require_upper,
           password_require_digit = @password_require_digit,
           lockout_attempts = @lockout_attempts,
           lockout_minutes = @lockout_minutes,
           auto_sync = @auto_sync,
           sync_interval_minutes = @sync_interval_minutes,
           backup_retention_days = @backup_retention_days,
           updated_at = @updated_at, version = version + 1
         WHERE school_id = @school_id`
      )
      .run({
        school_id: schoolId,
        timezone: input.timezone || current.timezone || DEFAULT_TIMEZONE,
        session_timeout_minutes: input.session_timeout_minutes ?? current.session_timeout_minutes,
        password_min_length: input.password_min_length ?? current.password_min_length,
        password_require_upper: input.password_require_upper === false ? 0 : 1,
        password_require_digit: input.password_require_digit === false ? 0 : 1,
        lockout_attempts: input.lockout_attempts ?? current.lockout_attempts,
        lockout_minutes: input.lockout_minutes ?? current.lockout_minutes,
        auto_sync: input.auto_sync ? 1 : 0,
        sync_interval_minutes: input.sync_interval_minutes ?? current.sync_interval_minutes,
        backup_retention_days: input.backup_retention_days ?? current.backup_retention_days,
        updated_at: now,
      })
    return this.ensureSettings(schoolId)
  }

  writePendingRestore(backupPath: string): string {
    const dest = path.join(path.dirname(backupPath), '..')
    return dest
  }
}
