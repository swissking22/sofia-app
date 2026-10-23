import { SystemAdminService } from '../../main/services/system-admin'
import {
  accountAllowsLogin,
  assertUserDeletable,
  auditIsMutable,
  buildPermissionMatrix,
  inferCoarseRole,
  isWritePermission,
  moduleFromAction,
  parseAuditPayload,
  restoreWarning,
} from '../../main/domain/system-admin'

describe('System admin users', () => {
  const svc = new SystemAdminService()

  it('creates a school-scoped user with a hashed-ready password policy', () => {
    const user = svc.createUser({
      email: 'bursar@greenfield.demo',
      first_name: 'Amina',
      last_name: 'Tabe',
      role_id: 'role_1',
      school_id: 'sch_a',
      permission_names: ['finance.read', 'finance.record_payment'],
      password: 'Sofia@Demo1',
    })
    expect(user.email).toBe('bursar@greenfield.demo')
    expect(user.display_name).toBe('Amina Tabe')
    expect(user.role).toBe('bursar')
    expect(user.status).toBe('active')
  })

  it('blocks self-delete and last active admin delete', () => {
    expect(() =>
      assertUserDeletable({
        actorUserId: 'u1',
        targetUserId: 'u1',
        targetRole: 'teacher',
        remainingActiveAdminsIfDeleted: 0,
      })
    ).toThrow(/cannot delete your own/i)

    expect(() =>
      assertUserDeletable({
        actorUserId: 'u1',
        targetUserId: 'u2',
        targetRole: 'admin',
        remainingActiveAdminsIfDeleted: 0,
      })
    ).toThrow(/last active administrator/i)

    expect(() =>
      assertUserDeletable({
        actorUserId: 'u1',
        targetUserId: 'u2',
        targetRole: 'admin',
        remainingActiveAdminsIfDeleted: 1,
      })
    ).not.toThrow()

    expect(() =>
      assertUserDeletable({
        actorUserId: 'u1',
        targetUserId: 'u3',
        targetRole: 'teacher',
        remainingActiveAdminsIfDeleted: 0,
      })
    ).not.toThrow()
  })

  it('rejects weak passwords and missing school', () => {
    expect(() =>
      svc.createUser({
        email: 'a@b.c',
        first_name: 'A',
        last_name: 'B',
        role_id: 'r',
        school_id: 's',
        permission_names: [],
        password: 'short',
      })
    ).toThrow(/at least/)
    expect(() =>
      svc.createUser({
        email: 'a@b.c',
        first_name: 'A',
        last_name: 'B',
        role_id: 'r',
        school_id: '',
        permission_names: [],
        password: 'Sofia@Demo1',
      })
    ).toThrow(/school/)
  })

  it('deactivates instead of deleting', () => {
    expect(svc.deactivate('active')).toBe('inactive')
  })

  it('isolates coarse role from permissions (school A vs B is a data concern)', () => {
    // Read-only → board (not teacher), so desktop login stays open for observers.
    expect(inferCoarseRole(['students.read'])).toBe('board')
    expect(inferCoarseRole(['system.users.view'])).toBe('board')
    expect(inferCoarseRole(['system.users.create'])).toBe('admin')
    expect(inferCoarseRole(['finance.record_payment'])).toBe('bursar')
    // Classroom write without admin ops → teacher (blocked on desktop login).
    expect(inferCoarseRole(['results.enter', 'attendance.mark'])).toBe(
      'teacher',
    )
    // VP / registrar style: staff/student writes beat classroom → secretary.
    expect(
      inferCoarseRole([
        'students.update',
        'staff.create',
        'results.enter',
        'attendance.mark',
      ]),
    ).toBe('secretary')
  })
})

describe('Roles and permissions', () => {
  it('builds a dynamic permission matrix', () => {
    const matrix = buildPermissionMatrix(
      [
        {
          id: 'p1',
          name: 'students.read',
          label: 'View students',
          module_key: 'students',
          module_label: 'Students',
        },
        {
          id: 'p2',
          name: 'students.update',
          label: 'Edit students',
          module_key: 'students',
          module_label: 'Students',
        },
      ],
      [
        { id: 'admin', permission_ids: ['p1', 'p2'] },
        { id: 'teacher', permission_ids: ['p1'] },
      ]
    )
    expect(matrix[0].roles.admin).toBe(true)
    expect(matrix[1].roles.teacher).toBe(false)
  })

  it('treats view/read as non-write for read-only roles', () => {
    expect(isWritePermission('students.read')).toBe(false)
    expect(isWritePermission('students.create')).toBe(true)
  })

  it('denies login for inactive accounts and lockout', () => {
    const svc = new SystemAdminService()
    expect(accountAllowsLogin('inactive')).toBe(false)
    const locked = svc.assertLogin({
      status: 'active',
      locked_until: new Date(Date.now() + 60_000).toISOString(),
      failed_count: 5,
      passwordOk: true,
      maxAttempts: 5,
      lockMinutes: 15,
    })
    expect(locked.ok).toBe(false)
    const fail = svc.assertLogin({
      status: 'active',
      locked_until: null,
      failed_count: 4,
      passwordOk: false,
      maxAttempts: 5,
      lockMinutes: 15,
    })
    expect(fail.ok).toBe(false)
    if (!fail.ok) expect(fail.locked_until).toBeTruthy()
  })
})

describe('Audit', () => {
  it('records before/after and is append-only', () => {
    const parsed = parseAuditPayload(
      JSON.stringify({
        description: 'Fee amount changed',
        before: { amount: 100000 },
        after: { amount: 120000 },
      })
    )
    expect(parsed.before).toEqual({ amount: 100000 })
    expect(parsed.after).toEqual({ amount: 120000 })
    expect(auditIsMutable()).toBe(false)
    expect(moduleFromAction('payment.record')).toBe('Finance')
  })
})

describe('Backup and sync', () => {
  it('requires explicit RESTORE confirmation', () => {
    const svc = new SystemAdminService()
    expect(() => svc.confirmRestore('yes')).toThrow(/RESTORE/)
    expect(() => svc.confirmRestore('RESTORE')).not.toThrow()
    expect(restoreWarning()).toMatch(/replace the current local database/)
  })
})
