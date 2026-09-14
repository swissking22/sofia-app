import type Database from 'better-sqlite3'
import { app } from 'electron'
import {
  prepareDatabaseRestore,
  verifySqliteBackup,
  type BackupManifest,
} from '../db/sqlite-backup'
import {
  getDatabase,
  getDatabasePath,
  queueDatabaseRestore,
  closeDatabase,
} from '../db'
import { appendRecoveryLog } from './recovery-log'
import {
  readUpdateState,
  writeUpdateState,
  type PersistedUpdateState,
} from './update-state'

export type RecoverySituation = {
  needsRecoveryUi: boolean
  status: PersistedUpdateState['status']
  fromVersion: string | null
  targetVersion: string | null
  currentVersion: string
  backupPath: string | null
  backupVerified: boolean
  message: string
}

function verifyOpenDatabase(db: Database.Database): { ok: boolean; integrityCheck: string } {
  try {
    const rows = db.pragma('integrity_check') as Array<{ integrity_check: string }>
    const result = rows?.[0]?.integrity_check ?? String(rows)
    return { ok: result === 'ok', integrityCheck: result }
  } catch (err) {
    return {
      ok: false,
      integrityCheck: err instanceof Error ? err.message : 'error',
    }
  }
}

/**
 * Evaluate incomplete update / recovery state after the database is ready.
 * Production only — development never enters recovery UI.
 */
export function evaluateStartupRecovery(db: Database.Database): RecoverySituation {
  const currentVersion = app.getVersion()
  const base: RecoverySituation = {
    needsRecoveryUi: false,
    status: 'idle',
    fromVersion: null,
    targetVersion: null,
    currentVersion,
    backupPath: null,
    backupVerified: false,
    message: '',
  }

  if (!app.isPackaged) {
    return base
  }

  const state = readUpdateState()
  const backupVerified = state.backupPath
    ? verifySqliteBackup(state.backupPath).ok
    : false

  if (state.status === 'installing' && state.targetVersion === currentVersion) {
    appendRecoveryLog({
      event: 'update-restart-completed',
      currentVersion,
      targetVersion: state.targetVersion,
      message: 'Application restarted on the target version.',
    })

    const liveCheck = verifyOpenDatabase(db)
    appendRecoveryLog({
      event: 'integrity-check',
      currentVersion,
      targetVersion: state.targetVersion,
      message: liveCheck.ok
        ? 'Database integrity ok after update.'
        : 'Database integrity concern after update.',
      detail: liveCheck.integrityCheck,
    })

    if (!liveCheck.ok) {
      writeUpdateState({
        status: 'rollback-required',
        lastError: 'Post-update database integrity check failed.',
        recoveryAcknowledged: false,
        blockedTargetVersion: state.targetVersion,
      })
      return {
        needsRecoveryUi: true,
        status: 'rollback-required',
        fromVersion: state.fromVersion,
        targetVersion: state.targetVersion,
        currentVersion,
        backupPath: state.backupPath,
        backupVerified,
        message:
          'Sofia updated, but the school database did not pass a safety check. Your pre-update backup has been preserved.',
      }
    }

    writeUpdateState({
      status: 'idle',
      fromVersion: null,
      targetVersion: null,
      backupPath: state.backupPath,
      manifestPath: state.manifestPath,
      lastError: null,
      recoveryAcknowledged: false,
      blockedTargetVersion: null,
    })
    return { ...base, status: 'idle', message: 'Update completed successfully.' }
  }

  if (
    state.status === 'installing' &&
    state.fromVersion &&
    currentVersion === state.fromVersion
  ) {
    appendRecoveryLog({
      event: 'update-failed',
      currentVersion,
      targetVersion: state.targetVersion,
      message: 'Update did not complete; application is still on the previous version.',
    })
    writeUpdateState({
      status: 'rollback-required',
      lastError: 'Update installation did not complete.',
      blockedTargetVersion: state.targetVersion,
      recoveryAcknowledged: false,
    })
    return {
      needsRecoveryUi: true,
      status: 'rollback-required',
      fromVersion: state.fromVersion,
      targetVersion: state.targetVersion,
      currentVersion,
      backupPath: state.backupPath,
      backupVerified,
      message:
        'Sofia detected an issue while applying an update. Your school data has been protected.',
    }
  }

  if (state.status === 'rollback-required' && !state.recoveryAcknowledged) {
    appendRecoveryLog({
      event: 'recovery-triggered',
      currentVersion,
      targetVersion: state.targetVersion,
      message: 'Recovery screen required.',
    })
    return {
      needsRecoveryUi: true,
      status: 'rollback-required',
      fromVersion: state.fromVersion,
      targetVersion: state.targetVersion,
      currentVersion,
      backupPath: state.backupPath,
      backupVerified,
      message:
        'Sofia detected an issue while applying an update. Your school data has been protected.',
    }
  }

  if (state.status === 'updated') {
    writeUpdateState({ status: 'idle', lastError: null })
  }

  return {
    ...base,
    status: state.status,
    fromVersion: state.fromVersion,
    targetVersion: state.targetVersion,
    backupPath: state.backupPath,
    backupVerified,
  }
}

export function getRecoverySituation(): RecoverySituation {
  const state = readUpdateState()
  const currentVersion = app.getVersion()
  const backupVerified = state.backupPath
    ? verifySqliteBackup(state.backupPath).ok
    : false
  const needsRecoveryUi =
    app.isPackaged &&
    state.status === 'rollback-required' &&
    !state.recoveryAcknowledged

  return {
    needsRecoveryUi,
    status: state.status,
    fromVersion: state.fromVersion,
    targetVersion: state.targetVersion,
    currentVersion,
    backupPath: state.backupPath,
    backupVerified,
    message: needsRecoveryUi
      ? 'Sofia detected an issue while applying an update. Your school data has been protected.'
      : '',
  }
}

export async function tryDatabaseRecovery(): Promise<{
  ok: boolean
  error?: string
  requiresRestart?: boolean
}> {
  if (!app.isPackaged) {
    return { ok: false, error: 'Recovery is only available in the installed app.' }
  }

  const state = readUpdateState()
  if (!state.backupPath) {
    return { ok: false, error: 'No pre-update backup is available to restore.' }
  }

  appendRecoveryLog({
    event: 'rollback-triggered',
    currentVersion: app.getVersion(),
    targetVersion: state.targetVersion,
    message: 'User requested database recovery from pre-update backup.',
  })

  const db = getDatabase()
  const result = await prepareDatabaseRestore({
    sourceDb: db,
    databasePath: getDatabasePath(),
    userDataPath: app.getPath('userData'),
    restoreFromPath: state.backupPath,
    currentVersion: app.getVersion(),
    queueRestore: queueDatabaseRestore,
  })

  if (!result.ok) {
    appendRecoveryLog({
      event: 'error',
      currentVersion: app.getVersion(),
      targetVersion: state.targetVersion,
      message: 'Database recovery could not be prepared.',
      detail: result.error,
    })
    return { ok: false, error: result.error }
  }

  appendRecoveryLog({
    event: 'restore-queued',
    currentVersion: app.getVersion(),
    targetVersion: state.targetVersion,
    message: 'Verified restore queued; Sofia will apply it on restart.',
  })

  writeUpdateState({
    status: 'rollback-completed',
    lastError: null,
    recoveryAcknowledged: true,
  })

  closeDatabase()

  return { ok: true, requiresRestart: true }
}

export function continueWithoutRecovery(): { ok: boolean } {
  appendRecoveryLog({
    event: 'recovery-triggered',
    currentVersion: app.getVersion(),
    targetVersion: readUpdateState().targetVersion,
    message: 'User continued without restoring the database.',
  })
  writeUpdateState({
    recoveryAcknowledged: true,
    status: 'failed',
  })
  return { ok: true }
}

export function listRecoveryBackupSummary(): BackupManifest | null {
  const state = readUpdateState()
  if (!state.backupPath) return null
  const check = verifySqliteBackup(state.backupPath)
  return {
    backupVersion: state.fromVersion || 'unknown',
    targetVersion: state.targetVersion || 'unknown',
    createdAt: state.updatedAt,
    databasePath: getDatabasePath(),
    backupPath: state.backupPath,
    verified: check.ok,
    integrityCheck: check.integrityCheck,
    fileSize: check.fileSize,
    purpose: 'pre-update',
  }
}
