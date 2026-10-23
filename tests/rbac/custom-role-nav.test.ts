import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { filterNavSections, NAV_SECTIONS } from '../../renderer/lib/navigation'
import { hashPassword } from '../../main/auth'
import {
  getSessionPermissionNames,
  isUnrestrictedAdminSession,
  sessionCanAny,
} from '../../main/rbac/session-access'

describe('custom role desktop module visibility', () => {
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

  it('limits sidebar modules to the custom role permissions even when coarse role is admin', async () => {
    const school = repos.schools.create({
      name: 'Custom Role School',
      email: 'owner@custom.test',
      phone: '670000000',
      address: 'Douala',
    })
    repos.roles.ensureDefaults(school.id)

    const financeRead = repos.roles
      .listAllPermissions()
      .find((p) => p.name === 'finance.read')
    const usersCreate = repos.roles
      .listAllPermissions()
      .find((p) => p.name === 'system.users.create')
    const usersView = repos.roles
      .listAllPermissions()
      .find((p) => p.name === 'system.users.view')
    expect(financeRead && usersCreate && usersView).toBeTruthy()

    // system.users.create makes inferCoarseRole → admin, which previously
    // unlocked the entire sidebar. Permissions here are only finance + users.
    const custom = repos.roles.createRole(school.id, {
      name: 'Fee Desk Lead',
      description: 'Limited custom role',
      permission_ids: [financeRead!.id, usersCreate!.id, usersView!.id],
    })

    const hash = await hashPassword('Sofia@Demo1')
    const user = repos.users.create({
      school_id: school.id,
      email: 'feedesk@custom.test',
      password_hash: hash,
      role: 'admin',
      role_id: custom.id,
      first_name: 'Fee',
      last_name: 'Desk',
    })

    const session = {
      userId: user.id,
      role: 'admin',
      schoolId: school.id,
    }

    expect(isUnrestrictedAdminSession(repos, session)).toBe(false)
    const perms = getSessionPermissionNames(repos, session)
    expect(perms.sort()).toEqual(
      ['finance.read', 'system.users.create', 'system.users.view'].sort(),
    )
    expect(sessionCanAny(repos, session, ['finance.read'])).toBe(true)
    expect(sessionCanAny(repos, session, ['staff.create'])).toBe(false)

    const labels = filterNavSections(NAV_SECTIONS, perms).flatMap((s) =>
      s.items.map((i) => i.label)
    )
    expect(labels).toContain('Dashboard')
    expect(labels).toContain('Finance & Fees')
    expect(labels).toContain('System Administration')
    expect(labels).not.toContain('Student Management')
    expect(labels).not.toContain('Staff Management')
    expect(labels).not.toContain('Academic Management')
  })

  it('keeps founding owner unrestricted when admin has no role_id', async () => {
    const school = repos.schools.create({
      name: 'Owner School',
      email: 'owner@owner.test',
      phone: '670000001',
      address: 'Yaounde',
    })
    const hash = await hashPassword('Sofia@Demo1')
    const owner = repos.users.create({
      school_id: school.id,
      email: 'owner@owner.test',
      password_hash: hash,
      role: 'admin',
      first_name: 'School',
      last_name: 'Owner',
    })

    const session = {
      userId: owner.id,
      role: 'admin',
      schoolId: school.id,
    }
    expect(isUnrestrictedAdminSession(repos, session)).toBe(true)
    expect(sessionCanAny(repos, session, ['staff.create'])).toBe(true)
    expect(getSessionPermissionNames(repos, session).length).toBeGreaterThan(20)
  })

  it('Principal system role with all permissions still sees full module tree', async () => {
    const school = repos.schools.create({
      name: 'Principal School',
      email: 'p@prin.test',
      phone: '670000002',
      address: 'Douala',
    })
    repos.roles.ensureDefaults(school.id)
    const principal = repos.roles
      .listBySchool(school.id)
      .find((r) => r.name === 'Principal')
    expect(principal).toBeTruthy()

    const hash = await hashPassword('Sofia@Demo1')
    const user = repos.users.create({
      school_id: school.id,
      email: 'principal@prin.test',
      password_hash: hash,
      role: 'admin',
      role_id: principal!.id,
      first_name: 'Pat',
      last_name: 'Principal',
    })

    const session = {
      userId: user.id,
      role: 'admin',
      schoolId: school.id,
    }
    expect(isUnrestrictedAdminSession(repos, session)).toBe(false)
    const perms = getSessionPermissionNames(repos, session)
    const labels = filterNavSections(NAV_SECTIONS, perms).flatMap((s) =>
      s.items.map((i) => i.label)
    )
    expect(labels).toContain('Finance & Fees')
    expect(labels).toContain('Student Management')
    expect(labels).toContain('Staff Management')
    expect(labels).toContain('System Administration')
  })
})
