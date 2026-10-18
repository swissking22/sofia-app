/**
 * Enqueue + push Sunrise Academy staff / RBAC / timetable ahead of the
 * attendance & finance backlog so Sofia Teacher mobile can be tested.
 *
 * Usage:
 *   node --require ./scripts/mock-electron.cjs ./node_modules/tsx/dist/cli.mjs scripts/pushSunriseStaffMobile.ts --dev
 */

import type Database from 'better-sqlite3'
import { openSeedDatabase, resolveDefaultDbPath } from './seed/db'
import { enqueueSync } from '../main/sync/queue'
import { pushPendingSync } from '../main/sync/push'
import { markSynced } from '../main/sync/queue'

const SCHOOL_NAME = 'Sunrise Academy'

/** Tables needed for mobile auth, assignments, and timetable. */
const MOBILE_TABLES = [
  'schools',
  'permissions',
  'roles',
  'role_permissions',
  'users',
  'staff',
  'staff_subjects',
  'staff_classes',
  'school_day_breaks',
  'timetable_slots',
  'academic_years',
  'academic_levels',
  'sections',
  'specializations',
  'classes',
  'subjects',
  'subject_classes',
] as const

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const has = (flag: string) => args.includes(flag)
  return {
    dbPath: get('--db') || resolveDefaultDbPath(has('--dev')),
  }
}

function tableHasColumn(db: Database.Database, table: string, col: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string
  }>
  return cols.some((c) => c.name === col)
}

function pendingExists(
  db: Database.Database,
  table: string,
  recordId: string
): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM sync_queue
       WHERE table_name = ? AND record_id = ? AND status = 'pending'
       LIMIT 1`
    )
    .get(table, recordId) as { ok: number } | undefined
  return Boolean(row)
}

function enqueueSunriseMobile(db: Database.Database, schoolId: string): number {
  let enqueued = 0

  for (const table of MOBILE_TABLES) {
    const hasSchoolId = tableHasColumn(db, table, 'school_id')
    const hasDeleted = tableHasColumn(db, table, 'deleted_at')
    const deletedClause = hasDeleted ? 'AND deleted_at IS NULL' : ''

    let rows: Array<Record<string, unknown>> = []
    try {
      if (table === 'permissions') {
        rows = db
          .prepare(
            `SELECT * FROM permissions WHERE sync_status = 'pending' ${deletedClause} LIMIT 5000`
          )
          .all() as Array<Record<string, unknown>>
      } else if (table === 'role_permissions') {
        rows = db
          .prepare(
            `SELECT rp.* FROM role_permissions rp
             JOIN roles r ON r.id = rp.role_id
             WHERE r.school_id = ? AND rp.sync_status = 'pending'
               ${hasDeleted ? 'AND rp.deleted_at IS NULL' : ''}
             LIMIT 5000`
          )
          .all(schoolId) as Array<Record<string, unknown>>
      } else if (table === 'staff_subjects' || table === 'staff_classes') {
        rows = db
          .prepare(
            `SELECT t.* FROM ${table} t
             JOIN staff st ON st.id = t.staff_id
             WHERE st.school_id = ? AND t.sync_status = 'pending'
               ${hasDeleted ? 'AND t.deleted_at IS NULL' : ''}
             LIMIT 5000`
          )
          .all(schoolId) as Array<Record<string, unknown>>
      } else if (table === 'subject_classes') {
        rows = db
          .prepare(
            `SELECT t.* FROM subject_classes t
             JOIN classes c ON c.id = t.class_id
             WHERE c.school_id = ? AND t.sync_status = 'pending'
               ${hasDeleted ? 'AND t.deleted_at IS NULL' : ''}
             LIMIT 5000`
          )
          .all(schoolId) as Array<Record<string, unknown>>
      } else if (table === 'schools') {
        rows = db
          .prepare(
            `SELECT * FROM schools WHERE id = ? AND sync_status = 'pending' ${deletedClause}`
          )
          .all(schoolId) as Array<Record<string, unknown>>
      } else if (hasSchoolId) {
        rows = db
          .prepare(
            `SELECT * FROM ${table}
             WHERE school_id = ? AND sync_status = 'pending' ${deletedClause}
             LIMIT 5000`
          )
          .all(schoolId) as Array<Record<string, unknown>>
      } else {
        continue
      }
    } catch (err) {
      console.warn(
        `  skip ${table}:`,
        err instanceof Error ? err.message : err
      )
      continue
    }

    for (const row of rows) {
      const id = String(row.id || '')
      if (!id || pendingExists(db, table, id)) continue
      enqueueSync(db, table, id, 'INSERT', row)
      enqueued += 1
    }
    if (rows.length) {
      console.log(`  queued ${table}: ${rows.length} pending row(s)`)
    }
  }

  return enqueued
}

function countMobilePending(db: Database.Database): number {
  const placeholders = MOBILE_TABLES.map(() => '?').join(', ')
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM sync_queue
       WHERE status = 'pending' AND table_name IN (${placeholders})`
    )
    .get(...MOBILE_TABLES) as { n: number }
  return Number(row.n) || 0
}

async function main(): Promise<void> {
  const { dbPath } = parseArgs(process.argv)
  console.log(`[sofia] Push Sunrise staff/mobile → ${dbPath}`)

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

    // Abandon unrelated foreign/failed school short-code conflict so it
    // does not confuse diagnostics (does not block Sunrise push).
    const foreignFailed = db
      .prepare(
        `SELECT id, record_id, last_error FROM sync_queue
         WHERE table_name = 'schools' AND status = 'failed'
           AND record_id != ?`
      )
      .all(school.id) as Array<{ id: string; record_id: string; last_error: string }>
    for (const row of foreignFailed) {
      markSynced(db, row.id)
      console.log(
        `  cleared foreign failed school queue ${row.record_id}: ${row.last_error}`
      )
    }

    const enqueued = enqueueSunriseMobile(db, school.id)
    console.log(`  Enqueued ${enqueued} mobile-critical item(s)`)

    let remaining = countMobilePending(db)
    console.log(`  Mobile pending in outbox: ${remaining}`)

    let rounds = 0
    let ok = 0
    let failed = 0
    const maxRounds = 80

    while (remaining > 0 && rounds < maxRounds) {
      rounds += 1
      const result = await pushPendingSync({
        db,
        schoolId: school.id,
        batchSize: 50,
      })
      ok += result.successful
      failed += result.failed
      remaining = countMobilePending(db)
      console.log(
        `  round ${rounds}: +${result.successful} ok, ${result.failed} failed, mobile pending=${remaining}`
      )
      if (result.processed === 0) break
      if (result.successful === 0 && result.failed > 0) break
    }

    console.log('\nDone.')
    console.log(`  Pushed ${ok} item(s); ${failed} failed; remaining mobile=${remaining}`)
    console.log('  Mobile login: *@sofia.demo / Sofia@Staff1 (after Auth was provisioned)')
    if (remaining > 0) {
      console.log('  Tip: run again, or Sync Now in the app for leftovers.')
    }
  } finally {
    db.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
