import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers/create-window'
import { getDatabase, closeDatabase } from './db'
import { createRepositories } from './db/repositories'
import { registerIpcHandlers } from './ipc'
import { needsSetup, ensureValidSession } from './auth'
import { completeUpdaterStartupEvaluation, initAutoUpdater } from './updater'
import { resolveUserDataPath } from './app-paths'

const isProd = process.env.NODE_ENV === 'production'

/**
 * Pin userData to `%APPDATA%\sofia\` (or `sofia (development)`).
 * Independent of electron-builder appId (`com.sofia.school`).
 */
app.setPath(
  'userData',
  resolveUserDataPath(app.getPath('appData'), {
    isPackagedOrProduction: isProd || app.isPackaged,
  })
)

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
  await app.whenReady()

  const iconPath = getRuntimeIconPath()
  if (iconPath && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath)
  }

  const db = getDatabase()
  const repos = createRepositories(db)

  registerIpcHandlers(db, repos)

  const recovery = completeUpdaterStartupEvaluation(db)
  const startPath = getStartPath(repos, recovery.needsRecoveryUi)

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

  if (isProd) {
    await mainWindow.loadURL(`app://./${startPath}`)
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/${startPath}`)
    mainWindow.webContents.openDevTools()
  }

  // Production-only: check GitHub Releases once shortly after startup.
  initAutoUpdater(mainWindow)
})().catch((err) => {
  console.error('[sofia] Failed to start:', err)
  app.quit()
})

app.on('window-all-closed', () => {
  closeDatabase()
  app.quit()
})

app.on('before-quit', () => {
  closeDatabase()
})
