import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { enqueueSync } from '../../main/sync/queue'
import {
  applyPulledChangesIndividually,
  pullRemoteChanges,
} from '../../main/sync/pull'
import { getLocalSyncCursor, setLocalSyncCursor } from '../../main/sync/cursor'
import { resetDeviceStoreForTests } from '../../main/sync/device'
import { runSyncWorker } from '../../main/sync/worker'
import type {
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

class MockSupabaseSyncClient implements SupabaseSyncClientInterface {
  public receivedOperations: ProcessSyncRpcParams[] = []
  public registeredDevices: RegisterDeviceRpcParams[] = []
  public pullRequests: PullSyncRpcParams[] = []
  public updatedCursors: UpdateSyncCursorRpcParams[] = []

  public changesToReturn: SyncChange[] = []
  public pullHandler?: (params: PullSyncRpcParams) => Promise<PullSyncRpcResult> | PullSyncRpcResult
  public operationHandler?: (params: ProcessSyncRpcParams) => Promise<ProcessSyncRpcResult> | ProcessSyncRpcResult

  async registerDevice(params: RegisterDeviceRpcParams): Promise<RegisterDeviceRpcResult> {
    this.registeredDevices.push(params)
    return { ok: true }
  }

  async processSyncOperation(params: ProcessSyncRpcParams): Promise<ProcessSyncRpcResult> {
    this.receivedOperations.push(params)
    if (this.operationHandler) {
      return this.operationHandler(params)
    }
    return { ok: true, duplicate: false, changeId: this.receivedOperations.length, status: 'applied' }
  }

  async pullSyncChanges(params: PullSyncRpcParams): Promise<PullSyncRpcResult> {
    this.pullRequests.push(params)
    if (this.pullHandler) {
      return this.pullHandler(params)
    }

    const filtered = this.changesToReturn.filter(
      (c) => c.school_id === params.schoolId && c.id > params.cursor
    )
    const limit = params.limit ?? 100
    const sliced = filtered.slice(0, limit)
    const newCursor = sliced.length > 0 ? sliced[sliced.length - 1].id : params.cursor
    const hasMore = filtered.length > limit

    return {
      ok: true,
      changes: sliced,
      count: sliced.length,
      currentCursor: params.cursor,
      newCursor,
      hasMore,
    }
  }

  async updateSyncCursor(params: UpdateSyncCursorRpcParams): Promise<UpdateSyncCursorRpcResult> {
    this.updatedCursors.push(params)
    return { ok: true, cursor: params.cursor }
  }
}

describe('Sofia Phase 2: Local Pull Sync Service', () => {
  let db: Database.Database
  let repos: ReturnType<typeof createRepositories>
  let mockClient: MockSupabaseSyncClient
  let schoolId: string
  let classId: string
  const deviceId = '44444444-4444-4444-4444-444444444444'
  const school2Id = '99999999-9999-9999-9999-999999999999'

  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
    repos = createRepositories(db)
    mockClient = new MockSupabaseSyncClient()
    resetDeviceStoreForTests(deviceId)

    const school = repos.schools.create({
      name: 'Pull High School',
      short_code: 'PHS',
      email: 'admin@phs.school',
    })
    schoolId = school.id

    const level = repos.academicLevels.create({
      school_id: schoolId,
      name: 'Level 1',
      short_name: 'L1',
      category: 'lower_secondary',
      sort_order: 1,
      is_active: 1,
    })

    const cls = repos.classes.create({
      school_id: schoolId,
      name: 'Class 1A',
      level: '1',
      form_key: 'L1',
      stream: 'A',
      academic_level_id: level.id,
      section_id: null,
      specialization_id: null,
      class_teacher_id: null,
      capacity: 40,
      is_active: 1,
    })
    classId = cls.id

    repos.studentIdSettings.ensureDefaults(schoolId)
    db.prepare(`DELETE FROM sync_queue`).run()
  })

  afterEach(() => {
    db.close()
  })

  // 1. Remote INSERT creates a new student locally
  test('1. Remote INSERT creates a new student in local SQLite with exact UUID and permanent code', async () => {
    const remoteStudentId = 'a1111111-1111-1111-1111-111111111111'
    mockClient.changesToReturn = [
      {
        id: 1,
        school_id: schoolId,
        table_name: 'students',
        record_id: remoteStudentId,
        operation: 'INSERT',
        version: 1,
        created_at: new Date().toISOString(),
        payload: {
          id: remoteStudentId,
          school_id: schoolId,
          name: 'Remote Jane',
          class_id: classId,
          student_code: 'PHS-0001',
          admission_year: 2026,
          sequence_number: 1,
          gender: 'female',
          status: 'active',
          version: 1,
        },
      },
    ]

    const result = await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(1)
    expect(result.newCursor).toBe(1)

    const localStudent = db.prepare(`SELECT * FROM students WHERE id = ?`).get(remoteStudentId) as any
    expect(localStudent).toBeDefined()
    expect(localStudent.id).toBe(remoteStudentId)
    expect(localStudent.name).toBe('Remote Jane')
    expect(localStudent.student_code).toBe('PHS-0001')
    expect(localStudent.sequence_number).toBe(1)
    expect(localStudent.admission_year).toBe(2026)
    expect(localStudent.sync_status).toBe('synced')
  })

  // 2. Cursor advancement persists locally and acknowledges to cloud
  test('2. Pull cursor advances locally and updates cloud sync cursor', async () => {
    mockClient.changesToReturn = [
      {
        id: 42,
        school_id: schoolId,
        table_name: 'students',
        record_id: 'b2222222-2222-2222-2222-222222222222',
        operation: 'INSERT',
        version: 1,
        created_at: new Date().toISOString(),
        payload: {
          id: 'b2222222-2222-2222-2222-222222222222',
          school_id: schoolId,
          name: 'Cursor Student',
          class_id: classId,
          version: 1,
        },
      },
    ]

    expect(getLocalSyncCursor(db, schoolId, deviceId)).toBe(0)

    const result = await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })

    expect(result.newCursor).toBe(42)
    expect(getLocalSyncCursor(db, schoolId, deviceId)).toBe(42)

    // Check cloud cursor update was dispatched
    expect(mockClient.updatedCursors.length).toBe(1)
    expect(mockClient.updatedCursors[0].cursor).toBe(42)
    expect(mockClient.updatedCursors[0].deviceId).toBe(deviceId)
  })

  // 3. Remote UPDATE with newer version applies to local student
  test('3. Remote UPDATE with newer version updates local student data', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Initial Name',
      class_id: classId,
      student_code: 'PHS-0003',
      sequence_number: 3,
    })

    // Advance cursor to 10
    setLocalSyncCursor(db, schoolId, deviceId, 10)

    mockClient.changesToReturn = [
      {
        id: 11,
        school_id: schoolId,
        table_name: 'students',
        record_id: student.id,
        operation: 'UPDATE',
        version: 2,
        created_at: new Date().toISOString(),
        payload: {
          id: student.id,
          school_id: schoolId,
          name: 'Updated Remotely',
          class_id: classId,
          phone: '+237699999999',
          version: 2,
        },
      },
    ]

    const result = await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })
    expect(result.applied).toBe(1)

    const updated = db.prepare(`SELECT * FROM students WHERE id = ?`).get(student.id) as any
    expect(updated.name).toBe('Updated Remotely')
    expect(updated.phone).toBe('+237699999999')
    expect(updated.version).toBe(2)
    expect(updated.sync_status).toBe('synced')
  })

  // 4. Older remote change does not overwrite newer local version
  test('4. Older remote change does not overwrite newer local version', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Latest Local Name',
      class_id: classId,
      student_code: 'PHS-0004',
    })

    // Simulate local version is already at 3
    db.prepare(`UPDATE students SET version = 3 WHERE id = ?`).run(student.id)

    mockClient.changesToReturn = [
      {
        id: 15,
        school_id: schoolId,
        table_name: 'students',
        record_id: student.id,
        operation: 'UPDATE',
        version: 2, // Older than local version 3
        created_at: new Date().toISOString(),
        payload: {
          id: student.id,
          school_id: schoolId,
          name: 'Stale Cloud Name',
          version: 2,
        },
      },
    ]

    const result = await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })
    expect(result.applied).toBe(0) // Skipped because stale

    const preserved = db.prepare(`SELECT * FROM students WHERE id = ?`).get(student.id) as any
    expect(preserved.name).toBe('Latest Local Name')
    expect(preserved.version).toBe(3)
  })

  // 5. Remote DELETE marks local student soft-deleted
  test('5. Remote DELETE marks local student soft-deleted with incremented version', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'To Be Deleted',
      class_id: classId,
      student_code: 'PHS-0005',
    })

    mockClient.changesToReturn = [
      {
        id: 20,
        school_id: schoolId,
        table_name: 'students',
        record_id: student.id,
        operation: 'DELETE',
        version: 2,
        created_at: new Date().toISOString(),
        payload: {
          id: student.id,
          school_id: schoolId,
          deleted_at: '2026-09-07T12:00:00.000Z',
          version: 2,
        },
      },
    ]

    const result = await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })
    expect(result.applied).toBe(1)

    const deleted = db.prepare(`SELECT * FROM students WHERE id = ?`).get(student.id) as any
    expect(deleted.deleted_at).toBe('2026-09-07T12:00:00.000Z')
    expect(deleted.version).toBe(2)
    expect(deleted.sync_status).toBe('synced')
  })

  // 6. Immutable student fields are preserved during remote UPDATE
  test('6. Immutable student_code and sequence_number cannot be corrupted by remote payload', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Protected Code Student',
      class_id: classId,
      student_code: 'PHS-0042',
      sequence_number: 42,
      admission_year: 2026,
    })

    mockClient.changesToReturn = [
      {
        id: 25,
        school_id: schoolId,
        table_name: 'students',
        record_id: student.id,
        operation: 'UPDATE',
        version: 2,
        created_at: new Date().toISOString(),
        payload: {
          id: student.id,
          school_id: schoolId,
          name: 'Renamed Student',
          student_code: 'TAMPERED-9999', // should NOT overwrite existing student_code
          sequence_number: 9999,
          version: 2,
        },
      },
    ]

    await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })

    const localStudent = db.prepare(`SELECT * FROM students WHERE id = ?`).get(student.id) as any
    expect(localStudent.name).toBe('Renamed Student')
    // Permanent identity preserved
    expect(localStudent.student_code).toBe('PHS-0042')
    expect(localStudent.sequence_number).toBe(42)
  })

  // 7. student_id_settings pull synchronization
  test('7. student_id_settings synchronizes pattern, sequence_scope, and advances sequence number', async () => {
    mockClient.changesToReturn = [
      {
        id: 30,
        school_id: schoolId,
        table_name: 'student_id_settings',
        record_id: 'settings-1',
        operation: 'UPDATE',
        version: 3,
        created_at: new Date().toISOString(),
        payload: {
          id: 'settings-1',
          school_id: schoolId,
          pattern: '{SCHOOL}-{YEAR}-{SEQ}',
          sequence_scope: 'school',
          next_sequence_number: 100,
          version: 3,
        },
      },
    ]

    const result = await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })
    expect(result.applied).toBe(1)

    const settings = repos.studentIdSettings.findBySchool(schoolId)
    expect(settings?.pattern).toBe('{SCHOOL}-{YEAR}-{SEQ}')
    expect(settings?.next_sequence_number).toBe(100)
    expect(settings?.version).toBe(3)
  })

  // 8. Tenant isolation: another school's changes are discarded
  test('8. Another schools change is ignored during pull', async () => {
    mockClient.changesToReturn = [
      {
        id: 35,
        school_id: school2Id, // foreign tenant
        table_name: 'students',
        record_id: 'foreign-student-uuid',
        operation: 'INSERT',
        version: 1,
        created_at: new Date().toISOString(),
        payload: {
          id: 'foreign-student-uuid',
          school_id: school2Id,
          name: 'Foreign Student',
          version: 1,
        },
      },
    ]

    const result = await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })
    expect(result.applied).toBe(0)

    const foreign = db.prepare(`SELECT * FROM students WHERE id = 'foreign-student-uuid'`).get()
    expect(foreign).toBeUndefined()
  })

  // 9. No sync echo loop: pulling does NOT write to sync_queue
  test('9. No sync loop: pulled remote changes never enqueue into local sync_queue', async () => {
    mockClient.changesToReturn = [
      {
        id: 40,
        school_id: schoolId,
        table_name: 'students',
        record_id: 'echo-test-student',
        operation: 'INSERT',
        version: 1,
        created_at: new Date().toISOString(),
        payload: {
          id: 'echo-test-student',
          school_id: schoolId,
          name: 'Echo Test',
          class_id: classId,
          version: 1,
        },
      },
    ]

    await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })

    const queueCount = db.prepare(`SELECT count(*) as count FROM sync_queue`).get() as { count: number }
    expect(queueCount.count).toBe(0)
  })

  // 10. Corrupted row in a page: per-change fallback keeps good rows and advances cursor
  test('10. Corrupted change falls back to per-row apply; good rows commit and cursor advances', async () => {
    setLocalSyncCursor(db, schoolId, deviceId, 50)

    mockClient.pullHandler = async () => ({
      ok: true,
      changes: [
        {
          id: 51,
          school_id: schoolId,
          table_name: 'students',
          record_id: 'student-valid',
          operation: 'INSERT',
          version: 1,
          created_at: new Date().toISOString(),
          payload: { id: 'student-valid', school_id: schoolId, name: 'Valid', class_id: classId, version: 1 },
        },
        {
          id: 52,
          school_id: schoolId,
          table_name: 'students',
          record_id: 'student-broken',
          operation: 'INSERT',
          version: 1,
          created_at: new Date().toISOString(),
          payload: null as any, // causes a TypeError during destructuring/execution
        },
      ],
      count: 2,
      currentCursor: 50,
      newCursor: 52,
      hasMore: false,
    })

    const result = await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })
    expect(result.ok).toBe(true)
    expect(result.applied).toBe(1)
    expect(result.failed).toBe(1)
    // Cursor advances past the page so Sync Now is not stuck replaying the poison row forever
    expect(getLocalSyncCursor(db, schoolId, deviceId)).toBe(52)
    const valid = db.prepare(`SELECT * FROM students WHERE id = 'student-valid'`).get()
    expect(valid).toBeDefined()
  })

  // 11. Network error during pull returns clean error and preserves cursor
  test('11. Network error during pull preserves cursor and reports failure gracefully', async () => {
    setLocalSyncCursor(db, schoolId, deviceId, 60)

    mockClient.pullHandler = async () => ({
      ok: false,
      changes: [],
      count: 0,
      currentCursor: 60,
      newCursor: 60,
      hasMore: false,
      error: 'fetch failed: ECONNRESET',
    })

    const result = await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })
    expect(result.ok).toBe(false)
    expect(result.failed).toBe(1)
    expect(result.hasMore).toBe(true)
    expect(getLocalSyncCursor(db, schoolId, deviceId)).toBe(60)
  })

  // 12. Concurrent edit conflict detection
  test('12. Concurrent edit conflict logs entry in sync_conflicts table', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Local Edit In Flight',
      class_id: classId,
    })

    // Local has an unpushed change in sync_queue
    enqueueSync(db, 'students', student.id, 'UPDATE', {
      id: student.id,
      school_id: schoolId,
      name: 'Local Edit In Flight Modified',
      version: 1,
    })

    // Remote brings version 2
    mockClient.changesToReturn = [
      {
        id: 70,
        school_id: schoolId,
        table_name: 'students',
        record_id: student.id,
        operation: 'UPDATE',
        version: 2,
        created_at: new Date().toISOString(),
        payload: {
          id: student.id,
          school_id: schoolId,
          name: 'Cloud Edit Newer',
          version: 2,
        },
      },
    ]

    const result = await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })
    expect(result.conflicts).toBe(1)

    const conflicts = db.prepare(`SELECT * FROM sync_conflicts WHERE record_id = ?`).all(student.id)
    expect(conflicts.length).toBe(1)
  })

  // 13. Multi-batch pagination
  test('13. Multi-batch pagination iterates until all remote changes are pulled', async () => {
    let callIndex = 0
    mockClient.pullHandler = async (params) => {
      callIndex += 1
      if (callIndex === 1) {
        return {
          ok: true,
          changes: [
            {
              id: 81,
              school_id: schoolId,
              table_name: 'students',
              record_id: 'batch-student-1',
              operation: 'INSERT',
              version: 1,
              created_at: new Date().toISOString(),
              payload: { id: 'batch-student-1', school_id: schoolId, name: 'Batch 1', class_id: classId, version: 1 },
            },
          ],
          count: 1,
          currentCursor: params.cursor,
          newCursor: 81,
          hasMore: true,
        }
      } else {
        return {
          ok: true,
          changes: [
            {
              id: 82,
              school_id: schoolId,
              table_name: 'students',
              record_id: 'batch-student-2',
              operation: 'INSERT',
              version: 1,
              created_at: new Date().toISOString(),
              payload: { id: 'batch-student-2', school_id: schoolId, name: 'Batch 2', class_id: classId, version: 1 },
            },
          ],
          count: 1,
          currentCursor: 81,
          newCursor: 82,
          hasMore: false,
        }
      }
    }

    const result = await pullRemoteChanges({ db, schoolId, deviceId, client: mockClient })
    expect(result.processed).toBe(2)
    expect(result.applied).toBe(2)
    expect(result.newCursor).toBe(82)
    expect(result.hasMore).toBe(false)
    expect(getLocalSyncCursor(db, schoolId, deviceId)).toBe(82)
  })

  // 13b. Safety cap must surface hasMore so Join / Sync Now can drain
  test('13b. returns hasMore=true when maxIterations stops with remote backlog', async () => {
    let nextId = 100
    mockClient.pullHandler = async (params) => {
      const id = nextId++
      return {
        ok: true,
        changes: [
          {
            id,
            school_id: schoolId,
            table_name: 'students',
            record_id: `cap-student-${id}`,
            operation: 'INSERT',
            version: 1,
            created_at: new Date().toISOString(),
            payload: {
              id: `cap-student-${id}`,
              school_id: schoolId,
              name: `Cap ${id}`,
              class_id: classId,
              version: 1,
            },
          },
        ],
        count: 1,
        currentCursor: params.cursor,
        newCursor: id,
        hasMore: true,
      }
    }

    const first = await pullRemoteChanges({
      db,
      schoolId,
      deviceId,
      client: mockClient,
      maxIterations: 3,
    })
    expect(first.ok).toBe(true)
    expect(first.processed).toBe(3)
    expect(first.hasMore).toBe(true)

    const second = await pullRemoteChanges({
      db,
      schoolId,
      deviceId,
      client: mockClient,
      maxIterations: 2,
    })
    expect(second.ok).toBe(true)
    expect(second.processed).toBe(2)
    expect(second.hasMore).toBe(true)
    expect(repos.students.findBySchool(schoolId, 'all').length).toBe(5)
  })

  // 13c. Worker drain continues while pull reports hasMore
  test('13c. runSyncWorker keeps pulling while hasMore until backlog clears', async () => {
    let nextId = 200
    let remaining = 7
    mockClient.pullHandler = async (params) => {
      if (remaining <= 0) {
        return {
          ok: true,
          changes: [],
          count: 0,
          currentCursor: params.cursor,
          newCursor: params.cursor,
          hasMore: false,
        }
      }
      const id = nextId++
      remaining -= 1
      return {
        ok: true,
        changes: [
          {
            id,
            school_id: schoolId,
            table_name: 'students',
            record_id: `drain-student-${id}`,
            operation: 'INSERT',
            version: 1,
            created_at: new Date().toISOString(),
            payload: {
              id: `drain-student-${id}`,
              school_id: schoolId,
              name: `Drain ${id}`,
              class_id: classId,
              version: 1,
            },
          },
        ],
        count: 1,
        currentCursor: params.cursor,
        newCursor: id,
        hasMore: remaining > 0,
      }
    }

    const workerResult = await runSyncWorker(db, {
      schoolId,
      client: mockClient,
      skipPush: true,
      pullBatchSize: 1,
    })

    expect(workerResult.ok).toBe(true)
    expect(workerResult.pull.applied).toBe(7)
    expect(workerResult.pull.hasMore).toBe(false)
    expect(workerResult.hasMore).toBe(false)
    expect(
      repos.students.findBySchool(schoolId, 'all').filter((s) =>
        s.id.startsWith('drain-student-')
      ).length
    ).toBe(7)
  })

  // 13d. One bad row must not freeze the whole pull page (second-desk crawl fix)
  test('13d. batch apply failure falls back to per-change apply and advances cursor', async () => {
    mockClient.pullHandler = async (params) => ({
      ok: true,
      changes: [
        {
          id: 301,
          school_id: schoolId,
          table_name: 'students',
          record_id: 'good-before-poison',
          operation: 'INSERT',
          version: 1,
          created_at: new Date().toISOString(),
          payload: {
            id: 'good-before-poison',
            school_id: schoolId,
            name: 'Good Before',
            class_id: classId,
            version: 1,
          },
        },
        {
          id: 302,
          school_id: schoolId,
          // Generic table: upsertRow throws when id is missing → aborts batch TX
          table_name: 'subjects',
          record_id: '',
          operation: 'INSERT',
          version: 1,
          created_at: new Date().toISOString(),
          payload: { name: 'Poison Subject', school_id: schoolId, version: 1 },
        },
        {
          id: 303,
          school_id: schoolId,
          table_name: 'students',
          record_id: 'good-after-poison',
          operation: 'INSERT',
          version: 1,
          created_at: new Date().toISOString(),
          payload: {
            id: 'good-after-poison',
            school_id: schoolId,
            name: 'Good After',
            class_id: classId,
            version: 1,
          },
        },
      ],
      count: 3,
      currentCursor: params.cursor,
      newCursor: 303,
      hasMore: false,
    })

    const result = await pullRemoteChanges({
      db,
      schoolId,
      deviceId,
      client: mockClient,
    })

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.newCursor).toBe(303)
    expect(getLocalSyncCursor(db, schoolId, deviceId)).toBe(303)
    expect(repos.students.findBySchool(schoolId, 'all').map((s) => s.id)).toEqual(
      expect.arrayContaining(['good-before-poison', 'good-after-poison'])
    )
  })

  // 13e. Hard pull error must not tight-loop inside the worker
  test('13e. runSyncWorker stops pull drain on hard error but keeps hasMore', async () => {
    let calls = 0
    mockClient.pullHandler = async (params) => {
      calls += 1
      return {
        ok: false,
        error: 'simulated network drop',
        changes: [],
        count: 0,
        currentCursor: params.cursor,
        newCursor: params.cursor,
        hasMore: false,
      }
    }

    const workerResult = await runSyncWorker(db, {
      schoolId,
      client: mockClient,
      skipPush: true,
    })

    expect(calls).toBe(1)
    expect(workerResult.ok).toBe(false)
    expect(workerResult.pull.hasMore).toBe(true)
    expect(workerResult.hasMore).toBe(true)
    expect(workerResult.message).toMatch(/Sync Now|network|continue/i)
  })

  // 13f. Individual apply helper advances cursor after mixed success
  test('13f. applyPulledChangesIndividually advances cursor past skipped failures', () => {
    const res = applyPulledChangesIndividually(
      db,
      [
        {
          id: 401,
          school_id: schoolId,
          table_name: 'students',
          record_id: 'indiv-ok',
          operation: 'INSERT',
          version: 1,
          created_at: new Date().toISOString(),
          payload: {
            id: 'indiv-ok',
            school_id: schoolId,
            name: 'Indiv Ok',
            class_id: classId,
            version: 1,
          },
        },
        {
          id: 402,
          school_id: schoolId,
          table_name: 'subjects',
          record_id: '',
          operation: 'INSERT',
          version: 1,
          created_at: new Date().toISOString(),
          payload: { name: 'No Id', school_id: schoolId },
        },
      ],
      schoolId,
      deviceId,
      402
    )
    expect(res.applied).toBe(1)
    expect(res.failed).toBe(1)
    expect(getLocalSyncCursor(db, schoolId, deviceId)).toBe(402)
  })

  // 14. Integrated sync worker runs push then pull
  test('14. runSyncWorker coordinates Push then Pull seamlessly', async () => {
    // 1. Enqueue local insert
    repos.students.create({
      school_id: schoolId,
      name: 'Local Push Student',
      class_id: classId,
    })

    // 2. Prepare remote pull item
    mockClient.changesToReturn = [
      {
        id: 95,
        school_id: schoolId,
        table_name: 'students',
        record_id: 'remote-worker-student',
        operation: 'INSERT',
        version: 1,
        created_at: new Date().toISOString(),
        payload: {
          id: 'remote-worker-student',
          school_id: schoolId,
          name: 'Remote Worker Student',
          class_id: classId,
          version: 1,
        },
      },
    ]

    const workerResult = await runSyncWorker(db, { schoolId, client: mockClient })

    expect(workerResult.ok).toBe(true)
    expect(workerResult.push.successful).toBeGreaterThanOrEqual(1)
    expect(workerResult.pull.applied).toBe(1)
    expect(workerResult.processed).toBeGreaterThanOrEqual(2)
    expect(workerResult.successful).toBeGreaterThanOrEqual(2)
  })
})
