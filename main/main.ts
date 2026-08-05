import path from 'path'
import { app } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers/create-window'
import { getDatabase, closeDatabase } from './db'
import { createRepositories } from './db/repositories'
import { registerIpcHandlers } from './ipc'
import { getSession, needsSetup } from './auth'

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

function getStartPath(repos: ReturnType<typeof createRepositories>): string {
  if (getSession()) return 'home'
  if (needsSetup(repos)) return 'register'
  return 'login'
}

;(async () => {
  await app.whenReady()

  const db = getDatabase()
  const repos = createRepositories(db)

  // Step 5–8: auth + IPC (including dashboard stats)
  registerIpcHandlers(db, repos)

  const startPath = getStartPath(repos)

  const mainWindow = createWindow('main', {
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'SOFIA',
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
})()

app.on('window-all-closed', () => {
  closeDatabase()
  app.quit()
})

app.on('before-quit', () => {
  closeDatabase()
})
