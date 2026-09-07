import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  DEFAULT_STUDENT_ID_PATTERN,
  type SequenceScope,
} from '../../helpers/student-id'
import type { StudentIdSettings } from '../types'
import { BaseRepository, type UpdateInput } from './base'

export interface StudentIdSettingsDto {
  id: string
  school_id: string
  pattern: string
  sequence_scope: SequenceScope
  next_sequence_number: number
  school_short_code: string
  school_name: string
}

export interface StudentIdSettingsSaveInput {
  pattern: string
  sequence_scope: SequenceScope
  /** Optionally reset the counter */
  next_sequence_number?: number
}

export class StudentIdSettingsRepository extends BaseRepository<StudentIdSettings> {
  constructor(db: Database.Database) {
    super(db, 'student_id_settings')
  }

  findBySchool(schoolId: string): StudentIdSettings | undefined {
    return this.db
      .prepare(
        `SELECT * FROM student_id_settings
         WHERE school_id = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId) as StudentIdSettings | undefined
  }

  ensureDefaults(schoolId: string): StudentIdSettings {
    const existing = this.findBySchool(schoolId)
    if (existing) return existing

    let initialSequence = 1
    try {
      const maxRow = this.db
        .prepare(
          `SELECT MAX(sequence_number) as max_seq FROM students WHERE school_id = ? AND deleted_at IS NULL`
        )
        .get(schoolId) as { max_seq: number | null } | undefined
      if (maxRow?.max_seq != null && maxRow.max_seq > 0) {
        initialSequence = maxRow.max_seq + 1
      }
    } catch {
      /* ignore if students table does not yet exist */
    }

    const record: StudentIdSettings = {
      ...this.buildBaseFields(),
      school_id: schoolId,
      pattern: DEFAULT_STUDENT_ID_PATTERN,
      sequence_scope: 'school',
      next_sequence_number: initialSequence,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO student_id_settings (
            id, school_id, pattern, sequence_scope, next_sequence_number,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @school_id, @pattern, @sequence_scope, @next_sequence_number,
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
    })
    tx()
    return record
  }

  getSetupDto(
    schoolId: string,
    school: { name: string; short_code: string }
  ): StudentIdSettingsDto {
    const row = this.ensureDefaults(schoolId)
    return {
      id: row.id,
      school_id: row.school_id,
      pattern: row.pattern,
      sequence_scope: row.sequence_scope,
      next_sequence_number: row.next_sequence_number,
      school_short_code: school.short_code,
      school_name: school.name,
    }
  }

  saveSetup(
    schoolId: string,
    input: StudentIdSettingsSaveInput
  ): StudentIdSettings {
    const pattern = input.pattern.trim()
    if (!pattern) throw new Error('Pattern is required.')
    if (!pattern.includes('{SEQ}')) {
      throw new Error('Pattern must include the {SEQ} token.')
    }
    if (
      input.sequence_scope !== 'school' &&
      input.sequence_scope !== 'year' &&
      input.sequence_scope !== 'year_level'
    ) {
      throw new Error('Invalid sequence scope.')
    }

    const existing = this.ensureDefaults(schoolId)
    const patch: UpdateInput<StudentIdSettings> = {
      pattern,
      sequence_scope: input.sequence_scope,
      next_sequence_number:
        input.next_sequence_number !== undefined
          ? Math.max(1, Math.floor(input.next_sequence_number))
          : existing.next_sequence_number,
    }

    const record: StudentIdSettings = {
      ...existing,
      ...patch,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE student_id_settings
           SET pattern = @pattern,
               sequence_scope = @sequence_scope,
               next_sequence_number = @next_sequence_number,
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
    })
    tx()
    return record
  }

  /**
   * Atomically allocate the next sequence number for a school.
   * SQLite serializes writes in a transaction (FOR UPDATE equivalent).
   */
  allocateSequence(schoolId: string): {
    sequence: number
    settings: StudentIdSettings
  } {
    const allocate = this.db.transaction(() => {
      const settings = this.ensureDefaults(schoolId)
      const sequence = settings.next_sequence_number
      const updated: StudentIdSettings = {
        ...settings,
        next_sequence_number: sequence + 1,
        ...this.applyUpdateMeta(settings),
      }
      this.db
        .prepare(
          `UPDATE student_id_settings
           SET next_sequence_number = @next_sequence_number,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(updated)
      enqueueSync(
        this.db,
        this.tableName,
        updated.id,
        'UPDATE',
        updated as unknown as Record<string, unknown>
      )
      return { sequence, settings: updated }
    })
    return allocate()
  }
}
