/**
 * Sofia Cloud Sync Worker: Two-Way Synchronization (Phase 1 Push + Phase 2 Pull)
 * 1. Pushes pending local SQLite changes to Supabase PostgreSQL (drains outbox).
 * 2. Pulls remote changes from Supabase into local SQLite via pull cursor.
 * 3. Downloads missing branding/photo files from Storage when available.
 */
import type Database from 'better-sqlite3'
import { pushPendingSync } from './push'
import { DEFAULT_PULL_BATCH_SIZE, pullRemoteChanges } from './pull'
import { downloadMissingSyncedAssets, uploadRowAssets } from './assets'
import { getSupabaseSyncClient } from './supabase-client'
import {
  countReadyPendingSyncItems,
  enqueueOrphanedPendingRows,
} from './queue'
import { getLocalSyncCursor } from './cursor'
import { getOrCreateDeviceId } from './device'
import { SyncProgressTracker } from './progress'
import { yieldToMain } from './yield'
import type {
  AssetStorageClient,
  PushSyncResult,
  PullSyncResult,
  SyncWorkerOptions,
  SyncWorkerResult,
} from './types'

/** Default push batch size (RPC items per round-trip). */
export const DEFAULT_SYNC_BATCH_SIZE = 50
/** Re-export pull page size (500 = cloud max) for Sync Now callers. */
export { DEFAULT_PULL_BATCH_SIZE }
/** Safety cap: 200 × 50 = 10 000 items per Sync Now. */
export const DEFAULT_MAX_PUSH_BATCHES = 200
/**
 * Max outer pull pages per Sync Now. Each page runs up to 50 inner batches of
 * up to 500 changes (see pullRemoteChanges). Must honour pull.hasMore and stop
 * on hard errors (no tight retry loop).
 */
export const DEFAULT_MAX_PULL_BATCHES = 100
/** Outer Sync Now rounds when a single drain hits a safety cap. */
export const DEFAULT_MAX_SYNC_ROUNDS = 40

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

async function resolvePullRemaining(
  client: SyncWorkerOptions['client'],
  schoolId: string | undefined,
  db: Database.Database
): Promise<{ count: number; known: boolean }> {
  if (!schoolId || !client?.countPendingSyncChanges) {
    return { count: 0, known: false }
  }
  try {
    const deviceId = getOrCreateDeviceId()
    const cursor = getLocalSyncCursor(db, schoolId, deviceId)
    const res = await client.countPendingSyncChanges({ schoolId, cursor })
    if (res.ok) return { count: res.count, known: true }
  } catch {
    /* fall through */
  }
  return { count: 0, known: false }
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
  const pullBatchSize = options.pullBatchSize ?? DEFAULT_PULL_BATCH_SIZE
  const drainPush = options.drainPush !== false
  const drainPull = options.drainPull !== false
  const maxPushBatches = options.maxPushBatches ?? DEFAULT_MAX_PUSH_BATCHES
  const maxPullBatches = options.maxPullBatches ?? DEFAULT_MAX_PULL_BATCHES
  const pullMaxIterations = options.pullMaxIterations

  let tracker = options.progressTracker
  if (!tracker && options.onProgress) {
    // Paint "Starting…" before the orphan scan so the UI/cursor stay alive.
    tracker = new SyncProgressTracker({
      pushTotal: 0,
      pullTotal: 0,
      pullCountKnown: false,
      onProgress: options.onProgress,
    })
    tracker.report('starting')
    await yieldToMain()
    if (!options.skipPush) {
      await enqueueOrphanedPendingRows(db, { limit: 5000 })
    }
    const pushTotal = options.skipPush ? 0 : countReadyPendingSyncItems(db)
    const pullRemaining = options.skipPull
      ? { count: 0, known: true }
      : await resolvePullRemaining(client, schoolId, db)
    tracker.pushTotal = pushTotal
    tracker.pullTotal = pullRemaining.count
    tracker.pullCountKnown = pullRemaining.known
    tracker.report('starting')
    await yieldToMain()
  }

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

  // 0. Backfill seed / missed writes (sync_status=pending, never queued)
  // so primary Sync Now pushes fee structures, admissions, roles, etc. for other desks.
  if (!options.skipPush) {
    const orphaned = await enqueueOrphanedPendingRows(db, { limit: 5000 })
    if (orphaned > 0) {
      console.log(
        `[SYNC] Enqueued ${orphaned} local pending row(s) that were missing from the outbox`
      )
      if (tracker && !options.progressTracker) {
        tracker.pushTotal = countReadyPendingSyncItems(db)
      }
    }
    await yieldToMain()
  }

  // 1. Push Phase (unless skipped) — drain outbox in batches
  if (!options.skipPush) {
    tracker?.report('push')
    await yieldToMain()
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
      if (batch.successful > 0) {
        tracker?.addPush(batch.successful)
        tracker?.report('push')
      }
      // Yield so mouse / window chrome stay responsive on the main process.
      await yieldToMain()

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
    tracker?.report('pull')
    await yieldToMain()
    let pages = 0
    do {
      const page = await pullRemoteChanges({
        db,
        schoolId,
        client,
        batchSize: pullBatchSize,
        maxIterations: pullMaxIterations,
        onPageApplied: (appliedDelta, pageHasMore) => {
          if (appliedDelta > 0) tracker?.addPull(appliedDelta)
          if (pageHasMore) tracker?.notePullHasMore(pullBatchSize)
          tracker?.report('pull')
        },
      })
      pullResult = mergePull(pullResult, page)
      pages += 1
      await yieldToMain()
      // Hard error (network / apply): keep hasMore for the UI but do not spin.
      if (!page.ok) break
      if (!drainPull) break
      if (!page.hasMore) break
      if (pages >= maxPullBatches) {
        console.warn(
          `[SYNC] Pull drain stopped at safety cap (${maxPullBatches} pages). ` +
            `Applied ${pullResult.applied} so far — Sync Now again to continue.`
        )
        pullResult = {
          ...pullResult,
          hasMore: true,
          message:
            pullResult.message ||
            `Pulled ${pullResult.applied} change(s); more remain — Sync Now again.`,
        }
        break
      }
    } while (pullResult.hasMore)

    console.log(
      `[SYNC] Pull drain finished after ${pages} page(s): ` +
        `${pullResult.applied} applied, ${pullResult.failed} failed, hasMore=${Boolean(
          pullResult.hasMore
        )}`
    )
  }

  // 3. Download branding/photos missing on this desk
  if (schoolId && storage && !options.skipPull) {
    tracker?.report('assets', 'Downloading photos and branding…')
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
  const hasMore = Boolean(pushResult.hasMore || pullResult.hasMore)
  const message =
    pushResult.message ||
    pullResult.message ||
    (failed > 0
      ? `Sync finished with ${failed} failure(s). Open Failed items below for the exact error.`
      : hasMore
        ? `Synced ${successful} item(s); more remain — Sync Now will continue.`
        : undefined)

  const progress =
    tracker && !hasMore
      ? tracker.report('done')
      : tracker
        ? tracker.report(pullResult.processed > 0 ? 'pull' : 'push', message)
        : undefined

  return {
    ok,
    processed,
    successful,
    failed,
    conflicts,
    hasMore,
    message,
    progress,
    push: pushResult,
    pull: pullResult,
  }
}

/**
 * Drain push+pull across safety-cap rounds with a stable progress denominator
 * measured once at the start (push outbox + cloud remaining count).
 */
export async function runSyncWorkerUntilCaughtUp(
  db: Database.Database,
  options: SyncWorkerOptions & { maxRounds?: number } = {}
): Promise<SyncWorkerResult> {
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_SYNC_ROUNDS
  const client = options.client || getSupabaseSyncClient()

  // Emit starting first so the renderer paints before the orphan scan.
  const tracker = new SyncProgressTracker({
    pushTotal: 0,
    pullTotal: 0,
    pullCountKnown: false,
    onProgress: options.onProgress,
  })
  tracker.report('starting')
  await yieldToMain()

  if (!options.skipPush) {
    await enqueueOrphanedPendingRows(db, { limit: 5000 })
  }
  const pushTotal = options.skipPush ? 0 : countReadyPendingSyncItems(db)
  const pullRemaining = options.skipPull
    ? { count: 0, known: true as const }
    : await resolvePullRemaining(client, options.schoolId, db)

  tracker.pushTotal = pushTotal
  tracker.pullTotal = pullRemaining.count
  tracker.pullCountKnown = pullRemaining.known
  tracker.report('starting')
  await yieldToMain()

  let merged: SyncWorkerResult = {
    ok: true,
    processed: 0,
    successful: 0,
    failed: 0,
    conflicts: 0,
    hasMore: false,
    push: {
      ok: true,
      processed: 0,
      successful: 0,
      failed: 0,
      conflicts: 0,
      hasMore: false,
    },
    pull: {
      ok: true,
      processed: 0,
      applied: 0,
      conflicts: 0,
      failed: 0,
      newCursor: 0,
      hasMore: false,
    },
    rounds: 0,
  }

  for (let round = 1; round <= maxRounds; round += 1) {
    const page = await runSyncWorker(db, {
      ...options,
      client,
      progressTracker: tracker,
      // Avoid double-counting orphans / re-measuring totals
      onProgress: undefined,
    })
    merged = {
      ok: merged.ok && page.ok,
      processed: merged.processed + page.processed,
      successful: merged.successful + page.successful,
      failed: merged.failed + page.failed,
      conflicts: merged.conflicts + page.conflicts,
      hasMore: Boolean(page.hasMore),
      message: page.message || merged.message,
      progress: page.progress,
      push: mergePush(merged.push, page.push),
      pull: mergePull(merged.pull, page.pull),
      rounds: round,
    }
    if (!page.hasMore) break
    if (!page.ok) break
    await yieldToMain()
  }

  if (!merged.hasMore) {
    merged.progress = tracker.report('done')
  } else {
    merged.progress = tracker.report(
      'pull',
      merged.message ||
        `Synced ${merged.successful} item(s); more remain — Sync Now again.`
    )
  }

  return merged
}
