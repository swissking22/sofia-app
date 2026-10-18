/**
 * Drain the rest of Sunrise Academy’s sync outbox (attendance, CA, results,
 * finance, …) after the mobile-critical push.
 *
 * Usage:
 *   node --import ./scripts/mock-electron-register.mjs --import tsx scripts/pushSunriseRemaining.ts --dev
 */

import { openSeedDatabase, resolveDefaultDbPath } from './seed/db'
import {
  countReadyPendingSyncItems,
  enqueueOrphanedPendingRows,
  markSynced,
} from '../main/sync/queue'
import { pushPendingSync } from '../main/sync/push'

const SCHOOL_NAME = 'Sunrise Academy'

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const has = (flag: string) => args.includes(flag)
  return {
    dbPath: get('--db') || resolveDefaultDbPath(has('--dev')),
    batchSize: Number(get('--batch') || 50) || 50,
    maxRounds: Number(get('--max-rounds') || 500) || 500,
  }
}

async function main(): Promise<void> {
  const { dbPath, batchSize, maxRounds } = parseArgs(process.argv)
  console.log(`[sofia] Push Sunrise remaining → ${dbPath}`)

  const db = openSeedDatabase({ dbPath, reset: false })
  try {
    const school = db
      .prepare(
        `SELECT id, name, short_code FROM schools
         WHERE deleted_at IS NULL AND name = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(SCHOOL_NAME) as
      | { id: string; name: string; short_code: string | null }
      | undefined
    if (!school) throw new Error(`School “${SCHOOL_NAME}” not found.`)

    console.log(`  School ${school.name} (${school.short_code}) ${school.id}`)

    // Clear stuck short-code conflict on a different school id (noise only).
    const foreignFailed = db
      .prepare(
        `SELECT id, record_id, last_error FROM sync_queue
         WHERE table_name = 'schools' AND status = 'failed'
           AND record_id != ?`
      )
      .all(school.id) as Array<{
      id: string
      record_id: string
      last_error: string | null
    }>
    for (const row of foreignFailed) {
      markSynced(db, row.id)
      console.log(`  cleared foreign failed school ${row.record_id}`)
    }

    // Also abandon Sunrise school queue rows that already failed short_code unique
    // so they do not keep resurfacing as barriers.
    const sunriseSchoolFailed = db
      .prepare(
        `SELECT id, last_error FROM sync_queue
         WHERE table_name = 'schools' AND record_id = ? AND status = 'failed'`
      )
      .all(school.id) as Array<{ id: string; last_error: string | null }>
    for (const row of sunriseSchoolFailed) {
      if (
        row.last_error &&
        /short_code|unique constraint/i.test(row.last_error)
      ) {
        markSynced(db, row.id)
        console.log(`  cleared Sunrise school short_code conflict queue row`)
      }
    }

    let orphaned = 0
    for (let i = 0; i < 8; i += 1) {
      const n = await enqueueOrphanedPendingRows(db, {
        limit: 5000,
        yieldEveryTable: false,
      })
      orphaned += n
      if (n === 0) break
      console.log(`  orphan pass ${i + 1}: +${n}`)
    }
    console.log(`  Orphans enqueued: ${orphaned}`)

    let remaining = countReadyPendingSyncItems(db)
    console.log(`  Ready pending: ${remaining}`)

    let rounds = 0
    let ok = 0
    let failed = 0

    while (remaining > 0 && rounds < maxRounds) {
      rounds += 1
      const result = await pushPendingSync({
        db,
        schoolId: school.id,
        batchSize,
      })
      ok += result.successful
      failed += result.failed
      remaining = countReadyPendingSyncItems(db)
      if (rounds === 1 || rounds % 10 === 0 || remaining === 0) {
        console.log(
          `  round ${rounds}: +${result.successful} ok / ${result.failed} fail · pending=${remaining}`
        )
      }
      if (result.processed === 0) {
        console.log('  stop: empty batch')
        break
      }
      if (result.successful === 0 && result.failed > 0 && !result.hasMore) {
        console.log('  stop: batch failed with no progress')
        break
      }
      // Permanent barrier already stops inside push; keep going on soft fails.
    }

    console.log('\nDone.')
    console.log(
      `  Pushed ${ok} ok, ${failed} failed across ${rounds} round(s); pending=${remaining}`
    )
    if (remaining > 0) {
      console.log('  Re-run this script to continue draining.')
    }
  } finally {
    db.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
