import Database from 'better-sqlite3'
import {
  enqueueSync,
  markFailed,
  recordSyncConflict,
} from '../../main/sync/queue'
import { applyConflictResolution } from '../../main/sync/resolve-conflict'

function memoryDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE student_id_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL UNIQUE,
      pattern TEXT NOT NULL DEFAULT '{SCHOOL}-{SEQ}',
      sequence_scope TEXT NOT NULL DEFAULT 'school',
      next_sequence_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE sync_conflicts (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      local_json TEXT,
      remote_json TEXT,
      local_updated_at TEXT,
      remote_updated_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      resolution TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL
    );
  `)
  return db
}

describe('applyConflictResolution', () => {
  it('keep local bumps version, requeues failed outbox, and clears sibling open conflicts', () => {
    const db = memoryDb()
    const schoolId = 'sch_1'
    const recordId = '45270704-fd9b-4f17-b3be-d4aa0360192d'
    const now = '2026-10-08T00:00:00.000Z'

    db.prepare(
      `INSERT INTO student_id_settings (
        id, school_id, pattern, sequence_scope, next_sequence_number,
        created_at, updated_at, sync_status, version
      ) VALUES (?, ?, '{SCHOOL}-{SEQ}', 'school', 1, ?, ?, 'failed', 1)`
    ).run(recordId, schoolId, now, now)

    enqueueSync(db, 'student_id_settings', recordId, 'UPDATE', {
      id: recordId,
      school_id: schoolId,
      pattern: '{SCHOOL}-{SEQ}',
      version: 1,
      updated_at: now,
    })
    const queueId = (
      db.prepare(`SELECT id FROM sync_queue WHERE record_id = ?`).get(recordId) as {
        id: string
      }
    ).id
    markFailed(db, queueId)

    for (let i = 0; i < 3; i += 1) {
      recordSyncConflict(db, {
        schoolId,
        tableName: 'student_id_settings',
        recordId,
        localJson: JSON.stringify({ id: recordId, version: 1 }),
        remoteJson: JSON.stringify({
          ok: false,
          conflict: true,
          cloudVersion: 4,
        }),
      })
    }

    const firstId = (
      db
        .prepare(
          `SELECT id FROM sync_conflicts WHERE record_id = ? AND status = 'open' LIMIT 1`
        )
        .get(recordId) as { id: string }
    ).id

    const result = applyConflictResolution(db, {
      schoolId,
      conflictId: firstId,
      resolution: 'local',
      userId: 'user_1',
    })

    expect(result.resolvedCount).toBe(3)

    const open = db
      .prepare(
        `SELECT COUNT(*) AS n FROM sync_conflicts WHERE record_id = ? AND status = 'open'`
      )
      .get(recordId) as { n: number }
    expect(open.n).toBe(0)

    const settings = db
      .prepare(`SELECT version, sync_status FROM student_id_settings WHERE id = ?`)
      .get(recordId) as { version: number; sync_status: string }
    expect(settings.version).toBe(5)
    expect(settings.sync_status).toBe('pending')

    const queue = db
      .prepare(`SELECT status, payload FROM sync_queue WHERE id = ?`)
      .get(queueId) as { status: string; payload: string }
    expect(queue.status).toBe('pending')
    expect(JSON.parse(queue.payload).version).toBe(5)
  })

  it('keep remote abandons failed/pending outbox and hides from open list', () => {
    const db = memoryDb()
    const schoolId = 'sch_1'
    const recordId = 'rec_remote'
    const now = '2026-10-08T00:00:00.000Z'

    db.prepare(
      `INSERT INTO student_id_settings (
        id, school_id, pattern, sequence_scope, next_sequence_number,
        created_at, updated_at, sync_status, version
      ) VALUES (?, ?, '{SCHOOL}-{SEQ}', 'school', 1, ?, ?, 'pending', 2)`
    ).run(recordId, schoolId, now, now)

    enqueueSync(db, 'student_id_settings', recordId, 'UPDATE', {
      id: recordId,
      version: 2,
      updated_at: now,
    })
    const queueId = (
      db.prepare(`SELECT id FROM sync_queue WHERE record_id = ?`).get(recordId) as {
        id: string
      }
    ).id
    markFailed(db, queueId)

    recordSyncConflict(db, {
      schoolId,
      tableName: 'student_id_settings',
      recordId,
      localJson: JSON.stringify({ id: recordId, version: 2 }),
      remoteJson: JSON.stringify({ conflict: true, cloudVersion: 9 }),
    })

    const conflictId = (
      db.prepare(`SELECT id FROM sync_conflicts WHERE record_id = ?`).get(recordId) as {
        id: string
      }
    ).id

    applyConflictResolution(db, {
      schoolId,
      conflictId,
      resolution: 'remote',
      userId: null,
    })

    const open = db
      .prepare(
        `SELECT COUNT(*) AS n FROM sync_conflicts WHERE school_id = ? AND status = 'open'`
      )
      .get(schoolId) as { n: number }
    expect(open.n).toBe(0)

    const queue = db
      .prepare(`SELECT status FROM sync_queue WHERE id = ?`)
      .get(queueId) as { status: string }
    expect(queue.status).toBe('synced')
  })
})
