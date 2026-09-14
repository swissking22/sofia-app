import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  readUpdateState,
  writeUpdateState,
} from '../../main/updater/update-state'

describe('update-state persistence', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sofia-update-state-'))
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('defaults to idle when missing', () => {
    const state = readUpdateState(tmpRoot)
    expect(state.status).toBe('idle')
    expect(state.blockedTargetVersion).toBeNull()
  })

  test('persists installing state across reads', () => {
    writeUpdateState(
      {
        status: 'installing',
        fromVersion: '1.0.0',
        targetVersion: '1.0.1',
        backupPath: path.join(tmpRoot, 'backup.sqlite'),
        blockedTargetVersion: null,
      },
      tmpRoot
    )
    const state = readUpdateState(tmpRoot)
    expect(state.status).toBe('installing')
    expect(state.fromVersion).toBe('1.0.0')
    expect(state.targetVersion).toBe('1.0.1')
    expect(fs.existsSync(path.join(tmpRoot, 'update-state.json'))).toBe(true)
  })
})
