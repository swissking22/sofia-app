import Database from 'better-sqlite3'
import { enqueueSync } from '../../main/sync/queue'
import {
  FOUNDATION_SYNC_TABLES,
  peekParallelPushTables,
} from '../../main/sync/parallel'

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

describe('parallel push peek', () => {
  it('lists foundation tables first when any foundation row is pending', () => {
    const db = memoryDb()
    enqueueSync(db, 'students', 'st_1', 'INSERT', { id: 'st_1' })
    enqueueSync(db, 'permissions', 'p_1', 'INSERT', { id: 'p_1' })
    const peek = peekParallelPushTables(db, { concurrency: 3 })
    expect(peek.mode).toBe('foundation')
    expect(peek.tables).toEqual([...FOUNDATION_SYNC_TABLES])
  })

  it('peeks up to concurrency independent tables after foundation is clear', () => {
    const db = memoryDb()
    enqueueSync(db, 'students', 'st_1', 'INSERT', { id: 'st_1' })
    enqueueSync(db, 'classes', 'cl_1', 'INSERT', { id: 'cl_1' })
    enqueueSync(db, 'subjects', 'su_1', 'INSERT', { id: 'su_1' })
    enqueueSync(db, 'invoice_lines', 'inv_1', 'INSERT', { id: 'inv_1' })
    const peek = peekParallelPushTables(db, { concurrency: 3 })
    expect(peek.mode).toBe('parallel')
    expect(peek.tables).toHaveLength(3)
    expect(peek.tables.every((t) => !FOUNDATION_SYNC_TABLES.includes(t as never))).toBe(
      true
    )
  })

  it('falls back to single when concurrency is 1', () => {
    const db = memoryDb()
    enqueueSync(db, 'students', 'st_1', 'INSERT', { id: 'st_1' })
    enqueueSync(db, 'classes', 'cl_1', 'INSERT', { id: 'cl_1' })
    const peek = peekParallelPushTables(db, { concurrency: 1 })
    expect(peek.mode).toBe('single')
    expect(peek.tables).toHaveLength(1)
  })

  it('respects maxLane when listing ready tables', () => {
    const db = memoryDb()
    enqueueSync(db, 'users', 'u_1', 'INSERT', { id: 'u_1' })
    enqueueSync(db, 'students', 'st_1', 'INSERT', { id: 'st_1' })
    enqueueSync(db, 'ca_scores', 'ca_1', 'INSERT', { id: 'ca_1' })
    const peek = peekParallelPushTables(db, {
      concurrency: 3,
      maxLane: 'critical',
    })
    expect(peek.mode).toBe('single')
    expect(peek.tables).toEqual(['users'])
  })
})
