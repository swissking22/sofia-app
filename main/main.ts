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
  repos: ReturnType<typeof createRepositories>
): string {
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
    startupLog('IPC registered (updater IPC disabled for bisect)')

    // BISECT: updater fully disabled — do not import('./updater') or
    // electron-updater at all until Windows launch is restored.
    const startPath = getStartPath(repos)
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

    startupLog('startup complete (updater disabled)')
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
