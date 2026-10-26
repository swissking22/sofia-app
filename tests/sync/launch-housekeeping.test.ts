import Database from 'better-sqlite3'
import {
  clearTableColumnCacheForTests,
  enqueueSync,
  runSyncHousekeeping,
} from '../../main/sync/queue'
import { pushPendingSync } from '../../main/sync/push'
import type {
  ProcessSyncRpcParams,
  ProcessSyncRpcResult,
  PullSyncRpcParams,
  PullSyncRpcResult,
  RegisterDeviceRpcParams,
  RegisterDeviceRpcResult,
  SupabaseSyncClientInterface,
  UpdateSyncCursorRpcParams,
  UpdateSyncCursorRpcResult,
} from '../../main/sync/types'

const SCHOOL_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

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
    CREATE TABLE schools (
      id TEXT PRIMARY KEY,
      name TEXT,
      sync_status TEXT
    );
  `)
  return db
}

class StubClient implements SupabaseSyncClientInterface {
  async registerDevice(
    _params: RegisterDeviceRpcParams
  ): Promise<RegisterDeviceRpcResult> {
    return { ok: true }
  }
  async processSyncOperation(
    _params: ProcessSyncRpcParams
  ): Promise<ProcessSyncRpcResult> {
    return { ok: true, duplicate: false }
  }
  async pullSyncChanges(
    params: PullSyncRpcParams
  ): Promise<PullSyncRpcResult> {
    return {
      ok: true,
      changes: [],
      count: 0,
      currentCursor: params.cursor,
      newCursor: params.cursor,
      hasMore: false,
    }
  }
  async updateSyncCursor(
    params: UpdateSyncCursorRpcParams
  ): Promise<UpdateSyncCursorRpcResult> {
    return { ok: true, cursor: params.cursor }
  }
}

describe('sync launch housekeeping', () => {
  let db: Database.Database

  beforeEach(() => {
    clearTableColumnCacheForTests()
    db = memoryDb()
    db.prepare(
      `INSERT INTO schools (id, name, sync_status) VALUES (?, 'Launch', 'synced')`
    ).run(SCHOOL_ID)
  })

  afterEach(() => {
    db.close()
    clearTableColumnCacheForTests()
  })

  it('runSyncHousekeeping yields and repairs domain flags from synced outbox', async () => {
    db.prepare(
      `INSERT INTO ca_scores (id, school_id, sync_status) VALUES ('c1', ?, 'pending')`
    ).run(SCHOOL_ID)
    enqueueSync(db, 'ca_scores', 'c1', 'INSERT', {
      id: 'c1',
      school_id: SCHOOL_ID,
    })
    const qid = (
      db.prepare(`SELECT id FROM sync_queue LIMIT 1`).get() as { id: string }
    ).id
    db.prepare(`UPDATE sync_queue SET status = 'synced' WHERE id = ?`).run(qid)

    const result = await runSyncHousekeeping(db, SCHOOL_ID)
    expect(result.repaired).toBeGreaterThanOrEqual(1)
    const row = db
      .prepare(`SELECT sync_status FROM ca_scores WHERE id = 'c1'`)
      .get() as { sync_status: string }
    expect(row.sync_status).toBe('synced')
  })

  it('skipHousekeeping allows push without re-running discard/repair', async () => {
    const result = await pushPendingSync({
      db,
      schoolId: SCHOOL_ID,
      client: new StubClient(),
      batchSize: 10,
      skipHousekeeping: true,
    })
    expect(result.ok).toBe(true)
  })
})
