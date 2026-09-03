import { SystemAdminService } from '../../main/services/system-admin'
import {
  accountAllowsLogin,
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
    expect(user.role).toBe('secretary')
    expect(user.status).toBe('active')
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
    expect(inferCoarseRole(['students.read'])).toBe('teacher')
    expect(inferCoarseRole(['system.users.view'])).toBe('admin')
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
