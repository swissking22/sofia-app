/**
 * Sofia Cloud Sync: Phase 2 (Pull Sync Engine)
 * Fetches remote changes from Supabase public.sync_changes starting from
 * the local sync_cursors checkpoint, verifies optimistic versioning,
 * and atomically applies student and student_id_settings records to
 * local SQLite without re-enqueuing into sync_queue.
 */
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getLocalSyncCursor, setLocalSyncCursor } from './cursor'
import {
  getDeviceFingerprint,
  getDeviceName,
  getOrCreateDeviceId,
  isDeviceRegisteredForSchool,
  markDeviceRegisteredForSchool,
} from './device'
import { applyGenericPulledChange } from './apply-generic'
import { recordSyncConflict } from './queue'
import { isGenericSyncTable } from './tables'
import { getSupabaseSyncClient } from './supabase-client'
import type {
  PullSyncOptions,
  PullSyncResult,
  SupabaseSyncClientInterface,
  SyncChange,
} from './types'

/**
 * Ensures a referenced class_id exists in local SQLite to satisfy foreign key constraints.
 */
function ensureClassExists(db: Database, classId: string, schoolId: string): void {
  if (!classId) return
  try {
    const exists = db.prepare('SELECT 1 FROM classes WHERE id = ?').get(classId)
    if (!exists) {
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO classes (
          id, name, school_id, is_active, created_at, updated_at, sync_status, version
        ) VALUES (
          ?, ?, ?, 1, ?, ?, 'synced', 1
        )
      `).run(classId, 'Class ' + classId.substring(0, 8), schoolId, now, now)
    }
  } catch {
    // If classes table doesn't exist in test context, ignore
  }
}

/**
 * Ensures a referenced academic_level_id exists in local SQLite to satisfy foreign key constraints.
 */
function ensureAcademicLevelExists(db: Database, levelId: string, schoolId: string): void {
  if (!levelId) return
  try {
    const exists = db.prepare('SELECT 1 FROM academic_levels WHERE id = ?').get(levelId)
    if (!exists) {
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO academic_levels (
          id, school_id, name, short_name, category, is_active, sort_order, created_at, updated_at, sync_status, version
        ) VALUES (
          ?, ?, ?, ?, 'lower_secondary', 1, 1, ?, ?, 'synced', 1
        )
      `).run(levelId, schoolId, 'Level ' + levelId.substring(0, 8), 'L', now, now)
    }
  } catch {
    // If academic_levels table doesn't exist in test context, ignore
  }
}

/**
 * Atomically applies a batch of pulled changes and updates the local cursor in SQLite.
 * If any critical error occurs, the entire transaction rolls back.
 */
export function applyPulledChangesTransaction(
  db: Database,
  changes: SyncChange[],
  schoolId: string,
  deviceId: string,
  newCursor: number,
  options?: { advanceCursor?: boolean }
): { applied: number; conflicts: number; skipped: number } {
  const advanceCursor = options?.advanceCursor !== false
  const applyTx = db.transaction((items: SyncChange[]) => {
    let applied = 0
    let conflicts = 0
    let skipped = 0

    for (const change of items) {
      console.log(`[SYNC] Applying pulled change ${change.id} for table ${change.table_name} (${change.operation})`)

      // Tenant isolation check
      if (change.school_id && change.school_id !== schoolId) {
        console.warn(`[SYNC] Skipping change ${change.id}: tenant mismatch (change belongs to ${change.school_id})`)
        skipped += 1
        continue
      }

      const remoteVersion = Number(change.version) || 1
      const payload = change.payload || {}

      // =======================================================================
      // BRANCH A: STUDENTS TABLE
      // =======================================================================
      if (change.table_name === 'students') {
        const recordId = change.record_id
        const existingStudent = db
          .prepare(`SELECT * FROM students WHERE id = ?`)
          .get(recordId) as Record<string, any> | undefined

        if (existingStudent) {
          // Preserve version 0 (finance-pull FK stubs) so the real student row can overwrite.
          const parsedLocal = Number(existingStudent.version)
          const localVersion = Number.isFinite(parsedLocal) ? parsedLocal : 1
          const pendingOutbox = db
            .prepare(`SELECT id FROM sync_queue WHERE record_id = ? AND status = 'pending'`)
            .get(recordId)

          // Remote is older than local SQLite record
          if (remoteVersion < localVersion) {
            console.log(`[SYNC] Skipped student ${recordId}: local version ${localVersion} > remote version ${remoteVersion}`)
            skipped += 1
            continue
          }

          // Same version: idempotent
          if (remoteVersion === localVersion) {
            if (change.operation === 'DELETE' && !existingStudent.deleted_at) {
              db.prepare(`
                UPDATE students
                SET deleted_at = ?, updated_at = ?, sync_status = 'synced', version = ?
                WHERE id = ?
              `).run(
                payload.deleted_at || new Date().toISOString(),
                payload.updated_at || new Date().toISOString(),
                remoteVersion,
                recordId
              )
              applied += 1
            } else {
              skipped += 1
            }
            continue
          }

          // Remote is strictly newer (remoteVersion > localVersion)
          if (pendingOutbox) {
            console.warn(`[SYNC] Conflict detected on student ${recordId}: remote version ${remoteVersion} overrides local ${localVersion}`)
            recordSyncConflict(db, {
              schoolId,
              tableName: 'students',
              recordId,
              localJson: JSON.stringify(existingStudent),
              remoteJson: JSON.stringify(payload),
            })
            conflicts += 1
          }

          if (change.operation === 'DELETE') {
            db.prepare(`
              UPDATE students
              SET deleted_at = ?,
                  updated_at = ?,
                  version = ?,
                  sync_status = 'synced'
              WHERE id = ?
            `).run(
              payload.deleted_at || new Date().toISOString(),
              payload.updated_at || new Date().toISOString(),
              remoteVersion,
              recordId
            )
            applied += 1
          } else {
            // Ensure foreign key targets exist if changed
            if (payload.class_id) {
              ensureClassExists(db, String(payload.class_id), schoolId)
            }
            if (payload.academic_level_id) {
              ensureAcademicLevelExists(db, String(payload.academic_level_id), schoolId)
            }

            // UPDATE: preserve permanent immutable fields (student_code, sequence_number, admission_year)
            db.prepare(`
              UPDATE students
              SET name = @name,
                  class_id = @class_id,
                  academic_level_id = @academic_level_id,
                  gender = @gender,
                  date_of_birth = @date_of_birth,
                  place_of_birth = @place_of_birth,
                  phone = @phone,
                  email = @email,
                  address = @address,
                  admission_type = @admission_type,
                  guardian_name = @guardian_name,
                  guardian_phone = @guardian_phone,
                  guardian_email = @guardian_email,
                  guardian_relationship = @guardian_relationship,
                  status = @status,
                  photo_path = @photo_path,
                  residence_type = @residence_type,
                  updated_at = @updated_at,
                  deleted_at = @deleted_at,
                  version = @version,
                  sync_status = 'synced'
              WHERE id = @id
            `).run({
              id: recordId,
              name: payload.name !== undefined ? payload.name : existingStudent.name,
              class_id: payload.class_id !== undefined ? payload.class_id : existingStudent.class_id,
              academic_level_id: payload.academic_level_id !== undefined ? payload.academic_level_id : existingStudent.academic_level_id,
              gender: payload.gender !== undefined ? payload.gender : existingStudent.gender,
              date_of_birth: payload.date_of_birth !== undefined ? payload.date_of_birth : existingStudent.date_of_birth,
              place_of_birth: payload.place_of_birth !== undefined ? payload.place_of_birth : existingStudent.place_of_birth,
              phone: payload.phone !== undefined ? payload.phone : existingStudent.phone,
              email: payload.email !== undefined ? payload.email : existingStudent.email,
              address: payload.address !== undefined ? payload.address : existingStudent.address,
              admission_type: payload.admission_type !== undefined ? payload.admission_type : existingStudent.admission_type,
              guardian_name: payload.guardian_name !== undefined ? payload.guardian_name : existingStudent.guardian_name,
              guardian_phone: payload.guardian_phone !== undefined ? payload.guardian_phone : existingStudent.guardian_phone,
              guardian_email: payload.guardian_email !== undefined ? payload.guardian_email : existingStudent.guardian_email,
              guardian_relationship: payload.guardian_relationship !== undefined ? payload.guardian_relationship : existingStudent.guardian_relationship,
              status: payload.status !== undefined ? payload.status : existingStudent.status,
              photo_path: payload.photo_path !== undefined ? payload.photo_path : existingStudent.photo_path,
              residence_type: payload.residence_type !== undefined ? payload.residence_type : existingStudent.residence_type,
              updated_at: payload.updated_at || new Date().toISOString(),
              deleted_at: payload.deleted_at !== undefined ? payload.deleted_at : existingStudent.deleted_at,
              version: remoteVersion,
            })
            applied += 1
          }
        } else {
          // New student locally!
          if (payload.class_id) {
            ensureClassExists(db, String(payload.class_id), schoolId)
          }
          if (payload.academic_level_id) {
            ensureAcademicLevelExists(db, String(payload.academic_level_id), schoolId)
          }

          db.prepare(`
            INSERT INTO students (
              id, name, class_id, school_id, student_code,
              admission_year, academic_level_id, sequence_number,
              gender, date_of_birth, place_of_birth, phone, email, address, admission_type,
              guardian_name, guardian_phone, guardian_email, guardian_relationship,
              status, photo_path, residence_type,
              created_at, updated_at, deleted_at, sync_status, version
            ) VALUES (
              @id, @name, @class_id, @school_id, @student_code,
              @admission_year, @academic_level_id, @sequence_number,
              @gender, @date_of_birth, @place_of_birth, @phone, @email, @address, @admission_type,
              @guardian_name, @guardian_phone, @guardian_email, @guardian_relationship,
              @status, @photo_path, @residence_type,
              @created_at, @updated_at, @deleted_at, 'synced', @version
            )
          `).run({
            id: recordId,
            name: payload.name || 'Unknown Student',
            class_id: payload.class_id || '',
            school_id: schoolId,
            student_code: payload.student_code ?? null,
            admission_year: payload.admission_year ?? null,
            academic_level_id: payload.academic_level_id ?? null,
            sequence_number: payload.sequence_number ?? null,
            gender: payload.gender ?? null,
            date_of_birth: payload.date_of_birth ?? null,
            place_of_birth: payload.place_of_birth ?? null,
            phone: payload.phone ?? null,
            email: payload.email ?? null,
            address: payload.address ?? null,
            admission_type: payload.admission_type ?? null,
            guardian_name: payload.guardian_name ?? null,
            guardian_phone: payload.guardian_phone ?? null,
            guardian_email: payload.guardian_email ?? null,
            guardian_relationship: payload.guardian_relationship ?? null,
            status: payload.status || 'active',
            photo_path: payload.photo_path ?? null,
            residence_type: payload.residence_type || 'day',
            created_at: payload.created_at || new Date().toISOString(),
            updated_at: payload.updated_at || new Date().toISOString(),
            deleted_at: change.operation === 'DELETE' ? (payload.deleted_at || new Date().toISOString()) : (payload.deleted_at ?? null),
            version: remoteVersion,
          })
          applied += 1
        }
      }

      // =======================================================================
      // BRANCH B: STUDENT_ID_SETTINGS TABLE
      // =======================================================================
      else if (change.table_name === 'student_id_settings') {
        const recordId = change.record_id
        const existingSettings = db
          .prepare(`SELECT * FROM student_id_settings WHERE school_id = ?`)
          .get(schoolId) as Record<string, any> | undefined

        if (existingSettings) {
          const localVersion = Number(existingSettings.version) || 1
          if (remoteVersion > localVersion) {
            db.prepare(`
              UPDATE student_id_settings
              SET pattern = @pattern,
                  sequence_scope = @sequence_scope,
                  next_sequence_number = MAX(next_sequence_number, @next_sequence_number),
                  updated_at = @updated_at,
                  deleted_at = @deleted_at,
                  version = @version,
                  sync_status = 'synced'
              WHERE school_id = @school_id
            `).run({
              school_id: schoolId,
              pattern: payload.pattern || existingSettings.pattern,
              sequence_scope: payload.sequence_scope || existingSettings.sequence_scope,
              next_sequence_number: Number(payload.next_sequence_number) || existingSettings.next_sequence_number,
              updated_at: payload.updated_at || new Date().toISOString(),
              deleted_at: payload.deleted_at ?? null,
              version: remoteVersion,
            })
            applied += 1
          } else {
            skipped += 1
          }
        } else {
          db.prepare(`
            INSERT INTO student_id_settings (
              id, school_id, pattern, sequence_scope, next_sequence_number,
              created_at, updated_at, deleted_at, sync_status, version
            ) VALUES (
              @id, @school_id, @pattern, @sequence_scope, @next_sequence_number,
              @created_at, @updated_at, @deleted_at, 'synced', @version
            )
          `).run({
            id: recordId || randomUUID(),
            school_id: schoolId,
            pattern: payload.pattern || '{SCHOOL}-{SEQ}',
            sequence_scope: payload.sequence_scope || 'school',
            next_sequence_number: Number(payload.next_sequence_number) || 1,
            created_at: payload.created_at || new Date().toISOString(),
            updated_at: payload.updated_at || new Date().toISOString(),
            deleted_at: payload.deleted_at ?? null,
            version: remoteVersion,
          })
          applied += 1
        }
      }

      // =======================================================================
      // BRANCH C: GENERIC MULTI-DESK MVP TABLES
      // =======================================================================
      else if (isGenericSyncTable(change.table_name)) {
        const result = applyGenericPulledChange(
          db,
          {
            table_name: change.table_name,
            record_id: change.record_id,
            operation: change.operation,
            version: change.version,
            payload: payload as Record<string, unknown>,
          },
          schoolId
        )
        if (result === 'applied') applied += 1
        else if (result === 'conflict') {
          applied += 1
          conflicts += 1
        } else skipped += 1
      } else {
        console.warn(`[SYNC] Unknown table in pull change: ${change.table_name}`)
        skipped += 1
      }
    }

    // Atomically advance local cursor in the SAME SQLite transaction
    if (advanceCursor) {
      setLocalSyncCursor(db, schoolId, deviceId, newCursor)
    }

    return { applied, conflicts, skipped }
  })

  return applyTx(changes)
}

/**
 * Apply each change in its own transaction so one bad row cannot roll back the
 * whole page (and freeze the pull cursor). Always advances the cursor afterward.
 */
export function applyPulledChangesIndividually(
  db: Database,
  changes: SyncChange[],
  schoolId: string,
  deviceId: string,
  newCursor: number
): { applied: number; conflicts: number; skipped: number; failed: number } {
  let applied = 0
  let conflicts = 0
  let skipped = 0
  let failed = 0

  for (const change of changes) {
    try {
      const res = applyPulledChangesTransaction(
        db,
        [change],
        schoolId,
        deviceId,
        newCursor,
        { advanceCursor: false }
      )
      applied += res.applied
      conflicts += res.conflicts
      skipped += res.skipped
    } catch (err) {
      failed += 1
      console.error(
        `[SYNC] Skipping pulled change ${change.id} (${change.table_name}):`,
        err instanceof Error ? err.message : err
      )
    }
  }

  setLocalSyncCursor(db, schoolId, deviceId, newCursor)
  return { applied, conflicts, skipped, failed }
}

/**
 * Sofia Pull Service: Phase 2
 * Pulls pending remote sync changes from Supabase into local SQLite.
 */
export async function pullRemoteChanges(
  options: PullSyncOptions
): Promise<PullSyncResult> {
  // Prefer larger pull pages than push batches — second desks hydrate big backlogs.
  const { db, batchSize = 100 } = options
  const client: SupabaseSyncClientInterface =
    options.client || getSupabaseSyncClient()

  console.log('[SYNC] Pull started')

  // 1. Resolve authorized school identity
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
      // Test environment or minimal db
    }
  }

  if (!schoolId) {
    console.log('[SYNC] Pull skipped: No authorized school identity found')
    return {
      ok: true,
      processed: 0,
      applied: 0,
      conflicts: 0,
      failed: 0,
      newCursor: 0,
      hasMore: false,
      skipped: true,
      message: 'No school identity found',
    }
  }

  // 2. Resolve client device identity
  const deviceId = options.deviceId || getOrCreateDeviceId()

  // 3. Ensure device is registered in cloud
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
    }
  }

  // 4. Read local cursor
  let currentCursor = getLocalSyncCursor(db, schoolId, deviceId)
  console.log(`[SYNC] Pull cursor starting at: ${currentCursor}`)

  let totalProcessed = 0
  let totalApplied = 0
  let totalConflicts = 0
  let totalFailed = 0
  let hasMore = true
  let iterations = 0
  // Cap per call so callers (Join / Sync Now worker) can drain across pages.
  const maxIterations = options.maxIterations ?? 50

  while (hasMore && iterations < maxIterations) {
    iterations += 1

    const pullRes = await client.pullSyncChanges({
      schoolId,
      deviceId,
      cursor: currentCursor,
      limit: batchSize,
    })

    if (!pullRes.ok) {
      console.warn(`[SYNC] Pull RPC error: ${pullRes.error || 'Unknown error'}`)
      totalFailed += 1
      // Keep hasMore=true so Sync Now / Join retry instead of pretending we are done.
      return {
        ok: false,
        processed: totalProcessed,
        applied: totalApplied,
        conflicts: totalConflicts,
        failed: totalFailed,
        newCursor: currentCursor,
        hasMore: true,
        message:
          pullRes.error ||
          'Pull paused after a network/RPC error. Click Sync Now to continue.',
      }
    }

    if (pullRes.changes.length === 0) {
      hasMore = false
      break
    }

    // 5. Apply batch — prefer one atomic transaction; fall back per-row so a
    // single bad change cannot freeze the cursor for the whole school.
    try {
      let txRes: {
        applied: number
        conflicts: number
        skipped: number
        failed?: number
      }
      try {
        txRes = applyPulledChangesTransaction(
          db,
          pullRes.changes,
          schoolId,
          deviceId,
          pullRes.newCursor
        )
      } catch (batchErr) {
        console.warn(
          '[SYNC] Batch apply failed; retrying each change individually:',
          batchErr instanceof Error ? batchErr.message : batchErr
        )
        txRes = applyPulledChangesIndividually(
          db,
          pullRes.changes,
          schoolId,
          deviceId,
          pullRes.newCursor
        )
        totalFailed += txRes.failed || 0
      }

      totalProcessed += pullRes.changes.length
      totalApplied += txRes.applied
      totalConflicts += txRes.conflicts
      currentCursor = pullRes.newCursor

      console.log(
        `[SYNC] Pulled batch applied: ${txRes.applied} records applied, cursor advanced to ${currentCursor}`
      )

      // 6. Notify cloud of advanced cursor
      await client.updateSyncCursor({
        schoolId,
        deviceId,
        cursor: currentCursor,
      })
    } catch (err: any) {
      console.error(`[SYNC] Error applying pulled changes transaction:`, err)
      totalFailed += 1
      return {
        ok: false,
        processed: totalProcessed,
        applied: totalApplied,
        conflicts: totalConflicts,
        failed: totalFailed,
        newCursor: currentCursor,
        hasMore: true,
        message:
          err?.message ||
          'Pull paused while applying changes. Click Sync Now to continue.',
      }
    }

    hasMore = Boolean(pullRes.hasMore)
  }

  if (hasMore) {
    console.warn(
      `[SYNC] Pull paused at safety cap (${maxIterations} batches, ${totalApplied} applied). ` +
        `More remote changes remain — continue Join / Sync Now.`
    )
  } else {
    console.log(
      `[SYNC] Pull completed: ${totalApplied} applied, ${totalConflicts} conflicts, new cursor: ${currentCursor}`
    )
  }

  return {
    ok: true,
    processed: totalProcessed,
    applied: totalApplied,
    conflicts: totalConflicts,
    failed: totalFailed,
    newCursor: currentCursor,
    hasMore,
  }
}
