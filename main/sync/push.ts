import type { Database } from 'better-sqlite3'
import {
  getPendingSyncItems,
  markFailed,
  markNetworkError,
  markSynced,
  markUnsupportedPendingAsFailed,
  recordSyncConflict,
  requeueFailedSupportedTables,
} from './queue'
import {
  getDeviceFingerprint,
  getDeviceName,
  getOrCreateDeviceId,
  isDeviceRegisteredForSchool,
  markDeviceRegisteredForSchool,
} from './device'
import { getSupabaseSyncClient } from './supabase-client'
import type {
  PushSyncOptions,
  PushSyncResult,
  SupabaseSyncClientInterface,
} from './types'

/** Structural / tenant barriers that would fail every remaining item the same way. */
function isPermanentSyncBarrier(error: string | undefined): boolean {
  if (!error) return false
  const e = error.toLowerCase()
  return (
    e.includes('school tenant does not exist') ||
    e.includes('column "id" does not exist') ||
    e.includes('column id does not exist') ||
    e.includes('relation "public.sync_operations" does not exist') ||
    e.includes('relation "sync_operations" does not exist')
  )
}

/** Once per process: lift historical "unsupported table" failures into the expanded allowlist. */
let didRequeueExpandedTables = false

export async function pushPendingSync(
  options: PushSyncOptions
): Promise<PushSyncResult> {
  const { db, batchSize = 50 } = options as { db: Database; batchSize?: number }
  const client: SupabaseSyncClientInterface =
    options.client || getSupabaseSyncClient()

  console.log('[SYNC] Push started')

  // 1. Resolve school identity
  let schoolId = options.schoolId
  if (!schoolId) {
    try {
      const row = db
        .prepare(
          `SELECT id FROM schools WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`
        )
        .get() as { id: string } | undefined
      if (row?.id) {
        schoolId = row.id
      }
    } catch {
      // In minimal test db or during first setup
    }
  }

  if (!schoolId) {
    console.log('[SYNC] Push skipped: No authorized school identity found')
    return {
      ok: true,
      processed: 0,
      successful: 0,
      failed: 0,
      conflicts: 0,
      skipped: true,
      message: 'No school identity found',
    }
  }

  // Once per process: lift historical "unsupported table" failures into the expanded allowlist
  if (!didRequeueExpandedTables) {
    const requeued = requeueFailedSupportedTables(db)
    if (requeued > 0) {
      console.log(
        `[SYNC] Re-queued ${requeued} previously failed supported-table operations`
      )
    }
    didRequeueExpandedTables = true
  }

  // Drain unsupported pending tables locally (finance etc. until later phases)
  markUnsupportedPendingAsFailed(db)

  // 2. Check and ensure device registration for this school
  const deviceId = getOrCreateDeviceId()
  const isRegistered = isDeviceRegisteredForSchool(schoolId)

  if (!isRegistered) {
    const regResult = await client.registerDevice({
      id: deviceId,
      schoolId,
      deviceName: getDeviceName(),
      deviceFingerprint: getDeviceFingerprint(),
    })

    if (regResult.ok) {
      markDeviceRegisteredForSchool(schoolId)
    } else {
      console.warn(
        `[SYNC] Device registration warning: ${regResult.error || 'Failed to register device'}`
      )
      // Missing tenant (or equivalent) blocks the whole batch — do not hammer RPC
      if (isPermanentSyncBarrier(regResult.error)) {
        console.error(
          `[SYNC] Push aborted: permanent barrier during device registration (${regResult.error})`
        )
        return {
          ok: false,
          processed: 0,
          successful: 0,
          failed: 0,
          conflicts: 0,
          message: regResult.error,
        }
      }
    }
  }

  // 3. Select supported pending items only (created_at ASC + backoff)
  const pendingRows = getPendingSyncItems(db, batchSize) as Array<{
    id: string
    table_name: string
    record_id: string
    operation: string
    payload: string
    retry_count: number
    status: string
  }>

  if (pendingRows.length === 0) {
    console.log('[SYNC] Push completed: 0 pending Phase 1 items')
    return {
      ok: true,
      processed: 0,
      successful: 0,
      failed: 0,
      conflicts: 0,
    }
  }

  let processed = 0
  let successful = 0
  let failed = 0
  let conflicts = 0

  // 4. Process each operation deterministically
  for (const item of pendingRows) {
    processed += 1
    console.log(`[SYNC] Processing operation ${item.id}`)

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(item.payload)
    } catch {
      console.error(
        `[SYNC] Validation error for operation ${item.id}: invalid JSON payload`
      )
      markFailed(db, item.id)
      failed += 1
      continue
    }

    // Tenant check: ensure payload school_id matches authorized schoolId
    if (payload.school_id && payload.school_id !== schoolId) {
      console.error(
        `[SYNC] Tenant mismatch for operation ${item.id}: payload belongs to ${payload.school_id}, authorized school is ${schoolId}`
      )
      markFailed(db, item.id)
      failed += 1
      continue
    }

    // Attach authorized school_id if omitted
    if (!payload.school_id) {
      payload.school_id = schoolId
    }

    // 5. Send operation to Supabase RPC
    const response = await client.processSyncOperation({
      id: item.id,
      schoolId,
      deviceId,
      tableName: item.table_name,
      recordId: item.record_id,
      operation: item.operation,
      payload,
    })

    if (response.ok) {
      markSynced(db, item.id)
      successful += 1
      if (item.table_name === 'students') {
        console.log(`[SYNC] Student ${item.record_id} uploaded`)
      }
      console.log(`[SYNC] Operation ${item.id} acknowledged`)
    } else {
      failed += 1

      if (response.errorType === 'network') {
        console.warn(
          `[SYNC] Network error for operation ${item.id}: ${response.error}. Retrying later.`
        )
        markNetworkError(db, item.id)
        // Stop current push batch if network connection dropped
        break
      }

      if (response.errorType === 'conflict') {
        conflicts += 1
        console.warn(
          `[SYNC] Conflict detected for operation ${item.id}: cloud version is ${response.cloudVersion}`
        )
        recordSyncConflict(db, {
          schoolId,
          tableName: item.table_name,
          recordId: item.record_id,
          localJson: item.payload,
          remoteJson: JSON.stringify(response),
        })
        markFailed(db, item.id)
        continue
      }

      // Validation or other non-recoverable error
      console.error(
        `[SYNC] Validation error for operation ${item.id}: ${response.error}`
      )
      markFailed(db, item.id)

      // Structural / tenant barriers fail every item the same way — stop the batch
      if (isPermanentSyncBarrier(response.error)) {
        console.error(
          `[SYNC] Push aborted after permanent barrier: ${response.error}`
        )
        break
      }
    }
  }

  console.log(
    `[SYNC] Push completed: ${successful} succeeded, ${failed} failed (${conflicts} conflicts)`
  )

  return {
    ok: failed === 0,
    processed,
    successful,
    failed,
    conflicts,
  }
}
