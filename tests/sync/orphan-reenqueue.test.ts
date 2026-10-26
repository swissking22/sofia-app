import Database from 'better-sqlite3'
import {
  discardDuplicatePendingAlreadySynced,
  enqueueOrphanedPendingRows,
  enqueueSync,
  markSynced,
  repairDomainSyncStatusFromOutbox,
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
    CREATE TABLE ca_scores (
      id TEXT PRIMARY KEY,
      school_id TEXT,
      sync_status TEXT,
      deleted_at TEXT
    );
  `)
  return db
}

describe('orphan re-enqueue guard', () => {
  it('markSynced flips domain sync_status', () => {
    const db = memoryDb()
    db.prepare(
      `INSERT INTO ca_scores (id, school_id, sync_status) VALUES ('c1', 's1', 'pending')`
    ).run()
    enqueueSync(db, 'ca_scores', 'c1', 'INSERT', {
      id: 'c1',
      school_id: 's1',
      sync_status: 'pending',
    })
    const qid = (
      db.prepare(`SELECT id FROM sync_queue LIMIT 1`).get() as { id: string }
    ).id
    markSynced(db, qid)
    const row = db
      .prepare(`SELECT sync_status FROM ca_scores WHERE id = 'c1'`)
      .get() as { sync_status: string }
    expect(row.sync_status).toBe('synced')
  })

  it('does not re-enqueue rows that already have a synced outbox entry', async () => {
    const db = memoryDb()
    db.prepare(
      `INSERT INTO ca_scores (id, school_id, sync_status) VALUES ('c1', 's1', 'pending')`
    ).run()
    enqueueSync(db, 'ca_scores', 'c1', 'INSERT', { id: 'c1' })
    const qid = (
      db.prepare(`SELECT id FROM sync_queue LIMIT 1`).get() as { id: string }
    ).id
    // Simulate old bug: queue synced but domain left pending
    db.prepare(`UPDATE sync_queue SET status = 'synced' WHERE id = ?`).run(qid)

    const enqueued = await enqueueOrphanedPendingRows(db, { limit: 100 })
    expect(enqueued).toBe(0)
    const domain = db
      .prepare(`SELECT sync_status FROM ca_scores WHERE id = 'c1'`)
      .get() as { sync_status: string }
    expect(domain.sync_status).toBe('synced')
    const pending = db
      .prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'pending'`)
      .get() as { n: number }
    expect(pending.n).toBe(0)
  })

  it('discards duplicate pending after a prior synced push', () => {
    const db = memoryDb()
    enqueueSync(db, 'ca_scores', 'c1', 'INSERT', { id: 'c1' })
    const first = (
      db.prepare(`SELECT id FROM sync_queue LIMIT 1`).get() as { id: string }
    ).id
    db.prepare(`UPDATE sync_queue SET status = 'synced' WHERE id = ?`).run(first)
    enqueueSync(db, 'ca_scores', 'c1', 'INSERT', { id: 'c1' })
    expect(discardDuplicatePendingAlreadySynced(db)).toBe(1)
    const pending = db
      .prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'pending'`)
      .get() as { n: number }
    expect(pending.n).toBe(0)
  })

  it('repairs domain flags from synced outbox', async () => {
    const db = memoryDb()
    db.prepare(
      `INSERT INTO ca_scores (id, school_id, sync_status) VALUES ('c1', 's1', 'pending')`
    ).run()
    enqueueSync(db, 'ca_scores', 'c1', 'INSERT', { id: 'c1' })
    const qid = (
      db.prepare(`SELECT id FROM sync_queue LIMIT 1`).get() as { id: string }
    ).id
    db.prepare(`UPDATE sync_queue SET status = 'synced' WHERE id = ?`).run(qid)
    expect(await repairDomainSyncStatusFromOutbox(db)).toBe(1)
    const row = db
      .prepare(`SELECT sync_status FROM ca_scores WHERE id = 'c1'`)
      .get() as { sync_status: string }
    expect(row.sync_status).toBe('synced')
  })
})
