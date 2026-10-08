import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { joinSchoolByCode } from '../../main/services/join-school'
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

class MockJoinClient implements SupabaseSyncClientInterface {
  lookupCode = 'LWM'
  school = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
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
    if (code.toUpperCase() !== this.lookupCode) {
      return { ok: false, error: 'No school found for code: ' + code }
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

describe('joinSchoolByCode', () => {
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

  it('rejects empty code', async () => {
    const res = await joinSchoolByCode(repos, '  ', client)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/school code/i)
  })

  it('rejects when local users already exist', async () => {
    const school = repos.schools.create({
      name: 'Local',
      email: 'a@b.com',
    })
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO users (
        id, school_id, email, password_hash, role,
        created_at, updated_at, sync_status, version
      ) VALUES (?, ?, 'u@test.com', 'hash', 'admin', ?, ?, 'synced', 1)`
    ).run('user-1', school.id, now, now)

    const res = await joinSchoolByCode(repos, 'LWM', client)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/already has user/i)
  })

  it('looks up school, pulls users when present, and completes setup', async () => {
    const now = new Date().toISOString()
    client.changes = [
      {
        id: 1,
        school_id: client.school.id,
        table_name: 'roles',
        record_id: 'role-1',
        operation: 'INSERT',
        version: 1,
        created_at: now,
        payload: {
          id: 'role-1',
          school_id: client.school.id,
          name: 'Bursar',
          is_system: 0,
          created_at: now,
          updated_at: now,
          version: 1,
        },
      },
      {
        id: 2,
        school_id: client.school.id,
        table_name: 'users',
        record_id: 'user-remote',
        operation: 'INSERT',
        version: 1,
        created_at: now,
        payload: {
          id: 'user-remote',
          school_id: client.school.id,
          email: 'bursar@lwm.test',
          role: 'secretary',
          role_id: 'role-1',
          first_name: 'Bea',
          last_name: 'Ursar',
          status: 'active',
          created_at: now,
          updated_at: now,
          version: 1,
        },
      },
    ]

    const res = await joinSchoolByCode(repos, 'lwm', client)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.schoolName).toBe('Light World Mission')
    expect(res.usersPulled).toBe(1)
    expect(res.needsSignIn).toBe(true)

    const localSchool = repos.schools.findById(client.school.id)
    expect(localSchool?.name).toBe('Light World Mission')
    expect(repos.users.findAll()).toHaveLength(1)
    expect(repos.users.findAll()[0].email).toBe('bursar@lwm.test')
  })

  it('succeeds when cloud has no user rows yet (sign-in bootstraps Auth)', async () => {
    client.changes = []
    const res = await joinSchoolByCode(repos, 'LWM', client)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.usersPulled).toBe(0)
    expect(res.needsSignIn).toBe(true)
    expect(repos.schools.findById(client.school.id)?.id).toBe(client.school.id)
    expect(repos.users.findAll()).toHaveLength(0)
  })

  it('resumes join when the same school was already installed locally', async () => {
    client.changes = []
    const first = await joinSchoolByCode(repos, 'LWM', client)
    expect(first.ok).toBe(true)

    const second = await joinSchoolByCode(repos, 'LWM', client)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.schoolId).toBe(client.school.id)
  })
})
