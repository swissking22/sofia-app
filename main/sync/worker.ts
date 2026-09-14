/**
 * Sofia Cloud Sync Worker: Two-Way Synchronization (Phase 1 Push + Phase 2 Pull)
 * 1. Pushes pending local SQLite changes to Supabase PostgreSQL.
 * 2. Pulls remote changes from Supabase into local SQLite via pull cursor.
 */
import type Database from 'better-sqlite3'
import { pushPendingSync } from './push'
import { pullRemoteChanges } from './pull'
import type { PushSyncResult, PullSyncResult, SyncWorkerOptions, SyncWorkerResult } from './types'

export async function runSyncWorker(
  db: Database.Database,
  schoolIdOrOptions?: string | SyncWorkerOptions
): Promise<SyncWorkerResult> {
  const options: SyncWorkerOptions =
    typeof schoolIdOrOptions === 'string'
      ? { schoolId: schoolIdOrOptions }
      : schoolIdOrOptions || {}

  const schoolId = options.schoolId
  const client = options.client

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
    pushResult = await pushPendingSync({ db, schoolId, client })
  }

  // 2. Pull Phase (unless skipped or offline)
  if (!options.skipPull) {
    // If push failed due to network error, skip pull to avoid waiting on connection timeout
    pullResult = await pullRemoteChanges({ db, schoolId, client })
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
