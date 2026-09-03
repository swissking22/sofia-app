import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import { deriveLevelShortName } from '../../helpers/student-id'
import type { AcademicLevel } from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'
import { DEFAULT_LEVELS } from '../../academic/structure'

export class AcademicLevelRepository extends BaseRepository<AcademicLevel> {
  constructor(db: Database.Database) {
    super(db, 'academic_levels')
  }

  findBySchool(schoolId: string): AcademicLevel[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM academic_levels
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY sort_order ASC, name ASC`
      )
      .all(schoolId) as AcademicLevel[]

    // Backfill short_name for older rows
    return rows.map((row) => {
      if (row.short_name?.trim()) return row
      return (
        this.update(row.id, {
          short_name: deriveLevelShortName(row.name),
        }) ?? row
      )
    })
  }

  ensureDefaults(schoolId: string): AcademicLevel[] {
    const school = this.db
      .prepare(
        `SELECT id FROM schools WHERE id = ? AND deleted_at IS NULL`
      )
      .get(schoolId) as { id: string } | undefined
    if (!school) return []

    const existing = this.findBySchool(schoolId)
    if (existing.length > 0) return existing

    const tx = this.db.transaction(() => {
      for (const level of DEFAULT_LEVELS) {
        this.create({
          school_id: schoolId,
          name: level.name,
          short_name: deriveLevelShortName(level.name),
          category: level.category,
          is_active: 1,
          sort_order: level.sort_order,
        })
      }
    })
    tx()
    return this.findBySchool(schoolId)
  }

  create(
    input: Omit<CreateInput<AcademicLevel>, 'short_name'> & {
      short_name?: string
    }
  ): AcademicLevel {
    const name = input.name.trim()
    const record: AcademicLevel = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      name,
      short_name:
        input.short_name?.trim() || deriveLevelShortName(name),
      category: input.category,
      is_active: input.is_active ?? 1,
      sort_order: input.sort_order ?? 0,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO academic_levels (
             id, school_id, name, short_name, category, is_active, sort_order,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @name, @short_name, @category, @is_active, @sort_order,
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

  update(id: string, input: UpdateInput<AcademicLevel>): AcademicLevel | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    const name = input.name?.trim() ?? existing.name
    const record: AcademicLevel = {
      ...existing,
      ...input,
      name,
      short_name:
        input.short_name?.trim() ||
        existing.short_name?.trim() ||
        deriveLevelShortName(name),
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE academic_levels
           SET school_id = @school_id,
               name = @name,
               short_name = @short_name,
               category = @category,
               is_active = @is_active,
               sort_order = @sort_order,
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

  countClasses(levelId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM classes
         WHERE academic_level_id = ? AND deleted_at IS NULL`
      )
      .get(levelId) as { count: number }
    return row.count
  }
}
