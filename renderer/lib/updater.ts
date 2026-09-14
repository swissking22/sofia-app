export type UpdaterPhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'preparing-backup'
  | 'error'

export type UpdaterState = {
  enabled: boolean
  phase: UpdaterPhase
  currentVersion: string
  availableVersion: string | null
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
  errorMessage: string | null
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function getUpdaterStatus(): Promise<Result<UpdaterState>> {
  return (await window.ipc.invoke('updater:get-status')) as Result<UpdaterState>
}

export async function downloadAppUpdate(): Promise<Result<UpdaterState>> {
  return (await window.ipc.invoke('updater:download')) as Result<UpdaterState>
}

export async function installAppUpdate(): Promise<Result<boolean>> {
  return (await window.ipc.invoke('updater:install')) as Result<boolean>
}

export async function dismissAppUpdate(): Promise<Result<UpdaterState>> {
  return (await window.ipc.invoke('updater:dismiss')) as Result<UpdaterState>
}

export async function listPreUpdateBackups(): Promise<
  Result<
    Array<{
      backupVersion: string
      targetVersion: string
      createdAt: string
      verified: boolean
      fileSize: number
      backupPath: string
    }>
  >
> {
  return (await window.ipc.invoke('updater:list-pre-update-backups')) as Result<
    Array<{
      backupVersion: string
      targetVersion: string
      createdAt: string
      verified: boolean
      fileSize: number
      backupPath: string
    }>
  >
}

export function subscribeUpdaterEvent(
  channel:
    | 'updater:available'
    | 'updater:progress'
    | 'updater:downloaded'
    | 'updater:error'
    | 'updater:status'
    | 'updater:dismissed'
    | 'updater:preparing-backup'
    | 'updater:backup-failed',
  callback: (payload: unknown) => void
): () => void {
  return window.ipc.on(channel, callback)
}
