/**
 * Prepare a teaching staff member for Sofia Teacher (mobile):
 * - Desktop `users` row (required by `get_mobile_access` membership check)
 * - Supabase Auth with app_metadata.staff_id / school_id / role=teacher
 * - Schedules cloud sync so user + staff + assignments appear on mobile
 *
 * Teachers are not Administration desktop operators; the users row exists so
 * mobile RBAC can resolve membership and the seeded Teacher role permissions.
 */
import { hashPassword } from '../auth'
import type { Repositories } from '../db/repositories'
import { STAFF_TEMP_PASSWORD } from '../db/repositories/staff.repository'
import { scheduleTeacherReadySync } from '../sync/auto-sync'
import { tryProvisionStaffAuth } from './cloud-auth'
import { ensureMobileAccessCatalog } from './ensure-mobile-access'

export type PrepareTeacherMobileInput = {
  repos: Repositories
  schoolId: string
  staffId: string
  email: string | null | undefined
  displayName: string
  schoolName?: string | null
  /** When true, overwrite Auth / local password (new teacher or explicit reset). */
  resetPassword: boolean
  password?: string
}

function splitDisplayName(displayName: string): {
  first_name: string
  last_name: string
} {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { first_name: 'Teacher', last_name: '' }
  if (parts.length === 1) return { first_name: parts[0], last_name: '' }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  }
}

/**
 * Ensure a synced desktop `users` membership for the teacher email.
 * Mobile `get_mobile_access` returns not_member when this row is missing.
 */
export async function ensureTeacherDesktopUser(
  input: PrepareTeacherMobileInput & { email: string }
): Promise<string | null> {
  const { repos, schoolId, staffId, email, displayName, resetPassword } = input
  const normalizedEmail = email.trim().toLowerCase()
  const password = input.password || STAFF_TEMP_PASSWORD
  const names = splitDisplayName(displayName)
  const teacherRoleId = repos.roles.findRoleIdByName(schoolId, 'Teacher')

  const existing = repos.users.findByEmail(normalizedEmail)
  if (existing) {
    if (existing.school_id !== schoolId) {
      return `Email ${normalizedEmail} is already used by another school account.`
    }
    const patch: Parameters<typeof repos.users.update>[1] = {
      staff_id: staffId,
      role: 'teacher',
      role_id: teacherRoleId ?? existing.role_id,
      status: 'active',
      first_name: names.first_name,
      last_name: names.last_name,
    }
    if (resetPassword) {
      patch.password_hash = await hashPassword(password)
    }
    repos.users.update(existing.id, patch)
    repos.staff.update(staffId, { user_id: existing.id })
    return null
  }

  const user = repos.users.create({
    school_id: schoolId,
    email: normalizedEmail,
    password_hash: await hashPassword(password),
    role: 'teacher',
    role_id: teacherRoleId,
    first_name: names.first_name,
    last_name: names.last_name,
    phone: null,
    status: 'active',
    last_login_at: null,
    staff_id: staffId,
    failed_login_count: 0,
    locked_until: null,
    must_change_password: 0,
  })
  repos.staff.update(staffId, { user_id: user.id })
  return null
}

export async function prepareTeacherForMobile(
  input: PrepareTeacherMobileInput
): Promise<string | null> {
  const email = input.email?.trim()
  if (!email) {
    return 'Add an email to enable Sofia Teacher mobile login.'
  }

  // Permissions catalog + Teacher role grants must exist in cloud synced_entities
  // or get_mobile_access returns an empty permission list.
  ensureMobileAccessCatalog(input.repos, input.schoolId)

  const membershipWarning = await ensureTeacherDesktopUser({
    ...input,
    email,
  })
  if (membershipWarning) return membershipWarning

  const warning = await tryProvisionStaffAuth({
    email,
    password: input.password || STAFF_TEMP_PASSWORD,
    role: 'teacher',
    schoolId: input.schoolId,
    staffId: input.staffId,
    schoolName: input.schoolName ?? null,
    displayName: input.displayName,
    resetPassword: input.resetPassword,
  })

  scheduleTeacherReadySync(input.schoolId)
  return warning
}

/**
 * Backfill desktop `users` rows for teaching staff who have an email but no
 * (or a stale) membership — so they appear under Administration → Users and
 * mobile `get_mobile_access` can resolve them.
 */
export async function repairTeacherDesktopUsers(
  repos: Repositories,
  schoolId: string
): Promise<{ repaired: number; warnings: string[] }> {
  const schoolName = repos.schools.findById(schoolId)?.name ?? null
  let repaired = 0
  const warnings: string[] = []
  const teachers = repos.staff
    .findBySchool(schoolId)
    .filter((s) => s.staff_type === 'teaching' && Boolean(s.email?.trim()))

  for (const teacher of teachers) {
    const email = teacher.email!.trim().toLowerCase()
    const needsRepair =
      !teacher.user_id ||
      !repos.users.findByEmail(email) ||
      repos.users.findByEmail(email)?.staff_id !== teacher.id
    const warning = await ensureTeacherDesktopUser({
      repos,
      schoolId,
      staffId: teacher.id,
      email,
      displayName: teacher.full_name,
      schoolName,
      resetPassword: false,
    })
    if (warning) {
      warnings.push(warning)
      continue
    }
    if (needsRepair) repaired += 1
  }

  if (repaired > 0) scheduleTeacherReadySync(schoolId)
  return { repaired, warnings }
}
