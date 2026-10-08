import type { Database } from 'better-sqlite3'
import {
  getPendingSyncItems,
  countReadyPendingSyncItems,
  discardUnsupportedSyncItems,
  markFailed,
  markNetworkError,
  markSynced,
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

function isMissingSchoolTenant(error: string | undefined): boolean {
  return Boolean(
    error && error.toLowerCase().includes('school tenant does not exist')
  )
}

/**
 * Cloud DELETE when the row was never pushed (or already gone) — desired end state.
 * Treat as success so Retry / Sync Now stop looping on these validation errors.
 */
function isIdempotentDeleteNotFound(error: string | undefined): boolean {
  if (!error) return false
  return /not found for delete/i.test(error)
}

/**
 * Upsert the local school into public.schools so register_device / queue push can proceed.
 * Used when a primary desk (or USB-restored DB) was never synced to the cloud.
 */
async function bootstrapCloudSchoolTenant(
  db: Database,
  client: SupabaseSyncClientInterface,
  schoolId: string
): Promise<{ ok: boolean; error?: string }> {
  const school = db
    .prepare(
      `SELECT id, name, short_code, school_code, address, phone, email
       FROM schools
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`
    )
    .get(schoolId) as
    | {
        id: string
        name: string
        short_code: string | null
        school_code: string | null
        address: string | null
        phone: string | null
        email: string | null
      }
    | undefined

  if (!school) {
    return {
      ok: false,
      error: 'Local school not found for cloud tenant bootstrap',
    }
  }

  if (!client.bootstrapSchoolTenant) {
    return {
      ok: false,
      error:
        'School tenant does not exist in the cloud. Deploy bootstrap_school_tenant RPC, then Sync again.',
    }
  }

  console.log(`[SYNC] Bootstrapping cloud school tenant ${schoolId}`)
  return client.bootstrapSchoolTenant({
    id: school.id,
    name: school.name || 'School',
    shortCode: school.short_code,
    schoolCode: school.school_code,
    address: school.address,
    phone: school.phone,
    email: school.email,
  })
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

  // Discard unsupported pending/failed tables locally (settings etc. until later phases)
  const unsupportedDrained = discardUnsupportedSyncItems(db)
  if (unsupportedDrained > 0) {
    console.log(
      `[SYNC] Discarded ${unsupportedDrained} unsupported-table queue item(s) as synced`
    )
  }

  // 2. Check and ensure device registration for this school
  const deviceId = getOrCreateDeviceId()
  const isRegistered = isDeviceRegisteredForSchool(schoolId)
  let didTenantBootstrap = false

  if (!isRegistered) {
    let regResult = await client.registerDevice({
      id: deviceId,
      schoolId,
      deviceName: getDeviceName(),
      deviceFingerprint: getDeviceFingerprint(),
    })

    if (!regResult.ok && isMissingSchoolTenant(regResult.error)) {
      didTenantBootstrap = true
      const boot = await bootstrapCloudSchoolTenant(db, client, schoolId)
      if (!boot.ok) {
        console.error(
          `[SYNC] Push aborted: could not bootstrap school tenant (${boot.error})`
        )
        return {
          ok: false,
          processed: 0,
          successful: 0,
          failed: 0,
          conflicts: 0,
          message: boot.error,
        }
      }
      regResult = await client.registerDevice({
        id: deviceId,
        schoolId,
        deviceName: getDeviceName(),
        deviceFingerprint: getDeviceFingerprint(),
      })
    }

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
      hasMore: false,
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

    // Never push credentials — even for historical outbox rows.
    if (item.table_name === 'users' && 'password_hash' in payload) {
      delete payload.password_hash
    }

    // 5. Send operation to Supabase RPC
    let response = await client.processSyncOperation({
      id: item.id,
      schoolId,
      deviceId,
      tableName: item.table_name,
      recordId: item.record_id,
      operation: item.operation,
      payload,
    })

    // Device already marked registered locally, but cloud tenant was never created
    // (e.g. USB restore on a machine that kept electron-store device state).
    if (
      !response.ok &&
      isMissingSchoolTenant(response.error) &&
      !didTenantBootstrap
    ) {
      didTenantBootstrap = true
      const boot = await bootstrapCloudSchoolTenant(db, client, schoolId)
      if (boot.ok) {
        if (!isDeviceRegisteredForSchool(schoolId)) {
          const reg = await client.registerDevice({
            id: deviceId,
            schoolId,
            deviceName: getDeviceName(),
            deviceFingerprint: getDeviceFingerprint(),
          })
          if (reg.ok) markDeviceRegisteredForSchool(schoolId)
        }
        response = await client.processSyncOperation({
          id: item.id,
          schoolId,
          deviceId,
          tableName: item.table_name,
          recordId: item.record_id,
          operation: item.operation,
          payload,
        })
      } else {
        console.error(
          `[SYNC] Push aborted: could not bootstrap school tenant (${boot.error})`
        )
        return {
          ok: false,
          processed,
          successful,
          failed: failed + 1,
          conflicts,
          message: boot.error,
          hasMore: countReadyPendingSyncItems(db) > 0,
        }
      }
    }

    if (response.ok) {
      markSynced(db, item.id)
      successful += 1
      if (item.table_name === 'students') {
        console.log(`[SYNC] Student ${item.record_id} uploaded`)
      }
      console.log(`[SYNC] Operation ${item.id} acknowledged`)
      if (options.onSynced) {
        try {
          await options.onSynced({
            id: String(item.id),
            table_name: String(item.table_name),
            record_id: String(item.record_id),
            payload: String(item.payload ?? '{}'),
          })
        } catch (err) {
          console.warn(
            `[SYNC] onSynced hook failed for ${item.id}:`,
            err instanceof Error ? err.message : err
          )
        }
      }
    } else {
      // Idempotent DELETE: student (etc.) never existed in cloud — local soft-delete already done
      if (isIdempotentDeleteNotFound(response.error)) {
        markSynced(db, item.id)
        successful += 1
        console.log(
          `[SYNC] Operation ${item.id}: cloud already absent — marked synced (${response.error})`
        )
        continue
      }

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

  const hasMore = countReadyPendingSyncItems(db) > 0

  return {
    ok: failed === 0,
    processed,
    successful,
    failed,
    conflicts,
    hasMore,
  }
}
