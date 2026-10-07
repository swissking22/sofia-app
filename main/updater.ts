import { app, BrowserWindow } from 'electron'
import type { AppUpdater, ProgressInfo, UpdateInfo } from 'electron-updater'
import { getDatabase, getDatabasePath, closeDatabase } from './db'
import {
  createPreUpdateBackup,
  prunePreUpdateBackups,
} from './db/sqlite-backup'
import { appendRecoveryLog } from './updater/recovery-log'
import { evaluateStartupRecovery, type RecoverySituation } from './updater/recovery'
import { readUpdateState, writeUpdateState } from './updater/update-state'

/**
 * Load electron-updater only when an update action runs — never via a static
 * import. A top-level import is pulled into the main webpack chunk and crashes
 * packaged Windows before app.whenReady() (see bisect/windows-launch).
 */
let autoUpdaterLoad: Promise<AppUpdater> | null = null

function loadAutoUpdater(): Promise<AppUpdater> {
  if (!autoUpdaterLoad) {
    // webpackIgnore: keep a true runtime import so electron-updater is not
    // evaluated when the main chunk loads (packaged Windows launch breaker).
    autoUpdaterLoad = import(
      /* webpackIgnore: true */ 'electron-updater'
    ).then((mod) => mod.autoUpdater)
  }
  return autoUpdaterLoad
}

export type UpdaterPhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'preparing-backup'
  | 'error'

export type UpdaterState = {
  enabled: boolean
  phase: UpdaterPhase
  currentVersion: string
  availableVersion: string | null
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
  errorMessage: string | null
  recovery: RecoverySituation | null
}

const CHECK_DELAY_MS = 8_000
const POSTPONE_MESSAGE =
  'Sofia could not safely prepare for this update. Your school data has not been changed. The update has been postponed.'

let mainWindow: BrowserWindow | null = null
let started = false
let dismissedVersion: string | null = null
let startupRecovery: RecoverySituation | null = null

let state: UpdaterState = {
  enabled: false,
  phase: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  percent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
  errorMessage: null,
  recovery: null,
}

function log(message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.log(`[sofia:updater] ${message}`, detail)
  } else {
    console.log(`[sofia:updater] ${message}`)
  }
}

function setState(patch: Partial<UpdaterState>): void {
  state = { ...state, ...patch }
  emit('updater:status', state)
}

function emit(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function friendlyNetworkError(): string {
  return 'Sofia could not check for updates right now. You can keep working as usual.'
}

/**
 * Run after the database is open. Detects incomplete installs and may
 * require the recovery start path.
 */
export function completeUpdaterStartupEvaluation(
  db: import('better-sqlite3').Database
): RecoverySituation {
  try {
    startupRecovery = evaluateStartupRecovery(db)
    setState({ recovery: startupRecovery, currentVersion: app.getVersion() })
    return startupRecovery
  } catch (err) {
    console.error('[SOFIA STARTUP] completeUpdaterStartupEvaluation failed (non-fatal)', err)
    startupRecovery = {
      needsRecoveryUi: false,
      status: 'idle',
      fromVersion: null,
      targetVersion: null,
      currentVersion: app.getVersion(),
      backupPath: null,
      backupVerified: false,
      message: '',
    }
    return startupRecovery
  }
}

export function getStartupRecovery(): RecoverySituation | null {
  return startupRecovery
}

/**
 * Start production auto-updates once the main window is ready.
 * No-ops in development (`!app.isPackaged`) so `npm run dev` never hits GitHub.
 * Dynamically loads `electron-updater` so packaged Windows can finish startup first.
 */
export async function initAutoUpdater(window: BrowserWindow): Promise<void> {
  mainWindow = window
  state = {
    ...state,
    currentVersion: app.getVersion(),
    recovery: startupRecovery,
  }

  if (!app.isPackaged) {
    log('skipped — app is not packaged (development)')
    setState({ enabled: false, phase: 'idle' })
    return
  }

  if (started) return
  started = true

  let autoUpdater: AppUpdater
  try {
    autoUpdater = await loadAutoUpdater()
  } catch (err) {
    log('failed to load electron-updater', err instanceof Error ? err.message : err)
    started = false
    setState({
      enabled: false,
      phase: 'error',
      errorMessage: friendlyNetworkError(),
    })
    return
  }

  setState({ enabled: true })

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => {
    log('checking for update')
    appendRecoveryLog({
      event: 'update-check-started',
      currentVersion: state.currentVersion,
    })
    setState({ phase: 'checking', errorMessage: null })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log('update available', info.version)
    const persisted = readUpdateState()
    if (
      persisted.blockedTargetVersion &&
      persisted.blockedTargetVersion === info.version
    ) {
      log('blocked target version — skipping auto prompt to avoid update loop', info.version)
      appendRecoveryLog({
        event: 'update-available',
        currentVersion: state.currentVersion,
        targetVersion: info.version,
        message: 'Update available but blocked after a previous failure.',
      })
      setState({
        phase: 'available',
        availableVersion: info.version,
      })
      return
    }

    appendRecoveryLog({
      event: 'update-available',
      currentVersion: state.currentVersion,
      targetVersion: info.version,
    })

    if (dismissedVersion && dismissedVersion === info.version) {
      log('user previously dismissed this version; skipping prompt')
      setState({
        phase: 'available',
        availableVersion: info.version,
      })
      return
    }

    setState({
      phase: 'available',
      availableVersion: info.version,
      percent: 0,
      errorMessage: null,
    })
    emit('updater:available', {
      currentVersion: state.currentVersion,
      availableVersion: info.version,
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log('update not available', info.version)
    appendRecoveryLog({
      event: 'update-not-available',
      currentVersion: state.currentVersion,
      targetVersion: info.version,
    })
    setState({
      phase: 'not-available',
      availableVersion: null,
      errorMessage: null,
    })
  })

  autoUpdater.on('error', (err: Error) => {
    log('error', err.message)
    appendRecoveryLog({
      event: 'error',
      currentVersion: state.currentVersion,
      targetVersion: state.availableVersion,
      message: 'Updater error',
      detail: err.message,
    })
    setState({
      phase: 'error',
      errorMessage: friendlyNetworkError(),
    })
    emit('updater:error', { message: friendlyNetworkError() })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setState({
      phase: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
      errorMessage: null,
    })
    emit('updater:progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log('update downloaded', info.version)
    appendRecoveryLog({
      event: 'update-downloaded',
      currentVersion: state.currentVersion,
      targetVersion: info.version,
    })
    writeUpdateState({
      status: 'update-downloaded',
      fromVersion: state.currentVersion,
      targetVersion: info.version,
    })
    setState({
      phase: 'downloaded',
      availableVersion: info.version,
      percent: 100,
      errorMessage: null,
    })
    emit('updater:downloaded', {
      currentVersion: state.currentVersion,
      availableVersion: info.version,
    })
  })

  // Do not auto-check while recovery UI is required.
  if (startupRecovery?.needsRecoveryUi) {
    log('skipping update check — recovery UI required')
    return
  }

  setTimeout(() => {
    void checkForUpdates()
  }, CHECK_DELAY_MS)
}

export function getUpdaterState(): UpdaterState {
  return { ...state, recovery: startupRecovery || getStartupRecoverySafe() }
}

function getStartupRecoverySafe(): RecoverySituation | null {
  try {
    return startupRecovery
  } catch {
    return null
  }
}

export async function checkForUpdates(options?: {
  /** Manual check: clear “Later” dismiss so an available update prompts again. */
  force?: boolean
}): Promise<{ ok: boolean; error?: string }> {
  if (!app.isPackaged) {
    return { ok: false, error: 'Updates are only available in the installed app.' }
  }
  const persisted = readUpdateState()
  if (persisted.status === 'rollback-required' && !persisted.recoveryAcknowledged) {
    return { ok: false, error: 'Finish recovery before checking for updates.' }
  }
  if (options?.force) {
    dismissedVersion = null
  }
  try {
    const autoUpdater = await loadAutoUpdater()
    await autoUpdater.checkForUpdates()
    return { ok: true }
  } catch (err) {
    const message = friendlyNetworkError()
    log('checkForUpdates failed', err instanceof Error ? err.message : err)
    appendRecoveryLog({
      event: 'error',
      currentVersion: state.currentVersion,
      message: 'Update check failed',
      detail: err instanceof Error ? err.message : String(err),
    })
    setState({ phase: 'error', errorMessage: message })
    return { ok: false, error: message }
  }
}

export async function downloadUpdate(): Promise<{ ok: boolean; error?: string }> {
  if (!app.isPackaged) {
    return { ok: false, error: 'Updates are only available in the installed app.' }
  }
  try {
    appendRecoveryLog({
      event: 'update-download-started',
      currentVersion: state.currentVersion,
      targetVersion: state.availableVersion,
    })
    setState({ phase: 'downloading', percent: 0, errorMessage: null })
    const autoUpdater = await loadAutoUpdater()
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (err) {
    const message = friendlyNetworkError()
    log('downloadUpdate failed', err instanceof Error ? err.message : err)
    appendRecoveryLog({
      event: 'update-download-failed',
      currentVersion: state.currentVersion,
      targetVersion: state.availableVersion,
      detail: err instanceof Error ? err.message : String(err),
    })
    setState({ phase: 'error', errorMessage: message })
    return { ok: false, error: message }
  }
}

export function dismissUpdate(): void {
  if (state.availableVersion) {
    dismissedVersion = state.availableVersion
  }
  setState({
    phase: state.phase === 'downloaded' ? 'downloaded' : 'idle',
  })
  emit('updater:dismissed', { availableVersion: state.availableVersion })
}

/**
 * Create + verify a pre-update DB backup, then quit and install.
 * Refuses to install if the backup cannot be created or verified.
 */
export async function quitAndInstallUpdate(): Promise<{ ok: boolean; error?: string }> {
  if (!app.isPackaged) {
    return { ok: false, error: 'Updates are only available in the installed app.' }
  }
  if (state.phase !== 'downloaded' && state.phase !== 'preparing-backup') {
    return { ok: false, error: 'No downloaded update is ready to install.' }
  }

  const targetVersion = state.availableVersion
  if (!targetVersion) {
    return { ok: false, error: 'No target version is available.' }
  }

  setState({ phase: 'preparing-backup', errorMessage: null })
  appendRecoveryLog({
    event: 'backup-started',
    currentVersion: state.currentVersion,
    targetVersion,
    message: 'Creating verified pre-update database backup.',
  })
  emit('updater:preparing-backup', {
    currentVersion: state.currentVersion,
    availableVersion: targetVersion,
  })

  const db = getDatabase()
  const backup = await createPreUpdateBackup({
    sourceDb: db,
    databasePath: getDatabasePath(),
    userDataPath: app.getPath('userData'),
    currentVersion: state.currentVersion,
    targetVersion,
  })

  if (!backup.ok) {
    log('pre-update backup failed', backup.error)
    appendRecoveryLog({
      event: 'backup-failed',
      currentVersion: state.currentVersion,
      targetVersion,
      message: 'Pre-update backup failed or failed verification.',
      detail: backup.error,
    })
    writeUpdateState({
      status: 'failed',
      fromVersion: state.currentVersion,
      targetVersion,
      lastError: backup.error,
    })
    setState({
      phase: 'downloaded',
      errorMessage: POSTPONE_MESSAGE,
    })
    emit('updater:backup-failed', { message: POSTPONE_MESSAGE })
    return { ok: false, error: POSTPONE_MESSAGE }
  }

  appendRecoveryLog({
    event: 'backup-created',
    currentVersion: state.currentVersion,
    targetVersion,
    message: 'Pre-update backup created.',
  })
  appendRecoveryLog({
    event: 'backup-verified',
    currentVersion: state.currentVersion,
    targetVersion,
    message: 'Pre-update backup passed integrity_check.',
  })

  writeUpdateState({
    status: 'backup-created',
    fromVersion: state.currentVersion,
    targetVersion,
    backupPath: backup.backupPath,
    manifestPath: backup.manifestPath,
    lastError: null,
    recoveryAcknowledged: false,
  })

  prunePreUpdateBackups(app.getPath('userData'))

  writeUpdateState({
    status: 'installing',
    fromVersion: state.currentVersion,
    targetVersion,
    backupPath: backup.backupPath,
    manifestPath: backup.manifestPath,
    lastError: null,
  })

  appendRecoveryLog({
    event: 'update-install-started',
    currentVersion: state.currentVersion,
    targetVersion,
    message: 'Backup verified; quitting to install update.',
  })

  log('quitAndInstall after verified backup', backup.backupPath)

  // Close DB cleanly before the installer replaces app files.
  closeDatabase()

  try {
    const autoUpdater = await loadAutoUpdater()
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true)
    })
  } catch (err) {
    const message = friendlyNetworkError()
    log('quitAndInstall load failed', err instanceof Error ? err.message : err)
    setState({ phase: 'downloaded', errorMessage: message })
    return { ok: false, error: message }
  }
  return { ok: true }
}
