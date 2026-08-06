import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { StaffNotification } from '../types'
import { BaseRepository } from './base'

export class StaffNotificationRepository extends BaseRepository<StaffNotification> {
  constructor(db: Database.Database) {
    super(db, 'staff_notifications')
  }

  findByUser(userId: string, limit = 50): StaffNotification[] {
    return this.db
      .prepare(
        `SELECT * FROM staff_notifications
         WHERE user_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(userId, limit) as StaffNotification[]
  }

  create(input: {
    school_id: string
    user_id: string
    title: string
    body?: string | null
    link?: string | null
  }): StaffNotification {
    const record: StaffNotification = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      user_id: input.user_id,
      title: input.title.trim(),
      body: input.body?.trim() || null,
      link: input.link ?? null,
      read_at: null,
    }
    this.db
      .prepare(
        `INSERT INTO staff_notifications (
           id, school_id, user_id, title, body, link, read_at,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @user_id, @title, @body, @link, @read_at,
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
    return record
  }

  markRead(id: string, userId: string): StaffNotification | undefined {
    const existing = this.findById(id)
    if (!existing || existing.user_id !== userId) return undefined
    if (existing.read_at) return existing
    const record: StaffNotification = {
      ...existing,
      read_at: new Date().toISOString(),
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE staff_notifications
         SET read_at = @read_at,
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

  markAllRead(userId: string): number {
    const rows = this.findByUser(userId, 200).filter((r) => !r.read_at)
    for (const row of rows) {
      this.markRead(row.id, userId)
    }
    return rows.length
  }
}
