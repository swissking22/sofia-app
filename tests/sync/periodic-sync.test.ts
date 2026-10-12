import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import {
  flushPeriodicSyncForTests,
  readPeriodicSyncPrefs,
  runPeriodicSyncTickForTests,
  startPeriodicSync,
  stopPeriodicSync,
} from '../../main/sync/periodic-sync'

describe('periodic background sync', () => {
  let db: Database.Database
  let schoolId: string
  let runSyncCalls: Array<{ schoolId: string }>

  beforeEach(() => {
    stopPeriodicSync()
    runSyncCalls = []
    db = new Database(':memory:')
    createSchema(db)
    const repos = createRepositories(db)
    const school = repos.schools.create({
      name: 'Periodic Sync School',
      short_code: 'PSS',
      email: 'admin@pss.school',
    })
    schoolId = school.id
    repos.systemAdmin.ensureSettings(schoolId)
  })

  afterEach(async () => {
    await flushPeriodicSyncForTests()
    stopPeriodicSync()
    db.close()
  })

  const fakeRunSync = async (
    _db: Database.Database,
    options: { schoolId: string }
  ) => {
    runSyncCalls.push({ schoolId: options.schoolId })
    return { ok: true, processed: 2, failed: 0, hasMore: false }
  }

  it('reads auto_sync prefs (enabled by default for new schools)', () => {
    const prefs = readPeriodicSyncPrefs(db)
    expect(prefs?.schoolId).toBe(schoolId)
    expect(prefs?.enabled).toBe(true)
    expect(prefs?.intervalMinutes).toBe(30)
  })

  it('skips the tick when offline', async () => {
    await runPeriodicSyncTickForTests({
      getDb: () => db,
      isOnline: () => false,
      runSync: fakeRunSync,
    })
    expect(runSyncCalls).toHaveLength(0)
  })

  it('skips the tick when auto_sync is off', async () => {
    createRepositories(db).systemAdmin.saveSettings(schoolId, {
      auto_sync: false,
    })
    await runPeriodicSyncTickForTests({
      getDb: () => db,
      isOnline: () => true,
      runSync: fakeRunSync,
    })
    expect(runSyncCalls).toHaveLength(0)
  })

  it('runs a quiet sync when online and auto_sync is on', async () => {
    await runPeriodicSyncTickForTests({
      getDb: () => db,
      isOnline: () => true,
      runSync: fakeRunSync,
    })
    expect(runSyncCalls).toEqual([{ schoolId }])
  })

  it('startPeriodicSync schedules without throwing', () => {
    expect(() =>
      startPeriodicSync({
        getDb: () => db,
        isOnline: () => false,
        runSync: fakeRunSync,
      })
    ).not.toThrow()
    stopPeriodicSync()
  })

  it('one-time migration enables auto_sync on existing off rows', () => {
    createRepositories(db).systemAdmin.saveSettings(schoolId, {
      auto_sync: false,
    })
    // Simulate an older DB that never got the one-time flip
    db.prepare(`DELETE FROM sofia_local_migrations WHERE id = ?`).run(
      'periodic_auto_sync_on'
    )
    createSchema(db)
    const prefs = readPeriodicSyncPrefs(db)
    expect(prefs?.enabled).toBe(true)
  })
})
