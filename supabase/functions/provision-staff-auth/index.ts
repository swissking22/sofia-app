/**
 * Provision (or update) a Supabase Auth user for desktop staff/teachers
 * so they can sign in to Sofia Teacher (Expo).
 *
 * Deploy:
 *   npx supabase functions deploy provision-staff-auth --project-ref <ref>
 *
 * Secrets (dashboard or CLI): service role is available automatically as
 * SUPABASE_SERVICE_ROLE_KEY inside the function runtime.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Role = 'teacher' | 'admin' | 'secretary'

interface ProvisionBody {
  email?: string
  password?: string
  role?: Role
  school_id?: string
  staff_id?: string | null
  school_name?: string | null
  display_name?: string | null
  /** When true, overwrite password on an existing Auth user. */
  reset_password?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed.' }, 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: 'Auth provisioning is not configured.' }, 500)
    }

    // Require a Bearer token from the desktop client (anon JWT).
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ ok: false, error: 'Missing authorization.' }, 401)
    }

    const body = (await req.json()) as ProvisionBody
    const email = body.email?.trim().toLowerCase() ?? ''
    const password = body.password ?? ''
    const role = body.role
    const schoolId = body.school_id?.trim() ?? ''
    const staffId = body.staff_id?.trim() || null
    const schoolName = body.school_name?.trim() || null
    const displayName = body.display_name?.trim() || null
    const resetPassword = body.reset_password === true

    if (!email || !password) {
      return json({ ok: false, error: 'Email and password are required.' }, 400)
    }
    if (!role || !['teacher', 'admin', 'secretary'].includes(role)) {
      return json({ ok: false, error: 'Invalid role.' }, 400)
    }
    if (!schoolId) {
      return json({ ok: false, error: 'school_id is required.' }, 400)
    }
    if (password.length < 8) {
      return json({ ok: false, error: 'Password must be at least 8 characters.' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: school, error: schoolError } = await admin
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .maybeSingle()

    // School row may only exist after sync; allow known UUID format either way.
    if (schoolError) {
      console.warn('schools lookup failed', schoolError.message)
    }
    if (!school && !/^[0-9a-f-]{36}$/i.test(schoolId)) {
      return json({ ok: false, error: 'Invalid school_id.' }, 400)
    }

    const appMetadata: Record<string, string> = {
      role,
      school_id: schoolId,
    }
    if (staffId) appMetadata.staff_id = staffId
    if (schoolName || school?.name) {
      appMetadata.school_name = schoolName || school?.name || ''
    }

    const userMetadata: Record<string, string> = {}
    if (displayName) userMetadata.full_name = displayName

    const existing = await findUserByEmail(admin, email)

    if (existing) {
      const update: Record<string, unknown> = {
        email_confirm: true,
        app_metadata: { ...existing.app_metadata, ...appMetadata },
        user_metadata: { ...existing.user_metadata, ...userMetadata },
      }
      if (resetPassword) update.password = password

      const { data, error } = await admin.auth.admin.updateUserById(
        existing.id,
        update
      )
      if (error) {
        return json({ ok: false, error: error.message }, 400)
      }
      return json({
        ok: true,
        data: { id: data.user.id, email, created: false, updated: true },
      })
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    })
    if (error) {
      return json({ ok: false, error: error.message }, 400)
    }

    return json({
      ok: true,
      data: { id: data.user.id, email, created: true, updated: false },
    })
  } catch (err) {
    console.error(err)
    return json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Provisioning failed.',
      },
      500
    )
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function findUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string
) {
  // Paginate lightly — schools are small; exact email filter isn't in listUsers.
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
