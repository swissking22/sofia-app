import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import { DEFAULT_STUDENT_ID_PATTERN } from '../../helpers/student-id'
import { generateStudentCode } from '../../services/student-id'
import type { Student, StudentIdSettings } from '../types'
import { BaseRepository, type UpdateInput } from './base'

export type StudentStatus = 'active' | 'alumni' | 'transferred'

export interface CreateStudentInput {
  name: string
  class_id: string
  school_id?: string | null
  id?: string
  student_code?: string | null
  admission_year?: number | null
  academic_level_id?: string | null
  sequence_number?: number | null
  section_name?: string | null
  specialization_abbr?: string | null
  gender?: string | null
  date_of_birth?: string | null
  place_of_birth?: string | null
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

export interface StudentListFilters {
  schoolId: string
  status?: StudentStatus | 'all'
  admissionYear?: number | null
  academicLevelId?: string | null
  /** Section id via class.section_id (shown as department/stream). */
  sectionId?: string | null
  classId?: string | null
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
    if (filters.classId) {
      clauses.push(`s.class_id = @classId`)
      params.classId = filters.classId
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

  create(input: CreateStudentInput): Student {
    const tx = this.db.transaction(() => {
      // 1. Resolve school_id and academic_level_id if omitted but class_id provided
      let schoolId = input.school_id ?? null
      let academicLevelId = input.academic_level_id ?? null
      if (input.class_id && (!schoolId || !academicLevelId)) {
        const cls = this.db
          .prepare(
            `SELECT school_id, academic_level_id FROM classes WHERE id = ? AND deleted_at IS NULL`
          )
          .get(input.class_id) as
          | { school_id: string; academic_level_id: string | null }
          | undefined
        if (cls) {
          if (!schoolId && cls.school_id) schoolId = cls.school_id
          if (!academicLevelId && cls.academic_level_id) {
            academicLevelId = cls.academic_level_id
          }
        }
      }

      const admissionYear =
        input.admission_year ?? new Date().getFullYear()

      let student_code: string | null = input.student_code?.trim() || null
      let sequence_number: number | null = input.sequence_number ?? null

      // 2. Generate permanent student_code atomically if not already supplied
      if (!student_code) {
        if (!schoolId) {
          throw new Error('school_id is required to generate student code.')
        }

        // Read student_id_settings
        let settings = this.db
          .prepare(
            `SELECT * FROM student_id_settings WHERE school_id = ? AND deleted_at IS NULL LIMIT 1`
          )
          .get(schoolId) as StudentIdSettings | undefined

        if (!settings) {
          const maxRow = this.db
            .prepare(
              `SELECT MAX(sequence_number) as max_seq FROM students WHERE school_id = ? AND deleted_at IS NULL`
            )
            .get(schoolId) as { max_seq: number | null } | undefined
          const initialSeq =
            maxRow?.max_seq != null && maxRow.max_seq > 0
              ? maxRow.max_seq + 1
              : 1

          const now = new Date().toISOString()
          settings = {
            id: randomUUID(),
            school_id: schoolId,
            pattern: DEFAULT_STUDENT_ID_PATTERN,
            sequence_scope: 'school',
            next_sequence_number: initialSeq,
            created_at: now,
            updated_at: now,
            deleted_at: null,
            sync_status: 'pending',
            version: 1,
          }
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
            .run(settings)

          enqueueSync(
            this.db,
            'student_id_settings',
            settings.id,
            'INSERT',
            settings as unknown as Record<string, unknown>
          )
        }

        const sequence = settings.next_sequence_number

        const generated = generateStudentCode(this.db, schoolId, {
          sequence,
          admissionYear,
          academicLevelId,
          sectionName: input.section_name ?? null,
          specializationAbbr: input.specialization_abbr ?? null,
        })
        student_code = generated.student_code
        sequence_number = generated.sequence_number

        // Collision check
        const clash = this.db
          .prepare(
            `SELECT id FROM students WHERE school_id = ? AND student_code = ? AND deleted_at IS NULL LIMIT 1`
          )
          .get(schoolId, student_code) as { id: string } | undefined
        if (clash) {
          throw new Error(
            `Generated student ID “${student_code}” already exists. Adjust the pattern or sequence.`
          )
        }

        // Increment sequence in student_id_settings atomically
        const now = new Date().toISOString()
        const updatedSettings: StudentIdSettings = {
          ...settings,
          next_sequence_number: sequence + 1,
          updated_at: now,
          version: settings.version + 1,
          sync_status: 'pending',
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
          .run(updatedSettings)

        enqueueSync(
          this.db,
          'student_id_settings',
          updatedSettings.id,
          'UPDATE',
          updatedSettings as unknown as Record<string, unknown>
        )
      } else if (schoolId) {
        // When student_code is explicitly provided, verify collision
        const clash = this.db
          .prepare(
            `SELECT id FROM students WHERE school_id = ? AND student_code = ? AND deleted_at IS NULL LIMIT 1`
          )
          .get(schoolId, student_code) as { id: string } | undefined
        if (clash) {
          throw new Error(`Student ID “${student_code}” already exists.`)
        }
      }

      // 3. Build student record with local UUID
      const base = this.buildBaseFields()
      const record: Student = {
        ...base,
        id: input.id || base.id,
        name: input.name.trim(),
        class_id: input.class_id,
        school_id: schoolId,
        student_code,
        admission_year: admissionYear,
        academic_level_id: academicLevelId,
        sequence_number,
        gender: input.gender ?? null,
        date_of_birth: input.date_of_birth ?? null,
        place_of_birth: input.place_of_birth?.trim() || null,
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

      // 4. Insert student
      this.db
        .prepare(
          `INSERT INTO students (
             id, name, class_id, school_id, student_code,
             admission_year, academic_level_id, sequence_number,
             gender, date_of_birth, place_of_birth, phone, email, address, admission_type,
             guardian_name, guardian_phone, guardian_email, guardian_relationship,
             status, photo_path, residence_type,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @name, @class_id, @school_id, @student_code,
             @admission_year, @academic_level_id, @sequence_number,
             @gender, @date_of_birth, @place_of_birth, @phone, @email, @address, @admission_type,
             @guardian_name, @guardian_phone, @guardian_email, @guardian_relationship,
             @status, @photo_path, @residence_type,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(record)

      // 5. Enqueue sync outbox entry
      enqueueSync(
        this.db,
        this.tableName,
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )

      return record
    })

    return tx()
  }

  update(id: string, input: UpdateInput<Student>): Student | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    // IPC often passes explicit `undefined` for untouched fields; spreading those
    // would overwrite NOT NULL columns (status, residence_type, sync_status) with NULL.
    const patch = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined)
    ) as UpdateInput<Student>

    const record: Student = {
      ...existing,
      ...patch,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      place_of_birth:
        patch.place_of_birth !== undefined
          ? patch.place_of_birth?.trim() || null
          : (existing.place_of_birth ?? null),
      // student_code is permanent and immutable after first assignment
      student_code: existing.student_code ?? patch.student_code?.trim() ?? null,
      sequence_number:
        existing.sequence_number ?? patch.sequence_number ?? null,
      admission_year:
        patch.admission_year !== undefined
          ? patch.admission_year
          : existing.admission_year,
      status: patch.status ?? existing.status ?? 'active',
      residence_type:
        patch.residence_type === 'boarding'
          ? 'boarding'
          : patch.residence_type === 'day'
            ? 'day'
            : existing.residence_type || 'day',
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
               place_of_birth = @place_of_birth,
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
