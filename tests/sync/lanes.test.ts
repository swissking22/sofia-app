import Database from 'better-sqlite3'
import {
  activePushLane,
  isCriticalLaneReady,
  pushLaneMessage,
  syncLaneForTable,
} from '../../main/sync/lanes'
import {
  countReadyPendingByLane,
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

describe('sync lanes', () => {
  it('maps tables to critical / operational / bulk', () => {
    expect(syncLaneForTable('users')).toBe('critical')
    expect(syncLaneForTable('staff_subjects')).toBe('critical')
    expect(syncLaneForTable('students')).toBe('operational')
    expect(syncLaneForTable('classes')).toBe('operational')
    expect(syncLaneForTable('attendance_records')).toBe('bulk')
    expect(syncLaneForTable('invoice_lines')).toBe('bulk')
  })

  it('drains critical before operational before bulk', () => {
    const db = memoryDb()
    enqueueSync(db, 'invoice_lines', 'inv_1', 'INSERT', { id: 'inv_1' })
    enqueueSync(db, 'students', 'st_1', 'INSERT', { id: 'st_1' })
    enqueueSync(db, 'users', 'u_1', 'INSERT', { id: 'u_1' })
    db.prepare(
      `UPDATE sync_queue SET created_at = '2025-01-01T00:00:00.000Z' WHERE table_name = 'invoice_lines'`
    ).run()

    const ordered = getPendingSyncItems(db, 10).map((r) => r.table_name)
    expect(ordered).toEqual(['users', 'students', 'invoice_lines'])
  })

  it('maxLane=critical skips operational and bulk', () => {
    const db = memoryDb()
    enqueueSync(db, 'users', 'u_1', 'INSERT', { id: 'u_1' })
    enqueueSync(db, 'students', 'st_1', 'INSERT', { id: 'st_1' })
    enqueueSync(db, 'ca_scores', 'ca_1', 'INSERT', { id: 'ca_1' })

    const batch = getPendingSyncItems(db, 10, { maxLane: 'critical' })
    expect(batch.map((r) => r.table_name)).toEqual(['users'])

    const counts = countReadyPendingByLane(db)
    expect(counts.critical).toBe(1)
    expect(counts.operational).toBe(1)
    expect(counts.bulk).toBe(1)
    expect(counts.total).toBe(3)
    expect(isCriticalLaneReady(counts)).toBe(false)
    expect(activePushLane(counts)).toBe('critical')
  })

  it('reports Ready for mobile once critical is empty', () => {
    const counts = {
      critical: 0,
      operational: 12,
      bulk: 900,
      total: 912,
    }
    expect(isCriticalLaneReady(counts)).toBe(true)
    expect(activePushLane(counts)).toBe('operational')
    expect(pushLaneMessage(counts, 10, 100, 40)).toContain('Ready for mobile')
  })
})
