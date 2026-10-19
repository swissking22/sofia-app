import { createClient } from '@supabase/supabase-js'
import {
  ensureEnvLoaded,
  getSupabaseConfig,
  normalizeSupabaseUrl,
} from '../sync/supabase-client'

export type CloudAuthRole = 'teacher' | 'admin' | 'secretary' | 'board' | 'bursar'

export interface ProvisionStaffAuthInput {
  email: string
  password: string
  role: CloudAuthRole
  schoolId: string
  staffId?: string | null
  schoolName?: string | null
  displayName?: string | null
  /** Overwrite Auth password when the user already exists. */
  resetPassword: boolean
}

export interface ProvisionStaffAuthResult {
  id: string
  email: string
  created: boolean
  updated: boolean
}

type ProvisionResponse =
  | { ok: true; data: ProvisionStaffAuthResult }
  | { ok: false; error: string }

function readServiceRoleKey(): string | null {
  ensureEnvLoaded()
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    ''
  return key || null
}

/**
 * Create or update a Supabase Auth user for a desktop staff account.
 * Prefers the Edge Function (anon key); falls back to service-role admin API
 * when SUPABASE_SERVICE_ROLE_KEY is present (local/dev).
 */
export async function provisionStaffAuth(
  input: ProvisionStaffAuthInput
): Promise<ProvisionStaffAuthResult> {
  const email = input.email.trim().toLowerCase()
  const password = input.password
  if (!email || !password) {
    throw new Error('Email and password are required for cloud login.')
  }

  const payload = {
    email,
    password,
    role: input.role,
    school_id: input.schoolId,
    staff_id: input.staffId ?? null,
    school_name: input.schoolName ?? null,
    display_name: input.displayName ?? null,
    reset_password: input.resetPassword,
  }

  // Prefer Edge Function so packaged desktops never need the service role.
  try {
    return await provisionViaEdgeFunction(payload)
  } catch (edgeError) {
    const serviceKey = readServiceRoleKey()
    if (!serviceKey) throw edgeError
    try {
      return await provisionViaServiceRole(payload, serviceKey)
    } catch {
      throw edgeError
    }
  }
}

async function provisionViaEdgeFunction(payload: {
  email: string
  password: string
  role: CloudAuthRole
  school_id: string
  staff_id: string | null
  school_name: string | null
  display_name: string | null
  reset_password: boolean
}): Promise<ProvisionStaffAuthResult> {
  const { url, anonKey } = getSupabaseConfig()
  const endpoint = `${normalizeSupabaseUrl(url)}/functions/v1/provision-staff-auth`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  let body: ProvisionResponse | null = null
  try {
    body = (await res.json()) as ProvisionResponse
  } catch {
    body = null
  }

  if (!res.ok || !body || body.ok !== true) {
    const message =
      body && 'error' in body && body.error
        ? body.error
        : `Cloud auth provision failed (${res.status}).`
    throw new Error(message)
  }

  return body.data
}

async function provisionViaServiceRole(
  payload: {
    email: string
    password: string
    role: CloudAuthRole
    school_id: string
    staff_id: string | null
    school_name: string | null
    display_name: string | null
    reset_password: boolean
  },
  serviceKey: string
): Promise<ProvisionStaffAuthResult> {
  const { url } = getSupabaseConfig()
  const admin = createClient(normalizeSupabaseUrl(url), serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const appMetadata: Record<string, string> = {
    role: payload.role,
    school_id: payload.school_id,
  }
  if (payload.staff_id) appMetadata.staff_id = payload.staff_id
  if (payload.school_name) appMetadata.school_name = payload.school_name

  const userMetadata: Record<string, string> = {}
  if (payload.display_name) userMetadata.full_name = payload.display_name

  const existing = await findAuthUserByEmail(admin, payload.email)
  if (existing) {
    const update: Record<string, unknown> = {
      email_confirm: true,
      app_metadata: { ...existing.app_metadata, ...appMetadata },
      user_metadata: { ...existing.user_metadata, ...userMetadata },
    }
    if (payload.reset_password) update.password = payload.password
    const { data, error } = await admin.auth.admin.updateUserById(
      existing.id,
      update
    )
    if (error) throw error
    return {
      id: data.user.id,
      email: payload.email,
      created: false,
      updated: true,
    }
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  })
  if (error) throw error
  return {
    id: data.user.id,
    email: payload.email,
    created: true,
    updated: false,
  }
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string
) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    )
    if (match) return match
    if (data.users.length < 200) break
  }
  return null
}

/** Fire cloud auth for a staff member; returns a user-facing warning on failure. */
export async function tryProvisionStaffAuth(
  input: ProvisionStaffAuthInput
): Promise<string | null> {
  try {
    await provisionStaffAuth(input)
    return null
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Could not create cloud login.'
    console.warn('[cloud-auth]', message)
    return `Saved locally, but cloud login failed: ${message}`
  }
}
