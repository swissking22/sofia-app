import Database from 'better-sqlite3'
import {
  countReadyPendingSyncItems,
  enqueueSync,
  getPendingSyncItems,
} from '../../main/sync/queue'

function memoryDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL
    );
  `)
  return db
}

describe('sync queue drain helpers', () => {
  it('prioritizes staff_subjects ahead of invoice_lines', () => {
    const db = memoryDb()
    enqueueSync(db, 'invoice_lines', 'inv_1', 'INSERT', {
      id: 'inv_1',
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    enqueueSync(db, 'staff_subjects', 'ss_1', 'INSERT', {
      id: 'ss_1',
      updated_at: '2026-01-02T00:00:00.000Z',
    })
    // Make finance older so created_at alone would pick it first
    db.prepare(
      `UPDATE sync_queue SET created_at = '2026-01-01T00:00:00.000Z' WHERE table_name = 'invoice_lines'`
    ).run()
    db.prepare(
      `UPDATE sync_queue SET created_at = '2026-01-02T00:00:00.000Z' WHERE table_name = 'staff_subjects'`
    ).run()

    const batch = getPendingSyncItems(db, 1)
    expect(batch).toHaveLength(1)
    expect(batch[0].table_name).toBe('staff_subjects')
    expect(countReadyPendingSyncItems(db)).toBe(2)
  })

  it('drains RBAC then staff before academics and finance', () => {
    const db = memoryDb()
    const rows: Array<[string, string]> = [
      ['invoice_lines', 'inv_1'],
      ['academic_years', 'ay_1'],
      ['staff_subjects', 'ss_1'],
      ['staff', 'st_1'],
      ['users', 'u_1'],
      ['role_permissions', 'rp_1'],
      ['roles', 'r_1'],
      ['permissions', 'p_1'],
      ['schools', 'sch_1'],
    ]
    for (const [table, id] of rows) {
      enqueueSync(db, table, id, 'INSERT', {
        id,
        updated_at: '2026-01-01T00:00:00.000Z',
      })
    }
    // Oldest created_at on finance — priority must still win
    db.prepare(
      `UPDATE sync_queue SET created_at = '2025-01-01T00:00:00.000Z' WHERE table_name = 'invoice_lines'`
    ).run()

    const ordered = getPendingSyncItems(db, 20).map((r) => r.table_name)
    expect(ordered.slice(0, 5)).toEqual([
      'schools',
      'permissions',
      'roles',
      'role_permissions',
      'users',
    ])
    expect(ordered.indexOf('staff')).toBeGreaterThan(-1)
    expect(ordered.indexOf('staff_subjects')).toBeGreaterThan(-1)
    expect(ordered.indexOf('users')).toBeLessThan(ordered.indexOf('staff'))
    expect(ordered.indexOf('staff')).toBeLessThan(ordered.indexOf('academic_years'))
    expect(ordered.indexOf('staff_subjects')).toBeLessThan(
      ordered.indexOf('academic_years')
    )
    expect(ordered.indexOf('staff_subjects')).toBeLessThan(
      ordered.indexOf('invoice_lines')
    )
  })
})
