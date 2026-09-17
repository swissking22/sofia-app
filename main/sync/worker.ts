/**
 * Sofia Cloud Sync Worker: Two-Way Synchronization (Phase 1 Push + Phase 2 Pull)
 * 1. Pushes pending local SQLite changes to Supabase PostgreSQL.
 * 2. Pulls remote changes from Supabase into local SQLite via pull cursor.
 * 3. Downloads missing branding/photo files from Storage when available.
 */
import type Database from 'better-sqlite3'
import { pushPendingSync } from './push'
import { pullRemoteChanges } from './pull'
import { downloadMissingSyncedAssets, uploadRowAssets } from './assets'
import { getSupabaseSyncClient } from './supabase-client'
import type {
  AssetStorageClient,
  PushSyncResult,
  PullSyncResult,
  SyncWorkerOptions,
  SyncWorkerResult,
} from './types'

function asAssetStorage(client: unknown): AssetStorageClient | null {
  const c = client as AssetStorageClient
  if (
    c &&
    typeof c.uploadAsset === 'function' &&
    typeof c.downloadAsset === 'function'
  ) {
    return c
  }
  return null
}

export async function runSyncWorker(
  db: Database.Database,
  schoolIdOrOptions?: string | SyncWorkerOptions
): Promise<SyncWorkerResult> {
  const options: SyncWorkerOptions =
    typeof schoolIdOrOptions === 'string'
      ? { schoolId: schoolIdOrOptions }
      : schoolIdOrOptions || {}

  const schoolId = options.schoolId
  const client = options.client || getSupabaseSyncClient()
  const storage = asAssetStorage(client)

  let pushResult: PushSyncResult = {
    ok: true,
    processed: 0,
    successful: 0,
    failed: 0,
    conflicts: 0,
  }

  let pullResult: PullSyncResult = {
    ok: true,
    processed: 0,
    applied: 0,
    conflicts: 0,
    failed: 0,
    newCursor: 0,
    hasMore: false,
  }

  // 1. Push Phase (unless skipped)
  if (!options.skipPush) {
    pushResult = await pushPendingSync({
      db,
      schoolId,
      client,
      onSynced: storage
        ? async (item) => {
            let payload: Record<string, unknown> = {}
            try {
              payload = JSON.parse(item.payload || '{}') as Record<
                string,
                unknown
              >
            } catch {
              payload = {}
            }
            await uploadRowAssets({
              schoolId: schoolId!,
              table: item.table_name,
              recordId: item.record_id,
              payload,
              storage,
            })
          }
        : undefined,
    })
  }

  // 2. Pull Phase (unless skipped)
  if (!options.skipPull) {
    pullResult = await pullRemoteChanges({ db, schoolId, client })
  }

  // 3. Download branding/photos missing on this desk
  if (schoolId && storage && !options.skipPull) {
    try {
      await downloadMissingSyncedAssets({ db, schoolId, storage })
    } catch (err) {
      console.warn(
        '[SYNC] Asset download pass failed:',
        err instanceof Error ? err.message : err
      )
    }
  }

  const processed = pushResult.processed + pullResult.processed
  const successful = pushResult.successful + pullResult.applied
  const failed = pushResult.failed + pullResult.failed
  const conflicts = pushResult.conflicts + pullResult.conflicts
  const ok = pushResult.ok && pullResult.ok

  return {
    ok,
    processed,
    successful,
    failed,
    conflicts,
    push: pushResult,
    pull: pullResult,
  }
}
