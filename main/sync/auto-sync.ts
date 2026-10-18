/**
 * After teacher/staff mutations that affect the mobile app, push the critical
 * outbox (RBAC + staff/users/assignments) when the network is reachable.
 * Failures leave rows pending for Sync Now / periodic sync.
 */
import type Database from 'better-sqlite3'
import { getDatabase } from '../db'
import { runSyncWorker } from './worker'

let inflight: Promise<void> | null = null
let queuedSchoolId: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null

const DEBOUNCE_MS = 800

async function runQueued(): Promise<void> {
  const schoolId = queuedSchoolId
  queuedSchoolId = null
  if (!schoolId) return

  try {
    // Critical lane only, no time budget, push-only — get mobile access online
    // quickly without waiting on attendance/CA history.
    const result = await runSyncWorker(getDatabase() as Database.Database, {
      schoolId,
      maxLane: 'critical',
      skipPull: true,
      skipOrphanEnqueue: true,
      maxDurationMs: 0,
      maxItems: 0,
      drainPush: true,
      maxPushBatches: 400,
    })
    if (!result.push.ok || result.push.failed > 0) {
      console.warn(
        '[auto-sync] Teacher-ready sync finished with issues',
        result.push
      )
    } else {
      console.log(
        '[auto-sync] Teacher-ready sync ok',
        `pushed=${result.push.successful}`
      )
    }
  } catch (err) {
    console.warn(
      '[auto-sync] Teacher-ready sync skipped/failed (offline or error)',
      err instanceof Error ? err.message : err
    )
  }
}

/**
 * Debounced fire-and-forget sync for teacher mobile readiness.
 * Safe to call from IPC handlers; does not block the UI reply.
 */
export function scheduleTeacherReadySync(schoolId: string | null | undefined): void {
  if (!schoolId) return
  queuedSchoolId = schoolId
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    if (inflight) {
      void inflight.finally(() => {
        if (queuedSchoolId) scheduleTeacherReadySync(queuedSchoolId)
      })
      return
    }
    inflight = runQueued().finally(() => {
      inflight = null
    })
  }, DEBOUNCE_MS)
}

/** Test helper — flush pending debounce immediately. */
export async function flushTeacherReadySyncForTests(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (inflight) await inflight
  if (queuedSchoolId) {
    inflight = runQueued().finally(() => {
      inflight = null
    })
    await inflight
  }
}
