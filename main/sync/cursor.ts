import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

/**
 * Ensures the sync_cursors table exists in the provided SQLite database.
 */
export function ensureSyncCursorsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_cursors (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      last_synced_change_id INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE (school_id, device_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sync_cursors_school_device
      ON sync_cursors(school_id, device_id);
  `)
}

/**
 * Reads the latest pulled change cursor for a given school tenant and device.
 * Returns 0 if no cursor has been recorded yet.
 */
export function getLocalSyncCursor(
  db: Database.Database,
  schoolId: string,
  deviceId: string
): number {
  ensureSyncCursorsTable(db)
  try {
    const row = db
      .prepare(
        `SELECT last_synced_change_id FROM sync_cursors WHERE school_id = ? AND device_id = ?`
      )
      .get(schoolId, deviceId) as { last_synced_change_id: number } | undefined

    return row ? Number(row.last_synced_change_id) || 0 : 0
  } catch {
    return 0
  }
}

/**
 * Updates or inserts the local pull cursor for a given school tenant and device.
 * Atomic upsert based on the UNIQUE(school_id, device_id) constraint.
 */
export function setLocalSyncCursor(
  db: Database.Database,
  schoolId: string,
  deviceId: string,
  cursor: number
): void {
  ensureSyncCursorsTable(db)
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO sync_cursors (
      id, school_id, device_id, last_synced_change_id, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (school_id, device_id) DO UPDATE SET
      last_synced_change_id = MAX(sync_cursors.last_synced_change_id, EXCLUDED.last_synced_change_id),
      updated_at = EXCLUDED.updated_at`
  ).run(randomUUID(), schoolId, deviceId, cursor, now)
}
