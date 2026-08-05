import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { BaseRecord, SyncStatus } from '../types'

/** Input for creating a record (domain fields only). */
export type CreateInput<T> = Omit<
  T,
  keyof BaseRecord
>

/** Input for updating a record (partial domain fields). */
export type UpdateInput<T> = Partial<CreateInput<T>>

/**
 * Generic repository with mandatory sync tracking.
 * All domain repositories extend this pattern.
 */
export abstract class BaseRepository<T extends BaseRecord> {
  constructor(
    protected db: Database.Database,
    protected tableName: string
  ) {}

  /** Soft-delete aware findAll — excludes deleted rows. */
  findAll(): T[] {
    return this.db
      .prepare(
        `SELECT * FROM ${this.tableName} WHERE deleted_at IS NULL ORDER BY created_at DESC`
      )
      .all() as T[]
  }

  findById(id: string): T | undefined {
    return this.db
      .prepare(
        `SELECT * FROM ${this.tableName} WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as T | undefined
  }

  /**
   * Soft delete: set deleted_at, bump version, enqueue DELETE.
   * NEVER hard-deletes rows.
   */
  delete(id: string): T | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    const now = new Date().toISOString()
    const updated: T = {
      ...existing,
      deleted_at: now,
      updated_at: now,
      version: existing.version + 1,
      sync_status: 'pending' as SyncStatus,
    }

    // Run update + sync enqueue atomically
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE ${this.tableName}
           SET deleted_at = @deleted_at,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(updated)

      enqueueSync(this.db, this.tableName, id, 'DELETE', updated as unknown as Record<string, unknown>)
    })

    tx()
    return updated
  }

  /** Build base fields for a new record. */
  protected buildBaseFields(): BaseRecord {
    const now = new Date().toISOString()
    return {
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      deleted_at: null,
      sync_status: 'pending',
      version: 1,
    }
  }

  /** Apply versioning + timestamp bump on update. */
  protected applyUpdateMeta(
    existing: BaseRecord
  ): Pick<BaseRecord, 'updated_at' | 'version' | 'sync_status'> {
    return {
      updated_at: new Date().toISOString(),
      version: existing.version + 1,
      sync_status: 'pending',
    }
  }
}
