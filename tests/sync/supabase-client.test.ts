import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  createSupabaseJsClient,
  ensureEnvLoaded,
  getSupabaseConfig,
  getSupabaseSyncClient,
  loadPackagedCloudConfig,
  normalizeSupabaseUrl,
  resetSupabaseSyncClientForTests,
  setSupabasePackagingOverridesForTests,
  SupabaseSyncClient,
  toFiniteNumber,
} from '../../main/sync/supabase-client'

function mockSupabase(rpcImpl: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => rpcImpl(fn, args),
  } as any
}

function clearSupabaseEnv() {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_ANON_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}

function writeTempCloudConfig(contents: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sofia-cloud-config-'))
  fs.writeFileSync(
    path.join(dir, 'cloud-config.json'),
    typeof contents === 'string' ? contents : JSON.stringify(contents),
    'utf8'
  )
  return dir
}

describe('Sofia Supabase JS client (transport)', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    resetSupabaseSyncClientForTests()
  })

  test('1. normalizeSupabaseUrl strips /rest/v1 and trailing slashes', () => {
    expect(
      normalizeSupabaseUrl('https://abc.supabase.co/rest/v1/')
    ).toBe('https://abc.supabase.co')
    expect(normalizeSupabaseUrl('https://abc.supabase.co/')).toBe(
      'https://abc.supabase.co'
    )
    expect(normalizeSupabaseUrl('https://abc.supabase.co')).toBe(
      'https://abc.supabase.co'
    )
  })

  test('2. getSupabaseConfig loads SUPABASE_* and falls back to NEXT_PUBLIC_*', () => {
    setSupabasePackagingOverridesForTests({ isPackaged: false })
    clearSupabaseEnv()
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      'https://from-next.supabase.co/rest/v1/'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-from-next'

    const cfg = getSupabaseConfig()
    expect(cfg.url).toBe('https://from-next.supabase.co')
    expect(cfg.anonKey).toBe('anon-from-next')
  })

  test('3. getSupabaseConfig prefers SUPABASE_* over NEXT_PUBLIC_*', () => {
    setSupabasePackagingOverridesForTests({ isPackaged: false })
    process.env.SUPABASE_URL = 'https://primary.supabase.co/rest/v1/'
    process.env.SUPABASE_ANON_KEY = 'primary-key'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://secondary.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'secondary-key'

    const cfg = getSupabaseConfig()
    expect(cfg.url).toBe('https://primary.supabase.co')
    expect(cfg.anonKey).toBe('primary-key')
  })

  test('4. createSupabaseJsClient initializes without throwing', () => {
    setSupabasePackagingOverridesForTests({ isPackaged: false })
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'test-anon-key'
    const client = createSupabaseJsClient()
    expect(client).toBeTruthy()
    expect(typeof client.rpc).toBe('function')
  })

  test('5. getSupabaseSyncClient returns a reusable singleton', () => {
    setSupabasePackagingOverridesForTests({ isPackaged: false })
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'test-anon-key'
    const a = getSupabaseSyncClient()
    const b = getSupabaseSyncClient()
    expect(a).toBe(b)
  })

  test('6. register_device RPC success and application-level failure', async () => {
    const supabase = mockSupabase(async () => ({
      data: { success: true, device_id: 'd1' },
      error: null,
    }))
    const client = new SupabaseSyncClient({ supabase })
    await expect(
      client.registerDevice({
        id: 'd1',
        schoolId: 's1',
        deviceName: 'Sofia',
      })
    ).resolves.toEqual({ ok: true })

    const supabaseFail = mockSupabase(async () => ({
      data: {
        success: false,
        error: 'School tenant does not exist: s1',
      },
      error: null,
    }))
    const clientFail = new SupabaseSyncClient({ supabase: supabaseFail })
    const result = await clientFail.registerDevice({
      id: 'd1',
      schoolId: 's1',
      deviceName: 'Sofia',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('School tenant does not exist')
  })

  test('7. process_sync_operation maps success, conflict, and validation', async () => {
    const okClient = new SupabaseSyncClient({
      supabase: mockSupabase(async () => ({
        data: { success: true, duplicate: false, change_id: 12, status: 'applied' },
        error: null,
      })),
    })
    await expect(
      okClient.processSyncOperation({
        id: 'op1',
        schoolId: 's1',
        deviceId: 'd1',
        tableName: 'students',
        recordId: 'r1',
        operation: 'INSERT',
        payload: { id: 'r1' },
      })
    ).resolves.toMatchObject({ ok: true, changeId: 12, duplicate: false })

    const conflictClient = new SupabaseSyncClient({
      supabase: mockSupabase(async () => ({
        data: {
          success: false,
          conflict: true,
          cloud_version: 5,
          incoming_version: 3,
          error: 'Version conflict',
        },
        error: null,
      })),
    })
    const conflict = await conflictClient.processSyncOperation({
      id: 'op2',
      schoolId: 's1',
      deviceId: 'd1',
      tableName: 'students',
      recordId: 'r1',
      operation: 'UPDATE',
      payload: {},
    })
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) {
      expect(conflict.errorType).toBe('conflict')
      expect(conflict.cloudVersion).toBe(5)
    }

    const rpcErrClient = new SupabaseSyncClient({
      supabase: mockSupabase(async () => ({
        data: null,
        error: { message: 'column "id" does not exist', code: '42703' },
      })),
    })
    const rpcErr = await rpcErrClient.processSyncOperation({
      id: 'op3',
      schoolId: 's1',
      deviceId: 'd1',
      tableName: 'students',
      recordId: 'r1',
      operation: 'INSERT',
      payload: {},
    })
    expect(rpcErr.ok).toBe(false)
    if (!rpcErr.ok) {
      expect(rpcErr.errorType).toBe('validation')
      expect(rpcErr.error).toContain('column "id" does not exist')
    }
  })

  test('8. pull_sync_changes preserves cursors and uses safe number conversion', async () => {
    const client = new SupabaseSyncClient({
      supabase: mockSupabase(async () => ({
        data: {
          success: true,
          changes: [{ id: 1 }],
          count: '1',
          current_cursor: undefined,
          new_cursor: '9',
          has_more: true,
        },
        error: null,
      })),
    })
    const result = await client.pullSyncChanges({
      schoolId: 's1',
      deviceId: 'd1',
      cursor: 4,
      limit: 10,
    })
    expect(result.ok).toBe(true)
    expect(result.currentCursor).toBe(4) // undefined → fallback, not NaN
    expect(result.newCursor).toBe(9)
    expect(result.hasMore).toBe(true)
    expect(result.count).toBe(1)
  })

  test('8b. count_pending_sync_changes returns remaining backlog', async () => {
    const client = new SupabaseSyncClient({
      supabase: mockSupabase(async () => ({
        data: { success: true, count: 42, cursor: 7 },
        error: null,
      })),
    })
    await expect(
      client.countPendingSyncChanges({ schoolId: 's1', cursor: 7 })
    ).resolves.toEqual({ ok: true, count: 42 })
  })

  test('9. update_sync_cursor RPC success and failure', async () => {
    const ok = new SupabaseSyncClient({
      supabase: mockSupabase(async () => ({
        data: { success: true, cursor: 42 },
        error: null,
      })),
    })
    await expect(
      ok.updateSyncCursor({ schoolId: 's1', deviceId: 'd1', cursor: 42 })
    ).resolves.toEqual({ ok: true, cursor: 42 })

    const fail = new SupabaseSyncClient({
      supabase: mockSupabase(async () => ({
        data: { success: false, error: 'School tenant does not exist: s1' },
        error: null,
      })),
    })
    const result = await fail.updateSyncCursor({
      schoolId: 's1',
      deviceId: 'd1',
      cursor: 1,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('School tenant does not exist')
  })

  test('10. network/timeout-style errors map to network for processSyncOperation', async () => {
    const client = new SupabaseSyncClient({
      supabase: mockSupabase(async () => {
        throw new Error('fetch failed')
      }),
    })
    const result = await client.processSyncOperation({
      id: 'op',
      schoolId: 's1',
      deviceId: 'd1',
      tableName: 'students',
      recordId: 'r1',
      operation: 'INSERT',
      payload: {},
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errorType).toBe('network')
    }
  })

  test('11. toFiniteNumber rejects NaN/undefined', () => {
    expect(toFiniteNumber(undefined, 7)).toBe(7)
    expect(toFiniteNumber(NaN, 7)).toBe(7)
    expect(toFiniteNumber('12', 0)).toBe(12)
    expect(toFiniteNumber(null, 3)).toBe(3)
  })

  test('12. ensureEnvLoaded is idempotent when vars already set', () => {
    setSupabasePackagingOverridesForTests({ isPackaged: false })
    process.env.SUPABASE_URL = 'https://already.set'
    process.env.SUPABASE_ANON_KEY = 'already'
    expect(() => ensureEnvLoaded()).not.toThrow()
  })

  test('13. register_device surfaces SDK transport errors', async () => {
    const client = new SupabaseSyncClient({
      supabase: mockSupabase(async () => ({
        data: null,
        error: { message: 'JWT expired', code: 'PGRST301' },
      })),
    })
    const result = await client.registerDevice({
      id: 'd1',
      schoolId: 's1',
      deviceName: 'Sofia',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('JWT expired')
  })

  test('14. unpackaged uses localhost fallback only when env is empty', () => {
    setSupabasePackagingOverridesForTests({ isPackaged: false })
    clearSupabaseEnv()
    // Avoid reading the real project .env during this case
    const cwd = process.cwd()
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sofia-empty-cwd-'))
    process.chdir(emptyDir)
    try {
      const cfg = getSupabaseConfig()
      expect(cfg.url).toBe('http://127.0.0.1:54321')
      expect(cfg.anonKey).toContain('eyJ')
    } finally {
      process.chdir(cwd)
    }
  })

  test('15. packaged loads cloud-config.json from resourcesPath', () => {
    clearSupabaseEnv()
    const resourcesPath = writeTempCloudConfig({
      supabaseUrl: 'https://hosted.supabase.co/rest/v1/',
      supabaseAnonKey: 'packaged-anon-key',
    })
    setSupabasePackagingOverridesForTests({
      isPackaged: true,
      resourcesPath,
    })

    const cfg = getSupabaseConfig()
    expect(cfg.url).toBe('https://hosted.supabase.co')
    expect(cfg.anonKey).toBe('packaged-anon-key')
    expect(cfg.url.includes('127.0.0.1')).toBe(false)
  })

  test('16. packaged prefers explicit process.env over cloud-config', () => {
    const resourcesPath = writeTempCloudConfig({
      supabaseUrl: 'https://from-file.supabase.co',
      supabaseAnonKey: 'from-file',
    })
    setSupabasePackagingOverridesForTests({
      isPackaged: true,
      resourcesPath,
    })
    process.env.SUPABASE_URL = 'https://from-env.supabase.co/rest/v1/'
    process.env.SUPABASE_ANON_KEY = 'from-env'

    const cfg = getSupabaseConfig()
    expect(cfg.url).toBe('https://from-env.supabase.co')
    expect(cfg.anonKey).toBe('from-env')
  })

  test('17. packaged never falls back to localhost when config missing', () => {
    clearSupabaseEnv()
    const emptyResources = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sofia-no-cloud-config-')
    )
    setSupabasePackagingOverridesForTests({
      isPackaged: true,
      resourcesPath: emptyResources,
    })

    expect(() => getSupabaseConfig()).toThrow(
      'Supabase production configuration is missing or invalid.'
    )
  })

  test('18. packaged rejects malformed cloud-config.json', () => {
    clearSupabaseEnv()
    const resourcesPath = writeTempCloudConfig('{ not-json')
    setSupabasePackagingOverridesForTests({
      isPackaged: true,
      resourcesPath,
    })
    expect(() => getSupabaseConfig()).toThrow(
      'Supabase production configuration is missing or invalid.'
    )
  })

  test('19. packaged rejects missing supabaseUrl', () => {
    clearSupabaseEnv()
    const resourcesPath = writeTempCloudConfig({
      supabaseAnonKey: 'only-key',
    })
    setSupabasePackagingOverridesForTests({
      isPackaged: true,
      resourcesPath,
    })
    expect(() => loadPackagedCloudConfig(resourcesPath)).toThrow(
      'Supabase production configuration is missing or invalid.'
    )
  })

  test('20. packaged rejects missing supabaseAnonKey', () => {
    clearSupabaseEnv()
    const resourcesPath = writeTempCloudConfig({
      supabaseUrl: 'https://hosted.supabase.co',
    })
    setSupabasePackagingOverridesForTests({
      isPackaged: true,
      resourcesPath,
    })
    expect(() => loadPackagedCloudConfig(resourcesPath)).toThrow(
      'Supabase production configuration is missing or invalid.'
    )
  })

  test('21. packaged createSupabaseJsClient uses hosted URL not localhost', () => {
    clearSupabaseEnv()
    const resourcesPath = writeTempCloudConfig({
      supabaseUrl: 'https://wbwcgcdsgmdpojrpicyl.supabase.co',
      supabaseAnonKey: 'packaged-publishable-key',
    })
    setSupabasePackagingOverridesForTests({
      isPackaged: true,
      resourcesPath,
    })
    const cfg = getSupabaseConfig()
    const client = createSupabaseJsClient()
    expect(cfg.url).toBe('https://wbwcgcdsgmdpojrpicyl.supabase.co')
    expect(cfg.url.includes('127.0.0.1')).toBe(false)
    expect(client).toBeTruthy()
    expect(typeof client.rpc).toBe('function')
  })
})
