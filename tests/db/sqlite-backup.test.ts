import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import {
  buildPreUpdateBackupFileName,
  createPreUpdateBackup,
  formatBackupTimestamp,
  prunePreUpdateBackups,
  verifySqliteBackup,
  PRE_UPDATE_RETENTION,
  listPreUpdateBackups,
} from '../../main/db/sqlite-backup'

describe('SQLite pre-update backup safeguards', () => {
  let tmpRoot: string
  let dbPath: string
  let db: Database.Database

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sofia-backup-'))
    dbPath = path.join(tmpRoot, 'sofia.db')
    db = new Database(dbPath)
    db.exec(`
      CREATE TABLE students (id TEXT PRIMARY KEY, name TEXT);
      INSERT INTO students (id, name) VALUES ('1', 'Ada');
    `)
  })

  afterEach(() => {
    try {
      db.close()
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('formatBackupTimestamp is Windows-safe', () => {
    const stamp = formatBackupTimestamp(new Date('2026-09-14T06:15:00.000Z'))
    expect(stamp).toBe('2026-09-14T061500')
    expect(stamp.includes(':')).toBe(false)
  })

  test('buildPreUpdateBackupFileName includes version and stamp', () => {
    const name = buildPreUpdateBackupFileName(
      '1.0.0',
      new Date('2026-09-14T06:15:00.000Z')
    )
    expect(name).toBe('backup-before-update-1.0.0-2026-09-14T061500.sqlite')
  })

  test('createPreUpdateBackup produces a verified snapshot', async () => {
    const result = await createPreUpdateBackup({
      sourceDb: db,
      databasePath: dbPath,
      userDataPath: tmpRoot,
      currentVersion: '1.0.0',
      targetVersion: '1.0.1',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(fs.existsSync(result.backupPath)).toBe(true)
    expect(fs.existsSync(result.manifestPath)).toBe(true)
    expect(result.manifest.verified).toBe(true)
    expect(result.manifest.integrityCheck).toBe('ok')
    expect(result.manifest.backupVersion).toBe('1.0.0')
    expect(result.manifest.targetVersion).toBe('1.0.1')

    const probe = new Database(result.backupPath, { readonly: true })
    const row = probe.prepare('SELECT name FROM students WHERE id = ?').get('1') as {
      name: string
    }
    expect(row.name).toBe('Ada')
    probe.close()
  })

  test('verifySqliteBackup rejects empty files', () => {
    const empty = path.join(tmpRoot, 'empty.sqlite')
    fs.writeFileSync(empty, '')
    const check = verifySqliteBackup(empty)
    expect(check.ok).toBe(false)
  })

  test('prunePreUpdateBackups retains the newest three', async () => {
    for (let i = 0; i < 5; i++) {
      // Unique filenames via distinct versions
      const result = await createPreUpdateBackup({
        sourceDb: db,
        databasePath: dbPath,
        userDataPath: tmpRoot,
        currentVersion: `1.0.${i}`,
        targetVersion: `1.0.${i + 1}`,
      })
      expect(result.ok).toBe(true)
      // Ensure distinct createdAt ordering by touching sleep-less unique names already
      await new Promise((r) => setTimeout(r, 5))
    }

    prunePreUpdateBackups(tmpRoot, PRE_UPDATE_RETENTION)
    const remaining = listPreUpdateBackups(tmpRoot)
    expect(remaining.length).toBe(PRE_UPDATE_RETENTION)
    expect(remaining.every((m) => m.verified)).toBe(true)
  })
})
