import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

export const PRE_UPDATE_RETENTION = 3

export type BackupManifest = {
  backupVersion: string
  targetVersion: string
  createdAt: string
  databasePath: string
  backupPath: string
  verified: boolean
  integrityCheck: string | null
  fileSize: number
  purpose: 'pre-update' | 'safety' | 'manual'
}

export type BackupResult =
  | { ok: true; backupPath: string; manifestPath: string; manifest: BackupManifest }
  | { ok: false; error: string }

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

export function getPreUpdateBackupDir(userDataPath: string): string {
  return path.join(userDataPath, 'backups', 'pre-update')
}

export function getSafetyBackupDir(userDataPath: string): string {
  return path.join(userDataPath, 'backups', 'safety')
}

export function getRestoreStagingDir(userDataPath: string): string {
  return path.join(userDataPath, 'backups', 'restore-staging')
}

/**
 * Copy an external backup into userData so the queued restore still works
 * after restart even if the original USB/folder is gone.
 */
export function stageRestoreSource(
  userDataPath: string,
  sourcePath: string
): { ok: true; stagedPath: string } | { ok: false; error: string } {
  try {
    if (!fs.existsSync(sourcePath)) {
      return { ok: false, error: 'Backup file not found.' }
    }
    const dir = getRestoreStagingDir(userDataPath)
    ensureDir(dir)
    const ext = path.extname(sourcePath) || '.sqlite'
    const stagedPath = path.join(
      dir,
      `queued-restore-${formatBackupTimestamp()}${ext}`
    )
    fs.copyFileSync(sourcePath, stagedPath)
    return { ok: true, stagedPath }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not copy the backup file into Sofia storage.',
    }
  }
}

/** Compact timestamp safe for Windows filenames: 2026-09-14T061500 */
export function formatBackupTimestamp(date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mm = String(date.getUTCMinutes()).padStart(2, '0')
  const ss = String(date.getUTCSeconds()).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}${mm}${ss}`
}

export function buildPreUpdateBackupFileName(
  currentVersion: string,
  date = new Date()
): string {
  const safeVersion = currentVersion.replace(/[^0-9A-Za-z._-]/g, '_')
  return `backup-before-update-${safeVersion}-${formatBackupTimestamp(date)}.sqlite`
}

/**
 * Open a SQLite file read-only and run PRAGMA integrity_check.
 * Returns true only when the check reports "ok".
 */
export function verifySqliteBackup(backupPath: string): {
  ok: boolean
  integrityCheck: string
  fileSize: number
  error?: string
} {
  if (!fs.existsSync(backupPath)) {
    return { ok: false, integrityCheck: 'missing', fileSize: 0, error: 'Backup file not found.' }
  }
  let fileSize = 0
  try {
    fileSize = fs.statSync(backupPath).size
  } catch {
    return { ok: false, integrityCheck: 'unreadable', fileSize: 0, error: 'Backup file unreadable.' }
  }
  if (fileSize <= 0) {
    return { ok: false, integrityCheck: 'empty', fileSize, error: 'Backup file is empty.' }
  }

  let probe: Database.Database | null = null
  try {
    probe = new Database(backupPath, { readonly: true, fileMustExist: true })
    const rows = probe.pragma('integrity_check') as Array<{ integrity_check: string }>
    const result = rows?.[0]?.integrity_check ?? String(rows)
    const ok = result === 'ok'
    return {
      ok,
      integrityCheck: result,
      fileSize,
      error: ok ? undefined : 'Backup failed the SQLite integrity check.',
    }
  } catch (err) {
    return {
      ok: false,
      integrityCheck: 'error',
      fileSize,
      error: err instanceof Error ? err.message : 'Could not open backup as SQLite.',
    }
  } finally {
    try {
      probe?.close()
    } catch {
      /* ignore */
    }
  }
}

function writeManifest(manifestPath: string, manifest: BackupManifest): void {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
}

export function readManifest(manifestPath: string): BackupManifest | null {
  try {
    if (!fs.existsSync(manifestPath)) return null
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest
  } catch {
    return null
  }
}

/**
 * Create a consistent SQLite snapshot via better-sqlite3 backup API,
 * then verify with PRAGMA integrity_check before treating it as valid.
 */
export async function createVerifiedBackup(options: {
  sourceDb: Database.Database
  databasePath: string
  currentVersion: string
  targetVersion: string
  backupDir: string
  fileName: string
  purpose: BackupManifest['purpose']
}): Promise<BackupResult> {
  const { sourceDb, databasePath, currentVersion, targetVersion, backupDir, fileName, purpose } =
    options

  try {
    ensureDir(backupDir)
    const backupPath = path.join(backupDir, fileName)
    const manifestPath = `${backupPath}.json`

    if (fs.existsSync(backupPath)) {
      return { ok: false, error: 'A backup with this name already exists.' }
    }

    await sourceDb.backup(backupPath)

    const verification = verifySqliteBackup(backupPath)
    const manifest: BackupManifest = {
      backupVersion: currentVersion,
      targetVersion,
      createdAt: new Date().toISOString(),
      databasePath,
      backupPath,
      verified: verification.ok,
      integrityCheck: verification.integrityCheck,
      fileSize: verification.fileSize,
      purpose,
    }
    writeManifest(manifestPath, manifest)

    if (!verification.ok) {
      return {
        ok: false,
        error:
          verification.error ||
          'Sofia could not verify the backup. The update was postponed to protect your school data.',
      }
    }

    return { ok: true, backupPath, manifestPath, manifest }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Sofia could not create a database backup.',
    }
  }
}

export async function createPreUpdateBackup(options: {
  sourceDb: Database.Database
  databasePath: string
  userDataPath: string
  currentVersion: string
  targetVersion: string
}): Promise<BackupResult> {
  const backupDir = getPreUpdateBackupDir(options.userDataPath)
  const fileName = buildPreUpdateBackupFileName(options.currentVersion)
  return createVerifiedBackup({
    sourceDb: options.sourceDb,
    databasePath: options.databasePath,
    currentVersion: options.currentVersion,
    targetVersion: options.targetVersion,
    backupDir,
    fileName,
    purpose: 'pre-update',
  })
}

export function listPreUpdateBackups(userDataPath: string): BackupManifest[] {
  const dir = getPreUpdateBackupDir(userDataPath)
  if (!fs.existsSync(dir)) return []
  const manifests: BackupManifest[] = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.sqlite.json') && !name.endsWith('.json')) continue
    // Prefer companion manifests named backup-....sqlite.json
    if (!name.includes('backup-before-update')) continue
    const full = path.join(dir, name)
    const manifest = readManifest(full)
    if (manifest) manifests.push(manifest)
  }
  return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Keep the newest N verified pre-update backups. Never delete all backups.
 * Cleanup failures are swallowed so the update flow can continue.
 */
export function prunePreUpdateBackups(
  userDataPath: string,
  retain = PRE_UPDATE_RETENTION
): void {
  try {
    const keep = Math.max(1, retain)
    const all = listPreUpdateBackups(userDataPath)
    if (all.length <= keep) return

    const removable = all.slice(keep)
    for (const manifest of removable) {
      try {
        if (fs.existsSync(manifest.backupPath)) fs.unlinkSync(manifest.backupPath)
      } catch {
        /* ignore */
      }
      try {
        const manifestPath = `${manifest.backupPath}.json`
        if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* never block the app on cleanup */
  }
}

/**
 * Create a safety snapshot of the live DB before any restore, then queue restore.
 * Caller must ensure the source backup has already passed verifySqliteBackup.
 */
export async function prepareDatabaseRestore(options: {
  sourceDb: Database.Database
  databasePath: string
  userDataPath: string
  restoreFromPath: string
  currentVersion: string
  queueRestore: (sourcePath: string) => void
}): Promise<BackupResult & { queued?: boolean }> {
  const verification = verifySqliteBackup(options.restoreFromPath)
  if (!verification.ok) {
    return {
      ok: false,
      error: verification.error || 'The selected backup failed integrity verification.',
    }
  }

  const safetyDir = getSafetyBackupDir(options.userDataPath)
  const safetyName = `safety-before-restore-${formatBackupTimestamp()}.sqlite`
  const safety = await createVerifiedBackup({
    sourceDb: options.sourceDb,
    databasePath: options.databasePath,
    currentVersion: options.currentVersion,
    targetVersion: options.currentVersion,
    backupDir: safetyDir,
    fileName: safetyName,
    purpose: 'safety',
  })

  if (!safety.ok) {
    return {
      ok: false,
      error:
        'Sofia could not create a safety backup of the current database. Restore was cancelled.',
    }
  }

  options.queueRestore(options.restoreFromPath)
  return { ...safety, queued: true }
}
