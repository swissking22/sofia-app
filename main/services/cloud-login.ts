/**
 * Online bootstrap login for secondary desks via Supabase Auth.
 * Passwords are verified in Auth — never copied from sync payloads.
 */
import { createClient, type Session, type User } from '@supabase/supabase-js'
import {
  ensureEnvLoaded,
  getSupabaseConfig,
  normalizeSupabaseUrl,
} from '../sync/supabase-client'
import type { UserRole } from '../db/types'

export type CloudLoginOk = {
  ok: true
  authUserId: string
  email: string
  schoolId: string
  role: UserRole
  staffId: string | null
  displayName: string | null
}

export type CloudLoginErr = { ok: false; error: string; code?: string }

export type CloudLoginResult = CloudLoginOk | CloudLoginErr

export type CloudAuthSignInFn = (input: {
  email: string
  password: string
}) => Promise<CloudLoginResult>

/** Sentinel local hash: row exists from sync profile, offline login not primed yet. */
export const CLOUD_AUTH_PENDING_HASH = '!sofia-cloud-auth-pending'

/** Teachers authenticate on Sofia Teacher (mobile); desktop is administrative only. */
export const TEACHER_DESKTOP_LOGIN_CODE = 'teacher_desktop'
export const TEACHER_DESKTOP_LOGIN_ERROR =
  'Teachers use the Sofia Teacher mobile app. Desktop login is for administrative accounts only.'

export function isCloudAuthPendingHash(hash: string | null | undefined): boolean {
  if (!hash) return true
  return hash === CLOUD_AUTH_PENDING_HASH || hash.startsWith('!sofia-cloud-auth')
}

/** True when the coarse / Auth role must not open a desktop session. */
export function isTeacherDesktopBlocked(
  role: string | null | undefined
): boolean {
  return String(role || '').toLowerCase() === 'teacher'
}

/** Map Auth `app_metadata.role` to a local desktop UserRole. */
export function mapCloudAuthRole(raw: unknown): UserRole | null {
  const role = String(raw || '').toLowerCase()
  if (
    role === 'admin' ||
    role === 'secretary' ||
    role === 'teacher' ||
    role === 'bursar' ||
    role === 'board'
  ) {
    return role
  }
  return null
}

function mapRole(raw: unknown): UserRole | null {
  return mapCloudAuthRole(raw)
}

function readMembership(user: User): {
  schoolId: string | null
  role: UserRole | null
  staffId: string | null
  displayName: string | null
} {
  const app = (user.app_metadata || {}) as Record<string, unknown>
  const meta = (user.user_metadata || {}) as Record<string, unknown>
  const schoolId = String(app.school_id || app.schoolId || '').trim() || null
  const role = mapRole(app.role)
  const staffId = String(app.staff_id || app.staffId || '').trim() || null
  const displayName =
    String(meta.full_name || meta.name || '').trim() ||
    String(app.display_name || '').trim() ||
    null
  return { schoolId, role, staffId, displayName }
}

/**
 * Sign in with Supabase Auth (anon key). Does not use the service role.
 */
export async function signInWithSupabasePassword(input: {
  email: string
  password: string
  /** Expected local school UUID — membership must match. */
  expectedSchoolId: string
  signInFn?: CloudAuthSignInFn
}): Promise<CloudLoginResult> {
  const email = input.email.trim().toLowerCase()
  const password = input.password
  const expectedSchoolId = String(input.expectedSchoolId || '').trim()

  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.', code: 'validation' }
  }
  if (!expectedSchoolId) {
    return {
      ok: false,
      error:
        'This computer has not been connected to this school yet. Internet access is required for first-time setup.',
      code: 'no_school',
    }
  }

  if (input.signInFn) {
    const result = await input.signInFn({ email, password })
    if (!result.ok) return result
    if (result.schoolId !== expectedSchoolId) {
      return {
        ok: false,
        error: 'This account is not authorized for this school.',
        code: 'wrong_school',
      }
    }
    return result
  }

  ensureEnvLoaded()
  let url: string
  let anonKey: string
  try {
    const cfg = getSupabaseConfig()
    url = normalizeSupabaseUrl(cfg.url)
    anonKey = cfg.anonKey
  } catch {
    return {
      ok: false,
      error:
        'This computer has not been connected to this school yet. Internet access is required for first-time setup.',
      code: 'offline_config',
    }
  }

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  let data: { user: User | null; session: Session | null }
  try {
    const res = await client.auth.signInWithPassword({ email, password })
    if (res.error) {
      const msg = res.error.message?.toLowerCase() || ''
      if (
        msg.includes('invalid login') ||
        msg.includes('invalid credentials') ||
        msg.includes('email not confirmed')
      ) {
        return {
          ok: false,
          error: 'Invalid email or password.',
          code: 'invalid_credentials',
        }
      }
      if (
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('failed to fetch')
      ) {
        return {
          ok: false,
          error:
            'This computer has not been connected to this school yet. Internet access is required for first-time setup.',
          code: 'offline',
        }
      }
      return {
        ok: false,
        error: 'Invalid email or password.',
        code: 'auth_error',
      }
    }
    data = res.data
  } catch {
    return {
      ok: false,
      error:
        'This computer has not been connected to this school yet. Internet access is required for first-time setup.',
      code: 'offline',
    }
  }

  const authUser = data.user
  if (!authUser?.id || !authUser.email) {
    return { ok: false, error: 'Invalid email or password.', code: 'no_user' }
  }

  const membership = readMembership(authUser)
  if (!membership.schoolId) {
    return {
      ok: false,
      error:
        'Your account has no Sofia permissions. Contact your school administrator.',
      code: 'no_school_membership',
    }
  }
  if (membership.schoolId !== expectedSchoolId) {
    return {
      ok: false,
      error: 'This account is not authorized for this school.',
      code: 'wrong_school',
    }
  }
  if (!membership.role) {
    return {
      ok: false,
      error:
        'Your account has no Sofia permissions. Contact your school administrator.',
      code: 'no_role',
    }
  }
  if (isTeacherDesktopBlocked(membership.role)) {
    return {
      ok: false,
      error: TEACHER_DESKTOP_LOGIN_ERROR,
      code: TEACHER_DESKTOP_LOGIN_CODE,
    }
  }

  // Best-effort sign-out of the short-lived Auth session; desktop uses local session.
  try {
    await client.auth.signOut({ scope: 'local' })
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    authUserId: authUser.id,
    email: authUser.email.toLowerCase(),
    schoolId: membership.schoolId,
    role: membership.role,
    staffId: membership.staffId,
    displayName: membership.displayName,
  }
}
