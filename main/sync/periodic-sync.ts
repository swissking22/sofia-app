/**
 * Quiet background sync while the app is online.
 * Honours system_settings.auto_sync + sync_interval_minutes.
 * Does not emit sync:progress (manual Sync Now still does).
 */
import { createRequire } from 'module'
import type Database from 'better-sqlite3'
import { getDatabase } from '../db'
import { createRepositories } from '../db/repositories'
import { runSyncWorkerUntilCaughtUp } from './worker'

const require = createRequire(import.meta.url)

const DEFAULT_INTERVAL_MINUTES = 30
const MIN_INTERVAL_MINUTES = 5
const MAX_INTERVAL_MINUTES = 24 * 60

let timer: ReturnType<typeof setInterval> | null = null
let initialTimer: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<void> | null = null
let started = false

export type PeriodicSyncDeps = {
  getDb?: () => Database.Database
  isOnline?: () => boolean
  /** Override sync runner (tests). Defaults to runSyncWorkerUntilCaughtUp. */
  runSync?: (
    db: Database.Database,
    options: { schoolId: string }
  ) => Promise<{
    ok: boolean
    processed: number
    failed: number
    hasMore?: boolean
  }>
}

function defaultIsOnline(): boolean {
  try {
    // Lazy require so unit tests can import this module without Electron.
    const electron = require('electron') as {
      net?: { isOnline?: () => boolean }
    }
    if (typeof electron.net?.isOnline === 'function') {
      return electron.net.isOnline()
    }
  } catch {
    /* not in Electron */
  }
  return true
}

function clampIntervalMinutes(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_MINUTES
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(n)))
}

/** Read auto-sync prefs for the latest school (or null if none). */
export function readPeriodicSyncPrefs(
  db: Database.Database
): { schoolId: string; enabled: boolean; intervalMinutes: number } | null {
  const school = db
    .prepare(
      `SELECT id FROM schools WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`
    )
    .get() as { id: string } | undefined
  if (!school?.id) return null

  const repos = createRepositories(db)
  const settings = repos.systemAdmin.ensureSettings(school.id) as Record<
    string,
    unknown
  >
  return {
    schoolId: school.id,
    enabled: Number(settings.auto_sync) === 1,
    intervalMinutes: clampIntervalMinutes(settings.sync_interval_minutes),
  }
}

async function tick(deps: PeriodicSyncDeps = {}): Promise<void> {
  if (inflight) return
  const isOnline = deps.isOnline ?? defaultIsOnline
  if (!isOnline()) return

  const db = (deps.getDb ?? getDatabase)()
  const prefs = readPeriodicSyncPrefs(db)
  if (!prefs?.enabled) return

  const runSync = deps.runSync ?? runSyncWorkerUntilCaughtUp

  inflight = (async () => {
    try {
      const result = await runSync(db, {
        schoolId: prefs.schoolId,
        // Quiet: no onProgress → no sync:progress spam in the UI
      })
      const repos = createRepositories(db)
      repos.backupSync.markSyncResult(prefs.schoolId, {
        ok: result.failed === 0,
        processed: result.processed,
        failed: result.failed,
      })
      if (!result.ok || result.failed > 0) {
        console.warn(
          '[periodic-sync] finished with issues',
          `processed=${result.processed}`,
          `failed=${result.failed}`,
          `hasMore=${Boolean(result.hasMore)}`
        )
      } else if (result.processed > 0) {
        console.log(
          '[periodic-sync] ok',
          `processed=${result.processed}`,
          `school=${prefs.schoolId}`
        )
      }
    } catch (err) {
      console.warn(
        '[periodic-sync] skipped/failed (offline or error)',
        err instanceof Error ? err.message : err
      )
    }
  })().finally(() => {
    inflight = null
  })

  await inflight
}

/**
 * Start (or restart) the quiet periodic sync timer.
 * Safe to call multiple times — clears any previous interval.
 */
export function startPeriodicSync(deps: PeriodicSyncDeps = {}): void {
  stopPeriodicSync()
  started = true

  const db = (deps.getDb ?? getDatabase)()
  const prefs = readPeriodicSyncPrefs(db)
  const minutes = prefs?.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES
  const ms = minutes * 60 * 1000

  // First pass shortly after startup (quiet, non-blocking)
  initialTimer = setTimeout(() => {
    initialTimer = null
    void tick(deps)
  }, 15_000)

  timer = setInterval(() => {
    void tick(deps)
  }, ms)

  console.log(
    '[periodic-sync] started',
    `interval=${minutes}m`,
    `auto_sync=${prefs?.enabled ? 'on' : 'off'}`
  )
}

/** Stop the timer (does not cancel an in-flight run). */
export function stopPeriodicSync(): void {
  if (initialTimer) {
    clearTimeout(initialTimer)
    initialTimer = null
  }
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}

/** Re-read settings and reschedule (call after settings save). */
export function restartPeriodicSync(deps: PeriodicSyncDeps = {}): void {
  if (!started && timer == null) {
    startPeriodicSync(deps)
    return
  }
  startPeriodicSync(deps)
}

/** Test helpers */
export async function runPeriodicSyncTickForTests(
  deps: PeriodicSyncDeps = {}
): Promise<void> {
  await tick(deps)
}

export async function flushPeriodicSyncForTests(): Promise<void> {
  if (inflight) await inflight
}

export function isPeriodicSyncStartedForTests(): boolean {
  return started || timer != null
}
