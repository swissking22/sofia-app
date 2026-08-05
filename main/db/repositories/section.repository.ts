import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { Section } from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'
import { DEFAULT_SECTIONS } from '../../academic/structure'

export class SectionRepository extends BaseRepository<Section> {
  constructor(db: Database.Database) {
    super(db, 'sections')
  }

  findBySchool(schoolId: string): Section[] {
    return this.db
      .prepare(
        `SELECT * FROM sections
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY name ASC`
      )
      .all(schoolId) as Section[]
  }

  ensureDefaults(schoolId: string): Section[] {
    const existing = this.findBySchool(schoolId)
    if (existing.length > 0) return existing

    const tx = this.db.transaction(() => {
      for (const section of DEFAULT_SECTIONS) {
        this.create({
          school_id: schoolId,
          name: section.name,
          description: section.description,
          is_active: 1,
        })
      }
    })
    tx()
    return this.findBySchool(schoolId)
  }

  create(input: CreateInput<Section>): Section {
    const record: Section = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      is_active: input.is_active ?? 1,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO sections (
             id, school_id, name, description, is_active,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @name, @description, @is_active,
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

  update(id: string, input: UpdateInput<Section>): Section | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    const record: Section = {
      ...existing,
      ...input,
      name: input.name?.trim() ?? existing.name,
      description:
        input.description !== undefined
          ? input.description?.trim() || null
          : existing.description,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE sections
           SET school_id = @school_id,
               name = @name,
               description = @description,
               is_active = @is_active,
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

  countClasses(sectionId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM classes
         WHERE section_id = ? AND deleted_at IS NULL`
      )
      .get(sectionId) as { count: number }
    return row.count
  }

  countSpecializations(sectionId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM specializations
         WHERE section_id = ? AND deleted_at IS NULL`
      )
      .get(sectionId) as { count: number }
    return row.count
  }
}
