import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import {
  getSyncSessionStatus,
  resetSyncSessionForTests,
  runBackgroundSync,
} from '../../main/sync/session'

describe('background sync session', () => {
  let db: Database.Database
  let schoolId: string

  beforeEach(() => {
    resetSyncSessionForTests()
    db = new Database(':memory:')
    createSchema(db)
    const repos = createRepositories(db)
    const school = repos.schools.create({
      name: 'Session Sync School',
      short_code: 'SSS',
      email: 'admin@sss.school',
    })
    schoolId = school.id
  })

  afterEach(() => {
    resetSyncSessionForTests()
    db.close()
  })

  it('reports inactive status when idle', () => {
    expect(getSyncSessionStatus()).toEqual({
      active: false,
      trigger: null,
      schoolId: null,
      progress: null,
      startedAt: null,
    })
  })

  it('joins a concurrent run for the same school', async () => {
    const first = runBackgroundSync(db, {
      schoolId,
      trigger: 'manual',
      skipPush: true,
      skipPull: true,
    })
    // Second call immediately — must share the same promise while the first is open.
    const second = runBackgroundSync(db, {
      schoolId,
      trigger: 'periodic',
    })

    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(b)
    expect(getSyncSessionStatus().active).toBe(false)
    expect(getSyncSessionStatus().progress?.phase).toBe('done')
  })
})

