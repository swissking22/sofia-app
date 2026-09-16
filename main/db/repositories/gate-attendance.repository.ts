import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  GATE_ATTENDANCE_TYPE,
  localSchoolDayIso,
} from '../../domain/gate-attendance'
import type {
  GateAttendance,
  GateAttendanceStatus,
  GateAttendanceType,
} from '../types'
import { BaseRepository } from './base'

export class GateAttendanceRepository extends BaseRepository<GateAttendance> {
  constructor(db: Database.Database) {
    super(db, 'gate_attendance')
  }

  findForStudentDay(
    schoolId: string,
    studentId: string,
    attendanceDate: string,
    attendanceType: GateAttendanceType = GATE_ATTENDANCE_TYPE
  ): GateAttendance | undefined {
    return this.db
      .prepare(
        `SELECT * FROM gate_attendance
         WHERE school_id = ?
           AND student_id = ?
           AND attendance_date = ?
           AND attendance_type = ?
           AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId, studentId, attendanceDate, attendanceType) as
      | GateAttendance
      | undefined
  }

  /**
   * Insert gate arrival for the school day.
   * Returns existing row when unique index already has a record (race-safe).
   */
  recordGateArrival(input: {
    school_id: string
    student_id: string
    student_code: string
    attendance_date?: string
    scanned_at?: string
    status?: GateAttendanceStatus
    attendance_type?: GateAttendanceType
    device_id?: string | null
    scanned_by?: string | null
  }): { record: GateAttendance; created: boolean } {
    const attendance_date = input.attendance_date || localSchoolDayIso()
    const attendance_type = input.attendance_type || GATE_ATTENDANCE_TYPE
    const existing = this.findForStudentDay(
      input.school_id,
      input.student_id,
      attendance_date,
      attendance_type
    )
    if (existing) {
      return { record: existing, created: false }
    }

    const base = this.buildBaseFields()
    const scanned_at = input.scanned_at || base.created_at
    const record: GateAttendance = {
      ...base,
      school_id: input.school_id,
      student_id: input.student_id,
      student_code: input.student_code,
      attendance_date,
      scanned_at,
      status: input.status || 'present',
      attendance_type,
      device_id: input.device_id ?? null,
      scanned_by: input.scanned_by ?? null,
    }

    try {
      this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO gate_attendance (
               id, school_id, student_id, student_code, attendance_date, scanned_at,
               status, attendance_type, device_id, scanned_by,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (
               @id, @school_id, @student_id, @student_code, @attendance_date, @scanned_at,
               @status, @attendance_type, @device_id, @scanned_by,
               @created_at, @updated_at, @deleted_at, @sync_status, @version
             )`
          )
          .run(record)
        enqueueSync(
          this.db,
          'gate_attendance',
          record.id,
          'INSERT',
          record as unknown as Record<string, unknown>
        )
      })()
      return { record, created: true }
    } catch (err) {
      // Unique index race: another insert won — return that row.
      const raced = this.findForStudentDay(
        input.school_id,
        input.student_id,
        attendance_date,
        attendance_type
      )
      if (raced) return { record: raced, created: false }
      throw err
    }
  }

  countForSchoolDay(
    schoolId: string,
    attendanceDate: string,
    attendanceType: GateAttendanceType = GATE_ATTENDANCE_TYPE
  ): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM gate_attendance
         WHERE school_id = ?
           AND attendance_date = ?
           AND attendance_type = ?
           AND deleted_at IS NULL`
      )
      .get(schoolId, attendanceDate, attendanceType) as { n: number }
    return row.n
  }

  todaySummary(schoolId: string, attendanceDate?: string) {
    const day = attendanceDate || localSchoolDayIso()
    const present = this.countForSchoolDay(schoolId, day)
    const totalActive = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM students
           WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'`
        )
        .get(schoolId) as { n: number }
    ).n
    return {
      attendance_date: day,
      present,
      total_active: totalActive,
      not_yet_scanned: Math.max(0, totalActive - present),
    }
  }
}
