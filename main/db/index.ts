import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { createSchema } from './schema'

let db: Database.Database | null = null

export function getDatabasePath(): string {
  return path.join(app.getPath('userData'), 'sofia.db')
}

function getDbPath(): string {
  return getDatabasePath()
}

export function getDefaultBackupLocation(): string {
  return path.join(app.getPath('userData'), 'backups')
}

export function getRestoreMarkerPath(): string {
  return path.join(app.getPath('userData'), 'restore-pending.json')
}

function applyPendingRestore(): void {
  const marker = getRestoreMarkerPath()
  if (!fs.existsSync(marker)) return
  try {
    const data = JSON.parse(fs.readFileSync(marker, 'utf8')) as { source?: string }
    const dest = getDbPath()
    if (data.source && fs.existsSync(data.source)) {
      // Replace the main DB file; drop WAL/SHM so the restored snapshot is authoritative.
      for (const suffix of ['', '-wal', '-shm']) {
        const target = `${dest}${suffix}`
        try {
          if (fs.existsSync(target)) fs.unlinkSync(target)
        } catch {
          /* ignore */
        }
      }
      fs.copyFileSync(data.source, dest)
      console.log('[sofia] Applied pending database restore')
    }
  } catch (err) {
    console.error('[sofia] Pending restore failed', err)
  } finally {
    try {
      fs.unlinkSync(marker)
    } catch {
      /* ignore */
    }
  }
}

export function queueDatabaseRestore(sourcePath: string): void {
  fs.writeFileSync(
    getRestoreMarkerPath(),
    JSON.stringify({ source: sourcePath, queued_at: new Date().toISOString() }),
    'utf8'
  )
}

export function getDatabase(): Database.Database {
  if (db) {
    return db
  }

  applyPendingRestore()

  const dbPath = getDbPath()
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createSchema(db)

  console.log(`[sofia] Database ready at ${dbPath}`)
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
