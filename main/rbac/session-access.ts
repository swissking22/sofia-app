/**
 * Session permission resolution for desktop RBAC.
 *
 * Coarse `users.role` (admin/secretary/…) is only a legacy label. Assigned
 * `role_id` permissions always win for module visibility and IPC checks.
 * Full unrestricted access is reserved for the founding school owner:
 * coarse role `admin` with no `role_id`.
 */
import type { Repositories } from '../db/repositories'
import { PERMISSION_CATALOG } from './catalog'

export type SessionAccessRef = {
  userId: string
  role: string
  schoolId?: string
}

/** Founding owner (or equivalent) with no RBAC role assignment. */
export function isUnrestrictedAdminSession(
  repos: Repositories,
  session: SessionAccessRef
): boolean {
  if (session.role !== 'admin') return false
  const user = repos.users.findById(session.userId)
  if (!user) return false
  return !user.role_id
}

/** Permission names for the current session (catalog for unrestricted owner). */
export function getSessionPermissionNames(
  repos: Repositories,
  session: SessionAccessRef
): string[] {
  if (isUnrestrictedAdminSession(repos, session)) {
    return PERMISSION_CATALOG.map((p) => p.name)
  }
  if (session.schoolId) {
    try {
      repos.roles.ensureDefaults(session.schoolId)
    } catch {
      /* non-fatal */
    }
  }
  return repos.roles.getPermissionNamesForUser(session.userId)
}

/** True when the session may perform any of the named permissions. */
export function sessionCanAny(
  repos: Repositories,
  session: SessionAccessRef,
  names: string[]
): boolean {
  if (isUnrestrictedAdminSession(repos, session)) return true
  const granted = getSessionPermissionNames(repos, session)
  return names.some((n) => granted.includes(n))
}
