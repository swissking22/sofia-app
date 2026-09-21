import {
  provisionStaffAuth,
  tryProvisionStaffAuth,
} from '../../main/services/cloud-auth'

describe('cloud-auth provisionStaffAuth', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_ANON_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  it('calls the Edge Function with anon credentials', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon-key'

    let calledUrl = ''
    let calledInit: RequestInit | undefined
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = String(input)
      calledInit = init
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            id: 'auth-1',
            email: 'teacher@school.com',
            created: true,
            updated: false,
          },
        }),
      } as Response
    }) as typeof fetch

    const result = await provisionStaffAuth({
      email: 'teacher@school.com',
      password: 'Sofia@Staff1',
      role: 'teacher',
      schoolId: '0dd470f4-4505-4aa5-a8ea-0b4c340daa5d',
      staffId: 'staff-1',
      schoolName: 'LWM',
      displayName: 'Test Teacher',
      resetPassword: true,
    })

    expect(result.created).toBe(true)
    expect(calledUrl).toBe(
      'https://example.supabase.co/functions/v1/provision-staff-auth'
    )
    expect(calledInit?.method).toBe('POST')
    const headers = calledInit?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer anon-key')
    expect(headers.apikey).toBe('anon-key')
  })

  it('tryProvisionStaffAuth returns a warning instead of throwing', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon-key'
    global.fetch = (async () =>
      ({
        ok: false,
        status: 500,
        json: async () => ({ ok: false, error: 'boom' }),
      }) as Response) as typeof fetch

    const warning = await tryProvisionStaffAuth({
      email: 'teacher@school.com',
      password: 'Sofia@Staff1',
      role: 'teacher',
      schoolId: 'school-1',
      resetPassword: true,
    })

    expect(warning).toMatch(/cloud login failed/i)
  })
})
