/** Shared auth types for the renderer (mirrors main/auth). */

export type UserRole = 'admin' | 'secretary' | 'teacher'

export interface SessionData {
  userId: string
  email: string
  role: UserRole
  schoolId: string
  schoolName: string
}

export interface PendingSchool {
  id: string
  name: string
  email: string
  phone: string | null
  country: string | null
  address: string | null
  logo_path: string | null
}

export interface SetupState {
  needsSetup: boolean
  pendingSchool: PendingSchool | null
}

export interface RegisterSchoolInput {
  schoolName: string
  schoolEmail?: string
  phone?: string
  country?: string
  address?: string
  logoBase64?: string | null
  logoMimeType?: string
}

export interface RegisterAdminInput {
  schoolId: string
  email: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

export type AuthResult =
  | { ok: true; session: SessionData }
  | { ok: false; error: string }

export type SchoolResult =
  | { ok: true; school: PendingSchool }
  | { ok: false; error: string }

export async function authGetSetupState(): Promise<SetupState> {
  return (await window.ipc.invoke('auth:needs-setup')) as SetupState
}

/** @deprecated use authGetSetupState */
export async function authNeedsSetup(): Promise<boolean> {
  const state = await authGetSetupState()
  return state.needsSetup
}

export async function authGetSession(): Promise<SessionData | null> {
  const result = (await window.ipc.invoke('auth:session')) as {
    session: SessionData | null
  }
  return result.session
}

export async function authRegisterSchool(
  input: RegisterSchoolInput
): Promise<SchoolResult> {
  return (await window.ipc.invoke(
    'auth:register-school',
    input
  )) as SchoolResult
}

export async function authRegisterAdmin(
  input: RegisterAdminInput
): Promise<AuthResult> {
  return (await window.ipc.invoke('auth:register-admin', input)) as AuthResult
}

export async function authLogin(input: LoginInput): Promise<AuthResult> {
  return (await window.ipc.invoke('auth:login', input)) as AuthResult
}

export async function authLogout(): Promise<void> {
  await window.ipc.invoke('auth:logout')
}
