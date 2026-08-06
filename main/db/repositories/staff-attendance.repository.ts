import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { StaffAttendance, StaffAttendanceStatus } from '../types'
import { BaseRepository } from './base'

export class StaffAttendanceRepository extends BaseRepository<StaffAttendance> {
  constructor(db: Database.Database) {
    super(db, 'staff_attendance')
  }

  findBySchoolDate(schoolId: string, date: string): StaffAttendance[] {
    return this.db
      .prepare(
        `SELECT * FROM staff_attendance
         WHERE school_id = ? AND date = ? AND deleted_at IS NULL`
      )
      .all(schoolId, date) as StaffAttendance[]
  }

  findByStaff(
    staffId: string,
    fromDate?: string | null,
    toDate?: string | null
  ): StaffAttendance[] {
    let sql = `SELECT * FROM staff_attendance
               WHERE staff_id = ? AND deleted_at IS NULL`
    const params: unknown[] = [staffId]
    if (fromDate) {
      sql += ` AND date >= ?`
      params.push(fromDate)
    }
    if (toDate) {
      sql += ` AND date <= ?`
      params.push(toDate)
    }
    sql += ` ORDER BY date DESC`
    return this.db.prepare(sql).all(...params) as StaffAttendance[]
  }

  findBySchoolMonth(
    schoolId: string,
    year: number,
    month: number
  ): StaffAttendance[] {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    return this.db
      .prepare(
        `SELECT * FROM staff_attendance
         WHERE school_id = ? AND date LIKE ? AND deleted_at IS NULL
         ORDER BY date ASC`
      )
      .all(schoolId, `${prefix}%`) as StaffAttendance[]
  }

  upsertDay(input: {
    school_id: string
    staff_id: string
    date: string
    status: StaffAttendanceStatus
    notes?: string | null
    marked_by?: string | null
  }): StaffAttendance {
    const existing = this.db
      .prepare(
        `SELECT * FROM staff_attendance
         WHERE school_id = ? AND staff_id = ? AND date = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(input.school_id, input.staff_id, input.date) as
      | StaffAttendance
      | undefined

    if (existing) {
      const record: StaffAttendance = {
        ...existing,
        status: input.status,
        notes: input.notes ?? null,
        marked_by: input.marked_by ?? existing.marked_by,
        ...this.applyUpdateMeta(existing),
      }
      this.db
        .prepare(
          `UPDATE staff_attendance
           SET status = @status,
               notes = @notes,
               marked_by = @marked_by,
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

    const record: StaffAttendance = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      staff_id: input.staff_id,
      date: input.date,
      status: input.status,
      notes: input.notes ?? null,
      marked_by: input.marked_by ?? null,
    }
    this.db
      .prepare(
        `INSERT INTO staff_attendance (
           id, school_id, staff_id, date, status, notes, marked_by,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @staff_id, @date, @status, @notes, @marked_by,
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
}
