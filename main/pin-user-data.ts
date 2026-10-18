/**
 * MUST be the first import from main/main.ts.
 * Pins Electron userData before any module constructs electron-store
 * or reads app.getPath('userData').
 */
import { installSafeConsole } from './helpers/safe-console'
import { app } from 'electron'
import { resolveUserDataPath } from './app-paths'

// Before any console.log — broken stdout (EIO/EPIPE) must not crash the app.
installSafeConsole()

const isProd = process.env.NODE_ENV === 'production'

const userDataPath = resolveUserDataPath(app.getPath('appData'), {
  isPackagedOrProduction: isProd || app.isPackaged,
})

app.setPath('userData', userDataPath)

console.log(`[SOFIA STARTUP] userData path set → ${userDataPath}`)
