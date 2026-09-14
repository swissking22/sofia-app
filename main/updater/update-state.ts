import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export type UpdateLifecycleStatus =
  | 'idle'
  | 'backup-created'
  | 'update-downloaded'
  | 'installing'
  | 'updated'
  | 'rollback-required'
  | 'rollback-completed'
  | 'failed'

export type PersistedUpdateState = {
  status: UpdateLifecycleStatus
  fromVersion: string | null
  targetVersion: string | null
  backupPath: string | null
  manifestPath: string | null
  updatedAt: string
  lastError: string | null
  /** Target version that failed — do not auto-retry this version. */
  blockedTargetVersion: string | null
  recoveryAcknowledged: boolean
}

const DEFAULT_STATE: PersistedUpdateState = {
  status: 'idle',
  fromVersion: null,
  targetVersion: null,
  backupPath: null,
  manifestPath: null,
  updatedAt: new Date().toISOString(),
  lastError: null,
  blockedTargetVersion: null,
  recoveryAcknowledged: false,
}

export function getUpdateStatePath(userDataPath = app.getPath('userData')): string {
  return path.join(userDataPath, 'update-state.json')
}

export function readUpdateState(
  userDataPath = app.getPath('userData')
): PersistedUpdateState {
  const file = getUpdateStatePath(userDataPath)
  try {
    if (!fs.existsSync(file)) return { ...DEFAULT_STATE }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<PersistedUpdateState>
    return { ...DEFAULT_STATE, ...parsed }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function writeUpdateState(
  patch: Partial<PersistedUpdateState>,
  userDataPath = app.getPath('userData')
): PersistedUpdateState {
  const current = readUpdateState(userDataPath)
  const next: PersistedUpdateState = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  const file = getUpdateStatePath(userDataPath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // Atomic-ish write: temp then rename
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
  fs.renameSync(tmp, file)
  return next
}
