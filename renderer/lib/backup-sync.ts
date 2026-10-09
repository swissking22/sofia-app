/** Backup & sync setup types + IPC helpers. */

import { formatDisplayDateTime } from './date-format'

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

export type SyncNowResult = BackupSyncSetup & {
  processed: number
  failed: number
  successful?: number
  has_more?: boolean
  hasMore?: boolean
  message?: string | null
  push?: { hasMore?: boolean; successful?: number; applied?: number }
  pull?: { hasMore?: boolean; applied?: number }
}

/** True when push or pull still has cloud/local backlog after a Sync Now. */
export function syncResultHasMore(data: {
  has_more?: boolean
  hasMore?: boolean
  message?: string | null
  push?: { hasMore?: boolean }
  pull?: { hasMore?: boolean }
}): boolean {
  return Boolean(
    data.has_more ||
      data.hasMore ||
      data.push?.hasMore ||
      data.pull?.hasMore
  )
}

export async function syncNow(): Promise<Result<SyncNowResult>> {
  return (await window.ipc.invoke('backup-sync:sync-now')) as Result<SyncNowResult>
}

/**
 * Keep calling Sync Now until push+pull report no backlog (or a hard error).
 * Caps rounds so a stuck remote change cannot spin forever.
 */
export async function syncNowUntilCaughtUp(options?: {
  maxRounds?: number
  onRound?: (round: number, data: SyncNowResult) => void
}): Promise<Result<SyncNowResult & { rounds: number }>> {
  const maxRounds = options?.maxRounds ?? 40
  let last: SyncNowResult | null = null
  let totalSuccessful = 0
  let totalFailed = 0
  let totalProcessed = 0

  for (let round = 1; round <= maxRounds; round += 1) {
    const res = await syncNow()
    if (!res.ok) return res
    last = res.data
    totalSuccessful += Number(res.data.successful ?? 0)
    totalFailed += Number(res.data.failed ?? 0)
    totalProcessed += Number(res.data.processed ?? 0)
    options?.onRound?.(round, res.data)
    if (!syncResultHasMore(res.data)) {
      return {
        ok: true,
        data: {
          ...res.data,
          successful: totalSuccessful,
          failed: totalFailed,
          processed: totalProcessed,
          rounds: round,
        },
      }
    }
    // Pause briefly between rounds so UI can paint and IPC can breathe.
    await new Promise((r) => setTimeout(r, 50))
  }

  return {
    ok: true,
    data: {
      ...(last as SyncNowResult),
      successful: totalSuccessful,
      failed: totalFailed,
      processed: totalProcessed,
      has_more: true,
      hasMore: true,
      message:
        last?.message ||
        `Synced ${totalSuccessful} item(s) across ${maxRounds} rounds; more remain — Sync Now again.`,
      rounds: maxRounds,
    },
  }
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
    return formatDisplayDateTime(d, 'Never')
  } catch {
    return 'Never'
  }
}
