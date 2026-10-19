import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import {
  getPendingSyncItems,
  countReadyPendingSyncItems,
  discardDuplicatePendingAlreadySynced,
  discardForeignTenantSyncItems,
  discardUnsupportedSyncItems,
  markFailed,
  markNetworkError,
  markSynced,
  recordSyncConflict,
  repairDomainSyncStatusFromOutbox,
  requeueFailedSupportedTables,
} from './queue'
import { normalizeShortCode } from '../helpers/school-short-code'
import {
  getDeviceFingerprint,
  getDeviceName,
  getOrCreateDeviceId,
  isDeviceRegisteredForSchool,
  markDeviceRegisteredForSchool,
} from './device'
import { leanSyncPayload } from './lean-payload'
import { getSupabaseSyncClient } from './supabase-client'
import type {
  ProcessSyncBatchItem,
  ProcessSyncRpcResult,
  PushSyncOptions,
  PushSyncResult,
  SupabaseSyncClientInterface,
} from './types'
import { isUnchangedAlreadySynced } from './watermark'

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

  const baseCode =
    normalizeShortCode(school.short_code || '') ||
    normalizeShortCode(school.school_code || '') ||
    normalizeShortCode(school.id.replace(/-/g, '').slice(0, 8)) ||
    'SCH'

  console.log(`[SYNC] Bootstrapping cloud school tenant ${schoolId}`)
  const first = await client.bootstrapSchoolTenant({
    id: school.id,
    name: school.name || 'School',
    shortCode: baseCode,
    schoolCode: normalizeShortCode(school.school_code || '') || baseCode,
    address: school.address,
    phone: school.phone,
    email: school.email,
  })
  if (first.ok) return first

  // Unique / NOT NULL conflicts: retry with an id-derived unique short code (never null —
  // some cloud schemas require short_code NOT NULL).
  const err = (first.error || '').toLowerCase()
  if (
    err.includes('short_code') ||
    err.includes('school_code') ||
    err.includes('duplicate key') ||
    err.includes('unique constraint') ||
    err.includes('not-null') ||
    err.includes('not null')
  ) {
    const unique =
      normalizeShortCode(
        `S${school.id.replace(/-/g, '').slice(0, 7)}${randomUUID().replace(/-/g, '').slice(0, 2)}`
      ) || `S${Date.now().toString(36).toUpperCase().slice(-8)}`
    console.warn(
      `[SYNC] School tenant bootstrap hit code constraint (${first.error}); retrying with short_code=${unique}`
    )
    return client.bootstrapSchoolTenant({
      id: school.id,
      name: school.name || 'School',
      shortCode: unique,
      schoolCode: unique,
      address: school.address,
      phone: school.phone,
      email: school.email,
    })
  }

  return first
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

  const skipHousekeeping = options.skipHousekeeping === true

  // Once per process: lift historical "unsupported table" failures into the expanded allowlist
  if (!skipHousekeeping && !didRequeueExpandedTables) {
    const requeued = requeueFailedSupportedTables(db)
    if (requeued > 0) {
      console.log(
        `[SYNC] Re-queued ${requeued} previously failed supported-table operations`
      )
    }
    didRequeueExpandedTables = true
  }

  if (!skipHousekeeping) {
    // Discard unsupported pending/failed tables locally (settings etc. until later phases)
    const unsupportedDrained = discardUnsupportedSyncItems(db)
    if (unsupportedDrained > 0) {
      console.log(
        `[SYNC] Discarded ${unsupportedDrained} unsupported-table queue item(s) as synced`
      )
    }

    // Drop leftovers from another school tenant (wrong-school outbox after switch/seed).
    const foreignDrained = discardForeignTenantSyncItems(db, schoolId)
    if (foreignDrained > 0) {
      console.log(
        `[SYNC] Abandoned ${foreignDrained} foreign-tenant queue item(s) (not school ${schoolId})`
      )
    }

    // Historical bug: domain sync_status stayed 'pending' after push → Sync Now
    // re-enqueued the same attendance/CA rows every night. Repair once per push.
    const dupes = discardDuplicatePendingAlreadySynced(db)
    if (dupes > 0) {
      console.log(
        `[SYNC] Abandoned ${dupes} duplicate pending item(s) already synced earlier`
      )
    }
    const repaired = repairDomainSyncStatusFromOutbox(db)
    if (repaired > 0) {
      console.log(
        `[SYNC] Marked ${repaired} domain row(s) synced (were pending after prior push)`
      )
    }
  }

  // 2. Check and ensure device registration for this school.
  // Always run when unregistered — parallel siblings may skip repair only.
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
  const pendingRows = getPendingSyncItems(db, batchSize, {
    maxLane: options.maxLane,
    tableNames: options.tableNames,
  }) as Array<{
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

  type Prepared = ProcessSyncBatchItem & {
    rawPayload: string
  }
  const toPush: Prepared[] = []

  // 4. Prepare items (lean payload + watermark skip of unchanged synced rows)
  for (const item of pendingRows) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(item.payload)
    } catch {
      console.error(
        `[SYNC] Validation error for operation ${item.id}: invalid JSON payload`
      )
      markFailed(db, item.id, 'Invalid JSON payload')
      failed += 1
      processed += 1
      continue
    }

    if (payload.school_id && payload.school_id !== schoolId) {
      console.warn(
        `[SYNC] Abandoning operation ${item.id}: payload belongs to ${payload.school_id}, authorized school is ${schoolId}`
      )
      markSynced(db, item.id)
      successful += 1
      processed += 1
      continue
    }

    if (!payload.school_id) payload.school_id = schoolId
    payload = leanSyncPayload(item.table_name, payload)
    if (!payload.school_id) payload.school_id = schoolId

    if (
      isUnchangedAlreadySynced(
        db,
        item.table_name,
        item.record_id,
        payload,
        item.operation
      )
    ) {
      markSynced(db, item.id)
      successful += 1
      processed += 1
      continue
    }

    toPush.push({
      id: item.id,
      tableName: item.table_name,
      recordId: item.record_id,
      operation: item.operation,
      payload,
      rawPayload: item.payload,
    })
  }

  const applyResponse = async (
    item: Prepared,
    response: ProcessSyncRpcResult
  ): Promise<'ok' | 'fail' | 'stop'> => {
    processed += 1
    if (response.ok) {
      markSynced(db, item.id)
      successful += 1
      if (options.onSynced) {
        try {
          await options.onSynced({
            id: String(item.id),
            table_name: String(item.tableName),
            record_id: String(item.recordId),
            payload: String(item.rawPayload ?? '{}'),
          })
        } catch (err) {
          console.warn(
            `[SYNC] onSynced hook failed for ${item.id}:`,
            err instanceof Error ? err.message : err
          )
        }
      }
      return 'ok'
    }

    if (isIdempotentDeleteNotFound(response.error)) {
      markSynced(db, item.id)
      successful += 1
      return 'ok'
    }

    failed += 1

    if (response.errorType === 'network') {
      console.warn(
        `[SYNC] Network error for operation ${item.id}: ${response.error}. Retrying later.`
      )
      markNetworkError(db, item.id)
      return 'stop'
    }

    if (response.errorType === 'conflict') {
      conflicts += 1
      recordSyncConflict(db, {
        schoolId,
        tableName: item.tableName,
        recordId: item.recordId,
        localJson: item.rawPayload,
        remoteJson: JSON.stringify(response),
      })
      markFailed(
        db,
        item.id,
        `Version conflict${
          response.cloudVersion != null
            ? ` (cloud version ${response.cloudVersion})`
            : ''
        }`
      )
      return 'fail'
    }

    console.error(
      `[SYNC] Validation error for operation ${item.id}: ${response.error}`
    )
    markFailed(
      db,
      item.id,
      response.error || 'Cloud rejected this sync operation'
    )
    if (isPermanentSyncBarrier(response.error)) {
      console.error(
        `[SYNC] Push aborted after permanent barrier: ${response.error}`
      )
      return 'stop'
    }
    return 'fail'
  }

  // 5. Prefer one multi-row RPC; fall back to per-item if undeployed / failed hard.
  let usePerItem = !client.processSyncedEntitiesBatch || toPush.length === 0

  if (!usePerItem && toPush.length > 0) {
    let batch = await client.processSyncedEntitiesBatch!({
      schoolId,
      deviceId,
      items: toPush,
    })

    if (
      !batch.ok &&
      !batch.unsupported &&
      batch.error &&
      isMissingSchoolTenant(batch.error) &&
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
        batch = await client.processSyncedEntitiesBatch!({
          schoolId,
          deviceId,
          items: toPush,
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
          hasMore: countReadyPendingSyncItems(db, { maxLane: options.maxLane }) > 0,
        }
      }
    }

    if (batch.unsupported) {
      console.warn(
        '[SYNC] process_synced_entities_batch unavailable — falling back to per-item push'
      )
      usePerItem = true
    } else if (!batch.ok && batch.results.length === 0) {
      // Whole-call failure (network) — mark first item for backoff and stop.
      if (toPush[0]) {
        markNetworkError(db, toPush[0].id)
        failed += 1
      }
      console.warn(`[SYNC] Batch push failed: ${batch.error}`)
    } else {
      const byId = new Map(batch.results.map((r) => [r.id, r.result]))
      for (const item of toPush) {
        const response = byId.get(item.id)
        if (!response) {
          // Missing from response — leave pending for retry
          continue
        }
        const outcome = await applyResponse(item, response)
        if (outcome === 'stop') break
      }
    }
  }

  if (usePerItem) {
    for (const item of toPush) {
      let response = await client.processSyncOperation({
        id: item.id,
        schoolId,
        deviceId,
        tableName: item.tableName,
        recordId: item.recordId,
        operation: item.operation,
        payload: item.payload,
      })

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
            tableName: item.tableName,
            recordId: item.recordId,
            operation: item.operation,
            payload: item.payload,
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
            hasMore:
              countReadyPendingSyncItems(db, { maxLane: options.maxLane }) > 0,
          }
        }
      }

      const outcome = await applyResponse(item, response)
      if (outcome === 'stop') break
    }
  }

  console.log(
    `[SYNC] Push completed: ${successful} succeeded, ${failed} failed (${conflicts} conflicts)`
  )

  const hasMore =
    countReadyPendingSyncItems(db, {
      maxLane: options.maxLane,
      tableNames: options.tableNames,
    }) > 0

  return {
    ok: failed === 0,
    processed,
    successful,
    failed,
    conflicts,
    hasMore,
  }
}
