/**
 * Sofia Cloud Sync Worker: Two-Way Synchronization (Phase 1 Push + Phase 2 Pull)
 * 1. Pushes pending local SQLite changes to Supabase PostgreSQL (drains outbox).
 * 2. Pulls remote changes from Supabase into local SQLite via pull cursor.
 * 3. Downloads missing branding/photo files from Storage when available.
 */
import type Database from 'better-sqlite3'
import { pushPendingSync } from './push'
import { pullRemoteChanges } from './pull'
import { downloadMissingSyncedAssets, uploadRowAssets } from './assets'
import { getSupabaseSyncClient } from './supabase-client'
import { countReadyPendingSyncItems } from './queue'
import type {
  AssetStorageClient,
  PushSyncResult,
  PullSyncResult,
  SyncWorkerOptions,
  SyncWorkerResult,
} from './types'

/** Default push batch size (RPC items per round-trip). */
export const DEFAULT_SYNC_BATCH_SIZE = 50
/** Safety cap: 200 × 50 = 10 000 items per Sync Now. */
export const DEFAULT_MAX_PUSH_BATCHES = 200
/**
 * Max outer pull pages per Sync Now. Each page runs up to 20 inner batches
 * (see pullRemoteChanges), so default ≈ 50 × 20 × 50 = 50 000 changes.
 * Must honour pull.hasMore — previously pull always returned false and only
 * one page ever ran (~1 000 changes), leaving second-desk rosters incomplete.
 */
export const DEFAULT_MAX_PULL_BATCHES = 50

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

function mergePush(a: PushSyncResult, b: PushSyncResult): PushSyncResult {
  return {
    ok: a.ok && b.ok,
    processed: a.processed + b.processed,
    successful: a.successful + b.successful,
    failed: a.failed + b.failed,
    conflicts: a.conflicts + b.conflicts,
    skipped: a.skipped || b.skipped,
    message: b.message || a.message,
    hasMore: b.hasMore,
  }
}

function mergePull(a: PullSyncResult, b: PullSyncResult): PullSyncResult {
  return {
    ok: a.ok && b.ok,
    processed: a.processed + b.processed,
    applied: a.applied + b.applied,
    conflicts: a.conflicts + b.conflicts,
    failed: a.failed + b.failed,
    newCursor: b.newCursor || a.newCursor,
    hasMore: b.hasMore,
    skipped: a.skipped || b.skipped,
    message: b.message || a.message,
  }
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
  const batchSize = options.batchSize ?? DEFAULT_SYNC_BATCH_SIZE
  const drainPush = options.drainPush !== false
  const drainPull = options.drainPull !== false
  const maxPushBatches = options.maxPushBatches ?? DEFAULT_MAX_PUSH_BATCHES
  const maxPullBatches = options.maxPullBatches ?? DEFAULT_MAX_PULL_BATCHES

  let pushResult: PushSyncResult = {
    ok: true,
    processed: 0,
    successful: 0,
    failed: 0,
    conflicts: 0,
    hasMore: false,
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

  // 1. Push Phase (unless skipped) — drain outbox in batches
  if (!options.skipPush) {
    const onSynced = storage
      ? async (item: {
          id: string
          table_name: string
          record_id: string
          payload: string
        }) => {
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
      : undefined

    let batches = 0
    do {
      const batch = await pushPendingSync({
        db,
        schoolId,
        client,
        batchSize,
        onSynced,
      })
      pushResult = mergePush(pushResult, batch)
      batches += 1

      if (batch.skipped || batch.processed === 0) break
      // Entire batch failed (network drop / permanent barrier) — stop draining
      if (batch.successful === 0 && batch.failed > 0) {
        pushResult = {
          ...pushResult,
          hasMore: countReadyPendingSyncItems(db) > 0,
          message:
            batch.message ||
            'Sync paused after errors. Fix connectivity or retry failed items, then Sync Now again.',
        }
        break
      }
      if (!drainPush) break
      if (!batch.hasMore) break
      if (batches >= maxPushBatches) {
        console.warn(
          `[SYNC] Push drain stopped at safety cap (${maxPushBatches} batches, ~${
            maxPushBatches * batchSize
          } items). Click Sync Now again to continue.`
        )
        pushResult = {
          ...pushResult,
          hasMore: true,
          message: `Synced ${pushResult.successful} item(s); more remain — click Sync Now again.`,
        }
        break
      }
    } while (countReadyPendingSyncItems(db) > 0)

    console.log(
      `[SYNC] Push drain finished after ${batches} batch(es): ` +
        `${pushResult.successful} ok, ${pushResult.failed} failed, hasMore=${Boolean(
          pushResult.hasMore
        )}`
    )
  }

  // 2. Pull Phase (unless skipped) — drain hasMore pages
  if (!options.skipPull) {
    let pages = 0
    do {
      const page = await pullRemoteChanges({
        db,
        schoolId,
        client,
        batchSize,
      })
      pullResult = mergePull(pullResult, page)
      pages += 1
      if (!drainPull) break
      if (!page.hasMore) break
      if (pages >= maxPullBatches) {
        console.warn(
          `[SYNC] Pull drain stopped at safety cap (${maxPullBatches} pages).`
        )
        pullResult = { ...pullResult, hasMore: true }
        break
      }
    } while (pullResult.hasMore)
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
    message: pushResult.message,
    push: pushResult,
    pull: pullResult,
  }
}
