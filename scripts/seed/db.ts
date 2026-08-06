import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'

export type OpenDbOptions = {
  dbPath: string
  /** Delete existing file before open */
  reset?: boolean
}

export function resolveDefaultDbPath(flagDev: boolean): string {
  if (flagDev) {
    const home = process.env.HOME || process.env.USERPROFILE || '.'
    return path.join(
      home,
      'Library',
      'Application Support',
      'sofia (development)',
      'sofia.db'
    )
  }
  return path.resolve(process.cwd(), 'data', 'sofia.seed.db')
}

export function openSeedDatabase(options: OpenDbOptions): Database.Database {
  const dir = path.dirname(options.dbPath)
  fs.mkdirSync(dir, { recursive: true })

  if (options.reset && fs.existsSync(options.dbPath)) {
    fs.rmSync(options.dbPath, { force: true })
    for (const suffix of ['-wal', '-shm']) {
      const side = options.dbPath + suffix
      if (fs.existsSync(side)) fs.rmSync(side, { force: true })
    }
  }

  const db = new Database(options.dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  createSchema(db)
  return db
}

export function printCounts(db: Database.Database): void {
  const tables = [
    'schools',
    'users',
    'departments',
    'classes',
    'staff',
    'subjects',
    'staff_subjects',
    'students',
    'fee_structures',
    'invoices',
    'payments',
    'receipts',
    'expenses',
    'attendance_sessions',
    'attendance_records',
    'staff_attendance',
  ]
  console.log('\nRow counts:')
  for (const t of tables) {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as {
        n: number
      }
      console.log(`  ${t.padEnd(22)} ${row.n}`)
    } catch {
      console.log(`  ${t.padEnd(22)} (missing)`)
    }
  }
}
