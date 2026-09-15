import './pin-user-data'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers/create-window'
import { getDatabase, closeDatabase } from './db'
import { createRepositories } from './db/repositories'
import { registerIpcHandlers } from './ipc'
import { needsSetup, ensureValidSession } from './auth'

const isProd = process.env.NODE_ENV === 'production'

console.log('[SOFIA STARTUP] module loaded')

if (isProd) {
  serve({ directory: 'app' })
}

function getStartPath(
  repos: ReturnType<typeof createRepositories>,
  needsRecoveryUi: boolean
): string {
  if (needsRecoveryUi) return 'recovery'
  if (ensureValidSession(repos)) return 'home'
  if (needsSetup(repos)) return 'register'
  return 'login'
}

/** Dev-only PNG next to the project; packaged macOS uses the bundle .icns. */
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
    console.log('[SOFIA STARTUP] app.whenReady complete')

    const iconPath = getRuntimeIconPath()
    if (iconPath && process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(iconPath)
    }

    console.log('[SOFIA STARTUP] database opening', app.getPath('userData'))
    const db = getDatabase()
    console.log('[SOFIA STARTUP] database opened')

    const repos = createRepositories(db)
    console.log('[SOFIA STARTUP] repositories created')

    registerIpcHandlers(db, repos)
    console.log('[SOFIA STARTUP] IPC registered')

    // Load updater AFTER ready + userData pin so electron-updater / store
    // never initialize against the pre-pin path during module import.
    let needsRecoveryUi = false
    let initAutoUpdater: ((window: Electron.BrowserWindow) => void) | null =
      null
    try {
      const updater = await import('./updater')
      const recovery = updater.completeUpdaterStartupEvaluation(db)
      needsRecoveryUi = recovery.needsRecoveryUi
      initAutoUpdater = updater.initAutoUpdater
      console.log('[SOFIA STARTUP] updater startup evaluation complete')
    } catch (err) {
      console.error('[SOFIA STARTUP] updater evaluation failed (non-fatal)', err)
    }

    const startPath = getStartPath(repos, needsRecoveryUi)
    console.log('[SOFIA STARTUP] start path resolved', startPath)

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
    console.log('[SOFIA STARTUP] window created')

    console.log('[SOFIA STARTUP] window loading', startPath)
    if (isProd) {
      await mainWindow.loadURL(`app://./${startPath}`)
    } else {
      const port = process.argv[2]
      await mainWindow.loadURL(`http://localhost:${port}/${startPath}`)
      mainWindow.webContents.openDevTools()
    }

    try {
      initAutoUpdater?.(mainWindow)
      console.log('[SOFIA STARTUP] auto-updater initialized')
    } catch (err) {
      console.error('[SOFIA STARTUP] auto-updater init failed (non-fatal)', err)
    }

    console.log('[SOFIA STARTUP] startup complete')
  } catch (err) {
    console.error('[SOFIA STARTUP] FAILURE', err)
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
