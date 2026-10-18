/**
 * Ensure everything mobile `get_mobile_access` needs is local + in the outbox
 * for a school: permission catalog, system roles (Teacher), role_permissions,
 * then staff/user membership (handled by prepareTeacherForMobile).
 *
 * Call on teacher create/update — no manual cloud scripts required.
 */
import type Database from 'better-sqlite3'
import type { Repositories } from '../db/repositories'
import { enqueueSync } from '../sync/queue'

function hasPendingOutbox(
  db: Database.Database,
  tableName: string,
  recordId: string
): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM sync_queue
       WHERE table_name = ? AND record_id = ? AND status = 'pending'
       LIMIT 1`
    )
    .get(tableName, recordId) as { ok: number } | undefined
  return Boolean(row)
}

/**
 * Re-queue even if an older synced outbox row exists (cloud may have been
 * purged / never received the catalog). Skips when a pending row already waits.
 */
function forceEnqueue(
  db: Database.Database,
  tableName: string,
  recordId: string,
  payload: Record<string, unknown>
): boolean {
  if (hasPendingOutbox(db, tableName, recordId)) return false
  try {
    db.prepare(
      `UPDATE ${tableName} SET sync_status = 'pending' WHERE id = ?`
    ).run(recordId)
  } catch {
    /* table may lack sync_status in tests */
  }
  enqueueSync(db, tableName, recordId, 'INSERT', payload)
  return true
}

/**
 * Seed RBAC if needed and force-enqueue the mobile permission graph for
 * `schoolId` (permissions + roles + role_permissions).
 * @returns number of new outbox rows enqueued
 */
export function ensureMobileAccessCatalog(
  repos: Repositories,
  schoolId: string
): number {
  if (!schoolId) return 0
  repos.roles.ensureDefaults(schoolId)
  const db = repos.roles.getDb()
  let enqueued = 0

  const permissions = db
    .prepare(
      `SELECT * FROM permissions WHERE deleted_at IS NULL ORDER BY name`
    )
    .all() as Array<Record<string, unknown>>

  for (const row of permissions) {
    const id = String(row.id || '')
    if (!id) continue
    if (
      forceEnqueue(db, 'permissions', id, {
        ...row,
        school_id: schoolId,
      })
    ) {
      enqueued += 1
    }
  }

  const roles = db
    .prepare(
      `SELECT * FROM roles
       WHERE school_id = ? AND deleted_at IS NULL`
    )
    .all(schoolId) as Array<Record<string, unknown>>

  for (const role of roles) {
    const roleId = String(role.id || '')
    if (!roleId) continue
    if (forceEnqueue(db, 'roles', roleId, role)) enqueued += 1

    const rps = db
      .prepare(
        `SELECT * FROM role_permissions
         WHERE role_id = ? AND deleted_at IS NULL`
      )
      .all(roleId) as Array<Record<string, unknown>>

    for (const rp of rps) {
      const rpId = String(rp.id || '')
      if (!rpId) continue
      if (
        forceEnqueue(db, 'role_permissions', rpId, {
          ...rp,
          school_id: schoolId,
        })
      ) {
        enqueued += 1
      }
    }
  }

  // School tenant row itself (needed for JWT school binding / mobile school name)
  const school = db
    .prepare(`SELECT * FROM schools WHERE id = ?`)
    .get(schoolId) as Record<string, unknown> | undefined
  if (school?.id && forceEnqueue(db, 'schools', String(school.id), school)) {
    enqueued += 1
  }

  return enqueued
}
