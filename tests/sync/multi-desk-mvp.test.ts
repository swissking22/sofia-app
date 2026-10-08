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
    expect(SUPPORTED_SYNC_TABLES).toContain('timetable_slots')
    expect(SUPPORTED_SYNC_TABLES).toContain('attendance_sessions')
    expect(SUPPORTED_SYNC_TABLES).toContain('gate_attendance')
    expect(SUPPORTED_SYNC_TABLES).toContain('result_runs')
    expect(SUPPORTED_SYNC_TABLES).toContain('report_cards')
    expect(SUPPORTED_SYNC_TABLES).toContain('document_templates')
    expect(SUPPORTED_SYNC_TABLES).toContain('issued_documents')
    expect(SUPPORTED_SYNC_TABLES).toContain('student_id_cards')
    expect(SUPPORTED_SYNC_TABLES).toContain('id_card_sequences')
    expect(SUPPORTED_SYNC_TABLES).toContain('announcements')
    expect(SUPPORTED_SYNC_TABLES).toContain('internal_notices')
    expect(SUPPORTED_SYNC_TABLES).toContain('communication_settings')
    expect(SUPPORTED_SYNC_TABLES).toContain('parent_messages')
    expect(isGenericSyncTable('backup_sync_settings')).toBe(false)
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

  it('applies users via batch transaction without importing password_hash', () => {
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
    // Credentials are never pulled from sync — pending until Auth bootstrap.
    expect(user.password_hash).toBe('!sofia-cloud-auth-pending')
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

  it('upserts attendance session + record without re-enqueue', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO classes (
        id, name, school_id, is_active, created_at, updated_at, sync_status, version
      ) VALUES ('class-att', 'F1A', ?, 1, ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)
    db.prepare(
      `INSERT INTO students (
        id, name, class_id, school_id, status, created_at, updated_at, sync_status, version
      ) VALUES ('stu-att-1', 'Ada', 'class-att', ?, 'active', ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)

    expect(
      applyGenericPulledChange(
        db,
        {
          table_name: 'attendance_sessions',
          record_id: 'sess-1',
          operation: 'INSERT',
          version: 1,
          payload: {
            id: 'sess-1',
            school_id: schoolId,
            class_id: 'class-att',
            session_date: '2026-09-17',
            created_at: now,
            updated_at: now,
            version: 1,
          },
        },
        schoolId
      )
    ).toBe('applied')

    expect(
      applyGenericPulledChange(
        db,
        {
          table_name: 'attendance_records',
          record_id: 'rec-1',
          operation: 'INSERT',
          version: 1,
          payload: {
            id: 'rec-1',
            session_id: 'sess-1',
            student_id: 'stu-att-1',
            status: 'present',
            created_at: now,
            updated_at: now,
            version: 1,
          },
        },
        schoolId
      )
    ).toBe('applied')

    const rec = db
      .prepare(`SELECT status FROM attendance_records WHERE id = ?`)
      .get('rec-1') as { status: string }
    expect(rec.status).toBe('present')
  })

  it('keeps locked result_run status when remote sends draft', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO classes (
        id, name, school_id, is_active, created_at, updated_at, sync_status, version
      ) VALUES ('class-res', 'F2A', ?, 1, ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)
    db.prepare(
      `INSERT INTO result_runs (
        id, school_id, class_id, status, created_at, updated_at, sync_status, version
      ) VALUES ('run-1', ?, 'class-res', 'locked', ?, ?, 'synced', 2)`
    ).run(schoolId, now, now)

    const result = applyGenericPulledChange(
      db,
      {
        table_name: 'result_runs',
        record_id: 'run-1',
        operation: 'UPDATE',
        version: 3,
        payload: {
          id: 'run-1',
          school_id: schoolId,
          class_id: 'class-res',
          status: 'draft',
          updated_at: now,
          version: 3,
        },
      },
      schoolId
    )
    expect(result).toBe('applied')
    const run = db
      .prepare(`SELECT status, version FROM result_runs WHERE id = ?`)
      .get('run-1') as { status: string; version: number }
    expect(run.status).toBe('locked')
    expect(run.version).toBe(3)
  })

  it('skips DELETE on locked result_runs', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO classes (
        id, name, school_id, is_active, created_at, updated_at, sync_status, version
      ) VALUES ('class-lock', 'F3A', ?, 1, ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)
    db.prepare(
      `INSERT INTO result_runs (
        id, school_id, class_id, status, created_at, updated_at, sync_status, version
      ) VALUES ('run-lock', ?, 'class-lock', 'locked', ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)

    const result = applyGenericPulledChange(
      db,
      {
        table_name: 'result_runs',
        record_id: 'run-lock',
        operation: 'DELETE',
        version: 2,
        payload: {
          id: 'run-lock',
          school_id: schoolId,
          deleted_at: now,
          version: 2,
        },
      },
      schoolId
    )
    expect(result).toBe('skipped')
    const run = db
      .prepare(`SELECT deleted_at, status FROM result_runs WHERE id = ?`)
      .get('run-lock') as { deleted_at: string | null; status: string }
    expect(run.deleted_at).toBeNull()
    expect(run.status).toBe('locked')
  })

  it('upserts report_cards payload without re-enqueue', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO classes (
        id, name, school_id, is_active, created_at, updated_at, sync_status, version
      ) VALUES ('class-rc', 'F1B', ?, 1, ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)
    db.prepare(
      `INSERT INTO students (
        id, name, class_id, school_id, status, created_at, updated_at, sync_status, version
      ) VALUES ('stu-rc-1', 'Bea', 'class-rc', ?, 'active', ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)

    const result = applyGenericPulledChange(
      db,
      {
        table_name: 'report_cards',
        record_id: 'rc-1',
        operation: 'INSERT',
        version: 1,
        payload: {
          id: 'rc-1',
          school_id: schoolId,
          student_id: 'stu-rc-1',
          class_id: 'class-rc',
          status: 'generated',
          payload: '{"average":72}',
          generated_at: now,
          created_at: now,
          updated_at: now,
          version: 1,
        },
      },
      schoolId
    )
    expect(result).toBe('applied')
    const card = db
      .prepare(`SELECT payload, status FROM report_cards WHERE id = ?`)
      .get('rc-1') as { payload: string; status: string }
    expect(card.payload).toBe('{"average":72}')
    expect(card.status).toBe('generated')
    const queued = db
      .prepare(`SELECT COUNT(*) AS c FROM sync_queue WHERE record_id = 'rc-1'`)
      .get() as { c: number }
    expect(queued.c).toBe(0)
  })

  it('merges document_number_sequences with MAX(local, remote)', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO document_number_sequences (
        id, school_id, type_code, year_key, next_number,
        created_at, updated_at, sync_status, version
      ) VALUES ('seq-doc-1', ?, 'ADM', '2026', 7, ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)

    const result = applyGenericPulledChange(
      db,
      {
        table_name: 'document_number_sequences',
        record_id: 'seq-doc-1',
        operation: 'UPDATE',
        version: 2,
        payload: {
          id: 'seq-doc-1',
          school_id: schoolId,
          type_code: 'ADM',
          year_key: '2026',
          next_number: 4,
          updated_at: now,
          version: 2,
        },
      },
      schoolId
    )
    expect(result).toBe('applied')
    const row = db
      .prepare(`SELECT next_number, version FROM document_number_sequences WHERE id = ?`)
      .get('seq-doc-1') as { next_number: number; version: number }
    expect(row.next_number).toBe(7)
    expect(row.version).toBe(2)
  })

  it('upserts document_templates without re-enqueue', () => {
    const now = new Date().toISOString()
    const result = applyGenericPulledChange(
      db,
      {
        table_name: 'document_templates',
        record_id: 'tpl-1',
        operation: 'INSERT',
        version: 1,
        payload: {
          id: 'tpl-1',
          school_id: schoolId,
          template_key: 'admission_letter',
          title: 'Admission Letter',
          header_text: 'Header',
          footer_text: 'Footer',
          document_family: 'admission',
          type_code: 'ADM',
          is_enabled: 1,
          created_at: now,
          updated_at: now,
          version: 1,
        },
      },
      schoolId
    )
    expect(result).toBe('applied')
    const tpl = db
      .prepare(`SELECT title, template_key FROM document_templates WHERE id = ?`)
      .get('tpl-1') as { title: string; template_key: string }
    expect(tpl.title).toBe('Admission Letter')
    expect(tpl.template_key).toBe('admission_letter')
    const queued = db
      .prepare(`SELECT COUNT(*) AS c FROM sync_queue WHERE record_id = 'tpl-1'`)
      .get() as { c: number }
    expect(queued.c).toBe(0)
  })

  it('merges id_card_sequences with MAX and upserts issued card metadata', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO classes (
        id, name, school_id, is_active, created_at, updated_at, sync_status, version
      ) VALUES ('class-idc', 'F1C', ?, 1, ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)
    db.prepare(
      `INSERT INTO students (
        id, name, class_id, school_id, status, created_at, updated_at, sync_status, version
      ) VALUES ('stu-idc-1', 'Cid', 'class-idc', ?, 'active', ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)
    db.prepare(
      `INSERT INTO id_card_sequences (
        id, school_id, scope_key, next_number,
        created_at, updated_at, sync_status, version
      ) VALUES ('seq-idc-1', ?, 'CARD-2026', 3, ?, ?, 'synced', 1)`
    ).run(schoolId, now, now)

    expect(
      applyGenericPulledChange(
        db,
        {
          table_name: 'id_card_sequences',
          record_id: 'seq-idc-1',
          operation: 'UPDATE',
          version: 2,
          payload: {
            id: 'seq-idc-1',
            school_id: schoolId,
            scope_key: 'CARD-2026',
            next_number: 11,
            updated_at: now,
            version: 2,
          },
        },
        schoolId
      )
    ).toBe('applied')

    const seq = db
      .prepare(`SELECT next_number FROM id_card_sequences WHERE id = ?`)
      .get('seq-idc-1') as { next_number: number }
    expect(seq.next_number).toBe(11)

    expect(
      applyGenericPulledChange(
        db,
        {
          table_name: 'student_id_cards',
          record_id: 'card-1',
          operation: 'INSERT',
          version: 1,
          payload: {
            id: 'card-1',
            school_id: schoolId,
            student_id: 'stu-idc-1',
            student_code: 'STU-001',
            academic_year_id: 'year-1',
            student_name: 'Cid',
            valid_from: '2026-09-01',
            valid_to: '2027-08-31',
            generated_at: now,
            card_number: 'IDC-0001',
            status: 'generated',
            created_at: now,
            updated_at: now,
            version: 1,
          },
        },
        schoolId
      )
    ).toBe('applied')

    const card = db
      .prepare(`SELECT card_number, student_name FROM student_id_cards WHERE id = ?`)
      .get('card-1') as { card_number: string; student_name: string }
    expect(card.card_number).toBe('IDC-0001')
    expect(card.student_name).toBe('Cid')
  })

  it('upserts internal_notices and announcements without re-enqueue', () => {
    const now = new Date().toISOString()
    expect(
      applyGenericPulledChange(
        db,
        {
          table_name: 'internal_notices',
          record_id: 'notice-1',
          operation: 'INSERT',
          version: 1,
          payload: {
            id: 'notice-1',
            school_id: schoolId,
            title: 'Staff briefing',
            body: 'Assembly at 8am',
            audience: 'all',
            priority: 'high',
            sent_at: now,
            created_at: now,
            updated_at: now,
            version: 1,
          },
        },
        schoolId
      )
    ).toBe('applied')

    expect(
      applyGenericPulledChange(
        db,
        {
          table_name: 'announcements',
          record_id: 'ann-1',
          operation: 'INSERT',
          version: 1,
          payload: {
            id: 'ann-1',
            school_id: schoolId,
            title: 'Fee reminder',
            body: 'Term fees due Friday',
            status: 'sent',
            channels_json: '["sms","internal"]',
            sent_at: now,
            created_at: now,
            updated_at: now,
            version: 1,
          },
        },
        schoolId
      )
    ).toBe('applied')

    const notice = db
      .prepare(`SELECT title, priority FROM internal_notices WHERE id = ?`)
      .get('notice-1') as { title: string; priority: string }
    expect(notice.title).toBe('Staff briefing')
    expect(notice.priority).toBe('high')

    const ann = db
      .prepare(`SELECT title, status FROM announcements WHERE id = ?`)
      .get('ann-1') as { title: string; status: string }
    expect(ann.title).toBe('Fee reminder')
    expect(ann.status).toBe('sent')

    const queued = db
      .prepare(
        `SELECT COUNT(*) AS c FROM sync_queue WHERE record_id IN ('notice-1', 'ann-1')`
      )
      .get() as { c: number }
    expect(queued.c).toBe(0)
  })
})
