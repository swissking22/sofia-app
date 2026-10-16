import Database from 'better-sqlite3'
import {
  getSetupState,
  registerAdmin,
  registerSchool,
} from '../../main/auth'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'

describe('registerAdmin cloud Auth provision', () => {
  let db: Database.Database
  let repos: ReturnType<typeof createRepositories>

  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
    repos = createRepositories(db)
  })

  afterEach(() => {
    db.close()
  })

  it('provisions founding admin Auth and keeps the local user', async () => {
    const school = registerSchool(repos, {
      schoolName: 'Auth Required School',
      phone: '670000000',
      address: 'Yaounde',
    })
    expect(school.ok).toBe(true)
    if (!school.ok) return

    let provisioned: { email: string; role: string; schoolId: string } | null =
      null
    const result = await registerAdmin(repos, {
      schoolId: school.school.id,
      email: 'founder@school.test',
      password: 'Missmn@16',
      provisionAuth: async (input) => {
        provisioned = {
          email: input.email,
          role: input.role,
          schoolId: input.schoolId,
        }
        return {
          id: 'auth-founder-1',
          email: input.email,
          created: true,
          updated: false,
        }
      },
    })

    expect(result.ok).toBe(true)
    expect(provisioned).toEqual({
      email: 'founder@school.test',
      role: 'admin',
      schoolId: school.school.id,
    })
    expect(repos.users.findByEmail('founder@school.test')).toBeTruthy()
    expect(getSetupState(repos).needsSetup).toBe(false)
  })

  it('rolls back the local admin when Auth provision fails', async () => {
    const school = registerSchool(repos, {
      schoolName: 'Auth Fail School',
      phone: '670000000',
      address: 'Yaounde',
    })
    expect(school.ok).toBe(true)
    if (!school.ok) return

    const result = await registerAdmin(repos, {
      schoolId: school.school.id,
      email: 'founder@school.test',
      password: 'Missmn@16',
      provisionAuth: async () => {
        throw new Error('Edge Function unreachable')
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/cloud login/i)
    expect(result.error).toMatch(/Edge Function unreachable/)
    expect(repos.users.findByEmail('founder@school.test')).toBeUndefined()
    expect(getSetupState(repos).needsSetup).toBe(true)
    expect(getSetupState(repos).pendingSchool?.id).toBe(school.school.id)

    const queueLeft = db
      .prepare(
        `SELECT COUNT(*) AS n FROM sync_queue WHERE table_name = 'users'`
      )
      .get() as { n: number }
    expect(queueLeft.n).toBe(0)
  })

  it('rejects passwords shorter than 8 characters before creating a user', async () => {
    const school = registerSchool(repos, {
      schoolName: 'Short Password School',
      phone: '670000000',
      address: 'Yaounde',
    })
    expect(school.ok).toBe(true)
    if (!school.ok) return

    let called = false
    const result = await registerAdmin(repos, {
      schoolId: school.school.id,
      email: 'founder@school.test',
      password: 'short1',
      provisionAuth: async () => {
        called = true
        return {
          id: 'x',
          email: 'founder@school.test',
          created: true,
          updated: false,
        }
      },
    })

    expect(result.ok).toBe(false)
    expect(called).toBe(false)
    expect(repos.users.findAll()).toHaveLength(0)
  })
})
