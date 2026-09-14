import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export type RecoveryLogEvent =
  | 'update-check-started'
  | 'update-available'
  | 'update-not-available'
  | 'update-download-started'
  | 'update-download-progress'
  | 'update-downloaded'
  | 'update-download-failed'
  | 'backup-started'
  | 'backup-created'
  | 'backup-verified'
  | 'backup-failed'
  | 'update-install-started'
  | 'update-restart-completed'
  | 'update-failed'
  | 'recovery-triggered'
  | 'rollback-triggered'
  | 'restore-queued'
  | 'restore-completed'
  | 'integrity-check'
  | 'error'

export type RecoveryLogEntry = {
  at: string
  event: RecoveryLogEvent
  currentVersion?: string
  targetVersion?: string | null
  message?: string
  /** Non-sensitive diagnostic detail only */
  detail?: string
}

const MAX_ENTRIES = 500

export function getRecoveryLogPath(userDataPath = app.getPath('userData')): string {
  return path.join(userDataPath, 'recovery-log.json')
}

export function readRecoveryLog(
  userDataPath = app.getPath('userData')
): RecoveryLogEntry[] {
  const file = getRecoveryLogPath(userDataPath)
  try {
    if (!fs.existsSync(file)) return []
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as RecoveryLogEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function appendRecoveryLog(
  entry: Omit<RecoveryLogEntry, 'at'> & { at?: string },
  userDataPath = app.getPath('userData')
): void {
  try {
    const file = getRecoveryLogPath(userDataPath)
    const existing = readRecoveryLog(userDataPath)
    existing.push({
      at: entry.at || new Date().toISOString(),
      event: entry.event,
      currentVersion: entry.currentVersion,
      targetVersion: entry.targetVersion,
      message: entry.message,
      detail: entry.detail,
    })
    const trimmed = existing.slice(-MAX_ENTRIES)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2), 'utf8')
    fs.renameSync(tmp, file)
  } catch (err) {
    console.error('[sofia:recovery-log] failed to write', err)
  }
}
