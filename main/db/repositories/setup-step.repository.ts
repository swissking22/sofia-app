import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { SetupStepRecord, SetupStepStatus } from '../types'
import { BaseRepository } from './base'
import { SETUP_STEPS, type SetupStepId } from '../../setup/steps'

export class SetupStepRepository extends BaseRepository<SetupStepRecord> {
  constructor(db: Database.Database) {
    super(db, 'setup_steps')
  }

  /** Ensure every catalog step exists as a pending row. */
  ensureAllSteps(): void {
    const tx = this.db.transaction(() => {
      for (const step of SETUP_STEPS) {
        const existing = this.findById(step.id)
        if (existing) continue

        const record: SetupStepRecord = {
          ...this.buildBaseFields(),
          id: step.id,
          status: 'pending',
          draft_data: null,
          completed_at: null,
        }

        this.db
          .prepare(
            `INSERT INTO setup_steps (
               id, status, draft_data, completed_at,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (
               @id, @status, @draft_data, @completed_at,
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
      }
    })
    tx()
  }

  findByStepId(stepId: SetupStepId): SetupStepRecord | undefined {
    return this.findById(stepId)
  }

  saveDraft(stepId: SetupStepId, draftData?: string | null): SetupStepRecord {
    this.ensureAllSteps()
    const existing = this.findById(stepId)

    if (!existing) {
      throw new Error(`Unknown setup step: ${stepId}`)
    }

    // Do not downgrade a completed step when saving a draft
    const nextStatus: SetupStepStatus =
      existing.status === 'completed' ? 'completed' : 'draft'

    const record: SetupStepRecord = {
      ...existing,
      status: nextStatus,
      draft_data:
        draftData === undefined ? existing.draft_data : draftData,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE setup_steps
           SET status = @status,
               draft_data = @draft_data,
               completed_at = @completed_at,
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

  /**
   * Mark a step skipped so the wizard can continue.
   * Skipped steps are never treated as done.
   */
  skipStep(stepId: SetupStepId): SetupStepRecord {
    this.ensureAllSteps()
    const existing = this.findById(stepId)
    if (!existing) {
      throw new Error(`Unknown setup step: ${stepId}`)
    }

    // Leave completed steps alone — skip only applies to unfinished work
    if (existing.status === 'completed') {
      return existing
    }

    const record: SetupStepRecord = {
      ...existing,
      status: 'skipped',
      completed_at: null,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE setup_steps
           SET status = @status,
               draft_data = @draft_data,
               completed_at = @completed_at,
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

  completeStep(stepId: SetupStepId): SetupStepRecord {
    this.ensureAllSteps()
    const existing = this.findById(stepId)
    if (!existing) {
      throw new Error(`Unknown setup step: ${stepId}`)
    }

    const now = new Date().toISOString()
    const record: SetupStepRecord = {
      ...existing,
      status: 'completed',
      completed_at: existing.completed_at ?? now,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE setup_steps
           SET status = @status,
               draft_data = @draft_data,
               completed_at = @completed_at,
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
}
