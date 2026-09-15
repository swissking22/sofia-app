import path from 'path'

/**
 * Stable Electron userData folder name.
 *
 * Intentionally independent of electron-builder `appId` / `productName` so
 * Windows installs remain at `%APPDATA%\sofia\` whether the installer was
 * configured as `com.sofia.app` (working Windows baseline) or `com.sofia.school`.
 */
export const USER_DATA_FOLDER = 'sofia'

export type ResolveUserDataOptions = {
  /** Production / packaged builds use the stable folder; development appends a suffix. */
  isPackagedOrProduction: boolean
  /** Ignored — accepted only to prove callers may pass appId without affecting the path. */
  appId?: string
  productName?: string
}

/**
 * Resolve Sofia's persistent data directory under the OS app-data root.
 * Never derives the folder from appId or productName.
 */
export function resolveUserDataPath(
  appDataRoot: string,
  options: ResolveUserDataOptions
): string {
  const folder = options.isPackagedOrProduction
    ? USER_DATA_FOLDER
    : `${USER_DATA_FOLDER} (development)`
  return path.join(appDataRoot, folder)
}

export function resolveDatabasePath(userDataPath: string): string {
  return path.join(userDataPath, 'sofia.db')
}

export function resolveBackupsPath(userDataPath: string): string {
  return path.join(userDataPath, 'backups')
}
