import Database from 'better-sqlite3'
import { login, registerAdmin, registerSchool, hashPassword } from '../../main/auth'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { joinSchoolByCode } from '../../main/services/join-school'
import {
  CLOUD_AUTH_PENDING_HASH,
  type CloudLoginResult,
} from '../../main/services/cloud-login'
import { enqueueSync } from '../../main/sync/queue'
import { resetDeviceStoreForTests } from '../../main/sync/device'
import type {
  LookupSchoolByCodeResult,
  ProcessSyncRpcParams,
  ProcessSyncRpcResult,
  PullSyncRpcParams,
  PullSyncRpcResult,
  RegisterDeviceRpcParams,
  RegisterDeviceRpcResult,
  SupabaseSyncClientInterface,
  SyncChange,
  UpdateSyncCursorRpcParams,
  UpdateSyncCursorRpcResult,
} from '../../main/sync/types'

const SCHOOL_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER_SCHOOL_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const AUTH_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

class MockJoinClient implements SupabaseSyncClientInterface {
  school = {
    id: SCHOOL_ID,
    name: 'Light World Mission',
    school_code: 'LWM',
    short_code: 'LWM',
    email: 'admin@lwm.test',
    phone: null as string | null,
    address: null as string | null,
    version: 1,
  }
  changes: SyncChange[] = []

  async lookupSchoolByCode(code: string): Promise<LookupSchoolByCodeResult> {
    if (code.toUpperCase() !== 'LWM') {
      return { ok: false, error: 'No school found' }
    }
    return { ok: true, school: this.school }
  }

  async registerDevice(
    _params: RegisterDeviceRpcParams
  ): Promise<RegisterDeviceRpcResult> {
    return { ok: true }
  }

  async processSyncOperation(
    _params: ProcessSyncRpcParams
  ): Promise<ProcessSyncRpcResult> {
    return { ok: true, duplicate: false }
  }

  async pullSyncChanges(params: PullSyncRpcParams): Promise<PullSyncRpcResult> {
    const filtered = this.changes.filter(
      (c) => c.school_id === params.schoolId && c.id > params.cursor
    )
    const sliced = filtered.slice(0, params.limit ?? 100)
    return {
      ok: true,
      changes: sliced,
      count: sliced.length,
      currentCursor: params.cursor,
      newCursor: sliced.length ? sliced[sliced.length - 1].id : params.cursor,
      hasMore: filtered.length > sliced.length,
    }
  }

  async updateSyncCursor(
    params: UpdateSyncCursorRpcParams
  ): Promise<UpdateSyncCursorRpcResult> {
    return { ok: true, cursor: params.cursor }
  }
}

describe('second desk join + Auth bootstrap', () => {
  let db: Database.Database
  let repos: ReturnType<typeof createRepositories>
  let client: MockJoinClient

  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
    repos = createRepositories(db)
    client = new MockJoinClient()
    resetDeviceStoreForTests('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')
  })

  afterEach(() => {
    db.close()
  })

  it('main computer can keep using local offline login', async () => {
    const school = registerSchool(repos, {
      schoolName: 'Main Desk School',
      phone: '670000000',
      address: 'Yaounde',
    })
    expect(school.ok).toBe(true)
    if (!school.ok) return

    const admin = await registerAdmin(repos, {
      schoolId: school.school.id,
      email: 'owner@main.test',
      password: 'Sofia@Demo1',
      provisionAuth: async () => ({
        id: 'auth-owner-1',
        email: 'owner@main.test',
        created: true,
        updated: false,
      }),
    })
    expect(admin.ok).toBe(true)

    const offline = await login(repos, {
      email: 'owner@main.test',
      password: 'Sofia@Demo1',
      cloudSignIn: async () => {
        throw new Error('cloud should not be called for primed local login')
      },
    })
    expect(offline.ok).toBe(true)
  })

  it('second computer discovers school and does not claim users were downloaded', async () => {
    const join = await joinSchoolByCode(repos, 'LWM', client)
    expect(join.ok).toBe(true)
    if (!join.ok) return
    expect(join.schoolId).toBe(SCHOOL_ID)
    expect(join.usersPulled).toBe(0)
    expect(join.needsSignIn).toBe(true)
    // Must not surface the old misleading “downloaded yet” failure.
    expect(JSON.stringify(join).toLowerCase()).not.toMatch(/downloaded yet/)
  })

  it('registers device association for the discovered school', async () => {
    let registeredSchool: string | null = null
    const tracking = new MockJoinClient()
    tracking.registerDevice = async (params) => {
      registeredSchool = params.schoolId
      return { ok: true }
    }
    const join = await joinSchoolByCode(repos, 'LWM', tracking)
    expect(join.ok).toBe(true)
    expect(registeredSchool).toBe(SCHOOL_ID)
  })

  it('valid Auth user for this school creates local profile and can enter Sofia', async () => {
    const join = await joinSchoolByCode(repos, 'LWM', client)
    expect(join.ok).toBe(true)

    const cloudSignIn = async (): Promise<CloudLoginResult> => ({
      ok: true,
      authUserId: AUTH_USER_ID,
      email: 'admin@lwm.test',
      schoolId: SCHOOL_ID,
      role: 'admin',
      staffId: null,
      displayName: 'Ada Min',
    })

    const result = await login(repos, {
      email: 'admin@lwm.test',
      password: 'Sofia@Demo1',
      cloudSignIn,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.session.schoolId).toBe(SCHOOL_ID)
    expect(result.session.email).toBe('admin@lwm.test')
    expect(result.user.role).toBe('admin')

    const local = repos.users.findByEmail('admin@lwm.test')
    expect(local).toBeTruthy()
    expect(local?.password_hash).not.toBe(CLOUD_AUTH_PENDING_HASH)
  })

  it('after bootstrap, offline login works without calling Auth again', async () => {
    await joinSchoolByCode(repos, 'LWM', client)
    await login(repos, {
      email: 'admin@lwm.test',
      password: 'Sofia@Demo1',
      cloudSignIn: async () => ({
        ok: true,
        authUserId: AUTH_USER_ID,
        email: 'admin@lwm.test',
        schoolId: SCHOOL_ID,
        role: 'admin',
        staffId: null,
        displayName: 'Ada Min',
      }),
    })

    let cloudCalls = 0
    const offline = await login(repos, {
      email: 'admin@lwm.test',
      password: 'Sofia@Demo1',
      cloudSignIn: async () => {
        cloudCalls += 1
        return { ok: false, error: 'should not run' }
      },
    })
    expect(offline.ok).toBe(true)
    expect(cloudCalls).toBe(0)
  })

  it('bootstraps a bursar Auth user on a second desk (cloud role bursar)', async () => {
    await joinSchoolByCode(repos, 'LWM', client)
    const result = await login(repos, {
      email: 'bursar@lwm.test',
      password: 'Sofia@Demo1',
      cloudSignIn: async () => ({
        ok: true,
        authUserId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        email: 'bursar@lwm.test',
        schoolId: SCHOOL_ID,
        role: 'bursar',
        staffId: null,
        displayName: 'Bella Bursar',
      }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.user.role).toBe('bursar')
    expect(result.session.role).toBe('bursar')
  })

  it('rejects teacher Auth role on desktop (mobile-only)', async () => {
    await joinSchoolByCode(repos, 'LWM', client)
    const result = await login(repos, {
      email: 'teacher@lwm.test',
      password: 'Sofia@Demo1',
      cloudSignIn: async () => ({
        ok: true,
        authUserId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        email: 'teacher@lwm.test',
        schoolId: SCHOOL_ID,
        role: 'teacher',
        staffId: 'staff-teacher-1',
        displayName: 'Tia Teacher',
      }),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/mobile app/i)
      expect(result.error.toLowerCase()).toMatch(/teacher/)
    }
    // Must not bootstrap a primed desktop session for teachers.
    expect(repos.users.findByEmail('teacher@lwm.test')).toBeFalsy()
  })

  it('rejects primed local teacher accounts on desktop login', async () => {
    const school = registerSchool(repos, {
      schoolName: 'Teacher Block School',
      phone: '670000001',
      address: 'Yaounde',
    })
    expect(school.ok).toBe(true)
    if (!school.ok) return

    const hash = await hashPassword('Sofia@Teacher1')
    repos.users.create({
      school_id: school.school.id,
      email: 'local.teacher@test.com',
      password_hash: hash,
      role: 'teacher',
      first_name: 'Local',
      last_name: 'Teacher',
      status: 'active',
    })

    const result = await login(repos, {
      email: 'local.teacher@test.com',
      password: 'Sofia@Teacher1',
      cloudSignIn: async () => {
        throw new Error('cloud should not be called for primed local login')
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/mobile app/i)
  })

  it('allows board Auth role on desktop (permission-gated modules)', async () => {
    await joinSchoolByCode(repos, 'LWM', client)
    const result = await login(repos, {
      email: 'board@lwm.test',
      password: 'Sofia@Demo1',
      cloudSignIn: async () => ({
        ok: true,
        authUserId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        email: 'board@lwm.test',
        schoolId: SCHOOL_ID,
        role: 'board',
        staffId: null,
        displayName: 'Board Member',
      }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.user.role).toBe('board')
  })

  it('rejects invalid password from Auth', async () => {
    await joinSchoolByCode(repos, 'LWM', client)
    const result = await login(repos, {
      email: 'admin@lwm.test',
      password: 'wrong-password',
      cloudSignIn: async () => ({
        ok: false,
        error: 'Invalid email or password.',
        code: 'invalid_credentials',
      }),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/invalid email or password/i)
  })

  it('rejects Auth user from another school with a clear membership error', async () => {
    await joinSchoolByCode(repos, 'LWM', client)
    const result = await login(repos, {
      email: 'outsider@other.test',
      password: 'Sofia@Demo1',
      cloudSignIn: async () => ({
        ok: true,
        authUserId: AUTH_USER_ID,
        email: 'outsider@other.test',
        schoolId: OTHER_SCHOOL_ID,
        role: 'admin',
        staffId: null,
        displayName: 'Outsider',
      }),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/not authorized for this school/i)
      expect(result.error.toLowerCase()).not.toMatch(/invalid email or password/)
    }
  })

  it('rejects Auth user with no Sofia role', async () => {
    await joinSchoolByCode(repos, 'LWM', client)
    const result = await login(repos, {
      email: 'norole@lwm.test',
      password: 'Sofia@Demo1',
      cloudSignIn: async () => ({
        ok: false,
        error:
          'Your account has no Sofia permissions. Contact your school administrator.',
        code: 'no_role',
      }),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/no sofia permissions/i)
  })

  it('new computer with school but no network gets an explicit offline bootstrap message', async () => {
    await joinSchoolByCode(repos, 'LWM', client)
    const result = await login(repos, {
      email: 'admin@lwm.test',
      password: 'Sofia@Demo1',
      cloudSignIn: async () => ({
        ok: false,
        error:
          'This computer has not been connected to this school yet. Internet access is required for first-time setup.',
        code: 'offline',
      }),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/internet access is required/i)
  })

  it('never enqueues password_hash for users sync payloads', async () => {
    const school = repos.schools.create({
      name: 'Hash School',
      email: 'h@test.com',
      phone: '670000000',
      address: 'Douala',
    })
    const hash = await hashPassword('Sofia@Demo1')
    repos.users.create({
      school_id: school.id,
      email: 'u@test.com',
      password_hash: hash,
      role: 'admin',
    })
    const row = db
      .prepare(
        `SELECT payload FROM sync_queue WHERE table_name = 'users' ORDER BY created_at DESC LIMIT 1`
      )
      .get() as { payload: string }
    const payload = JSON.parse(row.payload) as Record<string, unknown>
    expect(payload.password_hash).toBeUndefined()
    expect(payload.email).toBe('u@test.com')
  })

  it('pulled user profiles without password stay pending until Auth bootstrap', async () => {
    const now = new Date().toISOString()
    client.changes = [
      {
        id: 1,
        school_id: SCHOOL_ID,
        table_name: 'users',
        record_id: 'user-remote',
        operation: 'INSERT',
        version: 1,
        created_at: now,
        payload: {
          id: 'user-remote',
          school_id: SCHOOL_ID,
          email: 'synced@lwm.test',
          role: 'secretary',
          status: 'active',
          first_name: 'Syn',
          last_name: 'Ced',
          created_at: now,
          updated_at: now,
          version: 1,
        },
      },
    ]
    const join = await joinSchoolByCode(repos, 'LWM', client)
    expect(join.ok).toBe(true)
    const pending = repos.users.findByEmail('synced@lwm.test')
    expect(pending?.password_hash).toBe(CLOUD_AUTH_PENDING_HASH)

    const result = await login(repos, {
      email: 'synced@lwm.test',
      password: 'Sofia@Demo1',
      cloudSignIn: async () => ({
        ok: true,
        authUserId: AUTH_USER_ID,
        email: 'synced@lwm.test',
        schoolId: SCHOOL_ID,
        role: 'secretary',
        staffId: null,
        displayName: 'Syn Ced',
      }),
    })
    expect(result.ok).toBe(true)
    const primed = repos.users.findByEmail('synced@lwm.test')
    expect(primed?.password_hash).not.toBe(CLOUD_AUTH_PENDING_HASH)
  })

  it('enqueueSync helper redacts password_hash even when callers pass it', () => {
    enqueueSync(db, 'users', 'u1', 'UPDATE', {
      id: 'u1',
      email: 'x@y.z',
      password_hash: 'secret',
      updated_at: new Date().toISOString(),
    })
    const row = db
      .prepare(`SELECT payload FROM sync_queue WHERE record_id = 'u1'`)
      .get() as { payload: string }
    expect(JSON.parse(row.payload).password_hash).toBeUndefined()
  })
})
