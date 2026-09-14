import { execFileSync } from 'child_process'
import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { pushPendingSync } from '../../main/sync/push'
import { resetDeviceStoreForTests } from '../../main/sync/device'
import type {
  ProcessSyncRpcParams,
  ProcessSyncRpcResult,
  RegisterDeviceRpcParams,
  RegisterDeviceRpcResult,
  SupabaseSyncClientInterface,
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

  async pullSyncChanges(params: import('../../main/sync/types').PullSyncRpcParams): Promise<import('../../main/sync/types').PullSyncRpcResult> {
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
    return {
      ok: Boolean(json.success),
      changes: json.changes || [],
      count: Number(json.count) || 0,
      currentCursor: Number(json.current_cursor) ?? params.cursor,
      newCursor: Number(json.new_cursor) ?? params.cursor,
      hasMore: Boolean(json.has_more),
      error: json.error,
    }
  }

  async updateSyncCursor(params: import('../../main/sync/types').UpdateSyncCursorRpcParams): Promise<import('../../main/sync/types').UpdateSyncCursorRpcResult> {
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

describe('Sofia Phase 1: End-to-End Cloud Sync Integration Test', () => {
  const hasPg = isPostgresAvailable()

  if (!hasPg) {
    test.skip('Skipping PostgreSQL integration test (sofia_cloud not reachable)', () => {})
    return
  }

  let db: Database.Database
  let repos: ReturnType<typeof createRepositories>
  let pgClient: PostgresDirectClient
  const schoolId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const deviceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

  beforeAll(() => {
    pgClient = new PostgresDirectClient()

    // Ensure school exists in PostgreSQL
    pgClient.query(`
      INSERT INTO public.schools (id, name, school_code)
      VALUES ('${schoolId}', 'Integration High School', 'IHS')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `)
  })

  afterAll(() => {
    // Cleanup cloud database
    try {
      pgClient.query(`
        DELETE FROM public.students WHERE school_id = '${schoolId}';
        DELETE FROM public.student_id_settings WHERE school_id = '${schoolId}';
        DELETE FROM public.sync_changes WHERE school_id = '${schoolId}';
        DELETE FROM public.sync_operations WHERE school_id = '${schoolId}';
        DELETE FROM public.devices WHERE school_id = '${schoolId}';
        DELETE FROM public.schools WHERE id = '${schoolId}';
      `)
    } catch {
      // Ignore cleanup error
    }
  })

    let classId: string

    beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
    repos = createRepositories(db)
    resetDeviceStoreForTests(deviceId)

    // Setup local SQLite school matching the cloud school
    db.prepare(`
      INSERT INTO schools (id, name, short_code, email, created_at, updated_at, sync_status, version)
      VALUES (?, 'Integration High School', 'IHS', 'admin@ihs.edu', datetime('now'), datetime('now'), 'synced', 1)
    `).run(schoolId)

    const level = repos.academicLevels.create({
      school_id: schoolId,
      name: 'Grade 10',
      short_name: 'G10',
      category: 'upper_secondary',
      sort_order: 1,
      is_active: 1,
    })

    const cls = repos.classes.create({
      school_id: schoolId,
      name: 'Grade 10A',
      level: '10',
      form_key: 'G10',
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

    // Clear queue so we test student lifecycle cleanly
    db.prepare(`DELETE FROM sync_queue`).run()
  })

  afterEach(() => {
    db.close()
  })

  test('End-to-end: SQLite student -> sync_queue -> Supabase -> public.students -> sync_changes -> acknowledgement -> local sync_queue.status = synced', async () => {
    // STEP 1: Create student in local SQLite
    const student = repos.students.create({
      school_id: schoolId,
      name: 'Marcus Aurelius',
      class_id: classId,
      student_code: 'IHS-0001',
      admission_year: 2026,
      sequence_number: 1,
      gender: 'male',
      date_of_birth: '2010-04-26',
    })

    expect(student.id).toBeTruthy()
    expect(student.student_code).toBe('IHS-0001')

    // Verify it was enqueued locally as pending
    const localPending = db
      .prepare(`SELECT * FROM sync_queue WHERE record_id = ?`)
      .get(student.id) as any
    expect(localPending.status).toBe('pending')
    expect(localPending.operation).toBe('INSERT')

    // STEP 2: Execute push sync against real PostgreSQL
    const pushResult = await pushPendingSync({
      db,
      schoolId,
      client: pgClient,
    })

    expect(pushResult.successful).toBe(1)
    expect(pushResult.failed).toBe(0)
    expect(pushResult.conflicts).toBe(0)

    // STEP 3: Verify local SQLite sync_queue row marked 'synced'
    const localSynced = db
      .prepare(`SELECT * FROM sync_queue WHERE record_id = ?`)
      .get(student.id) as any
    expect(localSynced.status).toBe('synced')
    expect(localSynced.last_attempt_at).toBeTruthy()

    // STEP 4: Verify student in cloud public.students
    const cloudStudentRaw = pgClient.query(`
      SELECT row_to_json(s) FROM public.students s WHERE id = '${student.id}';
    `)
    const cloudStudent = JSON.parse(cloudStudentRaw)

    expect(cloudStudent.id).toBe(student.id) // DIRECT 1:1 UUID PRESERVATION!
    expect(cloudStudent.school_id).toBe(schoolId)
    expect(cloudStudent.student_code).toBe('IHS-0001')
    expect(cloudStudent.sequence_number).toBe(1)
    expect(cloudStudent.admission_year).toBe(2026)
    expect(cloudStudent.name).toBe('Marcus Aurelius')
    expect(cloudStudent.gender).toBe('male')
    expect(cloudStudent.date_of_birth).toBe('2010-04-26')
    expect(cloudStudent.deleted_at).toBeNull()

    // STEP 5: Verify cloud sync_changes has exactly 1 entry for this insert
    const cloudChangesRaw = pgClient.query(`
      SELECT json_agg(c) FROM public.sync_changes c WHERE record_id = '${student.id}';
    `)
    const cloudChanges = JSON.parse(cloudChangesRaw)
    expect(cloudChanges.length).toBe(1)
    expect(cloudChanges[0].operation).toBe('INSERT')
    expect(cloudChanges[0].table_name).toBe('students')
    expect(cloudChanges[0].payload.name).toBe('Marcus Aurelius')

    // STEP 6: Test student UPDATE end-to-end
    repos.students.update(student.id, {
      name: 'Marcus Aurelius Antoninus',
    })

    const updatePush = await pushPendingSync({
      db,
      schoolId,
      client: pgClient,
    })
    expect(updatePush.successful).toBe(1)

    const updatedCloudRaw = pgClient.query(`
      SELECT row_to_json(s) FROM public.students s WHERE id = '${student.id}';
    `)
    const updatedCloud = JSON.parse(updatedCloudRaw)
    expect(updatedCloud.name).toBe('Marcus Aurelius Antoninus')
    expect(updatedCloud.student_code).toBe('IHS-0001') // IMMUTABLE!
    expect(Number(updatedCloud.version)).toBe(2)

    // STEP 7: Test student DELETE (soft delete) end-to-end
    repos.students.delete(student.id)

    const deletePush = await pushPendingSync({
      db,
      schoolId,
      client: pgClient,
    })
    expect(deletePush.successful).toBe(1)

    const deletedCloudRaw = pgClient.query(`
      SELECT row_to_json(s) FROM public.students s WHERE id = '${student.id}';
    `)
    const deletedCloud = JSON.parse(deletedCloudRaw)
    expect(deletedCloud.deleted_at).not.toBeNull()
    expect(deletedCloud.student_code).toBe('IHS-0001') // PRESERVED!

    // Verify all 3 changes in sync_changes
    const allChangesRaw = pgClient.query(`
      SELECT json_agg(c ORDER BY id ASC) FROM public.sync_changes c WHERE record_id = '${student.id}';
    `)
    const allChanges = JSON.parse(allChangesRaw)
    expect(allChanges.length).toBe(3)
    expect(allChanges[0].operation).toBe('INSERT')
    expect(allChanges[1].operation).toBe('UPDATE')
    expect(allChanges[2].operation).toBe('DELETE')
  })
})
