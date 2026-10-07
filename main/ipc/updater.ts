import { ipcMain } from 'electron'
import {
  checkForUpdates,
  dismissUpdate,
  downloadUpdate,
  getUpdaterState,
  quitAndInstallUpdate,
} from '../updater'
import {
  continueWithoutRecovery,
  getRecoverySituation,
  listRecoveryBackupSummary,
  tryDatabaseRecovery,
} from '../updater/recovery'
import { listPreUpdateBackups } from '../db/sqlite-backup'
import { app } from 'electron'
import { readRecoveryLog } from '../updater/recovery-log'

export function registerUpdaterIpc(): void {
  ipcMain.handle('updater:get-status', () => ({
    ok: true as const,
    data: getUpdaterState(),
  }))

  ipcMain.handle(
    'updater:check',
    async (_event, payload?: { force?: boolean }) => {
      const result = await checkForUpdates({ force: payload?.force === true })
      if (!result.ok) {
        return { ok: false as const, error: result.error || 'Update check failed.' }
      }
      return { ok: true as const, data: getUpdaterState() }
    },
  )

  ipcMain.handle('updater:download', async () => {
    const result = await downloadUpdate()
    if (!result.ok) return { ok: false as const, error: result.error || 'Download failed.' }
    return { ok: true as const, data: getUpdaterState() }
  })

  ipcMain.handle('updater:install', async () => {
    const result = await quitAndInstallUpdate()
    if (!result.ok) return { ok: false as const, error: result.error || 'Install failed.' }
    return { ok: true as const, data: true }
  })

  ipcMain.handle('updater:dismiss', () => {
    dismissUpdate()
    return { ok: true as const, data: getUpdaterState() }
  })

  ipcMain.handle('updater:recovery-status', () => ({
    ok: true as const,
    data: {
      ...getRecoverySituation(),
      backup: listRecoveryBackupSummary(),
      preUpdateBackups: listPreUpdateBackups(app.getPath('userData')).slice(0, 5),
    },
  }))

  ipcMain.handle('updater:recovery-try', async () => {
    const result = await tryDatabaseRecovery()
    if (!result.ok) return { ok: false as const, error: result.error || 'Recovery failed.' }
    return { ok: true as const, data: result }
  })

  ipcMain.handle('updater:recovery-continue', () => ({
    ok: true as const,
    data: continueWithoutRecovery(),
  }))

  ipcMain.handle('updater:recovery-log', () => ({
    ok: true as const,
    data: readRecoveryLog().slice(-50),
  }))

  ipcMain.handle('updater:list-pre-update-backups', () => ({
    ok: true as const,
    data: listPreUpdateBackups(app.getPath('userData')),
  }))
}
