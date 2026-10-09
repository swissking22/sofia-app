/** Live Sync Now progress events from main (`sync:progress`). */

export type SyncProgressPhase =
  | 'starting'
  | 'push'
  | 'pull'
  | 'assets'
  | 'done'

export interface SyncProgressEvent {
  phase: SyncProgressPhase
  percent: number
  message: string
  pushTotal: number
  pushDone: number
  pullTotal: number
  pullDone: number
  indeterminate?: boolean
}

export function subscribeSyncProgress(
  onProgress: (event: SyncProgressEvent) => void
): () => void {
  return window.ipc.on('sync:progress', (...args: unknown[]) => {
    const event = args[0] as SyncProgressEvent | undefined
    if (!event || typeof event !== 'object') return
    if (typeof event.percent !== 'number') return
    onProgress(event)
  })
}

export function formatSyncPercent(event: SyncProgressEvent | null): string {
  if (!event) return ''
  if (event.indeterminate) return event.message || 'Syncing…'
  return event.message || `${event.percent}%`
}
