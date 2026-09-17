import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { applyGenericPulledChange } from '../../main/sync/apply-generic'
import { applyPulledChangesTransaction } from '../../main/sync/pull'
import { SUPPORTED_SYNC_TABLES, isGenericSyncTable } from '../../main/sync/tables'
import { getOrCreateDeviceId, resetDeviceStoreForTests } from '../../main/sync/device'

describe('Multi-desk sync MVP registry', () => {
  it('includes foundation, RBAC, and staff tables', () => {
    expect(SUPPORTED_SYNC_TABLES).toContain('students')
    expect(SUPPORTED_SYNC_TABLES).toContain('classes')
    expect(SUPPORTED_SYNC_TABLES).toContain('users')
    expect(SUPPORTED_SYNC_TABLES).toContain('roles')
    expect(SUPPORTED_SYNC_TABLES).toContain('staff')
    expect(SUPPORTED_SYNC_TABLES).toContain('invoices')
    expect(SUPPORTED_SYNC_TABLES).toContain('payments')
    expect(SUPPORTED_SYNC_TABLES).toContain('finance_settings')
    expect(isGenericSyncTable('timetable_slots')).toBe(false)
    expect(isGenericSyncTable('roles')).toBe(true)
  })
})

describe('Generic pull apply', () => {
  let db: Database.Database
  const schoolId = '11111111-1111-1111-1111-111111111111'

  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO schools (
        id, name, email, school_code, short_code,
        created_at, updated_at, sync_status, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', 1)`
    ).run(schoolId, 'Test School', 'a@test.com', 'TST', 'TST', now, now)
  })

  afterEach(() => {
    db.close()
  })

  it('inserts a class from a remote change', () => {
    const result = applyGenericPulledChange(
      db,
      {
        table_name: 'classes',
        record_id: 'class-1',
        operation: 'INSERT',
        version: 1,
        payload: {
          id: 'class-1',
          name: 'Form 1A',
          school_id: schoolId,
          is_active: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 1,
        },
      },
      schoolId
    )
    expect(result).toBe('applied')
    const row = db.prepare(`SELECT name FROM classes WHERE id = ?`).get('class-1') as {
      name: string
    }
    expect(row.name).toBe('Form 1A')
    const queued = db
      .prepare(`SELECT COUNT(*) AS c FROM sync_queue WHERE record_id = ?`)
      .get('class-1') as { c: number }
    expect(queued.c).toBe(0)
  })

  it('skips stale remote versions', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO roles (
        id, school_id, name, description, is_system,
        created_at, updated_at, sync_status, version
      ) VALUES (?, ?, 'Bursar', NULL, 0, ?, ?, 'synced', 3)`
    ).run('role-1', schoolId, now, now)

    const result = applyGenericPulledChange(
      db,
      {
        table_name: 'roles',
        record_id: 'role-1',
        operation: 'UPDATE',
        version: 2,
        payload: {
          id: 'role-1',
          school_id: schoolId,
          name: 'Old',
          version: 2,
          updated_at: now,
        },
      },
      schoolId
    )
    expect(result).toBe('skipped')
    const row = db.prepare(`SELECT name, version FROM roles WHERE id = ?`).get('role-1') as {
      name: string
      version: number
    }
    expect(row.name).toBe('Bursar')
    expect(row.version).toBe(3)
  })

  it('remaps local permission ids when remote catalog wins by name', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO permissions (
        id, name, label, module_key, module_label,
        created_at, updated_at, sync_status, version
      ) VALUES ('local-perm', 'students.read', 'View students', 'students', 'Students', ?, ?, 'synced', 1)`
    ).run(now, now)
    db.prepare(
      `INSERT INTO roles (
        id, school_id, name, is_system, created_at, updated_at, sync_status, version
      ) VALUES ('role-x', ?, 'Secretary', 0, ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)
    db.prepare(
      `INSERT INTO role_permissions (
        id, role_id, permission_id, created_at, updated_at, sync_status, version
      ) VALUES ('rp-1', 'role-x', 'local-perm', ?, ?, 'synced', 1)`
    ).run(now, now)

    const result = applyGenericPulledChange(
      db,
      {
        table_name: 'permissions',
        record_id: 'remote-perm',
        operation: 'INSERT',
        version: 1,
        payload: {
          id: 'remote-perm',
          name: 'students.read',
          label: 'View students',
          module_key: 'students',
          module_label: 'Students',
          created_at: now,
          updated_at: now,
          version: 1,
        },
      },
      schoolId
    )
    expect(result).toBe('applied')
    const rp = db
      .prepare(`SELECT permission_id FROM role_permissions WHERE id = ?`)
      .get('rp-1') as { permission_id: string }
    expect(rp.permission_id).toBe('remote-perm')
    const localGone = db
      .prepare(`SELECT id FROM permissions WHERE id = 'local-perm'`)
      .get()
    expect(localGone).toBeUndefined()
  })

  it('applies users with password_hash via batch transaction', () => {
    resetDeviceStoreForTests('dddddddd-dddd-dddd-dddd-dddddddddddd')
    const deviceId = getOrCreateDeviceId()
    const now = new Date().toISOString()
    const stats = applyPulledChangesTransaction(
      db,
      [
        {
          id: 10,
          school_id: schoolId,
          table_name: 'roles',
          record_id: 'role-admin',
          operation: 'INSERT',
          payload: {
            id: 'role-admin',
            school_id: schoolId,
            name: 'Principal',
            is_system: 1,
            created_at: now,
            updated_at: now,
            version: 1,
          },
          version: 1,
          created_at: now,
        },
        {
          id: 11,
          school_id: schoolId,
          table_name: 'users',
          record_id: 'user-1',
          operation: 'INSERT',
          payload: {
            id: 'user-1',
            school_id: schoolId,
            email: 'bursar@school.test',
            password_hash: '$2a$10$hashed',
            role: 'secretary',
            role_id: 'role-admin',
            first_name: 'Bea',
            last_name: 'Ursar',
            status: 'active',
            created_at: now,
            updated_at: now,
            version: 1,
          },
          version: 1,
          created_at: now,
        },
      ],
      schoolId,
      deviceId,
      11
    )
    expect(stats.applied).toBe(2)
    const user = db.prepare(`SELECT email, password_hash FROM users WHERE id = ?`).get('user-1') as {
      email: string
      password_hash: string
    }
    expect(user.email).toBe('bursar@school.test')
    expect(user.password_hash).toBe('$2a$10$hashed')
  })

  it('merges finance_settings counters with MAX(local, remote)', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO finance_settings (
        id, school_id, currency, payment_methods, receipt_prefix, receipt_next_number,
        invoice_prefix, invoice_next_number, payment_prefix, payment_next_number,
        expense_prefix, expense_next_number,
        created_at, updated_at, sync_status, version
      ) VALUES (
        'fs-1', ?, 'XAF', '[]', 'RCP', 5,
        'INV', 12, 'PAY', 3,
        'EXP', 2,
        ?, ?, 'synced', 1
      )`
    ).run(schoolId, now, now)

    const result = applyGenericPulledChange(
      db,
      {
        table_name: 'finance_settings',
        record_id: 'fs-1',
        operation: 'UPDATE',
        version: 2,
        payload: {
          id: 'fs-1',
          school_id: schoolId,
          currency: 'XAF',
          invoice_next_number: 8,
          receipt_next_number: 20,
          payment_next_number: 1,
          expense_next_number: 9,
          updated_at: now,
          version: 2,
        },
      },
      schoolId
    )
    expect(result).toBe('applied')
    const row = db
      .prepare(
        `SELECT invoice_next_number, receipt_next_number, payment_next_number, expense_next_number, version
         FROM finance_settings WHERE id = ?`
      )
      .get('fs-1') as Record<string, number>
    expect(row.invoice_next_number).toBe(12) // max(12, 8)
    expect(row.receipt_next_number).toBe(20) // max(5, 20)
    expect(row.payment_next_number).toBe(3) // max(3, 1)
    expect(row.expense_next_number).toBe(9) // max(2, 9)
    expect(row.version).toBe(2)
  })

  it('upserts invoice rows without re-enqueue', () => {
    const now = new Date().toISOString()
    const studentId = 'stu-fin-1'
    db.prepare(
      `INSERT INTO classes (
        id, name, school_id, is_active, created_at, updated_at, sync_status, version
      ) VALUES ('class-fin', 'F1A', ?, 1, ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)
    db.prepare(
      `INSERT INTO students (
        id, name, class_id, school_id, status, created_at, updated_at, sync_status, version
      ) VALUES (?, 'Ada', 'class-fin', ?, 'active', ?, ?, 'synced', 1)`
    ).run(studentId, schoolId, now, now)

    const result = applyGenericPulledChange(
      db,
      {
        table_name: 'invoices',
        record_id: 'inv-1',
        operation: 'INSERT',
        version: 1,
        payload: {
          id: 'inv-1',
          school_id: schoolId,
          student_id: studentId,
          invoice_number: 'INV-0001',
          issue_date: '2026-09-01',
          status: 'pending',
          subtotal: 10000,
          discount_total: 0,
          net_payable: 10000,
          amount_paid: 0,
          balance: 10000,
          created_at: now,
          updated_at: now,
          version: 1,
        },
      },
      schoolId
    )
    expect(result).toBe('applied')
    const inv = db
      .prepare(`SELECT invoice_number, balance FROM invoices WHERE id = ?`)
      .get('inv-1') as { invoice_number: string; balance: number }
    expect(inv.invoice_number).toBe('INV-0001')
    expect(inv.balance).toBe(10000)
    const queued = db
      .prepare(`SELECT COUNT(*) AS c FROM sync_queue WHERE record_id = 'inv-1'`)
      .get() as { c: number }
    expect(queued.c).toBe(0)
  })
})
