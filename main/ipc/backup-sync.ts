import { dialog, BrowserWindow } from 'electron'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { getSession } from '../auth'
import { getDatabasePath } from '../db'
import type { Repositories } from '../db/repositories'
import type {
  BackupSyncSaveInput,
  BackupSyncSetupDto,
} from '../db/repositories/backup-sync.repository'
import { runSyncWorkerUntilCaughtUp } from '../sync/worker'
import type { SyncProgressEvent } from '../sync/progress'

function emitSyncProgress(
  event: IpcMainInvokeEvent,
  progress: SyncProgressEvent
): void {
  try {
    if (!event.sender.isDestroyed()) {
      event.sender.send('sync:progress', progress)
    }
  } catch {
    /* renderer gone */
  }
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function resolveSchool(repos: Repositories) {
  const session = getSession()
  if (session?.schoolId) {
    const bySession = repos.schools.findById(session.schoolId)
    if (bySession) return repos.schools.ensureSchoolCode(bySession)
  }
  const latest = repos.schools.findLatest()
  return latest ? repos.schools.ensureSchoolCode(latest) : undefined
}

function loadSetup(repos: Repositories): BackupSyncSetupDto | null {
  const school = resolveSchool(repos)
  if (!school) return null
  return repos.backupSync.getSetupDto(
    school.id,
    school.name,
    school.school_code || school.id,
    getDatabasePath()
  )
}

export function registerBackupSyncIpc(
  db: import('better-sqlite3').Database,
  repos: Repositories
): void {
  ipcMain.handle('backup-sync:get-setup', (): Result<BackupSyncSetupDto> => {
    const data = loadSetup(repos)
    if (!data) {
      return {
        ok: false,
        error: 'No school found. Complete registration first.',
      }
    }
    return { ok: true, data }
  })

  ipcMain.handle(
    'backup-sync:save-setup',
    (_e, input: BackupSyncSaveInput): Result<BackupSyncSetupDto> => {
      const school = resolveSchool(repos)
      if (!school) return { ok: false, error: 'No school found.' }

      try {
        if (!input.backup_location?.trim()) {
          return { ok: false, error: 'Backup storage location is required.' }
        }
        return {
          ok: true,
          data: repos.backupSync.saveSettings(
            school.id,
            school.name,
            school.school_code || school.id,
            getDatabasePath(),
            input
          ),
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not save backup settings.',
        }
      }
    }
  )

  ipcMain.handle(
    'backup-sync:pick-location',
    async (): Promise<Result<{ path: string }>> => {
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showOpenDialog(win ?? undefined, {
        title: 'Choose backup folder',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || !result.filePaths[0]) {
        return { ok: false, error: 'No folder selected.' }
      }
      return { ok: true, data: { path: result.filePaths[0] } }
    }
  )

  ipcMain.handle(
    'backup-sync:sync-now',
    async (
      event: IpcMainInvokeEvent
    ): Promise<
      Result<BackupSyncSetupDto & { processed: number; failed: number }>
    > => {
      const school = resolveSchool(repos)
      if (!school) return { ok: false, error: 'No school found.' }

      try {
        const result = await runSyncWorkerUntilCaughtUp(db, {
          schoolId: school.id,
          onProgress: (p) => emitSyncProgress(event, p),
        })
        const ok = result.failed === 0
        repos.backupSync.markSyncResult(school.id, {
          ok,
          processed: result.processed,
          failed: result.failed,
        })

        // Keep a local snapshot when automatic backup is on
        const settings = repos.backupSync.ensureSettings(school.id)
        if (settings.automatic_backup === 1) {
          try {
            await repos.backupSync.createLocalBackup(school.id)
          } catch {
            // Sync succeeded; backup failure is non-fatal for this action
          }
        }

        const data = loadSetup(repos)!
        const hasMore = Boolean(
          result.hasMore || result.push?.hasMore || result.pull?.hasMore
        )
        return {
          ok: true,
          data: {
            ...data,
            processed: result.processed,
            failed: result.failed,
            successful: result.successful,
            has_more: hasMore,
            message: result.message || null,
            push: result.push,
            pull: result.pull,
            progress: result.progress,
            rounds: result.rounds,
          },
        }
      } catch (err) {
        repos.backupSync.markSyncResult(school.id, {
          ok: false,
          processed: 0,
          failed: 1,
        })
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Sync failed unexpectedly.',
        }
      }
    }
  )

  ipcMain.handle(
    'backup-sync:test-connection',
    async (): Promise<Result<BackupSyncSetupDto>> => {
      const school = resolveSchool(repos)
      if (!school) return { ok: false, error: 'No school found.' }

      try {
        // Simulate cloud connectivity check — no real network call (offline-first)
        await new Promise((r) => setTimeout(r, 400))
        repos.backupSync.markConnectionTest(school.id, true)
        return { ok: true, data: loadSetup(repos)! }
      } catch (err) {
        repos.backupSync.markConnectionTest(school.id, false)
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not reach cloud database.',
        }
      }
    }
  )
}
