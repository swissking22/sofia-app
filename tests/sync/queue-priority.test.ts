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
})
