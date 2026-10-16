/**
 * Shared background sync session: one inflight run for the app, progress
 * broadcast to every BrowserWindow so Home / Backup & Sync stay in sync
 * when the user navigates away mid-run.
 */
import { createRequire } from 'module'
import type Database from 'better-sqlite3'
import type { SyncProgressEvent } from './progress'
import type { SyncWorkerResult } from './types'
import { runSyncWorkerUntilCaughtUp } from './worker'

const nodeRequire = createRequire(import.meta.url)

export type SyncTrigger = 'manual' | 'periodic' | 'teacher'

export interface SyncSessionStatus {
  active: boolean
  trigger: SyncTrigger | null
  schoolId: string | null
  progress: SyncProgressEvent | null
  startedAt: number | null
}

type ActiveRun = {
  schoolId: string
  trigger: SyncTrigger
  promise: Promise<SyncWorkerResult>
  startedAt: number
}

let active: ActiveRun | null = null
let lastProgress: SyncProgressEvent | null = null

function getBrowserWindows(): Array<{
  isDestroyed: () => boolean
  webContents: { send: (channel: string, payload: unknown) => void }
}> {
  try {
    const electron = nodeRequire('electron') as {
      BrowserWindow?: {
        getAllWindows: () => Array<{
          isDestroyed: () => boolean
          webContents: { send: (channel: string, payload: unknown) => void }
        }>
      }
    }
    return electron.BrowserWindow?.getAllWindows?.() ?? []
  } catch {
    return []
  }
}

export function getSyncSessionStatus(): SyncSessionStatus {
  return {
    active: active != null,
    trigger: active?.trigger ?? null,
    schoolId: active?.schoolId ?? null,
    progress: lastProgress,
    startedAt: active?.startedAt ?? null,
  }
}

/** Broadcast live progress to every renderer (not just the invoking sender). */
export function broadcastSyncProgress(progress: SyncProgressEvent): void {
  lastProgress = progress
  for (const win of getBrowserWindows()) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send('sync:progress', progress)
      }
    } catch {
      /* window closed */
    }
  }
}

/**
 * Run (or join) a catch-up sync. Concurrent callers for the same school share
 * one worker promise so Sync Now + periodic never double-push.
 */
export async function runBackgroundSync(
  db: Database.Database,
  options: {
    schoolId: string
    trigger?: SyncTrigger
    maxRounds?: number
    skipPush?: boolean
    skipPull?: boolean
  }
): Promise<SyncWorkerResult> {
  const trigger = options.trigger ?? 'manual'

  if (active) {
    if (active.schoolId === options.schoolId) {
      return active.promise
    }
    try {
      await active.promise
    } catch {
      /* start a new run after the previous one settles */
    }
  }

  const startedAt = Date.now()
  broadcastSyncProgress({
    phase: 'starting',
    percent: 0,
    message:
      trigger === 'periodic' ? 'Background sync…' : 'Starting sync…',
    pushTotal: 0,
    pushDone: 0,
    pullTotal: 0,
    pullDone: 0,
  })

  let settle!: (result: SyncWorkerResult) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<SyncWorkerResult>((res, rej) => {
    settle = res
    reject = rej
  })

  active = {
    schoolId: options.schoolId,
    trigger,
    promise,
    startedAt,
  }

  void (async () => {
    try {
      const result = await runSyncWorkerUntilCaughtUp(db, {
        schoolId: options.schoolId,
        maxRounds: options.maxRounds,
        skipPush: options.skipPush,
        skipPull: options.skipPull,
        onProgress: broadcastSyncProgress,
      })
      settle(result)
    } catch (err) {
      reject(err)
    } finally {
      if (active?.promise === promise) {
        active = null
      }
    }
  })()

  return promise
}

/** Test helper — clear session state between cases. */
export function resetSyncSessionForTests(): void {
  active = null
  lastProgress = null
}
