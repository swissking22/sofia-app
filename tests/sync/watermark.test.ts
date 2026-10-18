import Database from 'better-sqlite3'
import { enqueueSync, markSynced } from '../../main/sync/queue'
import { isUnchangedAlreadySynced } from '../../main/sync/watermark'

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

describe('sync watermark', () => {
  it('skips when a synced outbox row already has the same version', () => {
    const db = memoryDb()
    enqueueSync(db, 'ca_scores', 'c1', 'INSERT', { id: 'c1', version: 3 })
    const qid = (
      db.prepare(`SELECT id FROM sync_queue LIMIT 1`).get() as { id: string }
    ).id
    markSynced(db, qid)

    expect(
      isUnchangedAlreadySynced(db, 'ca_scores', 'c1', { version: 3 }, 'INSERT')
    ).toBe(true)
    expect(
      isUnchangedAlreadySynced(db, 'ca_scores', 'c1', { version: 4 }, 'INSERT')
    ).toBe(false)
    expect(
      isUnchangedAlreadySynced(db, 'ca_scores', 'c1', { version: 3 }, 'UPDATE')
    ).toBe(false)
  })

  it('does not skip when nothing was synced yet', () => {
    const db = memoryDb()
    expect(
      isUnchangedAlreadySynced(db, 'users', 'u1', { version: 5 }, 'INSERT')
    ).toBe(false)
  })
})
