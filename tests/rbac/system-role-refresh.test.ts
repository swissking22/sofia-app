import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { filterNavSections, NAV_SECTIONS } from '../../renderer/lib/navigation'
import { hashPassword } from '../../main/auth'
import { buildDashboardSummary } from '../../main/services/dashboard.service'

describe('system role permission refresh', () => {
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

  it('repairs an existing empty Bursar system role so nav modules appear', async () => {
    const school = repos.schools.create({
      name: 'Role School',
      email: 'admin@role.test',
      phone: '670000000',
      address: 'Douala',
    })

    // First seed creates Bursar with permissions.
    repos.roles.ensureDefaults(school.id)
    const bursar = repos.roles
      .listBySchool(school.id)
      .find((r) => r.name === 'Bursar')
    expect(bursar).toBeTruthy()

    // Simulate older install: strip all role_permissions from Bursar.
    db.prepare(
      `UPDATE role_permissions SET deleted_at = ? WHERE role_id = ?`
    ).run(new Date().toISOString(), bursar!.id)
    expect(repos.roles.getDetail(bursar!.id)?.permission_names ?? []).toEqual([])

    // ensureDefaults must restore catalog permissions onto the system role.
    repos.roles.ensureDefaults(school.id)
    const names = repos.roles.getDetail(bursar!.id)?.permission_names ?? []
    expect(names).toContain('finance.read')
    expect(names).toContain('finance.record_payment')
    expect(names).toContain('students.read')

    const hash = await hashPassword('Sofia@Demo1')
    const user = repos.users.create({
      school_id: school.id,
      email: 'bursar@role.test',
      password_hash: hash,
      role: 'secretary',
      role_id: bursar!.id,
      first_name: 'Bu',
      last_name: 'Sar',
    })

    const perms = repos.roles.getPermissionNamesForUser(user.id)
    const nav = filterNavSections(NAV_SECTIONS, perms)
    const labels = nav.flatMap((s) => s.items.map((i) => i.label))
    expect(labels).toContain('Finance & Fees')
    expect(labels).toContain('Student Management')
  })

  it('dashboard summary does not fail when finance_settings are missing', () => {
    const school = repos.schools.create({
      name: 'Dash School',
      email: 'admin@dash.test',
      phone: '670000000',
      address: 'Yaounde',
    })
    const missing = db
      .prepare(
        `SELECT COUNT(*) AS n FROM finance_settings WHERE school_id = ? AND deleted_at IS NULL`
      )
      .get(school.id) as { n: number }
    expect(missing.n).toBe(0)

    const summary = buildDashboardSummary(
      db,
      repos,
      {
        userId: 'u1',
        email: 'bursar@dash.test',
        role: 'secretary',
        schoolId: school.id,
        schoolName: school.name,
      },
      {}
    )
    expect(summary.context.currency).toBe('XAF')
    const created = db
      .prepare(
        `SELECT COUNT(*) AS n FROM finance_settings WHERE school_id = ? AND deleted_at IS NULL`
      )
      .get(school.id) as { n: number }
    expect(created.n).toBe(1)
  })
})
