import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type Database from 'better-sqlite3'
import { enqueueSync, getPendingSyncItems, countPendingPhase1 } from '../../sync/queue'
import type { BackupFrequency, BackupSyncSettings } from '../types'
import { verifySqliteBackup } from '../sqlite-backup'
import { BaseRepository } from './base'

export function getDefaultBackupLocation(): string {
  return path.join(app.getPath('userData'), 'backups')
}

export const BACKUP_FREQUENCY_OPTIONS = [
  { key: 'daily' as const, label: 'Daily' },
  { key: 'weekly' as const, label: 'Weekly' },
  { key: 'monthly' as const, label: 'Monthly' },
]

export type SyncDisplayStatus =
  | 'never'
  | 'idle'
  | 'pending'
  | 'synced'
  | 'error'

export interface BackupSyncSetupDto {
  schoolId: string
  schoolName: string
  schoolSyncId: string
  localDatabase: {
    status: 'connected' | 'disconnected'
    path: string
  }
  cloudDatabase: {
    status: 'connected' | 'disconnected'
    last_test_at: string | null
  }
  synchronization: {
    school_sync_id: string
    last_sync_at: string | null
    sync_status: SyncDisplayStatus
    sync_status_label: string
    pending_count: number
  }
  backup: {
    automatic_backup: boolean
    backup_frequency: BackupFrequency
    backup_location: string
  }
}

export interface BackupSyncSaveInput {
  automatic_backup: boolean
  backup_frequency: BackupFrequency
  backup_location: string
}

function isBackupFrequency(v: string): v is BackupFrequency {
  return v === 'daily' || v === 'weekly' || v === 'monthly'
}

function statusLabel(
  status: SyncDisplayStatus,
  pendingCount: number
): string {
  switch (status) {
    case 'never':
      return 'Never synced'
    case 'pending':
      return pendingCount > 0
        ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} pending`
        : 'Pending'
    case 'synced':
      return 'Up to date'
    case 'error':
      return 'Sync error'
    case 'idle':
    default:
      return pendingCount > 0
        ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} pending`
        : 'Idle'
  }
}

function resolveDisplayStatus(
  stored: string,
  pendingCount: number
): SyncDisplayStatus {
  if (stored === 'error') return 'error'
  if (stored === 'never' && pendingCount === 0) return 'never'
  if (pendingCount > 0) return 'pending'
  if (stored === 'synced') return 'synced'
  if (stored === 'never') return 'never'
  return 'idle'
}

export class BackupSyncRepository extends BaseRepository<BackupSyncSettings> {
  constructor(db: Database.Database) {
    super(db, 'backup_sync_settings')
  }

  ensureSettings(schoolId: string): BackupSyncSettings {
    const existing = this.db
      .prepare(
        `SELECT * FROM backup_sync_settings
         WHERE school_id = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId) as BackupSyncSettings | undefined

    if (existing) {
      if (!existing.backup_location) {
        return this.patchLocation(existing, getDefaultBackupLocation())
      }
      return existing
    }

    const record: BackupSyncSettings = {
      ...this.buildBaseFields(),
      school_id: schoolId,
      last_sync_at: null,
      last_sync_status: 'never',
      cloud_connected: 0,
      last_connection_test_at: null,
      automatic_backup: 1,
      backup_frequency: 'daily',
      backup_location: getDefaultBackupLocation(),
    }

    this.db
      .prepare(
        `INSERT INTO backup_sync_settings (
          id, school_id, last_sync_at, last_sync_status, cloud_connected,
          last_connection_test_at, automatic_backup, backup_frequency, backup_location,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @last_sync_at, @last_sync_status, @cloud_connected,
          @last_connection_test_at, @automatic_backup, @backup_frequency, @backup_location,
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

  private patchLocation(
    existing: BackupSyncSettings,
    location: string
  ): BackupSyncSettings {
    const record: BackupSyncSettings = {
      ...existing,
      backup_location: location,
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE backup_sync_settings
         SET backup_location = @backup_location,
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

  getPendingCount(): number {
    return countPendingPhase1(this.db)
  }

  getSetupDto(
    schoolId: string,
    schoolName: string,
    schoolSyncId: string,
    localDbPath: string
  ): BackupSyncSetupDto {
    const settings = this.ensureSettings(schoolId)
    const pending = this.getPendingCount()
    const syncStatus = resolveDisplayStatus(settings.last_sync_status, pending)

    return {
      schoolId,
      schoolName,
      schoolSyncId,
      localDatabase: {
        status: 'connected',
        path: localDbPath,
      },
      cloudDatabase: {
        status: settings.cloud_connected === 1 ? 'connected' : 'disconnected',
        last_test_at: settings.last_connection_test_at,
      },
      synchronization: {
        school_sync_id: schoolSyncId,
        last_sync_at: settings.last_sync_at,
        sync_status: syncStatus,
        sync_status_label: statusLabel(syncStatus, pending),
        pending_count: pending,
      },
      backup: {
        automatic_backup: settings.automatic_backup === 1,
        backup_frequency: isBackupFrequency(settings.backup_frequency)
          ? settings.backup_frequency
          : 'daily',
        backup_location:
          settings.backup_location || getDefaultBackupLocation(),
      },
    }
  }

  saveSettings(
    schoolId: string,
    schoolName: string,
    schoolSyncId: string,
    localDbPath: string,
    input: BackupSyncSaveInput
  ): BackupSyncSetupDto {
    const settings = this.ensureSettings(schoolId)
    const frequency = isBackupFrequency(input.backup_frequency)
      ? input.backup_frequency
      : 'daily'
    const location =
      input.backup_location.trim() || getDefaultBackupLocation()

    const record: BackupSyncSettings = {
      ...settings,
      automatic_backup: input.automatic_backup ? 1 : 0,
      backup_frequency: frequency,
      backup_location: location,
      ...this.applyUpdateMeta(settings),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE backup_sync_settings
           SET automatic_backup = @automatic_backup,
               backup_frequency = @backup_frequency,
               backup_location = @backup_location,
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

    try {
      fs.mkdirSync(location, { recursive: true })
    } catch {
      // Location may be invalid until user picks another folder
    }

    return this.getSetupDto(schoolId, schoolName, schoolSyncId, localDbPath)
  }

  markSyncResult(
    schoolId: string,
    result: { ok: boolean; processed: number; failed: number }
  ): BackupSyncSettings {
    const settings = this.ensureSettings(schoolId)
    const now = new Date().toISOString()
    const record: BackupSyncSettings = {
      ...settings,
      last_sync_at: now,
      last_sync_status: result.ok && result.failed === 0 ? 'synced' : 'error',
      ...this.applyUpdateMeta(settings),
    }

    this.db
      .prepare(
        `UPDATE backup_sync_settings
         SET last_sync_at = @last_sync_at,
             last_sync_status = @last_sync_status,
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

  markConnectionTest(schoolId: string, connected: boolean): BackupSyncSettings {
    const settings = this.ensureSettings(schoolId)
    const now = new Date().toISOString()
    const record: BackupSyncSettings = {
      ...settings,
      cloud_connected: connected ? 1 : 0,
      last_connection_test_at: now,
      ...this.applyUpdateMeta(settings),
    }

    this.db
      .prepare(
        `UPDATE backup_sync_settings
         SET cloud_connected = @cloud_connected,
             last_connection_test_at = @last_connection_test_at,
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

  /** Write a local SQLite snapshot into the configured backup folder. */
  async createLocalBackup(schoolId: string): Promise<string> {
    const settings = this.ensureSettings(schoolId)
    const dir = settings.backup_location || getDefaultBackupLocation()
    fs.mkdirSync(dir, { recursive: true })

    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19)
    const dest = path.join(dir, `sofia-backup-${stamp}.db`)

    await this.db.backup(dest)

    // Verify the snapshot before returning it to callers.
    const check = verifySqliteBackup(dest)
    if (!check.ok) {
      try {
        fs.unlinkSync(dest)
      } catch {
        /* ignore */
      }
      throw new Error(check.error || 'Backup failed integrity verification.')
    }

    return dest
  }

  /** Expose pending items helper for diagnostics (unused in UI for now). */
  peekPending(limit = 5): Array<Record<string, unknown>> {
    return getPendingSyncItems(this.db, limit)
  }
}
