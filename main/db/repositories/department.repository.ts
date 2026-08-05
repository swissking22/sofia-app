import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { Department } from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'
import { DEFAULT_DEPARTMENTS } from '../../academic/structure'

export class DepartmentRepository extends BaseRepository<Department> {
  constructor(db: Database.Database) {
    super(db, 'departments')
  }

  findBySchool(schoolId: string): Department[] {
    return this.db
      .prepare(
        `SELECT * FROM departments
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY name ASC`
      )
      .all(schoolId) as Department[]
  }

  /** Seed Science / Arts / Commercial / Technical when none exist. */
  ensureDefaults(schoolId: string): Department[] {
    const existing = this.findBySchool(schoolId)
    if (existing.length > 0) return existing

    const tx = this.db.transaction(() => {
      for (const name of DEFAULT_DEPARTMENTS) {
        this.create({ school_id: schoolId, name })
      }
    })
    tx()
    return this.findBySchool(schoolId)
  }

  create(input: CreateInput<Department>): Department {
    const record: Department = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      name: input.name.trim(),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO departments (
             id, school_id, name,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @name,
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

  update(id: string, input: UpdateInput<Department>): Department | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    const record: Department = {
      ...existing,
      ...input,
      name: input.name?.trim() ?? existing.name,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE departments
           SET school_id = @school_id,
               name = @name,
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

  countStaff(departmentId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM staff
         WHERE department_id = ? AND deleted_at IS NULL`
      )
      .get(departmentId) as { count: number }
    return row.count
  }

  countSubjects(departmentId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM subjects
         WHERE department_id = ? AND deleted_at IS NULL`
      )
      .get(departmentId) as { count: number }
    return row.count
  }
}
