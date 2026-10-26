import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { hashPassword } from '../../main/auth'

describe('admin user name edit + permanent role delete', () => {
  let db: Database.Database
  let repos: ReturnType<typeof createRepositories>
  let schoolId: string

  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
    repos = createRepositories(db)
    const school = repos.schools.create({
      name: 'LIWMAIC Test',
      email: 'admin@liwmaic.test',
      phone: '670000000',
      address: 'Douala',
    })
    schoolId = school.id
    repos.roles.ensureDefaults(schoolId)
  })

  afterEach(() => {
    db.close()
  })

  it('patchUser updates name and enqueues users UPDATE for sync', async () => {
    const teacherRole = repos.roles
      .listBySchool(schoolId)
      .find((r) => r.name === 'Teacher')
    expect(teacherRole).toBeTruthy()

    const userId = randomUUID()
    const hash = await hashPassword('Sofia@Demo1')
    repos.systemAdmin.insertUser({
      id: userId,
      school_id: schoolId,
      email: 'jane@liwmaic.test',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: null,
      role: 'teacher',
      role_id: teacherRole!.id,
      status: 'active',
      staff_id: null,
      password_hash: hash,
      must_change_password: 0,
    })

    repos.systemAdmin.patchUser(schoolId, userId, {
      first_name: 'Janet',
      last_name: 'Nkeng',
    })

    const updated = repos.systemAdmin.getUser(schoolId, userId)
    expect(updated?.user.first_name).toBe('Janet')
    expect(updated?.user.last_name).toBe('Nkeng')

    const queued = db
      .prepare(
        `SELECT operation, payload FROM sync_queue
         WHERE table_name = 'users' AND record_id = ? AND operation = 'UPDATE'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(userId) as { operation: string; payload: string } | undefined
    expect(queued?.operation).toBe('UPDATE')
    const payload = JSON.parse(queued!.payload) as {
      first_name: string
      last_name: string
    }
    expect(payload.first_name).toBe('Janet')
    expect(payload.last_name).toBe('Nkeng')
  })

  it('softDeleteRole removes custom role + permissions and blocks system/assigned roles', async () => {
    const financeRead = repos.roles
      .listAllPermissions()
      .find((p) => p.name === 'finance.read')
    expect(financeRead).toBeTruthy()

    const custom = repos.roles.createRole(schoolId, {
      name: 'Extra Clerk (Copy)',
      description: 'duplicate to remove',
      permission_ids: [financeRead!.id],
    })
    expect(repos.roles.getDetail(custom.id)?.permission_count).toBe(1)

    repos.roles.softDeleteRole(custom.id)
    expect(repos.roles.findById(custom.id)).toBeUndefined()
    expect(
      repos.roles.listBySchool(schoolId).some((r) => r.id === custom.id)
    ).toBe(false)

    const rp = db
      .prepare(
        `SELECT deleted_at FROM role_permissions WHERE role_id = ?`
      )
      .all(custom.id) as Array<{ deleted_at: string | null }>
    expect(rp.length).toBeGreaterThan(0)
    expect(rp.every((row) => row.deleted_at != null)).toBe(true)

    const roleQueue = db
      .prepare(
        `SELECT operation FROM sync_queue
         WHERE table_name = 'roles' AND record_id = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(custom.id) as { operation: string } | undefined
    expect(roleQueue?.operation).toBe('DELETE')

    const systemRole = repos.roles
      .listBySchool(schoolId)
      .find((r) => r.is_system)
    expect(systemRole).toBeTruthy()
    expect(() => repos.roles.softDeleteRole(systemRole!.id)).toThrow(
      /system roles cannot be deleted/i
    )

    const assigned = repos.roles.createRole(schoolId, {
      name: 'Desk Clerk',
      description: 'has a user',
      permission_ids: [financeRead!.id],
    })
    const userId = randomUUID()
    const hash = await hashPassword('Sofia@Demo1')
    repos.systemAdmin.insertUser({
      id: userId,
      school_id: schoolId,
      email: 'clerk@liwmaic.test',
      first_name: 'C',
      last_name: 'User',
      phone: null,
      role: 'secretary',
      role_id: assigned.id,
      status: 'active',
      staff_id: null,
      password_hash: hash,
      must_change_password: 0,
    })
    expect(() => repos.roles.softDeleteRole(assigned.id)).toThrow(
      /cannot delete role while/i
    )
  })
})
