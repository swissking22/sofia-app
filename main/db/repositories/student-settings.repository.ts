import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { StudentSettings } from '../types'
import { BaseRepository, type UpdateInput } from './base'

export const DEFAULT_STUDENT_ID_FORMAT = 'SOF-{SEQ}'

export const STUDENT_INFO_FIELDS = [
  { key: 'full_name', label: 'Full Name', column: 'field_full_name', required: true },
  { key: 'gender', label: 'Gender', column: 'field_gender', required: false },
  {
    key: 'date_of_birth',
    label: 'Date of Birth',
    column: 'field_date_of_birth',
    required: false,
  },
  {
    key: 'place_of_birth',
    label: 'Place of Birth',
    column: 'field_place_of_birth',
    required: false,
  },
  {
    key: 'parent_information',
    label: 'Parent Information',
    column: 'field_parent_information',
    required: false,
  },
  {
    key: 'emergency_contact',
    label: 'Emergency Contact',
    column: 'field_emergency_contact',
    required: false,
  },
] as const

export const ADMISSION_TYPES = [
  { key: 'new', label: 'New Student', column: 'admit_new' },
  { key: 'returning', label: 'Returning Student', column: 'admit_returning' },
  { key: 'transfer', label: 'Transfer Student', column: 'admit_transfer' },
] as const

export type StudentInfoFieldKey = (typeof STUDENT_INFO_FIELDS)[number]['key']
export type AdmissionTypeKey = (typeof ADMISSION_TYPES)[number]['key']

export interface StudentSettingsDto {
  id: string
  school_id: string
  student_id_format: string
  student_id_example: string
  fields: Record<StudentInfoFieldKey, boolean>
  admission: Record<AdmissionTypeKey, boolean>
  student_count: number
}

export interface StudentSettingsSaveInput {
  student_id_format: string
  fields: Record<StudentInfoFieldKey, boolean>
  admission: Record<AdmissionTypeKey, boolean>
}

/** Preview format tokens for the UI (e.g. SOF-2026-0001). */
export function previewStudentIdFormat(format: string, year = new Date().getFullYear()): string {
  const trimmed = format.trim() || DEFAULT_STUDENT_ID_FORMAT
  return trimmed
    .replace(/\{YEAR\}/gi, String(year))
    .replace(/\{SEQ\}/gi, '0001')
}

export class StudentSettingsRepository extends BaseRepository<StudentSettings> {
  constructor(db: Database.Database) {
    super(db, 'student_settings')
  }

  findBySchool(schoolId: string): StudentSettings | undefined {
    return this.db
      .prepare(
        `SELECT * FROM student_settings
         WHERE school_id = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId) as StudentSettings | undefined
  }

  ensureDefaults(schoolId: string): StudentSettings {
    const existing = this.findBySchool(schoolId)
    if (existing) return existing

    const record: StudentSettings = {
      ...this.buildBaseFields(),
      school_id: schoolId,
      student_id_format: DEFAULT_STUDENT_ID_FORMAT,
      field_full_name: 1,
      field_gender: 1,
      field_date_of_birth: 1,
      field_place_of_birth: 1,
      field_parent_information: 1,
      field_emergency_contact: 1,
      admit_new: 1,
      admit_returning: 1,
      admit_transfer: 1,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO student_settings (
            id, school_id, student_id_format,
            field_full_name, field_gender, field_date_of_birth,
            field_place_of_birth, field_parent_information, field_emergency_contact,
            admit_new, admit_returning, admit_transfer,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @school_id, @student_id_format,
            @field_full_name, @field_gender, @field_date_of_birth,
            @field_place_of_birth, @field_parent_information, @field_emergency_contact,
            @admit_new, @admit_returning, @admit_transfer,
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

  getSetupDto(schoolId: string): StudentSettingsDto {
    const row = this.ensureDefaults(schoolId)
    const countRow = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM students WHERE deleted_at IS NULL`
      )
      .get() as { c: number }

    return {
      id: row.id,
      school_id: row.school_id,
      student_id_format: row.student_id_format,
      student_id_example: previewStudentIdFormat(row.student_id_format),
      fields: {
        full_name: row.field_full_name === 1,
        gender: row.field_gender === 1,
        date_of_birth: row.field_date_of_birth === 1,
        place_of_birth: row.field_place_of_birth === 1,
        parent_information: row.field_parent_information === 1,
        emergency_contact: row.field_emergency_contact === 1,
      },
      admission: {
        new: row.admit_new === 1,
        returning: row.admit_returning === 1,
        transfer: row.admit_transfer === 1,
      },
      student_count: countRow.c,
    }
  }

  saveSetup(schoolId: string, input: StudentSettingsSaveInput): StudentSettingsDto {
    const format = input.student_id_format.trim() || DEFAULT_STUDENT_ID_FORMAT
    if (!input.fields.full_name) {
      throw new Error('Full Name must remain enabled.')
    }
    const anyAdmission =
      input.admission.new ||
      input.admission.returning ||
      input.admission.transfer
    if (!anyAdmission) {
      throw new Error('Enable at least one admission type.')
    }

    const existing = this.ensureDefaults(schoolId)
    const patch: UpdateInput<StudentSettings> = {
      student_id_format: format,
      field_full_name: 1,
      field_gender: input.fields.gender ? 1 : 0,
      field_date_of_birth: input.fields.date_of_birth ? 1 : 0,
      field_place_of_birth: input.fields.place_of_birth ? 1 : 0,
      field_parent_information: input.fields.parent_information ? 1 : 0,
      field_emergency_contact: input.fields.emergency_contact ? 1 : 0,
      admit_new: input.admission.new ? 1 : 0,
      admit_returning: input.admission.returning ? 1 : 0,
      admit_transfer: input.admission.transfer ? 1 : 0,
    }

    const record: StudentSettings = {
      ...existing,
      ...patch,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE student_settings
           SET student_id_format = @student_id_format,
               field_full_name = @field_full_name,
               field_gender = @field_gender,
               field_date_of_birth = @field_date_of_birth,
               field_place_of_birth = @field_place_of_birth,
               field_parent_information = @field_parent_information,
               field_emergency_contact = @field_emergency_contact,
               admit_new = @admit_new,
               admit_returning = @admit_returning,
               admit_transfer = @admit_transfer,
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

    return this.getSetupDto(schoolId)
  }
}
