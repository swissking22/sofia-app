import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { SYSTEM_ROLE_SEEDS } from '../../main/rbac/catalog'
import { filterNavSections, NAV_SECTIONS } from '../../renderer/lib/navigation'
import { hashPassword } from '../../main/auth'
import { buildDashboardSummary } from '../../main/services/dashboard.service'

describe('system + custom role permission refresh', () => {
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

  it('repairs every seeded system role when permissions were stripped', () => {
    const school = repos.schools.create({
      name: 'Role School',
      email: 'admin@role.test',
      phone: '670000000',
      address: 'Douala',
    })

    repos.roles.ensureDefaults(school.id)
    const roles = repos.roles.listBySchool(school.id)
    const seededNames = SYSTEM_ROLE_SEEDS.map((s) => s.name)
    for (const name of seededNames) {
      expect(roles.some((r) => r.name === name)).toBe(true)
    }

    // Strip permissions from every system role.
    for (const role of roles.filter((r) => r.is_system)) {
      db.prepare(
        `UPDATE role_permissions SET deleted_at = ? WHERE role_id = ?`
      ).run(new Date().toISOString(), role.id)
      expect(repos.roles.getDetail(role.id)?.permission_names ?? []).toEqual([])
    }

    repos.roles.ensureDefaults(school.id)

    for (const seed of SYSTEM_ROLE_SEEDS) {
      const role = repos.roles.listBySchool(school.id).find((r) => r.name === seed.name)
      expect(role).toBeTruthy()
      const names = repos.roles.getDetail(role!.id)?.permission_names ?? []
      expect(names.length).toBeGreaterThan(0)
      if (seed.permissions !== 'all') {
        for (const required of seed.permissions.slice(0, 3)) {
          expect(names).toContain(required)
        }
      }
    }
  })

  it('repairs an empty custom role that matches a seed name (case-insensitive)', () => {
    const school = repos.schools.create({
      name: 'Custom School',
      email: 'admin@custom.test',
      phone: '670000000',
      address: 'Douala',
    })
    repos.roles.ensureDefaults(school.id)
    const financeRead = repos.roles
      .listAllPermissions()
      .find((p) => p.name === 'finance.read')
    expect(financeRead).toBeTruthy()

    // Custom role with a seed-like name, then emptied.
    const custom = repos.roles.createRole(school.id, {
      name: 'Extra Clerk',
      description: 'temp',
      permission_ids: [financeRead!.id],
    })
    db.prepare(`UPDATE roles SET name = ? WHERE id = ?`).run('bursar', custom.id)
    db.prepare(
      `UPDATE role_permissions SET deleted_at = ? WHERE role_id = ?`
    ).run(new Date().toISOString(), custom.id)
    expect(repos.roles.getDetail(custom.id)?.permission_names ?? []).toEqual([])

    repos.roles.ensureDefaults(school.id)
    const names = repos.roles.getDetail(custom.id)?.permission_names ?? []
    expect(names).toContain('finance.read')
    expect(names).toContain('students.read')
  })

  it('rejects creating or updating a custom role with zero permissions', () => {
    const school = repos.schools.create({
      name: 'Guard School',
      email: 'admin@guard.test',
      phone: '670000000',
      address: 'Douala',
    })
    repos.roles.ensureDefaults(school.id)
    const financeRead = repos.roles
      .listAllPermissions()
      .find((p) => p.name === 'finance.read')!

    expect(() =>
      repos.roles.createRole(school.id, {
        name: 'Empty Role',
        permission_ids: [],
      })
    ).toThrow(/at least one permission/i)

    const role = repos.roles.createRole(school.id, {
      name: 'Clerk',
      permission_ids: [financeRead.id],
    })
    expect(() =>
      repos.roles.updateRole(role.id, {
        name: 'Clerk',
        permission_ids: [],
      })
    ).toThrow(/at least one permission/i)
  })

  it('bursar and secretary users regain module nav after repair', async () => {
    const school = repos.schools.create({
      name: 'Nav School',
      email: 'admin@nav.test',
      phone: '670000000',
      address: 'Douala',
    })
    repos.roles.ensureDefaults(school.id)

    for (const roleName of ['Bursar', 'Secretary', 'Registrar', 'Teacher'] as const) {
      const role = repos.roles.listBySchool(school.id).find((r) => r.name === roleName)!
      db.prepare(
        `UPDATE role_permissions SET deleted_at = ? WHERE role_id = ?`
      ).run(new Date().toISOString(), role.id)
    }

    repos.roles.ensureDefaults(school.id)
    const hash = await hashPassword('Sofia@Demo1')

    const cases: Array<{ roleName: string; expectLabel: string }> = [
      { roleName: 'Bursar', expectLabel: 'Finance & Fees' },
      { roleName: 'Secretary', expectLabel: 'Student Management' },
      { roleName: 'Registrar', expectLabel: 'Student Management' },
      { roleName: 'Teacher', expectLabel: 'Academic Management' },
    ]

    for (const c of cases) {
      const role = repos.roles.listBySchool(school.id).find((r) => r.name === c.roleName)!
      const user = repos.users.create({
        school_id: school.id,
        email: `${c.roleName.toLowerCase().replace(/\s+/g, '')}@nav.test`,
        password_hash: hash,
        role: 'secretary',
        role_id: role.id,
        first_name: c.roleName,
        last_name: 'User',
      })
      const perms = repos.roles.getPermissionNamesForUser(user.id)
      const labels = filterNavSections(NAV_SECTIONS, perms).flatMap((s) =>
        s.items.map((i) => i.label)
      )
      expect(labels).toContain(c.expectLabel)
    }
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
        email: 'secretary@dash.test',
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
