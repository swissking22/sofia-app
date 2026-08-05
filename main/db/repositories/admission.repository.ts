import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { Admission, AdmissionStatus } from '../types'
import { BaseRepository } from './base'

export class AdmissionRepository extends BaseRepository<Admission> {
  constructor(db: Database.Database) {
    super(db, 'admissions')
  }

  findBySchool(schoolId: string): Admission[] {
    return this.db
      .prepare(
        `SELECT * FROM admissions
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      )
      .all(schoolId) as Admission[]
  }

  create(input: {
    school_id: string
    full_name: string
    gender?: string | null
    date_of_birth?: string | null
    phone?: string | null
    email?: string | null
    address?: string | null
    academic_level_id?: string | null
    preferred_class_id?: string | null
    admission_year?: number | null
    guardian_name?: string | null
    guardian_phone?: string | null
    guardian_email?: string | null
    guardian_relationship?: string | null
    notes?: string | null
    status?: AdmissionStatus
  }): Admission {
    const record: Admission = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      full_name: input.full_name.trim(),
      gender: input.gender ?? null,
      date_of_birth: input.date_of_birth ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      academic_level_id: input.academic_level_id ?? null,
      preferred_class_id: input.preferred_class_id ?? null,
      admission_year: input.admission_year ?? null,
      guardian_name: input.guardian_name ?? null,
      guardian_phone: input.guardian_phone ?? null,
      guardian_email: input.guardian_email ?? null,
      guardian_relationship: input.guardian_relationship ?? null,
      status: input.status ?? 'pending',
      notes: input.notes ?? null,
      student_id: null,
    }

    this.db
      .prepare(
        `INSERT INTO admissions (
          id, school_id, full_name, gender, date_of_birth, phone, email, address,
          academic_level_id, preferred_class_id, admission_year,
          guardian_name, guardian_phone, guardian_email, guardian_relationship,
          status, notes, student_id,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @full_name, @gender, @date_of_birth, @phone, @email, @address,
          @academic_level_id, @preferred_class_id, @admission_year,
          @guardian_name, @guardian_phone, @guardian_email, @guardian_relationship,
          @status, @notes, @student_id,
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
