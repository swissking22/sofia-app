import bcrypt from 'bcryptjs'
import Store from 'electron-store'
import type { Repositories } from '../db/repositories'
import type { School, User, UserRole } from '../db/types'
import { saveSchoolLogo } from '../helpers/save-logo'
import {
  isCloudAuthPendingHash,
  isTeacherDesktopBlocked,
  signInWithSupabasePassword,
  TEACHER_DESKTOP_LOGIN_ERROR,
  type CloudAuthSignInFn,
} from '../services/cloud-login'
import {
  provisionStaffAuth,
  type ProvisionStaffAuthInput,
  type ProvisionStaffAuthResult,
} from '../services/cloud-auth'
import { ensureMobileAccessCatalog } from '../services/ensure-mobile-access'
import { SystemAdminService } from '../services/system-admin'
import { pullRemoteChanges } from '../sync/pull'

const BCRYPT_ROUNDS = 10
/** Matches Edge Function `provision-staff-auth` (min 8). */
export const REGISTER_ADMIN_MIN_PASSWORD_LENGTH = 8

export type ProvisionStaffAuthFn = (
  input: ProvisionStaffAuthInput
) => Promise<ProvisionStaffAuthResult>

export type SafeUser = Omit<User, 'password_hash'>

export interface SessionData {
  userId: string
  email: string
  role: UserRole
  schoolId: string
  schoolName: string
}

/** Step 1–2: create the school record (before admin). */
export interface RegisterSchoolInput {
  schoolName: string
  schoolEmail?: string
  phone?: string
  country?: string
  address?: string
  /** Optional data-URL or raw base64 for the school logo */
  logoBase64?: string | null
  logoMimeType?: string
}

/** Step 3: create the admin user for an existing school. */
export interface RegisterAdminInput {
  schoolId: string
  email: string
  password: string
  /**
   * Test seam — production always uses `provisionStaffAuth`.
   * Founding-admin cloud Auth is required; failures abort registration.
   */
  provisionAuth?: ProvisionStaffAuthFn
}

export interface LoginInput {
  email: string
  password: string
  /** Test seam for Supabase Auth sign-in. */
  cloudSignIn?: CloudAuthSignInFn
}

interface AuthResultOk {
  ok: true
  user: SafeUser
  session: SessionData
}

interface AuthResultErr {
  ok: false
  error: string
}

export type AuthResult = AuthResultOk | AuthResultErr

export type SchoolResult =
  | { ok: true; school: School }
  | { ok: false; error: string }

export interface SetupState {
  needsSetup: boolean
  /** School created but admin not yet — resume at step 3 */
  pendingSchool: Pick<
    School,
    'id' | 'name' | 'email' | 'phone' | 'country' | 'address' | 'logo_path'
  > | null
}

/**
 * Lazy electron-store so construction happens AFTER main/pin-user-data.ts
 * calls app.setPath('userData', …). Eager construction at import time used the
 * pre-pin path and could split session files from sofia.db — or throw during
 * module load on packaged Windows.
 */
let sessionStoreInstance: Store<{ session: SessionData | null }> | null = null

function getSessionStore(): Store<{ session: SessionData | null }> {
  if (!sessionStoreInstance) {
    sessionStoreInstance = new Store<{ session: SessionData | null }>({
      name: 'sofia-session',
    })
  }
  return sessionStoreInstance
}

/** Hash a plain password — never store plaintext. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

/** Compare plain password against stored hash. */
export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash)
}

function toSafeUser(user: User): SafeUser {
  const { password_hash: _, ...safe } = user
  return safe
}

/** True when no admin/users exist yet. */
export function needsSetup(repos: Repositories): boolean {
  return repos.users.findAll().length === 0
}

/** Setup status for the multi-step registration wizard. */
export function getSetupState(repos: Repositories): SetupState {
  if (!needsSetup(repos)) {
    return { needsSetup: false, pendingSchool: null }
  }

  const school = repos.schools.findLatest()
  if (!school) {
    return { needsSetup: true, pendingSchool: null }
  }

  return {
    needsSetup: true,
    pendingSchool: {
      id: school.id,
      name: school.name,
      email: school.email,
      phone: school.phone,
      country: school.country,
      address: school.address,
      logo_path: school.logo_path,
    },
  }
}

/**
 * Step 1–2: persist school details (and optional logo).
 * Does NOT create a user — that happens in registerAdmin.
 */
export function registerSchool(
  repos: Repositories,
  input: RegisterSchoolInput
): SchoolResult {
  if (!needsSetup(repos)) {
    return {
      ok: false,
      error: 'SOFIA is already set up. Please sign in instead.',
    }
  }

  // Resume path: school already created — return it
  const existing = repos.schools.findLatest()
  if (existing) {
    return { ok: true, school: existing }
  }

  const schoolName = input.schoolName.trim()
  const schoolEmail = input.schoolEmail?.trim().toLowerCase() || ''
  const phone = input.phone?.trim() || null
  const country = input.country?.trim() || null
  const address = input.address?.trim() || null

  if (!schoolName) {
    return { ok: false, error: 'School name is required.' }
  }

  if (!phone) {
    return { ok: false, error: 'Phone is required.' }
  }

  if (!address) {
    return { ok: false, error: 'Address is required.' }
  }

  let logo_path: string | null = null
  if (input.logoBase64) {
    try {
      logo_path = saveSchoolLogo(
        input.logoBase64,
        input.logoMimeType ?? 'image/png'
      )
    } catch {
      return { ok: false, error: 'Could not save the school logo.' }
    }
  }

  const school = repos.schools.create({
    name: schoolName,
    email: schoolEmail,
    phone,
    country,
    address,
    logo_path,
  })

  return { ok: true, school }
}

/**
 * Undo a founding-admin insert when cloud Auth provision fails so the
 * registration wizard can retry (needsSetup stays true).
 */
function revertUnprovisionedAdmin(repos: Repositories, userId: string): void {
  const db = repos.users.getDb()
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM sync_queue WHERE table_name = 'users' AND record_id = ?`).run(
      userId
    )
    db.prepare(`DELETE FROM users WHERE id = ?`).run(userId)
  })
  tx()
}

/**
 * Step 3: create admin for an existing school and open a session.
 * Always provisions Supabase Auth for the founding admin (required for
 * secondary-desk / Join login). On Auth failure the local user is rolled
 * back and registration returns an error.
 */
export async function registerAdmin(
  repos: Repositories,
  input: RegisterAdminInput
): Promise<AuthResult> {
  if (!needsSetup(repos)) {
    return {
      ok: false,
      error: 'SOFIA is already set up. Please sign in instead.',
    }
  }

  const email = input.email.trim().toLowerCase()
  const password = input.password

  if (!input.schoolId || !email || !password) {
    return { ok: false, error: 'All fields are required.' }
  }

  if (password.length < REGISTER_ADMIN_MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${REGISTER_ADMIN_MIN_PASSWORD_LENGTH} characters.`,
    }
  }

  const school = repos.schools.findById(input.schoolId)
  if (!school) {
    return { ok: false, error: 'School not found. Please create the school first.' }
  }

  if (repos.users.findByEmail(email)) {
    return { ok: false, error: 'An account with this email already exists.' }
  }

  const password_hash = await hashPassword(password)

  const user = repos.users.create({
    school_id: school.id,
    email,
    password_hash,
    role: 'admin',
  })

  // Seed Teacher/system roles + enqueue permission catalog for mobile RBAC
  // before the founding admin ever creates staff.
  ensureMobileAccessCatalog(repos, school.id)

  const provision = input.provisionAuth ?? provisionStaffAuth
  try {
    await provision({
      email,
      password,
      role: 'admin',
      schoolId: school.id,
      schoolName: school.name,
      displayName: email,
      resetPassword: true,
    })
  } catch (err) {
    revertUnprovisionedAdmin(repos, user.id)
    const message =
      err instanceof Error ? err.message : 'Could not create cloud login.'
    return {
      ok: false,
      error: `Could not create cloud login for this admin (needed for other desks). Check your internet connection and try again. ${message}`,
    }
  }

  const session: SessionData = {
    userId: user.id,
    email: user.email,
    role: user.role,
    schoolId: school.id,
    schoolName: school.name,
  }

  getSessionStore().set('session', session)

  return { ok: true, user: toSafeUser(user), session }
}

function splitDisplayName(displayName: string | null, email: string): {
  first_name: string
  last_name: string
} {
  const cleaned = (displayName || '').trim()
  if (!cleaned) {
    const local = email.split('@')[0] || 'User'
    return { first_name: local, last_name: '' }
  }
  const parts = cleaned.split(/\s+/)
  return {
    first_name: parts[0] || cleaned,
    last_name: parts.slice(1).join(' '),
  }
}

/**
 * After Supabase Auth succeeds, create/update the local profile and cache a
 * local password hash for offline sign-in on this device only.
 */
async function bootstrapLocalUserFromCloudAuth(
  repos: Repositories,
  input: {
    schoolId: string
    email: string
    password: string
    authUserId: string
    role: UserRole
    staffId: string | null
    displayName: string | null
  }
): Promise<User> {
  const password_hash = await hashPassword(input.password)
  const names = splitDisplayName(input.displayName, input.email)

  // Prefer a profile row already pulled via sync (may use a different id).
  let user = repos.users.findByEmail(input.email)
  if (user) {
    const updated = repos.users.update(user.id, {
      password_hash,
      role: input.role,
      staff_id: input.staffId ?? user.staff_id,
      status: 'active',
      failed_login_count: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
      first_name: user.first_name || names.first_name,
      last_name: user.last_name || names.last_name,
    })
    if (!updated) {
      throw new Error('Could not update local user profile.')
    }
    return updated
  }

  // Best-effort pull so roles/permissions land before first home screen.
  try {
    await pullRemoteChanges({
      db: repos.schools.getDb(),
      schoolId: input.schoolId,
    })
    user = repos.users.findByEmail(input.email)
    if (user) {
      const updated = repos.users.update(user.id, {
        password_hash,
        role: input.role,
        staff_id: input.staffId ?? user.staff_id,
        status: 'active',
        failed_login_count: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
      })
      if (updated) return updated
    }
  } catch {
    /* continue with Auth metadata bootstrap */
  }

  return repos.users.create({
    id: input.authUserId,
    school_id: input.schoolId,
    email: input.email,
    password_hash,
    role: input.role,
    first_name: names.first_name,
    last_name: names.last_name,
    staff_id: input.staffId,
    status: 'active',
  })
}

async function finishLocalLogin(
  repos: Repositories,
  user: User
): Promise<AuthResult> {
  if (isTeacherDesktopBlocked(user.role)) {
    try {
      repos.systemAdmin.writeAudit({
        school_id: user.school_id,
        actor_user_id: user.id,
        action: 'auth.login_failed',
        description: TEACHER_DESKTOP_LOGIN_ERROR,
        result: 'failure',
      })
    } catch {
      /* ignore */
    }
    return { ok: false, error: TEACHER_DESKTOP_LOGIN_ERROR }
  }

  repos.systemAdmin.patchUser(user.school_id, user.id, {
    failed_login_count: 0,
    locked_until: null,
    last_login_at: new Date().toISOString(),
  })
  repos.systemAdmin.createSession(user.school_id, user.id)
  repos.systemAdmin.writeAudit({
    school_id: user.school_id,
    actor_user_id: user.id,
    action: 'auth.login',
    description: 'Signed in',
  })

  const school = repos.schools.findById(user.school_id)
  const session: SessionData = {
    userId: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.school_id,
    schoolName: school?.name ?? 'School',
  }

  getSessionStore().set('session', session)
  return { ok: true, user: toSafeUser(user), session }
}

/**
 * Authenticate with email + password.
 * 1) Local bcrypt when a primed offline hash exists (main desk / after bootstrap).
 * 2) Otherwise online Supabase Auth → verify school membership → upsert local profile.
 */
export async function login(
  repos: Repositories,
  input: LoginInput
): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase()
  const password = input.password

  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.' }
  }

  const school = repos.schools.findLatest()
  const existing = repos.users.findByEmail(email)

  // Path A — offline-capable local login (hash already primed on this device).
  if (existing && !isCloudAuthPendingHash(existing.password_hash)) {
    const settings = repos.systemAdmin.ensureSettings(existing.school_id) as {
      lockout_attempts: number
      lockout_minutes: number
    }
    const gate = new SystemAdminService().assertLogin({
      status: existing.status || 'active',
      locked_until: existing.locked_until,
      failed_count: existing.failed_login_count || 0,
      passwordOk: await verifyPassword(password, existing.password_hash),
      maxAttempts: Number(settings.lockout_attempts) || 5,
      lockMinutes: Number(settings.lockout_minutes) || 15,
    })

    if (!gate.ok) {
      repos.systemAdmin.patchUser(existing.school_id, existing.id, {
        failed_login_count: gate.failed,
        locked_until: gate.locked_until,
      })
      repos.systemAdmin.writeAudit({
        school_id: existing.school_id,
        actor_user_id: existing.id,
        action: 'auth.login_failed',
        description: gate.error,
        result: 'failure',
      })
      return { ok: false, error: gate.error }
    }

    return finishLocalLogin(repos, existing)
  }

  // Path B — first-time / secondary desk: Supabase Auth + school membership.
  if (!school) {
    return {
      ok: false,
      error:
        'This computer has not been connected to this school yet. Join with your school code first.',
    }
  }

  const cloud = await signInWithSupabasePassword({
    email,
    password,
    expectedSchoolId: school.id,
    signInFn: input.cloudSignIn,
  })

  if (!cloud.ok) {
    try {
      repos.systemAdmin.writeAudit({
        school_id: school.id,
        actor_user_id: null,
        action: 'auth.login_failed',
        description: `${cloud.code || 'cloud'}: ${cloud.error}`,
        result: 'failure',
      })
    } catch {
      /* ignore */
    }
    return { ok: false, error: cloud.error }
  }

  // Teachers (Auth role) stay on the mobile app — do not bootstrap a desktop session.
  if (isTeacherDesktopBlocked(cloud.role)) {
    try {
      repos.systemAdmin.writeAudit({
        school_id: school.id,
        actor_user_id: null,
        action: 'auth.login_failed',
        description: TEACHER_DESKTOP_LOGIN_ERROR,
        result: 'failure',
      })
    } catch {
      /* ignore */
    }
    return { ok: false, error: TEACHER_DESKTOP_LOGIN_ERROR }
  }

  try {
    const user = await bootstrapLocalUserFromCloudAuth(repos, {
      schoolId: school.id,
      email: cloud.email,
      password,
      authUserId: cloud.authUserId,
      role: cloud.role,
      staffId: cloud.staffId,
      displayName: cloud.displayName,
    })
    return finishLocalLogin(repos, user)
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Your account was verified, but Sofia could not finish setting up this computer. ${err.message}`
          : 'Your account was verified, but Sofia could not finish setting up this computer. Please try again.',
    }
  }
}

export function logout(repos?: Repositories): void {
  const current = getSession()
  if (current && repos) {
    try {
      repos.systemAdmin.revokeSessions(current.schoolId, current.userId)
      repos.systemAdmin.writeAudit({
        school_id: current.schoolId,
        actor_user_id: current.userId,
        action: 'auth.logout',
        description: 'Signed out',
      })
    } catch {
      /* ignore */
    }
  }
  getSessionStore().set('session', null)
}

export function getSession(): SessionData | null {
  return getSessionStore().get('session', null)
}

/** Drop a stored session if the school or user no longer exists (e.g. after a DB reset). */
export function ensureValidSession(repos: Repositories): SessionData | null {
  const session = getSession()
  if (!session) return null
  const school = repos.schools.findById(session.schoolId)
  const user = repos.users.findById(session.userId)
  if (!school || !user || user.school_id !== school.id) {
    getSessionStore().set('session', null)
    return null
  }
  return session
}

/** Keep the local session in sync when the school name changes. */
export function updateSessionSchoolName(schoolName: string): void {
  const current = getSession()
  if (!current) return
  getSessionStore().set('session', { ...current, schoolName })
}
