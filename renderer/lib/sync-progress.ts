/** Live background sync progress from main (`sync:progress` + `sync:get-status`). */

import React from 'react'

export type SyncProgressPhase =
  | 'starting'
  | 'push'
  | 'pull'
  | 'assets'
  | 'done'

export type SyncLane = 'critical' | 'operational' | 'bulk'

export type SyncLaneCounts = {
  critical: number
  operational: number
  bulk: number
  total: number
}

export interface SyncProgressEvent {
  phase: SyncProgressPhase
  percent: number
  message: string
  pushTotal: number
  pushDone: number
  pullTotal: number
  pullDone: number
  indeterminate?: boolean
  lane?: SyncLane
  /** Critical outbox empty — mobile-critical data has been pushed. */
  criticalReady?: boolean
  laneCounts?: SyncLaneCounts
}

export type SyncTrigger = 'manual' | 'periodic' | 'teacher'

export interface SyncSessionStatus {
  active: boolean
  trigger: SyncTrigger | null
  schoolId: string | null
  progress: SyncProgressEvent | null
  startedAt: number | null
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

export async function fetchSyncStatus(): Promise<SyncSessionStatus | null> {
  try {
    const res = (await window.ipc.invoke('sync:get-status')) as {
      ok?: boolean
      data?: SyncSessionStatus
    }
    if (res?.ok && res.data) return res.data
  } catch {
    /* IPC unavailable */
  }
  return null
}

export function formatSyncPercent(event: SyncProgressEvent | null): string {
  if (!event) return ''
  if (event.indeterminate) return event.message || 'Syncing…'
  return event.message || `${event.percent}%`
}

const DONE_CLEAR_MS = 2500

/**
 * Shared sync % across screens. Hydrates from main on mount so navigating
 * away mid-sync (Home ↔ Backup & Sync ↔ elsewhere) keeps the bar accurate.
 */
export function useBackgroundSyncProgress(): {
  progress: SyncProgressEvent | null
  active: boolean
  trigger: SyncTrigger | null
} {
  const [progress, setProgress] = React.useState<SyncProgressEvent | null>(
    null
  )
  const [active, setActive] = React.useState(false)
  const [trigger, setTrigger] = React.useState<SyncTrigger | null>(null)

  React.useEffect(() => {
    let cancelled = false
    let clearTimer: ReturnType<typeof setTimeout> | null = null

    const clearDoneSoon = () => {
      if (clearTimer) clearTimeout(clearTimer)
      clearTimer = setTimeout(() => {
        if (cancelled) return
        setProgress((cur) => (cur?.phase === 'done' ? null : cur))
        setActive(false)
      }, DONE_CLEAR_MS)
    }

    void fetchSyncStatus().then((status) => {
      if (cancelled || !status) return
      setActive(status.active)
      setTrigger(status.trigger)
      if (status.progress) {
        setProgress(status.progress)
        // Keep showing in-progress / continuing phases even if the session
        // briefly reports inactive between budgeted auto-resume chunks.
        if (!status.active && status.progress.phase === 'done') {
          clearDoneSoon()
        } else if (status.active || status.progress.phase !== 'done') {
          setActive(true)
        }
      }
    })

    const unsub = subscribeSyncProgress((event) => {
      if (clearTimer) {
        clearTimeout(clearTimer)
        clearTimer = null
      }
      setProgress(event)
      setActive(event.phase !== 'done')
      if (event.phase === 'done') {
        clearDoneSoon()
      }
    })

    return () => {
      cancelled = true
      if (clearTimer) clearTimeout(clearTimer)
      unsub()
    }
  }, [])

  return { progress, active, trigger }
}
