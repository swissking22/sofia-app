import path from 'path'
import {
  USER_DATA_FOLDER,
  resolveBackupsPath,
  resolveDatabasePath,
  resolveUserDataPath,
} from '../main/app-paths'

describe('Sofia userData path stability', () => {
  const appDataRoot =
    process.platform === 'win32'
      ? 'C:\\Users\\School\\AppData\\Roaming'
      : '/Users/school/Library/Application Support'

  test('USER_DATA_FOLDER is the fixed name sofia', () => {
    expect(USER_DATA_FOLDER).toBe('sofia')
  })

  test('packaged path is appData/sofia regardless of appId', () => {
    const withSchool = resolveUserDataPath(appDataRoot, {
      isPackagedOrProduction: true,
      appId: 'com.sofia.school',
      productName: 'Sofia',
    })
    const withLegacy = resolveUserDataPath(appDataRoot, {
      isPackagedOrProduction: true,
      appId: 'com.sofia.app',
      productName: 'SOFIA',
    })
    const withoutId = resolveUserDataPath(appDataRoot, {
      isPackagedOrProduction: true,
    })

    expect(withSchool).toBe(path.join(appDataRoot, 'sofia'))
    expect(withLegacy).toBe(path.join(appDataRoot, 'sofia'))
    expect(withoutId).toBe(path.join(appDataRoot, 'sofia'))
    expect(withSchool).toBe(withLegacy)
  })

  test('development path uses sofia (development) suffix', () => {
    const dev = resolveUserDataPath(appDataRoot, {
      isPackagedOrProduction: false,
      appId: 'com.sofia.school',
    })
    expect(dev).toBe(path.join(appDataRoot, 'sofia (development)'))
  })

  test('database and backups stay under the stable userData folder', () => {
    const userData = resolveUserDataPath(appDataRoot, {
      isPackagedOrProduction: true,
      appId: 'com.sofia.app',
    })
    expect(resolveDatabasePath(userData)).toBe(path.join(userData, 'sofia.db'))
    expect(resolveBackupsPath(userData)).toBe(path.join(userData, 'backups'))
    expect(resolveDatabasePath(userData).includes('com.sofia')).toBe(false)
  })
})
