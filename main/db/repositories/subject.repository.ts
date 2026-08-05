import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { Subject, SubjectClass } from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'

export interface SubjectWithClasses extends Subject {
  class_ids: string[]
}

export class SubjectRepository extends BaseRepository<Subject> {
  constructor(db: Database.Database) {
    super(db, 'subjects')
  }

  findBySchool(schoolId: string): Subject[] {
    return this.db
      .prepare(
        `SELECT * FROM subjects
         WHERE deleted_at IS NULL
           AND (school_id = ? OR school_id IS NULL)
         ORDER BY name ASC`
      )
      .all(schoolId) as Subject[]
  }

  findClassIds(subjectId: string): string[] {
    return (
      this.db
        .prepare(
          `SELECT class_id FROM subject_classes
           WHERE subject_id = ? AND deleted_at IS NULL`
        )
        .all(subjectId) as Array<{ class_id: string }>
    ).map((r) => r.class_id)
  }

  findBySchoolWithClasses(schoolId: string): SubjectWithClasses[] {
    return this.findBySchool(schoolId).map((s) => {
      const class_ids = this.findClassIds(s.id)
      return {
        ...s,
        class_ids: class_ids.length > 0 ? class_ids : s.class_id ? [s.class_id] : [],
      }
    })
  }

  create(input: CreateInput<Subject>): Subject {
    const record: Subject = {
      ...this.buildBaseFields(),
      name: input.name,
      class_id: input.class_id,
      school_id: input.school_id ?? null,
      department_id: input.department_id ?? null,
      coefficient: input.coefficient ?? 1,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO subjects (
             id, name, class_id, school_id, department_id, coefficient,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @name, @class_id, @school_id, @department_id, @coefficient,
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

  update(id: string, input: UpdateInput<Subject>): Subject | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    const record: Subject = {
      ...existing,
      ...input,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE subjects
           SET name = @name,
               class_id = @class_id,
               school_id = @school_id,
               department_id = @department_id,
               coefficient = @coefficient,
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

  findByClassId(classId: string): Subject[] {
    return this.db
      .prepare(
        `SELECT DISTINCT s.* FROM subjects s
         LEFT JOIN subject_classes sc
           ON sc.subject_id = s.id AND sc.deleted_at IS NULL
         WHERE s.deleted_at IS NULL
           AND (s.class_id = ? OR sc.class_id = ?)
         ORDER BY s.name ASC`
      )
      .all(classId, classId) as Subject[]
  }

  createWithClasses(input: {
    school_id: string
    name: string
    department_id: string
    coefficient: number
    class_ids: string[]
  }): SubjectWithClasses {
    if (!input.class_ids.length) {
      throw new Error('Assign at least one class.')
    }

    const save = this.db.transaction(() => {
      const subject = this.create({
        name: input.name.trim(),
        school_id: input.school_id,
        department_id: input.department_id,
        coefficient: input.coefficient,
        class_id: input.class_ids[0],
      })

      for (const classId of input.class_ids) {
        this.linkClass(subject.id, classId)
      }

      return {
        ...subject,
        class_ids: input.class_ids,
      }
    })

    return save()
  }

  updateWithClasses(
    id: string,
    input: {
      name: string
      department_id: string
      coefficient: number
      class_ids: string[]
    }
  ): SubjectWithClasses | undefined {
    if (!input.class_ids.length) {
      throw new Error('Assign at least one class.')
    }

    const save = this.db.transaction(() => {
      const updated = this.update(id, {
        name: input.name.trim(),
        department_id: input.department_id,
        coefficient: input.coefficient,
        class_id: input.class_ids[0],
      })
      if (!updated) return undefined

      const existingLinks = this.db
        .prepare(
          `SELECT * FROM subject_classes
           WHERE subject_id = ? AND deleted_at IS NULL`
        )
        .all(id) as SubjectClass[]

      const keep = new Set(input.class_ids)
      for (const link of existingLinks) {
        if (!keep.has(link.class_id)) {
          this.unlinkClass(link.id, link)
        }
      }

      const existingIds = new Set(existingLinks.map((l) => l.class_id))
      for (const classId of input.class_ids) {
        if (!existingIds.has(classId)) {
          this.linkClass(id, classId)
        }
      }

      return { ...updated, class_ids: input.class_ids }
    })

    return save()
  }

  private linkClass(subjectId: string, classId: string): SubjectClass {
    const record: SubjectClass = {
      ...this.buildBaseFields(),
      subject_id: subjectId,
      class_id: classId,
    }

    this.db
      .prepare(
        `INSERT INTO subject_classes (
           id, subject_id, class_id,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @subject_id, @class_id,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)

    enqueueSync(
      this.db,
      'subject_classes',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  private unlinkClass(id: string, existing: SubjectClass): void {
    const now = new Date().toISOString()
    const record: SubjectClass = {
      ...existing,
      deleted_at: now,
      updated_at: now,
      version: existing.version + 1,
      sync_status: 'pending',
    }

    this.db
      .prepare(
        `UPDATE subject_classes
         SET deleted_at = @deleted_at,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)

    enqueueSync(
      this.db,
      'subject_classes',
      id,
      'DELETE',
      record as unknown as Record<string, unknown>
    )
  }
}
