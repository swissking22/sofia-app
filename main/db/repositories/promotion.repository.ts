import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { PromotionMapping, PromotionRun } from '../types'
import { BaseRepository } from './base'

export class PromotionRepository extends BaseRepository<PromotionRun> {
  constructor(db: Database.Database) {
    super(db, 'promotion_runs')
  }

  findBySchool(schoolId: string): PromotionRun[] {
    return this.db
      .prepare(
        `SELECT * FROM promotion_runs
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      )
      .all(schoolId) as PromotionRun[]
  }

  findMappings(runId: string): PromotionMapping[] {
    return this.db
      .prepare(
        `SELECT * FROM promotion_mappings
         WHERE promotion_run_id = ? AND deleted_at IS NULL
         ORDER BY created_at ASC`
      )
      .all(runId) as PromotionMapping[]
  }

  createRun(input: {
    school_id: string
    from_year: number
    to_year: number
    notes?: string | null
    mappings: Array<{
      from_class_id: string
      to_class_id: string | null
      student_count: number
    }>
  }): PromotionRun {
    const run: PromotionRun = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      from_year: input.from_year,
      to_year: input.to_year,
      status: 'draft',
      notes: input.notes ?? null,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO promotion_runs (
            id, school_id, from_year, to_year, status, notes,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @school_id, @from_year, @to_year, @status, @notes,
            @created_at, @updated_at, @deleted_at, @sync_status, @version
          )`
        )
        .run(run)

      enqueueSync(
        this.db,
        this.tableName,
        run.id,
        'INSERT',
        run as unknown as Record<string, unknown>
      )

      for (const m of input.mappings) {
        const mapping: PromotionMapping = {
          ...this.buildBaseFields(),
          promotion_run_id: run.id,
          from_class_id: m.from_class_id,
          to_class_id: m.to_class_id,
          student_count: m.student_count,
        }
        this.db
          .prepare(
            `INSERT INTO promotion_mappings (
              id, promotion_run_id, from_class_id, to_class_id, student_count,
              created_at, updated_at, deleted_at, sync_status, version
            ) VALUES (
              @id, @promotion_run_id, @from_class_id, @to_class_id, @student_count,
              @created_at, @updated_at, @deleted_at, @sync_status, @version
            )`
          )
          .run(mapping)
        enqueueSync(
          this.db,
          'promotion_mappings',
          mapping.id,
          'INSERT',
          mapping as unknown as Record<string, unknown>
        )
      }
    })
    tx()
    return run
  }

  markCompleted(runId: string): PromotionRun | undefined {
    const existing = this.findById(runId)
    if (!existing) return undefined
    const record: PromotionRun = {
      ...existing,
      status: 'completed',
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE promotion_runs
         SET status = @status,
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
    return record
  }
}
