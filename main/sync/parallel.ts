/**
 * Capped parallel push: foundation tables first (sequential), then up to N
 * independent tables concurrent. SQLite apply stays on the main connection
 * (sync statements); only network RPCs overlap.
 */
import type Database from 'better-sqlite3'
import {
  countReadyPendingSyncItems,
  listReadyPendingTables,
} from './queue'
import { pushPendingSync } from './push'
import type { PushSyncOptions, PushSyncResult } from './types'

/** Must land before anything that FKs them — never parallelize these. */
export const FOUNDATION_SYNC_TABLES = [
  'schools',
  'permissions',
  'roles',
  'role_permissions',
] as const

export const DEFAULT_PARALLEL_PUSH_CONCURRENCY = 3

const FOUNDATION_SET = new Set<string>(FOUNDATION_SYNC_TABLES)

export function isFoundationSyncTable(tableName: string): boolean {
  return FOUNDATION_SET.has(tableName)
}

function mergePush(a: PushSyncResult, b: PushSyncResult): PushSyncResult {
  return {
    ok: a.ok && b.ok,
    processed: a.processed + b.processed,
    successful: a.successful + b.successful,
    failed: a.failed + b.failed,
    conflicts: a.conflicts + b.conflicts,
    skipped: a.skipped || b.skipped,
    message: b.message || a.message,
    hasMore: Boolean(a.hasMore || b.hasMore),
  }
}

export type ParallelPushOptions = PushSyncOptions & {
  /** Max concurrent non-foundation table pushes (default 3). */
  concurrency?: number
}

/**
 * One drain step: foundation table(s) if any pending, else up to `concurrency`
 * independent tables in parallel.
 */
export async function pushPendingSyncParallel(
  options: ParallelPushOptions
): Promise<PushSyncResult> {
  const db = options.db
  const concurrency = Math.max(
    1,
    options.concurrency ?? DEFAULT_PARALLEL_PUSH_CONCURRENCY
  )
  const laneOpts = {
    maxLane: options.maxLane,
    tableNames: options.tableNames,
  }

  const foundationPending = countReadyPendingSyncItems(db, {
    ...laneOpts,
    tableNames: [...FOUNDATION_SYNC_TABLES],
  })

  if (foundationPending > 0) {
    return pushPendingSync({
      ...options,
      tableNames: [...FOUNDATION_SYNC_TABLES],
      skipHousekeeping: options.skipHousekeeping,
    })
  }

  const tables = listReadyPendingTables(db, laneOpts).filter(
    (t) => !isFoundationSyncTable(t)
  )

  if (tables.length === 0) {
    return pushPendingSync(options)
  }

  if (concurrency <= 1 || tables.length === 1) {
    return pushPendingSync({
      ...options,
      tableNames: [tables[0]],
      skipHousekeeping: options.skipHousekeeping,
    })
  }

  const chunk = tables.slice(0, concurrency)
  const results = await Promise.all(
    chunk.map((table, index) =>
      pushPendingSync({
        ...options,
        tableNames: [table],
        // First sibling still runs device/repair; others skip.
        skipHousekeeping: options.skipHousekeeping || index > 0,
      })
    )
  )

  return results.reduce((acc, r) => mergePush(acc, r))
}

/** Test helper: peek which tables would run this round. */
export function peekParallelPushTables(
  db: Database.Database,
  options?: {
    maxLane?: PushSyncOptions['maxLane']
    concurrency?: number
  }
): { mode: 'foundation' | 'parallel' | 'single'; tables: string[] } {
  const concurrency = Math.max(
    1,
    options?.concurrency ?? DEFAULT_PARALLEL_PUSH_CONCURRENCY
  )
  const foundationPending = countReadyPendingSyncItems(db, {
    maxLane: options?.maxLane,
    tableNames: [...FOUNDATION_SYNC_TABLES],
  })
  if (foundationPending > 0) {
    return { mode: 'foundation', tables: [...FOUNDATION_SYNC_TABLES] }
  }
  const tables = listReadyPendingTables(db, {
    maxLane: options?.maxLane,
  }).filter((t) => !isFoundationSyncTable(t))
  if (tables.length <= 1 || concurrency <= 1) {
    return { mode: 'single', tables: tables.slice(0, 1) }
  }
  return { mode: 'parallel', tables: tables.slice(0, concurrency) }
}
