/** Backup & sync setup types + IPC helpers. */

export const BACKUP_FREQUENCY_OPTIONS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
] as const

export type BackupFrequency = (typeof BACKUP_FREQUENCY_OPTIONS)[number]['key']

export type SyncDisplayStatus =
  | 'never'
  | 'idle'
  | 'pending'
  | 'synced'
  | 'error'

export interface BackupSyncSetup {
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

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchBackupSyncSetup(): Promise<Result<BackupSyncSetup>> {
  return (await window.ipc.invoke(
    'backup-sync:get-setup'
  )) as Result<BackupSyncSetup>
}

export async function saveBackupSyncSetup(
  input: BackupSyncSaveInput
): Promise<Result<BackupSyncSetup>> {
  return (await window.ipc.invoke(
    'backup-sync:save-setup',
    input
  )) as Result<BackupSyncSetup>
}

export async function pickBackupLocation(): Promise<
  Result<{ path: string }>
> {
  return (await window.ipc.invoke(
    'backup-sync:pick-location'
  )) as Result<{ path: string }>
}

export async function syncNow(): Promise<
  Result<BackupSyncSetup & { processed: number; failed: number }>
> {
  return (await window.ipc.invoke('backup-sync:sync-now')) as Result<
    BackupSyncSetup & { processed: number; failed: number }
  >
}

export async function testCloudConnection(): Promise<
  Result<BackupSyncSetup>
> {
  return (await window.ipc.invoke(
    'backup-sync:test-connection'
  )) as Result<BackupSyncSetup>
}

export function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Never'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return 'Never'
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return 'Never'
  }
}
