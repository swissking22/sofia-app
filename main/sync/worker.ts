/**
 * Sync worker stub.
 * Reads pending sync_queue items and simulates sending to a server.
 * DO NOT call a real API — mark as synced locally only.
 */
import type Database from 'better-sqlite3'
import { getPendingSyncItems, markSynced, markFailed } from './queue'

export async function runSyncWorker(db: Database.Database): Promise<{
  processed: number
  failed: number
}> {
  const items = getPendingSyncItems(db)
  let processed = 0
  let failed = 0

  for (const item of items) {
    try {
      // Simulate network send — no real API call
      await simulateSend(item)
      markSynced(db, item.id as string)
      processed += 1
    } catch {
      markFailed(db, item.id as string)
      failed += 1
    }
  }

  return { processed, failed }
}

/** Fake delay to mimic a network round-trip. */
function simulateSend(_item: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10))
}
