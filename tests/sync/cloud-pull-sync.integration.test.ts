import { execFileSync } from 'child_process'
import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { pushPendingSync } from '../../main/sync/push'
import { pullRemoteChanges } from '../../main/sync/pull'
import { getLocalSyncCursor } from '../../main/sync/cursor'
import { resetDeviceStoreForTests } from '../../main/sync/device'
import type {
  ProcessSyncRpcParams,
  ProcessSyncRpcResult,
  PullSyncRpcParams,
  PullSyncRpcResult,
  RegisterDeviceRpcParams,
  RegisterDeviceRpcResult,
  SupabaseSyncClientInterface,
  UpdateSyncCursorRpcParams,
  UpdateSyncCursorRpcResult,
} from '../../main/sync/types'

function isPostgresAvailable(): boolean {
  try {
    const user = process.env.USER || 'postgres'
    const out = execFileSync(
      '/usr/local/opt/postgresql@18/bin/psql',
      ['-U', user, '-d', 'sofia_cloud', '-t', '-A', '-c', 'SELECT 1;'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    )
    return out.trim() === '1'
  } catch {
    return false
  }
}

class PostgresDirectClient implements SupabaseSyncClientInterface {
  private psql(query: string): string {
    const user = process.env.USER || 'postgres'
    return execFileSync(
      '/usr/local/opt/postgresql@18/bin/psql',
      ['-U', user, '-d', 'sofia_cloud', '-t', '-A', '-c', query],
      { encoding: 'utf8' }
    ).trim()
  }

  async registerDevice(
    params: RegisterDeviceRpcParams
  ): Promise<RegisterDeviceRpcResult> {
    const sql = `
      SELECT public.register_device(
        ${this.quote(params.id)}::uuid,
        ${this.quote(params.schoolId)}::uuid,
        ${this.quote(params.deviceName)},
        ${params.deviceFingerprint ? this.quote(params.deviceFingerprint) : 'NULL'}
      );
    `
    const raw = this.psql(sql)
    const json = JSON.parse(raw)
    return { ok: Boolean(json.success), error: json.error }
  }

  async processSyncOperation(
    params: ProcessSyncRpcParams
  ): Promise<ProcessSyncRpcResult> {
    const sql = `
      SELECT public.process_sync_operation(
        ${this.quote(params.id)}::uuid,
        ${this.quote(params.schoolId)}::uuid,
        ${params.deviceId ? this.quote(params.deviceId) + '::uuid' : 'NULL'},
        ${this.quote(params.tableName)},
        ${this.quote(params.recordId)},
        ${this.quote(params.operation)},
        ${this.quote(JSON.stringify(params.payload))}::jsonb
      );
    `
    const raw = this.psql(sql)
    const json = JSON.parse(raw)

    if (json.conflict) {
      return {
        ok: false,
        errorType: 'conflict',
        conflict: true,
        cloudVersion: json.cloud_version,
        incomingVersion: json.incoming_version,
        error: json.error,
      }
    }

    if (json.success === false) {
      return {
        ok: false,
        errorType: 'validation',
        error: json.error,
      }
    }

    return {
      ok: true,
      duplicate: Boolean(json.duplicate),
      changeId: json.change_id,
      status: json.status,
    }
  }

  async pullSyncChanges(params: PullSyncRpcParams): Promise<PullSyncRpcResult> {
    const sql = `
      SELECT public.pull_sync_changes(
        ${this.quote(params.schoolId)}::uuid,
        ${this.quote(params.deviceId)}::uuid,
        ${params.cursor}::bigint,
        ${params.limit ?? 100}::integer
      );
    `
    const raw = this.psql(sql)
    const json = JSON.parse(raw)

    if (!json.success) {
      return {
        ok: false,
        changes: [],
        count: 0,
        currentCursor: params.cursor,
        newCursor: params.cursor,
        hasMore: false,
        error: json.error,
      }
    }

    return {
      ok: true,
      changes: json.changes || [],
      count: Number(json.count) || 0,
      currentCursor: Number(json.current_cursor) ?? params.cursor,
      newCursor: Number(json.new_cursor) ?? params.cursor,
      hasMore: Boolean(json.has_more),
    }
  }

  async updateSyncCursor(params: UpdateSyncCursorRpcParams): Promise<UpdateSyncCursorRpcResult> {
    const sql = `
      SELECT public.update_sync_cursor(
        ${this.quote(params.schoolId)}::uuid,
        ${this.quote(params.deviceId)}::uuid,
        ${params.cursor}::bigint
      );
    `
    const raw = this.psql(sql)
    const json = JSON.parse(raw)
    return { ok: Boolean(json.success), cursor: Number(json.cursor), error: json.error }
  }

  public query(sql: string): any {
    return this.psql(sql)
  }

  private quote(val: string): string {
    return "'" + val.replace(/'/g, "''") + "'"
  }
}

describe('Sofia Phase 2: Live PostgreSQL Multi-Device Pull Sync Integration Test', () => {
  const hasPg = isPostgresAvailable()

  if (!hasPg) {
    test.skip('Skipping PostgreSQL integration test (sofia_cloud not reachable)', () => {})
    return
  }

  let dbA: Database.Database
  let dbB: Database.Database
  let reposA: ReturnType<typeof createRepositories>
  let pgClient: PostgresDirectClient

  const schoolId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  const deviceAId = 'dddddddd-1111-1111-1111-111111111111'
  const deviceBId = 'dddddddd-2222-2222-2222-222222222222'

  beforeAll(() => {
    pgClient = new PostgresDirectClient()

    // Ensure clean school tenant in PostgreSQL
    pgClient.query(`
      INSERT INTO public.schools (id, name, school_code)
      VALUES ('${schoolId}', 'Two-Way Sync Academy', 'TWSA')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `)
  })

  afterAll(() => {
    try {
      pgClient.query(`
        DELETE FROM public.students WHERE school_id = '${schoolId}';
        DELETE FROM public.student_id_settings WHERE school_id = '${schoolId}';
        DELETE FROM public.sync_changes WHERE school_id = '${schoolId}';
        DELETE FROM public.sync_operations WHERE school_id = '${schoolId}';
        DELETE FROM public.sync_cursors WHERE school_id = '${schoolId}';
        DELETE FROM public.devices WHERE school_id = '${schoolId}';
        DELETE FROM public.schools WHERE id = '${schoolId}';
      `)
    } catch {
      // Ignore cleanup error
    }
  })

  let classAId: string

  beforeEach(() => {
    // Database A: Device A (Pushing device)
    dbA = new Database(':memory:')
    createSchema(dbA)
    reposA = createRepositories(dbA)

    dbA.prepare(`
      INSERT INTO schools (id, name, short_code, email, created_at, updated_at, sync_status, version)
      VALUES (?, 'Two-Way Sync Academy', 'TWSA', 'admin@twsa.edu', datetime('now'), datetime('now'), 'synced', 1)
    `).run(schoolId)

    const levelA = reposA.academicLevels.create({
      school_id: schoolId,
      name: 'Form 1',
      short_name: 'F1',
      category: 'lower_secondary',
      sort_order: 1,
      is_active: 1,
    })

    const clsA = reposA.classes.create({
      school_id: schoolId,
      name: 'Form 1A',
      level: '1',
      form_key: 'F1',
      stream: 'A',
      academic_level_id: levelA.id,
      section_id: null,
      specialization_id: null,
      class_teacher_id: null,
      capacity: 35,
      is_active: 1,
    })
    classAId = clsA.id
    reposA.studentIdSettings.ensureDefaults(schoolId)
    dbA.prepare(`DELETE FROM sync_queue`).run()

    // Database B: Device B (Pulling device starting empty)
    dbB = new Database(':memory:')
    createSchema(dbB)
    dbB.prepare(`
      INSERT INTO schools (id, name, short_code, email, created_at, updated_at, sync_status, version)
      VALUES (?, 'Two-Way Sync Academy', 'TWSA', 'admin@twsa.edu', datetime('now'), datetime('now'), 'synced', 1)
    `).run(schoolId)
    dbB.prepare(`DELETE FROM sync_queue`).run()
  })

  afterEach(() => {
    dbA.close()
    dbB.close()
  })

  test('Multi-device: Device A pushes student -> Supabase sync_changes -> Device B pulls into local SQLite -> Device B receives updates & soft delete', async () => {
    // -------------------------------------------------------------------------
    // 1. Device A inserts student and pushes to Supabase
    // -------------------------------------------------------------------------
    resetDeviceStoreForTests(deviceAId)

    const studentA = reposA.students.create({
      school_id: schoolId,
      name: 'Alexander The Great',
      class_id: classAId,
      student_code: 'TWSA-0001',
      admission_year: 2026,
      sequence_number: 1,
      gender: 'male',
      date_of_birth: '2010-07-20',
    })

    const pushRes = await pushPendingSync({
      db: dbA,
      schoolId,
      client: pgClient,
    })

    expect(pushRes.successful).toBe(1)
    expect(pushRes.failed).toBe(0)

    // Verify change exists in cloud PostgreSQL
    const changesCount = Number(
      pgClient.query(
        `SELECT COUNT(*) FROM public.sync_changes WHERE school_id = '${schoolId}' AND record_id = '${studentA.id}';`
      )
    )
    expect(changesCount).toBeGreaterThanOrEqual(1)

    // -------------------------------------------------------------------------
    // 2. Device B pulls changes from cursor 0
    // -------------------------------------------------------------------------
    resetDeviceStoreForTests(deviceBId)
    expect(getLocalSyncCursor(dbB, schoolId, deviceBId)).toBe(0)

    const pullRes1 = await pullRemoteChanges({
      db: dbB,
      schoolId,
      deviceId: deviceBId,
      client: pgClient,
    })

    expect(pullRes1.ok).toBe(true)
    expect(pullRes1.applied).toBeGreaterThanOrEqual(1)
    expect(pullRes1.newCursor).toBeGreaterThan(0)
    expect(getLocalSyncCursor(dbB, schoolId, deviceBId)).toBe(pullRes1.newCursor)

    // Verify student exists in Device B's local SQLite
    const studentB = dbB.prepare(`SELECT * FROM students WHERE id = ?`).get(studentA.id) as any
    expect(studentB).toBeDefined()
    expect(studentB.id).toBe(studentA.id)
    expect(studentB.name).toBe('Alexander The Great')
    expect(studentB.student_code).toBe('TWSA-0001')
    expect(studentB.sequence_number).toBe(1)
    expect(studentB.admission_year).toBe(2026)
    expect(studentB.sync_status).toBe('synced')
    expect(studentB.deleted_at).toBeNull()

    // Verify Device B did NOT create any pending items in its sync_queue
    const queueCountB = (dbB.prepare(`SELECT COUNT(*) as cnt FROM sync_queue`).get() as any).cnt
    expect(queueCountB).toBe(0)

    // Verify cloud cursor for Device B is recorded
    const cloudCursorB = Number(
      pgClient.query(
        `SELECT last_synced_change_id FROM public.sync_cursors WHERE device_id = '${deviceBId}' AND school_id = '${schoolId}';`
      )
    )
    expect(cloudCursorB).toBe(pullRes1.newCursor)

    // -------------------------------------------------------------------------
    // 3. Device A updates student and pushes to Supabase
    // -------------------------------------------------------------------------
    resetDeviceStoreForTests(deviceAId)
    reposA.students.update(studentA.id, {
      name: 'Alexander III of Macedon',
      phone: '+237677112233',
    })

    const pushUpdateRes = await pushPendingSync({
      db: dbA,
      schoolId,
      client: pgClient,
    })
    expect(pushUpdateRes.successful).toBe(1)

    // -------------------------------------------------------------------------
    // 4. Device B pulls update
    // -------------------------------------------------------------------------
    resetDeviceStoreForTests(deviceBId)
    const pullRes2 = await pullRemoteChanges({
      db: dbB,
      schoolId,
      deviceId: deviceBId,
      client: pgClient,
    })

    expect(pullRes2.ok).toBe(true)
    expect(pullRes2.applied).toBe(1)
    expect(pullRes2.newCursor).toBeGreaterThan(pullRes1.newCursor)

    const updatedStudentB = dbB.prepare(`SELECT * FROM students WHERE id = ?`).get(studentA.id) as any
    expect(updatedStudentB.name).toBe('Alexander III of Macedon')
    expect(updatedStudentB.phone).toBe('+237677112233')
    expect(updatedStudentB.student_code).toBe('TWSA-0001')
    expect(Number(updatedStudentB.version)).toBe(2)

    // -------------------------------------------------------------------------
    // 5. Device A deletes student and pushes to Supabase
    // -------------------------------------------------------------------------
    resetDeviceStoreForTests(deviceAId)
    reposA.students.delete(studentA.id)

    const pushDeleteRes = await pushPendingSync({
      db: dbA,
      schoolId,
      client: pgClient,
    })
    expect(pushDeleteRes.successful).toBe(1)

    // -------------------------------------------------------------------------
    // 6. Device B pulls delete
    // -------------------------------------------------------------------------
    resetDeviceStoreForTests(deviceBId)
    const pullRes3 = await pullRemoteChanges({
      db: dbB,
      schoolId,
      deviceId: deviceBId,
      client: pgClient,
    })

    expect(pullRes3.ok).toBe(true)
    expect(pullRes3.applied).toBe(1)
    expect(pullRes3.newCursor).toBeGreaterThan(pullRes2.newCursor)

    const deletedStudentB = dbB.prepare(`SELECT * FROM students WHERE id = ?`).get(studentA.id) as any
    expect(deletedStudentB.deleted_at).not.toBeNull()
    expect(deletedStudentB.student_code).toBe('TWSA-0001')

    // -------------------------------------------------------------------------
    // 7. Device B pulls 4th time: no new changes
    // -------------------------------------------------------------------------
    const pullRes4 = await pullRemoteChanges({
      db: dbB,
      schoolId,
      deviceId: deviceBId,
      client: pgClient,
    })

    expect(pullRes4.ok).toBe(true)
    expect(pullRes4.applied).toBe(0)
    expect(pullRes4.processed).toBe(0)
    expect(pullRes4.newCursor).toBe(pullRes3.newCursor)
  })
})
