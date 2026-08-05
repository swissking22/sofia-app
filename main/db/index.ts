import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { createSchema } from './schema'

let db: Database.Database | null = null

/**
 * Returns the SQLite database path inside Electron userData.
 * Offline-first: all data lives on the local machine.
 */
export function getDatabasePath(): string {
  return path.join(app.getPath('userData'), 'sofia.db')
}

function getDbPath(): string {
  return getDatabasePath()
}

/** Default folder for local database backups. */
export function getDefaultBackupLocation(): string {
  return path.join(app.getPath('userData'), 'backups')
}

/**
 * Opens (or creates) the SQLite database and applies schema.
 * Safe to call multiple times — returns the existing connection.
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db
  }

  const dbPath = getDbPath()
  db = new Database(dbPath)

  // WAL improves concurrent read performance for desktop apps
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createSchema(db)

  console.log(`[sofia] Database ready at ${dbPath}`)
  return db
}

/** Close the database connection (call on app quit). */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
