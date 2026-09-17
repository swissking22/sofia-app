import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { enqueueSync, getPendingSyncItems } from '../../main/sync/queue'
import { pushPendingSync } from '../../main/sync/push'
import { resetDeviceStoreForTests } from '../../main/sync/device'
import type {
  ProcessSyncRpcParams,
  ProcessSyncRpcResult,
  RegisterDeviceRpcParams,
  RegisterDeviceRpcResult,
  SupabaseSyncClientInterface,
} from '../../main/sync/types'

class MockSupabaseSyncClient implements SupabaseSyncClientInterface {
  public receivedOperations: ProcessSyncRpcParams[] = []
  public registeredDevices: RegisterDeviceRpcParams[] = []
  public operationHandler?: (
    params: ProcessSyncRpcParams
  ) => Promise<ProcessSyncRpcResult> | ProcessSyncRpcResult
  public deviceHandler?: (
    params: RegisterDeviceRpcParams
  ) => Promise<RegisterDeviceRpcResult> | RegisterDeviceRpcResult

  async registerDevice(
    params: RegisterDeviceRpcParams
  ): Promise<RegisterDeviceRpcResult> {
    this.registeredDevices.push(params)
    if (this.deviceHandler) {
      return this.deviceHandler(params)
    }
    return { ok: true }
  }

  async processSyncOperation(
    params: ProcessSyncRpcParams
  ): Promise<ProcessSyncRpcResult> {
    this.receivedOperations.push(params)
    if (this.operationHandler) {
      return this.operationHandler(params)
    }
    return {
      ok: true,
      duplicate: false,
      changeId: this.receivedOperations.length,
      status: 'applied',
    }
  }

  async pullSyncChanges(params: import('../../main/sync/types').PullSyncRpcParams): Promise<import('../../main/sync/types').PullSyncRpcResult> {
    return {
      ok: true,
      changes: [],
      count: 0,
      currentCursor: params.cursor,
      newCursor: params.cursor,
      hasMore: false,
    }
  }

  async updateSyncCursor(params: import('../../main/sync/types').UpdateSyncCursorRpcParams): Promise<import('../../main/sync/types').UpdateSyncCursorRpcResult> {
    return { ok: true, cursor: params.cursor }
  }
}

describe('Sofia Phase 1: Local Push Sync Service', () => {
  let db: Database.Database
  let repos: ReturnType<typeof createRepositories>
  let mockClient: MockSupabaseSyncClient
  let schoolId: string
  let classId: string
  const school2Id = '22222222-2222-2222-2222-222222222222'

  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
    repos = createRepositories(db)
    mockClient = new MockSupabaseSyncClient()
    resetDeviceStoreForTests('33333333-3333-3333-3333-333333333333')

    // Create a school
    const school = repos.schools.create({
      name: 'Alpha Beta College',
      short_code: 'ABC',
      email: 'info@abc.school',
    })
    schoolId = school.id

    const level = repos.academicLevels.create({
      school_id: schoolId,
      name: 'Form 1',
      short_name: 'F1',
      category: 'lower_secondary',
      sort_order: 1,
      is_active: 1,
    })

    const cls = repos.classes.create({
      school_id: schoolId,
      name: 'Form 1A',
      level: '1',
      form_key: 'F1',
      stream: 'A',
      academic_level_id: level.id,
      section_id: null,
      specialization_id: null,
      class_teacher_id: null,
      capacity: 50,
      is_active: 1,
    })
    classId = cls.id

    repos.studentIdSettings.ensureDefaults(schoolId)

    // Clear initial setup sync_queue items so tests start with a clean slate
    db.prepare(`DELETE FROM sync_queue`).run()
  })

  afterEach(() => {
    db.close()
  })

  // 1. New student INSERT reaches Supabase
  test('1. New student INSERT reaches Supabase via process_sync_operation RPC', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'John Doe',
      class_id: classId,
      student_code: 'ABC-0001',
      admission_year: 2026,
      sequence_number: 1,
    })

    const pending = getPendingSyncItems(db)
    expect(pending.length).toBe(1)
    expect(pending[0].record_id).toBe(student.id)
    expect(pending[0].operation).toBe('INSERT')

    const result = await pushPendingSync({ db, schoolId, client: mockClient })

    expect(result.processed).toBe(1)
    expect(result.successful).toBe(1)
    expect(result.failed).toBe(0)
    expect(mockClient.receivedOperations.length).toBe(1)

    const op = mockClient.receivedOperations[0]
    expect(op.tableName).toBe('students')
    expect(op.recordId).toBe(student.id)
    expect(op.operation).toBe('INSERT')
    expect(op.payload.name).toBe('John Doe')
    expect(op.payload.student_code).toBe('ABC-0001')
  })

  // 2. Same operation sent twice is idempotent
  test('2. Same operation sent twice is idempotent (duplicate: true acknowledged without error)', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Jane Doe',
      class_id: classId,
      student_code: 'ABC-0002',
      sequence_number: 2,
    })

    // Mock handler returns duplicate: true on second call
    let callCount = 0
    mockClient.operationHandler = async () => {
      callCount++
      if (callCount === 1) {
        return { ok: true, duplicate: false, changeId: 10 }
      }
      return { ok: true, duplicate: true, status: 'applied' }
    }

    // First push
    const res1 = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(res1.successful).toBe(1)

    // Reset status back to pending to simulate retry/resend
    const item = db.prepare(`SELECT id FROM sync_queue WHERE record_id = ?`).get(student.id) as { id: string }
    db.prepare(`UPDATE sync_queue SET status = 'pending' WHERE id = ?`).run(item.id)

    // Second push
    const res2 = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(res2.successful).toBe(1)
    expect(res2.failed).toBe(0)

    const syncedItem = db.prepare(`SELECT status FROM sync_queue WHERE id = ?`).get(item.id) as { status: string }
    expect(syncedItem.status).toBe('synced')
  })

  // 3. Student UUID remains identical locally/cloud
  test('3. Student UUID remains identical between local SQLite and cloud payload', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Bob Smith',
      class_id: classId,
      student_code: 'ABC-0003',
      sequence_number: 3,
    })

    await pushPendingSync({ db, schoolId, client: mockClient })

    const op = mockClient.receivedOperations.find((o) => o.tableName === 'students')!
    expect(op.recordId).toBe(student.id)
    expect(op.payload.id).toBe(student.id)
  })

  // 4. student_code remains identical locally/cloud
  test('4. student_code remains identical between local SQLite and cloud payload', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Charlie Brown',
      class_id: classId,
      student_code: 'ABC-0042',
      sequence_number: 42,
    })

    await pushPendingSync({ db, schoolId, client: mockClient })

    const op = mockClient.receivedOperations[0]
    expect(op.payload.student_code).toBe(student.student_code)
    expect(op.payload.sequence_number).toBe(student.sequence_number)
  })

  // 5. Student UPDATE succeeds with newer version
  test('5. Student UPDATE succeeds with newer version', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Alice Wonder',
      class_id: classId,
    })

    // Clear insert from queue
    await pushPendingSync({ db, schoolId, client: mockClient })
    mockClient.receivedOperations = []

    // Update student
    repos.students.update(student.id, {
      name: 'Alice Wonderland',
    })

    const pending = getPendingSyncItems(db)
    expect(pending.length).toBe(1)
    expect(pending[0].operation).toBe('UPDATE')

    const result = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(result.successful).toBe(1)
    expect(result.failed).toBe(0)
    expect(mockClient.receivedOperations[0].operation).toBe('UPDATE')
    expect(mockClient.receivedOperations[0].payload.name).toBe('Alice Wonderland')
  })

  // 6. Older UPDATE does not overwrite newer cloud version (returns conflict)
  test('6. Older UPDATE does not overwrite newer cloud version and logs conflict', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'David Old',
      class_id: classId,
    })
    await pushPendingSync({ db, schoolId, client: mockClient })
    mockClient.receivedOperations = []

    // Enqueue an older update
    enqueueSync(db, 'students', student.id, 'UPDATE', {
      id: student.id,
      school_id: schoolId,
      name: 'David Stale',
      version: 1, // older than cloud version 2
    })

    // Mock client returning conflict
    mockClient.operationHandler = async () => ({
      ok: false,
      errorType: 'conflict',
      conflict: true,
      cloudVersion: 2,
      incomingVersion: 1,
      error: 'Version conflict: incoming version 1 is older than cloud version 2',
    })

    const result = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(result.conflicts).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.successful).toBe(0)

    // Check sync_conflicts table in local SQLite
    const conflicts = db.prepare(`SELECT * FROM sync_conflicts WHERE record_id = ?`).all(student.id)
    expect(conflicts.length).toBe(1)
  })

  // 7. Attempt to change student_code is rejected
  test('7. Attempt to change student_code is rejected as immutable-field violation', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Eve Code',
      class_id: classId,
      student_code: 'ABC-0005',
    })
    await pushPendingSync({ db, schoolId, client: mockClient })

    // Enqueue an illegal update changing student_code
    enqueueSync(db, 'students', student.id, 'UPDATE', {
      id: student.id,
      school_id: schoolId,
      student_code: 'HACKED-9999',
      name: 'Eve Code',
      version: 2,
    })

    mockClient.operationHandler = async (params) => {
      if (params.payload.student_code === 'HACKED-9999') {
        return {
          ok: false,
          errorType: 'validation',
          error: 'Immutable field violation: student_code cannot be changed',
        }
      }
      return { ok: true, duplicate: false, changeId: 1 }
    }

    const result = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(result.failed).toBe(1)
    expect(result.successful).toBe(0)

    const item = db.prepare(`SELECT status FROM sync_queue WHERE operation = 'UPDATE'`).get() as { status: string }
    expect(item.status).toBe('failed')
  })

  // 8. Attempt to change student school_id is rejected
  test('8. Attempt to change student school_id is rejected', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Frank School',
      class_id: classId,
      student_code: 'ABC-0008',
      sequence_number: 8,
    })
    await pushPendingSync({ db, schoolId, client: mockClient })

    // Enqueue an update targeting another school
    enqueueSync(db, 'students', student.id, 'UPDATE', {
      id: student.id,
      school_id: school2Id, // different school
      name: 'Frank School',
      version: 2,
    })

    const result = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(result.failed).toBe(1)
    expect(result.successful).toBe(0)

    // The operation must not have been sent with mismatched tenant
    const failedOp = db.prepare(`SELECT status FROM sync_queue WHERE record_id = ? AND operation = 'UPDATE'`).get(student.id) as { status: string }
    expect(failedOp.status).toBe('failed')
  })

  // 9. DELETE performs soft delete
  test('9. DELETE performs soft delete through sync', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Grace Hopper',
      class_id: classId,
      student_code: 'ABC-0009',
      sequence_number: 9,
    })
    await pushPendingSync({ db, schoolId, client: mockClient })
    mockClient.receivedOperations = []

    repos.students.delete(student.id)

    const pending = getPendingSyncItems(db)
    expect(pending.length).toBe(1)
    expect(pending[0].operation).toBe('DELETE')

    const result = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(result.successful).toBe(1)

    const op = mockClient.receivedOperations[0]
    expect(op.operation).toBe('DELETE')
    expect(op.recordId).toBe(student.id)
  })

  // 10. Exactly one sync_changes entry is created per successful operation
  test('10. Exactly one sync_changes entry is acknowledged per successful operation', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Isaac Newton',
      class_id: classId,
      student_code: 'ABC-0010',
      sequence_number: 10,
    })

    mockClient.operationHandler = async () => ({
      ok: true,
      duplicate: false,
      changeId: 101,
      status: 'applied',
    })

    const result = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(result.successful).toBe(1)
    expect(mockClient.receivedOperations.length).toBe(1)
    expect(mockClient.receivedOperations[0].recordId).toBe(student.id)
  })

  // 11. Failed network request remains pending locally
  test('11. Failed network request remains pending locally with incremented retry_count', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Network Test',
      class_id: classId,
      student_code: 'ABC-0011',
      sequence_number: 11,
    })

    mockClient.operationHandler = async () => ({
      ok: false,
      errorType: 'network',
      error: 'fetch failed: ECONNREFUSED',
    })

    const result = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(result.failed).toBe(1)
    expect(result.successful).toBe(0)

    const item = db.prepare(`SELECT status, retry_count, last_attempt_at FROM sync_queue WHERE record_id = ?`).get(student.id) as {
      status: string
      retry_count: number
      last_attempt_at: string
    }

    expect(item.status).toBe('pending') // MUST remain pending!
    expect(item.retry_count).toBe(1)
    expect(item.last_attempt_at).toBeTruthy()
  })

  // 12. Successful push marks local sync_queue item as synced
  test('12. Successful push marks local sync_queue item as synced without deleting it', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Sync Mark Test',
      class_id: classId,
      student_code: 'ABC-0012',
      sequence_number: 12,
    })

    await pushPendingSync({ db, schoolId, client: mockClient })

    const item = db.prepare(`SELECT status, last_attempt_at FROM sync_queue WHERE record_id = ?`).get(student.id) as {
      status: string
      last_attempt_at: string
    }

    expect(item.status).toBe('synced')
    expect(item.last_attempt_at).toBeTruthy()

    // Must NOT be deleted
    const count = db.prepare(`SELECT count(*) as count FROM sync_queue WHERE record_id = ?`).get(student.id) as { count: number }
    expect(count.count).toBe(1)
  })

  // 13. student_id_settings synchronizes correctly
  test('13. student_id_settings synchronizes correctly', async () => {
    repos.studentIdSettings.ensureDefaults(schoolId)
    repos.studentIdSettings.saveSetup(schoolId, {
      pattern: '{SCHOOL}-{SEQ}',
      sequence_scope: 'school',
      next_sequence_number: 10,
    })

    const pending = getPendingSyncItems(db)
    const settingsItem = pending.find((p) => p.table_name === 'student_id_settings')
    expect(settingsItem).toBeDefined()

    const result = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(result.successful).toBeGreaterThanOrEqual(1)

    const op = mockClient.receivedOperations.find((o) => o.tableName === 'student_id_settings')
    expect(op).toBeDefined()
    expect(op?.payload.pattern).toBe('{SCHOOL}-{SEQ}')
    expect(op?.payload.sequence_scope).toBe('school')
  })

  // 14. Another school's student cannot be written into this school's tenant
  test('14. Another schools student cannot be written into this schools tenant', async () => {
    // Manually enqueue an item belonging to school2
    enqueueSync(db, 'students', '88888888-8888-8888-8888-888888888888', 'INSERT', {
      id: '88888888-8888-8888-8888-888888888888',
      school_id: school2Id, // different tenant
      name: 'Rogue Student',
    })

    const result = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(result.failed).toBe(1)
    expect(result.successful).toBe(0)

    const item = db.prepare(`SELECT status FROM sync_queue WHERE record_id = ?`).get('88888888-8888-8888-8888-888888888888') as { status: string }
    expect(item.status).toBe('failed')
  })

  // 15. Unsupported tables are failed locally without RPC calls
  test('15. Unsupported pending tables are skipped without calling cloud RPC', async () => {
    enqueueSync(db, 'backup_sync_settings', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'INSERT', {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      school_id: schoolId,
    })
    enqueueSync(db, 'report_settings', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'INSERT', {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      school_id: schoolId,
    })

    const beforeOps = mockClient.receivedOperations.length
    const result = await pushPendingSync({ db, schoolId, client: mockClient })

    expect(result.successful).toBe(0)
    expect(result.processed).toBe(0)
    expect(mockClient.receivedOperations.length).toBe(beforeOps)

    const a = db
      .prepare(`SELECT status FROM sync_queue WHERE record_id = ?`)
      .get('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as { status: string }
    const b = db
      .prepare(`SELECT status FROM sync_queue WHERE record_id = ?`)
      .get('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as { status: string }
    expect(a.status).toBe('failed')
    expect(b.status).toBe('failed')
  })

  // 16. Permanent RPC barriers abort the batch (no sync storm)
  test('16. Permanent validation barrier aborts remaining batch items', async () => {
    const s1 = repos.students.create({
      school_id: schoolId,
      name: 'Barrier One',
      class_id: classId,
      student_code: 'ABC-0016',
      sequence_number: 16,
    })
    const s2 = repos.students.create({
      school_id: schoolId,
      name: 'Barrier Two',
      class_id: classId,
      student_code: 'ABC-0017',
      sequence_number: 17,
    })

    mockClient.operationHandler = async () => ({
      ok: false,
      errorType: 'validation',
      error: 'RPC error (400): column "id" does not exist',
    })

    const result = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(result.failed).toBe(1)
    expect(result.processed).toBe(1)
    expect(mockClient.receivedOperations.length).toBe(1)

    const first = db
      .prepare(`SELECT status FROM sync_queue WHERE record_id = ?`)
      .get(s1.id) as { status: string }
    const second = db
      .prepare(`SELECT status FROM sync_queue WHERE record_id = ?`)
      .get(s2.id) as { status: string }
    expect(first.status).toBe('failed')
    expect(second.status).toBe('pending')
  })

  // 17. Network backoff keeps recently failed pending items out of the next batch
  test('17. Network backoff excludes items until delay elapses', async () => {
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Backoff Test',
      class_id: classId,
      student_code: 'ABC-0018',
      sequence_number: 18,
    })

    mockClient.operationHandler = async () => ({
      ok: false,
      errorType: 'network',
      error: 'fetch failed',
    })

    await pushPendingSync({ db, schoolId, client: mockClient })

    // Immediately after network fail (retry_count=1), item is still pending but
    // within the 5s backoff window — must not be selected again.
    expect(getPendingSyncItems(db).length).toBe(0)

    db.prepare(
      `UPDATE sync_queue SET last_attempt_at = datetime('now', '-30 seconds') WHERE record_id = ?`
    ).run(student.id)

    const again = getPendingSyncItems(db)
    expect(again.length).toBe(1)
    expect(again[0].record_id).toBe(student.id)
  })

  // 18. Missing cloud tenant aborts before processing queue items
  test('18. Missing school tenant aborts push without processing queue', async () => {
    repos.students.create({
      school_id: schoolId,
      name: 'Tenant Gate',
      class_id: classId,
      student_code: 'ABC-0019',
      sequence_number: 19,
    })

    resetDeviceStoreForTests('44444444-4444-4444-4444-444444444444')
    mockClient.deviceHandler = async () => ({
      ok: false,
      error: 'School tenant does not exist: ' + schoolId,
    })

    const result = await pushPendingSync({ db, schoolId, client: mockClient })
    expect(result.ok).toBe(false)
    expect(result.processed).toBe(0)
    expect(mockClient.receivedOperations.length).toBe(0)
    expect(result.message).toContain('School tenant does not exist')
  })
})
