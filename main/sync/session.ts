/**
 * Shared background sync session: one inflight run for the app, progress
 * broadcast to every BrowserWindow so Home / Backup & Sync stay in sync
 * when the user navigates away mid-run.
 */
import { createRequire } from 'module'
import type Database from 'better-sqlite3'
import {
  DEFAULT_SYNC_BUDGET_ITEMS,
  DEFAULT_SYNC_BUDGET_MS,
  SYNC_BUDGET_RESUME_DELAY_MS,
} from './budget'
import type { SyncProgressEvent } from './progress'
import type { SyncWorkerResult } from './types'
import { runSyncWorkerUntilCaughtUp } from './worker'
import { yieldToMain } from './yield'

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
/** True while a budgeted follow-up is scheduled — keeps the UI bar visible. */
let resumePending = false
let resumeTimer: ReturnType<typeof setTimeout> | null = null
/** Orphan backfill once per catch-up chain (first run only). */
let orphanDoneForSchool: string | null = null

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
    active: active != null || resumePending,
    trigger: active?.trigger ?? (resumePending ? 'periodic' : null),
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

function clearResumeTimer(): void {
  if (resumeTimer) {
    clearTimeout(resumeTimer)
    resumeTimer = null
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
    /** Override default 60s budget; 0 = unlimited. */
    maxDurationMs?: number
    /** Override default 2500-item budget; 0 = unlimited. */
    maxItems?: number
    /** When true, do not schedule a follow-up after a budget pause. */
    skipAutoResume?: boolean
    /** Skip expensive orphan table scan (auto-resume sets this). */
    skipOrphanEnqueue?: boolean
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

  clearResumeTimer()
  resumePending = false

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

  const maxDurationMs =
    options.maxDurationMs !== undefined
      ? options.maxDurationMs
      : DEFAULT_SYNC_BUDGET_MS
  const maxItems =
    options.maxItems !== undefined
      ? options.maxItems
      : DEFAULT_SYNC_BUDGET_ITEMS

  const skipOrphan =
    options.skipOrphanEnqueue === true ||
    orphanDoneForSchool === options.schoolId

  void (async () => {
    try {
      // Return to the event loop so the renderer can paint + the cursor stays live
      // before better-sqlite3 work blocks the main process.
      await yieldToMain()
      const result = await runSyncWorkerUntilCaughtUp(db, {
        schoolId: options.schoolId,
        maxRounds: options.maxRounds,
        skipPush: options.skipPush,
        skipPull: options.skipPull,
        maxDurationMs,
        maxItems,
        skipOrphanEnqueue: skipOrphan,
        onProgress: broadcastSyncProgress,
      })
      if (!skipOrphan) {
        orphanDoneForSchool = options.schoolId
      }
      settle(result)

      // Budget pause: keep the bar visible and continue without re-scanning orphans.
      if (
        result.hasMore &&
        result.ok &&
        !options.skipAutoResume &&
        maxDurationMs > 0
      ) {
        const schoolId = options.schoolId
        resumePending = true
        const prev = lastProgress
        broadcastSyncProgress({
          phase: 'push',
          percent: prev?.percent ?? 0,
          message:
            prev?.criticalReady
              ? prev.message || 'Ready for mobile · continuing in background…'
              : 'Continuing sync in background…',
          pushTotal: prev?.pushTotal ?? 0,
          pushDone: prev?.pushDone ?? 0,
          pullTotal: prev?.pullTotal ?? 0,
          pullDone: prev?.pullDone ?? 0,
          lane: prev?.lane,
          criticalReady: prev?.criticalReady,
          laneCounts: prev?.laneCounts,
        })
        resumeTimer = setTimeout(() => {
          resumeTimer = null
          resumePending = false
          void runBackgroundSync(db, {
            schoolId,
            trigger: 'periodic',
            skipAutoResume: false,
            skipOrphanEnqueue: true,
          }).catch(() => {
            resumePending = false
          })
        }, SYNC_BUDGET_RESUME_DELAY_MS)
      } else if (!result.hasMore) {
        orphanDoneForSchool = null
        resumePending = false
      }
    } catch (err) {
      resumePending = false
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
  clearResumeTimer()
  active = null
  lastProgress = null
  resumePending = false
  orphanDoneForSchool = null
}
