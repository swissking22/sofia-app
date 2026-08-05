import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { StudentTransfer, TransferStatus } from '../types'
import { BaseRepository } from './base'

export class StudentTransferRepository extends BaseRepository<StudentTransfer> {
  constructor(db: Database.Database) {
    super(db, 'student_transfers')
  }

  findBySchool(schoolId: string): StudentTransfer[] {
    return this.db
      .prepare(
        `SELECT * FROM student_transfers
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY transfer_date DESC, created_at DESC`
      )
      .all(schoolId) as StudentTransfer[]
  }

  create(input: {
    school_id: string
    student_id: string
    from_class_id?: string | null
    to_school_name: string
    transfer_date: string
    reason?: string | null
    status?: TransferStatus
  }): StudentTransfer {
    const record: StudentTransfer = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      student_id: input.student_id,
      from_class_id: input.from_class_id ?? null,
      to_school_name: input.to_school_name.trim(),
      transfer_date: input.transfer_date,
      reason: input.reason ?? null,
      status: input.status ?? 'pending',
    }

    this.db
      .prepare(
        `INSERT INTO student_transfers (
          id, school_id, student_id, from_class_id, to_school_name,
          transfer_date, reason, status,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @student_id, @from_class_id, @to_school_name,
          @transfer_date, @reason, @status,
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

  updateStatus(id: string, status: TransferStatus): StudentTransfer | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const record: StudentTransfer = {
      ...existing,
      status,
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE student_transfers
         SET status = @status,
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
}
