import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import { SQL_SECTION_SORT_CASE } from '../../domain/class-order'
import type { Class } from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'

export class ClassRepository extends BaseRepository<Class> {
  constructor(db: Database.Database) {
    super(db, 'classes')
  }

  findBySchool(schoolId: string): Class[] {
    return this.db
      .prepare(
        `SELECT c.* FROM classes c
         LEFT JOIN academic_levels al ON al.id = c.academic_level_id
         LEFT JOIN sections sec ON sec.id = c.section_id
         WHERE c.deleted_at IS NULL
           AND (c.school_id = ? OR c.school_id IS NULL)
         ORDER BY IFNULL(al.sort_order, 9999) ASC,
                  ${SQL_SECTION_SORT_CASE} ASC,
                  IFNULL(sec.name, '') COLLATE NOCASE ASC,
                  c.name COLLATE NOCASE ASC`
      )
      .all(schoolId) as Class[]
  }

  findStructureClasses(schoolId: string): Class[] {
    return this.db
      .prepare(
        `SELECT c.* FROM classes c
         LEFT JOIN academic_levels al ON al.id = c.academic_level_id
         LEFT JOIN sections sec ON sec.id = c.section_id
         WHERE c.deleted_at IS NULL
           AND c.school_id = ?
           AND c.academic_level_id IS NOT NULL
           AND c.section_id IS NOT NULL
         ORDER BY IFNULL(al.sort_order, 9999) ASC,
                  ${SQL_SECTION_SORT_CASE} ASC,
                  IFNULL(sec.name, '') COLLATE NOCASE ASC,
                  c.name COLLATE NOCASE ASC`
      )
      .all(schoolId) as Class[]
  }

  create(input: CreateInput<Class>): Class {
    const record: Class = {
      ...this.buildBaseFields(),
      name: input.name.trim(),
      school_id: input.school_id ?? null,
      level: input.level ?? null,
      form_key: input.form_key ?? null,
      stream: input.stream ?? null,
      academic_level_id: input.academic_level_id ?? null,
      section_id: input.section_id ?? null,
      specialization_id: input.specialization_id ?? null,
      capacity: input.capacity ?? null,
      is_active: input.is_active ?? 1,
      class_teacher_id: input.class_teacher_id ?? null,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO classes (
             id, name, school_id, level, form_key, stream,
             academic_level_id, section_id, specialization_id, capacity, is_active,
             class_teacher_id,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @name, @school_id, @level, @form_key, @stream,
             @academic_level_id, @section_id, @specialization_id, @capacity, @is_active,
             @class_teacher_id,
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

  update(id: string, input: UpdateInput<Class>): Class | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    const record: Class = {
      ...existing,
      ...input,
      name: input.name?.trim() ?? existing.name,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE classes
           SET name = @name,
               school_id = @school_id,
               level = @level,
               form_key = @form_key,
               stream = @stream,
               academic_level_id = @academic_level_id,
               section_id = @section_id,
               specialization_id = @specialization_id,
               capacity = @capacity,
               is_active = @is_active,
               class_teacher_id = @class_teacher_id,
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

  createInHierarchy(input: {
    school_id: string
    academic_level_id: string
    section_id: string
    specialization_id?: string | null
    name: string
    capacity?: number | null
  }): Class {
    const name = input.name.trim()
    if (!name) throw new Error('Class name is required.')
    if (!input.academic_level_id) throw new Error('Select an academic level.')
    if (!input.section_id) throw new Error('Select a section.')

    const duplicate = this.findStructureClasses(input.school_id).find(
      (c) =>
        c.name.toLowerCase() === name.toLowerCase() &&
        c.academic_level_id === input.academic_level_id &&
        c.section_id === input.section_id &&
        (c.specialization_id || null) === (input.specialization_id || null)
    )
    if (duplicate) {
      throw new Error(`${name} already exists for this combination.`)
    }

    return this.create({
      school_id: input.school_id,
      name,
      academic_level_id: input.academic_level_id,
      section_id: input.section_id,
      specialization_id: input.specialization_id || null,
      capacity: input.capacity ?? null,
      is_active: 1,
      level: null,
      form_key: null,
      stream: null,
      class_teacher_id: null,
    })
  }
}
