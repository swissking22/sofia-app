/**
 * Hard-delete every local school except Sunrise Academy (SRA).
 *
 * Usage:
 *   npx tsx scripts/purgeLocalKeepSunrise.ts --dev
 */
import Database from 'better-sqlite3'
import { openSeedDatabase, resolveDefaultDbPath } from './seed/db'

const KEEP_SHORT = 'SRA'
const KEEP_NAME = 'Sunrise Academy'

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

function tableColumns(db: Database.Database, table: string): Set<string> {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string
  }>
  return new Set(cols.map((c) => c.name))
}

function listTables(db: Database.Database): string[] {
  return (
    db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`
      )
      .all() as Array<{ name: string }>
  ).map((r) => r.name)
}

function main(): void {
  const { dbPath } = parseArgs(process.argv)
  console.log(`[sofia] Purge local keep Sunrise → ${dbPath}`)

  const db = openSeedDatabase({ dbPath, reset: false })
  try {
    const keep = db
      .prepare(
        `SELECT id, name, short_code FROM schools
         WHERE deleted_at IS NULL
           AND (short_code = ? OR name = ?)
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(KEEP_SHORT, KEEP_NAME) as
      | { id: string; name: string; short_code: string }
      | undefined
    if (!keep) throw new Error('Sunrise Academy (SRA) not found locally.')

    const drop = db
      .prepare(
        `SELECT id, name, short_code FROM schools
         WHERE id != ?`
      )
      .all(keep.id) as Array<{ id: string; name: string; short_code: string }>

    console.log(`  Keep: ${keep.name} (${keep.short_code}) ${keep.id}`)
    for (const d of drop) {
      console.log(`  Drop: ${d.name} (${d.short_code}) ${d.id}`)
    }
    if (!drop.length) {
      console.log('  Nothing to drop.')
      return
    }

    const dropIds = drop.map((d) => d.id)
    const placeholders = dropIds.map(() => '?').join(',')

    db.pragma('foreign_keys = OFF')
    const tx = db.transaction(() => {
      // 1) Tables with school_id
      for (const table of listTables(db)) {
        if (table === 'schools') continue
        const cols = tableColumns(db, table)
        if (!cols.has('school_id')) continue
        const res = db
          .prepare(`DELETE FROM ${table} WHERE school_id IN (${placeholders})`)
          .run(...dropIds)
        if (res.changes > 0) {
          console.log(`  ${table}: deleted ${res.changes} by school_id`)
        }
      }

      // 2) Orphan junction / child rows (parents already removed by school_id)
      const orphanCleanups: Array<[string, string]> = [
        [
          'role_permissions',
          `DELETE FROM role_permissions WHERE role_id NOT IN (SELECT id FROM roles)`,
        ],
        [
          'staff_subjects',
          `DELETE FROM staff_subjects WHERE staff_id NOT IN (SELECT id FROM staff)`,
        ],
        [
          'staff_classes',
          `DELETE FROM staff_classes WHERE staff_id NOT IN (SELECT id FROM staff)`,
        ],
        [
          'subject_classes',
          `DELETE FROM subject_classes WHERE class_id NOT IN (SELECT id FROM classes)`,
        ],
        [
          'payslip_lines',
          `DELETE FROM payslip_lines WHERE payslip_id NOT IN (SELECT id FROM payslips)`,
        ],
        [
          'invoice_lines',
          `DELETE FROM invoice_lines WHERE invoice_id NOT IN (SELECT id FROM invoices)`,
        ],
        [
          'payment_allocations',
          `DELETE FROM payment_allocations WHERE payment_id NOT IN (SELECT id FROM payments)`,
        ],
        [
          'ca_scores',
          `DELETE FROM ca_scores WHERE assessment_id NOT IN (SELECT id FROM ca_assessments)`,
        ],
        [
          'exam_scores',
          `DELETE FROM exam_scores WHERE paper_id NOT IN (SELECT id FROM exam_papers)`,
        ],
        [
          'attendance_records',
          `DELETE FROM attendance_records WHERE session_id NOT IN (SELECT id FROM attendance_sessions)`,
        ],
        [
          'result_subject_rows',
          `DELETE FROM result_subject_rows WHERE run_id NOT IN (SELECT id FROM result_runs)`,
        ],
        [
          'result_student_summaries',
          `DELETE FROM result_student_summaries WHERE run_id NOT IN (SELECT id FROM result_runs)`,
        ],
      ]
      for (const [table, joinSql] of orphanCleanups) {
        try {
          const res = db.prepare(joinSql).run()
          if (res.changes > 0) {
            console.log(`  ${table}: orphan cleanup ${res.changes}`)
          }
        } catch (err) {
          console.warn(
            `  skip ${table}:`,
            err instanceof Error ? err.message : err
          )
        }
      }

      // 3) sync_queue / conflicts referencing dropped schools
      let qChanges = 0
      for (const id of dropIds) {
        qChanges += db
          .prepare(
            `DELETE FROM sync_queue
             WHERE record_id = ?
                OR instr(payload, ?) > 0`
          )
          .run(id, id).changes
      }
      console.log(`  sync_queue: deleted ${qChanges}`)

      try {
        const cDel = db
          .prepare(
            `DELETE FROM sync_conflicts WHERE school_id IN (${placeholders})`
          )
          .run(...dropIds)
        console.log(`  sync_conflicts: deleted ${cDel.changes}`)
      } catch {
        /* optional */
      }

      try {
        const curDel = db
          .prepare(
            `DELETE FROM sync_cursors WHERE school_id IN (${placeholders})`
          )
          .run(...dropIds)
        console.log(`  sync_cursors: deleted ${curDel.changes}`)
      } catch {
        /* optional */
      }

      // 4) Drop school rows
      const sDel = db
        .prepare(`DELETE FROM schools WHERE id IN (${placeholders})`)
        .run(...dropIds)
      console.log(`  schools: deleted ${sDel.changes}`)
    })

    tx()
    db.pragma('foreign_keys = ON')

    const left = db
      .prepare(
        `SELECT id, name, short_code FROM schools WHERE deleted_at IS NULL ORDER BY name`
      )
      .all()
    console.log('\nRemaining schools:', left)
    console.log('Done.')
  } finally {
    db.close()
  }
}

main()
