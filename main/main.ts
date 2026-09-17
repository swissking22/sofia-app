import './pin-user-data'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers/create-window'
import { getDatabase, closeDatabase } from './db'
import { createRepositories } from './db/repositories'
import { registerIpcHandlers } from './ipc'
import { ensureValidSession } from './auth'
import {
  completeUpdaterStartupEvaluation,
  initAutoUpdater,
} from './updater'

const isProd = process.env.NODE_ENV === 'production'

function startupLog(message: string, detail?: unknown): void {
  const line =
    detail !== undefined
      ? `[SOFIA STARTUP] ${message} ${String(detail)}`
      : `[SOFIA STARTUP] ${message}`
  console.log(line)
  try {
    const logPath = path.join(app.getPath('userData'), 'sofia-startup.log')
    fs.appendFileSync(
      logPath,
      `${new Date().toISOString()} ${line}\n`,
      'utf8'
    )
  } catch {
    /* ignore log write failures */
  }
}

startupLog('module loaded', app.getPath('userData'))

if (isProd) {
  serve({ directory: 'app' })
}

function getStartPath(
  repos: ReturnType<typeof createRepositories>,
  needsRecoveryUi: boolean
): string {
  if (needsRecoveryUi) return 'recovery'
  if (ensureValidSession(repos)) return 'home'
  // Fresh install: login screen offers Join school + Create school
  return 'login'
}

/** Dev and packaged runtime icon (dock + BrowserWindow). Bundle .icns/.ico come from electron-builder. */
function getRuntimeIconPath(): string | undefined {
  const candidates = [
    path.join(import.meta.dirname, '../resources/icon.png'),
    path.join(process.resourcesPath, 'icon.png'),
  ]
  return candidates.find((p) => fs.existsSync(p))
}

;(async () => {
  try {
    await app.whenReady()
    startupLog('app.whenReady complete')

    const iconPath = getRuntimeIconPath()
    if (iconPath && process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(iconPath)
    }

    startupLog('database opening', app.getPath('userData'))
    const db = getDatabase()
    startupLog('database opened')

    const repos = createRepositories(db)
    startupLog('repositories created')

    registerIpcHandlers(db, repos)
    startupLog('IPC registered')

    // Recovery evaluation does not load electron-updater (lazy inside updater.ts).
    const recovery = completeUpdaterStartupEvaluation(db)
    startupLog('updater startup evaluation complete', recovery.status)

    const startPath = getStartPath(repos, recovery.needsRecoveryUi)
    startupLog('start path resolved', startPath)

    const mainWindow = createWindow('main', {
      width: 1440,
      height: 900,
      minWidth: 1200,
      minHeight: 700,
      title: 'Sofia',
      ...(iconPath ? { icon: iconPath } : {}),
      webPreferences: {
        preload: path.join(import.meta.dirname, 'preload.js'),
      },
    })
    startupLog('window created')

    startupLog('window loading', startPath)
    if (isProd) {
      await mainWindow.loadURL(`app://./${startPath}`)
    } else {
      const port = process.argv[2]
      await mainWindow.loadURL(`http://localhost:${port}/${startPath}`)
      mainWindow.webContents.openDevTools()
    }

    // Loads electron-updater only after the window is up (packaged Windows safe).
    try {
      await initAutoUpdater(mainWindow)
      startupLog('auto-updater initialized')
    } catch (err) {
      console.error('[SOFIA STARTUP] auto-updater init failed (non-fatal)', err)
      startupLog('auto-updater init failed (non-fatal)')
    }

    startupLog('startup complete')
  } catch (err) {
    const message = err instanceof Error ? err.stack || err.message : String(err)
    startupLog('FAILURE', message)
    console.error('[sofia] Failed to start:', err)
    app.quit()
  }
})()

app.on('window-all-closed', () => {
  closeDatabase()
  app.quit()
})

app.on('before-quit', () => {
  closeDatabase()
})
