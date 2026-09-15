import bcrypt from 'bcryptjs'
import Store from 'electron-store'
import type { Repositories } from '../db/repositories'
import type { School, User, UserRole } from '../db/types'
import { saveSchoolLogo } from '../helpers/save-logo'
import { SystemAdminService } from '../services/system-admin'

const BCRYPT_ROUNDS = 10

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
}

export interface LoginInput {
  email: string
  password: string
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
 * Step 3: create admin for an existing school and open a session.
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

  if (password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' }
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

/** Authenticate with email + password and persist session locally. */
export async function login(
  repos: Repositories,
  input: LoginInput
): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase()
  const password = input.password

  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.' }
  }

  const user = repos.users.findByEmail(email)
  if (!user) {
    try {
      const latest = repos.schools.findLatest()
      if (latest) {
        repos.systemAdmin.writeAudit({
          school_id: latest.id,
          actor_user_id: null,
          action: 'auth.login_failed',
          description: `Failed sign-in for ${email}`,
          result: 'failure',
        })
      }
    } catch {
      /* audit table may not exist yet */
    }
    return { ok: false, error: 'Invalid email or password.' }
  }

  const settings = repos.systemAdmin.ensureSettings(user.school_id) as {
    lockout_attempts: number
    lockout_minutes: number
  }
  const gate = new SystemAdminService().assertLogin({
    status: user.status || 'active',
    locked_until: user.locked_until,
    failed_count: user.failed_login_count || 0,
    passwordOk: await verifyPassword(password, user.password_hash),
    maxAttempts: Number(settings.lockout_attempts) || 5,
    lockMinutes: Number(settings.lockout_minutes) || 15,
  })

  if (!gate.ok) {
    repos.systemAdmin.patchUser(user.school_id, user.id, {
      failed_login_count: gate.failed,
      locked_until: gate.locked_until,
    })
    repos.systemAdmin.writeAudit({
      school_id: user.school_id,
      actor_user_id: user.id,
      action: 'auth.login_failed',
      description: gate.error,
      result: 'failure',
    })
    return { ok: false, error: gate.error }
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
