import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { Specialization } from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'

function normalizeAbbreviation(value: string): string {
  return value.trim().toUpperCase()
}

export class SpecializationRepository extends BaseRepository<Specialization> {
  constructor(db: Database.Database) {
    super(db, 'specializations')
  }

  findBySchool(schoolId: string): Specialization[] {
    return this.db
      .prepare(
        `SELECT * FROM specializations
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY name ASC`
      )
      .all(schoolId) as Specialization[]
  }

  findBySection(sectionId: string): Specialization[] {
    return this.db
      .prepare(
        `SELECT * FROM specializations
         WHERE section_id = ? AND deleted_at IS NULL
         ORDER BY name ASC`
      )
      .all(sectionId) as Specialization[]
  }

  create(input: CreateInput<Specialization>): Specialization {
    const record: Specialization = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      section_id: input.section_id,
      name: input.name.trim(),
      abbreviation: normalizeAbbreviation(input.abbreviation),
      description: input.description?.trim() || null,
      is_active: input.is_active ?? 1,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO specializations (
             id, school_id, section_id, name, abbreviation, description, is_active,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @section_id, @name, @abbreviation, @description, @is_active,
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

  update(
    id: string,
    input: UpdateInput<Specialization>
  ): Specialization | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    const record: Specialization = {
      ...existing,
      ...input,
      name: input.name?.trim() ?? existing.name,
      abbreviation:
        input.abbreviation !== undefined
          ? normalizeAbbreviation(input.abbreviation)
          : existing.abbreviation,
      description:
        input.description !== undefined
          ? input.description?.trim() || null
          : existing.description,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE specializations
           SET school_id = @school_id,
               section_id = @section_id,
               name = @name,
               abbreviation = @abbreviation,
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

  countClasses(specializationId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM classes
         WHERE specialization_id = ? AND deleted_at IS NULL`
      )
      .get(specializationId) as { count: number }
    return row.count
  }
}
