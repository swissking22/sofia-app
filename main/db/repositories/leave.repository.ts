import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type {
  LeaveBalance,
  LeaveRequest,
  LeaveRequestStatus,
  LeaveType,
} from '../types'
import { BaseRepository } from './base'

export const DEFAULT_LEAVE_ENTITLEMENTS: Record<LeaveType, number | null> = {
  sick: 10,
  casual: 5,
  paid: 15,
  unpaid: null,
}

export const LEAVE_TYPES: LeaveType[] = ['sick', 'casual', 'paid', 'unpaid']

export class LeaveRepository extends BaseRepository<LeaveRequest> {
  constructor(db: Database.Database) {
    super(db, 'leave_requests')
  }

  findBySchool(
    schoolId: string,
    filters?: {
      status?: LeaveRequestStatus | 'all'
      staffId?: string | null
      year?: number | null
    }
  ): LeaveRequest[] {
    let rows = this.db
      .prepare(
        `SELECT * FROM leave_requests
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      )
      .all(schoolId) as LeaveRequest[]

    if (filters?.status && filters.status !== 'all') {
      rows = rows.filter((r) => r.status === filters.status)
    }
    if (filters?.staffId) {
      rows = rows.filter((r) => r.staff_id === filters.staffId)
    }
    if (filters?.year) {
      const y = String(filters.year)
      rows = rows.filter(
        (r) => r.start_date.startsWith(y) || r.end_date.startsWith(y)
      )
    }
    return rows
  }

  findCalendar(
    schoolId: string,
    fromDate: string,
    toDate: string
  ): LeaveRequest[] {
    return this.db
      .prepare(
        `SELECT * FROM leave_requests
         WHERE school_id = ?
           AND deleted_at IS NULL
           AND status = 'approved'
           AND start_date <= ?
           AND end_date >= ?
         ORDER BY start_date ASC`
      )
      .all(schoolId, toDate, fromDate) as LeaveRequest[]
  }

  createRequest(input: {
    school_id: string
    staff_id: string
    leave_type: LeaveType
    start_date: string
    end_date: string
    days: number
    reason?: string | null
  }): LeaveRequest {
    const record: LeaveRequest = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      staff_id: input.staff_id,
      leave_type: input.leave_type,
      start_date: input.start_date,
      end_date: input.end_date,
      days: input.days,
      reason: input.reason?.trim() || null,
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      review_notes: null,
    }
    this.db
      .prepare(
        `INSERT INTO leave_requests (
           id, school_id, staff_id, leave_type, start_date, end_date, days,
           reason, status, reviewed_by, reviewed_at, review_notes,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @staff_id, @leave_type, @start_date, @end_date, @days,
           @reason, @status, @reviewed_by, @reviewed_at, @review_notes,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)
    enqueueSync(
      this.db,
      this.tableName,
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  decide(
    id: string,
    input: {
      status: 'approved' | 'rejected' | 'cancelled'
      reviewed_by: string
      review_notes?: string | null
    }
  ): LeaveRequest | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const record: LeaveRequest = {
      ...existing,
      status: input.status,
      reviewed_by: input.reviewed_by,
      reviewed_at: new Date().toISOString(),
      review_notes: input.review_notes?.trim() || null,
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE leave_requests
         SET status = @status,
             reviewed_by = @reviewed_by,
             reviewed_at = @reviewed_at,
             review_notes = @review_notes,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)
    enqueueSync(
      this.db,
      this.tableName,
      record.id,
      'UPDATE',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  getBalances(
    schoolId: string,
    staffId: string,
    year: number
  ): LeaveBalance[] {
    this.ensureBalances(schoolId, staffId, year)
    return this.db
      .prepare(
        `SELECT * FROM leave_balances
         WHERE school_id = ? AND staff_id = ? AND year = ?
           AND deleted_at IS NULL`
      )
      .all(schoolId, staffId, year) as LeaveBalance[]
  }

  ensureBalances(schoolId: string, staffId: string, year: number): void {
    for (const leave_type of LEAVE_TYPES) {
      const existing = this.db
        .prepare(
          `SELECT id FROM leave_balances
           WHERE school_id = ? AND staff_id = ? AND leave_type = ? AND year = ?
             AND deleted_at IS NULL
           LIMIT 1`
        )
        .get(schoolId, staffId, leave_type, year)
      if (existing) continue

      const record: LeaveBalance = {
        ...this.buildBaseFields(),
        school_id: schoolId,
        staff_id: staffId,
        leave_type,
        year,
        entitled: DEFAULT_LEAVE_ENTITLEMENTS[leave_type],
        used: 0,
      }
      this.db
        .prepare(
          `INSERT INTO leave_balances (
             id, school_id, staff_id, leave_type, year, entitled, used,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @staff_id, @leave_type, @year, @entitled, @used,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(record)
      enqueueSync(
        this.db,
        'leave_balances',
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
    }
  }

  getBalanceRow(
    schoolId: string,
    staffId: string,
    leaveType: LeaveType,
    year: number
  ): LeaveBalance | undefined {
    this.ensureBalances(schoolId, staffId, year)
    return this.db
      .prepare(
        `SELECT * FROM leave_balances
         WHERE school_id = ? AND staff_id = ? AND leave_type = ? AND year = ?
           AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId, staffId, leaveType, year) as LeaveBalance | undefined
  }

  addUsed(balanceId: string, days: number): void {
    const row = this.db
      .prepare(
        `SELECT * FROM leave_balances WHERE id = ? AND deleted_at IS NULL`
      )
      .get(balanceId) as LeaveBalance | undefined
    if (!row) return
    const record: LeaveBalance = {
      ...row,
      used: row.used + days,
      ...this.applyUpdateMeta(row),
    }
    this.db
      .prepare(
        `UPDATE leave_balances
         SET used = @used,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)
    enqueueSync(
      this.db,
      'leave_balances',
      record.id,
      'UPDATE',
      record as unknown as Record<string, unknown>
    )
  }
}
