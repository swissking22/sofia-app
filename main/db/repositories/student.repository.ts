import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { Student } from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'

export type StudentStatus = 'active' | 'alumni' | 'transferred'

export interface StudentListFilters {
  schoolId: string
  status?: StudentStatus | 'all'
  admissionYear?: number | null
  academicLevelId?: string | null
  /** Section id via class.section_id (shown as department/stream). */
  sectionId?: string | null
  search?: string | null
}

export class StudentRepository extends BaseRepository<Student> {
  constructor(db: Database.Database) {
    super(db, 'students')
  }

  findBySchoolAndCode(
    schoolId: string,
    studentCode: string
  ): Student | undefined {
    return this.db
      .prepare(
        `SELECT * FROM students
         WHERE school_id = ?
           AND student_code = ?
           AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId, studentCode) as Student | undefined
  }

  findBySchool(schoolId: string, status: StudentStatus | 'all' = 'active'): Student[] {
    if (status === 'all') {
      return this.db
        .prepare(
          `SELECT * FROM students
           WHERE school_id = ? AND deleted_at IS NULL
           ORDER BY name COLLATE NOCASE ASC`
        )
        .all(schoolId) as Student[]
    }
    return this.db
      .prepare(
        `SELECT * FROM students
         WHERE school_id = ? AND status = ? AND deleted_at IS NULL
         ORDER BY name COLLATE NOCASE ASC`
      )
      .all(schoolId, status) as Student[]
  }

  listFiltered(filters: StudentListFilters): Student[] {
    const clauses = [`s.deleted_at IS NULL`, `s.school_id = @schoolId`]
    const params: Record<string, unknown> = { schoolId: filters.schoolId }

    if (filters.status && filters.status !== 'all') {
      clauses.push(`s.status = @status`)
      params.status = filters.status
    }
    if (filters.admissionYear) {
      clauses.push(`s.admission_year = @admissionYear`)
      params.admissionYear = filters.admissionYear
    }
    if (filters.academicLevelId) {
      clauses.push(`s.academic_level_id = @academicLevelId`)
      params.academicLevelId = filters.academicLevelId
    }
    if (filters.sectionId) {
      clauses.push(`c.section_id = @sectionId`)
      params.sectionId = filters.sectionId
    }
    if (filters.search?.trim()) {
      clauses.push(
        `(s.name LIKE @search OR IFNULL(s.student_code, '') LIKE @search)`
      )
      params.search = `%${filters.search.trim()}%`
    }

    return this.db
      .prepare(
        `SELECT s.* FROM students s
         LEFT JOIN classes c ON c.id = s.class_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY s.name COLLATE NOCASE ASC, IFNULL(s.student_code, '') COLLATE NOCASE ASC`
      )
      .all(params) as Student[]
  }

  create(
    input: Omit<
      CreateInput<Student>,
      | 'school_id'
      | 'student_code'
      | 'admission_year'
      | 'academic_level_id'
      | 'sequence_number'
      | 'status'
    > & {
      school_id?: string | null
      student_code?: string | null
      admission_year?: number | null
      academic_level_id?: string | null
      sequence_number?: number | null
      gender?: string | null
      date_of_birth?: string | null
      phone?: string | null
      email?: string | null
      address?: string | null
      admission_type?: string | null
      guardian_name?: string | null
      guardian_phone?: string | null
      guardian_email?: string | null
      guardian_relationship?: string | null
      status?: string
      photo_path?: string | null
      residence_type?: 'day' | 'boarding' | null
    }
  ): Student {
    const record: Student = {
      ...this.buildBaseFields(),
      name: input.name.trim(),
      class_id: input.class_id,
      school_id: input.school_id ?? null,
      student_code: input.student_code ?? null,
      admission_year: input.admission_year ?? null,
      academic_level_id: input.academic_level_id ?? null,
      sequence_number: input.sequence_number ?? null,
      gender: input.gender ?? null,
      date_of_birth: input.date_of_birth ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      admission_type: input.admission_type ?? null,
      guardian_name: input.guardian_name ?? null,
      guardian_phone: input.guardian_phone ?? null,
      guardian_email: input.guardian_email ?? null,
      guardian_relationship: input.guardian_relationship ?? null,
      status: input.status ?? 'active',
      photo_path: input.photo_path ?? null,
      residence_type: input.residence_type === 'boarding' ? 'boarding' : 'day',
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO students (
             id, name, class_id, school_id, student_code,
             admission_year, academic_level_id, sequence_number,
             gender, date_of_birth, phone, email, address, admission_type,
             guardian_name, guardian_phone, guardian_email, guardian_relationship,
             status, photo_path, residence_type,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @name, @class_id, @school_id, @student_code,
             @admission_year, @academic_level_id, @sequence_number,
             @gender, @date_of_birth, @phone, @email, @address, @admission_type,
             @guardian_name, @guardian_phone, @guardian_email, @guardian_relationship,
             @status, @photo_path, @residence_type,
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

  update(id: string, input: UpdateInput<Student>): Student | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    const record: Student = {
      ...existing,
      ...input,
      name: input.name?.trim() ?? existing.name,
      student_code: existing.student_code ?? input.student_code ?? null,
      sequence_number:
        existing.sequence_number ?? input.sequence_number ?? null,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE students
           SET name = @name,
               class_id = @class_id,
               school_id = @school_id,
               student_code = @student_code,
               admission_year = @admission_year,
               academic_level_id = @academic_level_id,
               sequence_number = @sequence_number,
               gender = @gender,
               date_of_birth = @date_of_birth,
               phone = @phone,
               email = @email,
               address = @address,
               admission_type = @admission_type,
               guardian_name = @guardian_name,
               guardian_phone = @guardian_phone,
               guardian_email = @guardian_email,
               guardian_relationship = @guardian_relationship,
               status = @status,
               photo_path = @photo_path,
               residence_type = @residence_type,
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

  findByClassId(classId: string): Student[] {
    return this.db
      .prepare(
        `SELECT * FROM students WHERE class_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE ASC`
      )
      .all(classId) as Student[]
  }

  bulkUpdateStatus(ids: string[], status: StudentStatus): number {
    let n = 0
    const tx = this.db.transaction(() => {
      for (const id of ids) {
        const updated = this.update(id, { status })
        if (updated) n += 1
      }
    })
    tx()
    return n
  }
}
