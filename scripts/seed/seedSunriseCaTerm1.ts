/**
 * Seed Term 1 continuous assessments for Sunrise Academy.
 *
 * Creates Sequence 1 + Sequence 2 sheets for every class × subject on Term 1,
 * then fills scores for every active student (scale /20). Leaves result
 * processing for you to run in the app.
 *
 * Usage:
 *   npx tsx scripts/seed/seedSunriseCaTerm1.ts --dev
 *   npx tsx scripts/seed/seedSunriseCaTerm1.ts --db /path/to/sofia.db
 */

import { randomUUID } from 'node:crypto'
import { openSeedDatabase, resolveDefaultDbPath } from './db'
import { baseFields, runInTransaction } from './helpers'

const SCHOOL_NAME = 'Sunrise Academy'
const SEQ_NAMES = ['Sequence 1', 'Sequence 2'] as const
const MAX_SCORE = 20
const WEIGHT_PERCENT = 50

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

/** Deterministic-ish score in [low, high] from student/subject seeds. */
function scoreFor(
  studentIndex: number,
  subjectIndex: number,
  sequenceIndex: number,
  max: number
): number {
  // ~12% weaker students (roughly fail / borderline on MINESEC 10/20)
  const weak = studentIndex % 8 === 7
  const base = weak
    ? 6 + ((studentIndex + subjectIndex) % 4)
    : 11 + ((studentIndex * 3 + subjectIndex * 5) % 7)
  const wobble = ((sequenceIndex * 2 + subjectIndex) % 3) - 1
  const raw = Math.min(max, Math.max(0, base + wobble))
  return Math.round(raw * 2) / 2 // half-point precision
}

function main(): void {
  const { dbPath } = parseArgs(process.argv)
  console.log(`[sofia:seed] Sunrise CA Term 1 → ${dbPath}`)

  const db = openSeedDatabase({ dbPath, reset: false })
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  try {
    const school = db
      .prepare(
        `SELECT id, name FROM schools
         WHERE deleted_at IS NULL AND name = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(SCHOOL_NAME) as { id: string; name: string } | undefined
    if (!school) {
      throw new Error(`School “${SCHOOL_NAME}” not found.`)
    }

    const year = db
      .prepare(
        `SELECT id, name FROM academic_years
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY is_current DESC, start_date DESC LIMIT 1`
      )
      .get(school.id) as { id: string; name: string } | undefined
    if (!year) throw new Error('No academic year for Sunrise Academy.')

    const term1 = db
      .prepare(
        `SELECT id, name FROM academic_terms
         WHERE academic_year_id = ? AND deleted_at IS NULL AND term_number = 1
         LIMIT 1`
      )
      .get(year.id) as { id: string; name: string } | undefined
    if (!term1) throw new Error('Term 1 not found for current year.')

    const classes = db
      .prepare(
        `SELECT id, name FROM classes
         WHERE school_id = ? AND deleted_at IS NULL AND is_active = 1
         ORDER BY name`
      )
      .all(school.id) as Array<{ id: string; name: string }>
    if (!classes.length) throw new Error('No classes for Sunrise Academy.')

    const insertAssessment = db.prepare(`
      INSERT INTO ca_assessments (
        id, school_id, name, subject_id, class_id, term_id, academic_year_id,
        weight_percent, max_score, assessment_date,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @name, @subject_id, @class_id, @term_id, @academic_year_id,
        @weight_percent, @max_score, @assessment_date,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    const findAssessment = db.prepare(`
      SELECT id FROM ca_assessments
      WHERE school_id = ? AND class_id = ? AND subject_id = ?
        AND term_id = ? AND deleted_at IS NULL
        AND lower(trim(name)) = lower(trim(?))
      LIMIT 1
    `)

    const insertScore = db.prepare(`
      INSERT INTO ca_scores (
        id, assessment_id, student_id, score, score_status,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @assessment_id, @student_id, @score, 'recorded',
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    const updateScore = db.prepare(`
      UPDATE ca_scores
      SET score = @score, score_status = 'recorded',
          updated_at = @updated_at, version = version + 1, sync_status = 'pending'
      WHERE assessment_id = @assessment_id AND student_id = @student_id
        AND deleted_at IS NULL
    `)

    const findScore = db.prepare(`
      SELECT id FROM ca_scores
      WHERE assessment_id = ? AND student_id = ? AND deleted_at IS NULL
      LIMIT 1
    `)

    let createdSheets = 0
    let skippedSheets = 0
    let insertedScores = 0
    let updatedScores = 0

    runInTransaction(db, () => {
      for (const klass of classes) {
        const subjects = db
          .prepare(
            `SELECT s.id, s.name
             FROM subject_classes sc
             JOIN subjects s ON s.id = sc.subject_id
             WHERE sc.class_id = ? AND sc.deleted_at IS NULL
               AND s.deleted_at IS NULL
             ORDER BY s.name`
          )
          .all(klass.id) as Array<{ id: string; name: string }>

        const students = db
          .prepare(
            `SELECT id, name FROM students
             WHERE class_id = ? AND school_id = ?
               AND deleted_at IS NULL AND status = 'active'
             ORDER BY name`
          )
          .all(klass.id, school.id) as Array<{ id: string; name: string }>

        if (!subjects.length || !students.length) {
          console.warn(
            `  Skip ${klass.name}: subjects=${subjects.length} students=${students.length}`
          )
          continue
        }

        for (let seqIdx = 0; seqIdx < SEQ_NAMES.length; seqIdx++) {
          const seqName = SEQ_NAMES[seqIdx]!
          for (let subIdx = 0; subIdx < subjects.length; subIdx++) {
            const subject = subjects[subIdx]!
            let assessmentId = (
              findAssessment.get(
                school.id,
                klass.id,
                subject.id,
                term1.id,
                seqName
              ) as { id: string } | undefined
            )?.id

            if (!assessmentId) {
              assessmentId = randomUUID()
              insertAssessment.run({
                ...baseFields(now),
                id: assessmentId,
                school_id: school.id,
                name: seqName,
                subject_id: subject.id,
                class_id: klass.id,
                term_id: term1.id,
                academic_year_id: year.id,
                weight_percent: WEIGHT_PERCENT,
                max_score: MAX_SCORE,
                assessment_date: today,
              })
              createdSheets += 1
            } else {
              skippedSheets += 1
            }

            for (let stIdx = 0; stIdx < students.length; stIdx++) {
              const student = students[stIdx]!
              const score = scoreFor(stIdx, subIdx, seqIdx, MAX_SCORE)
              const existing = findScore.get(assessmentId, student.id) as
                | { id: string }
                | undefined
              if (existing) {
                updateScore.run({
                  assessment_id: assessmentId,
                  student_id: student.id,
                  score,
                  updated_at: now,
                })
                updatedScores += 1
              } else {
                insertScore.run({
                  ...baseFields(now),
                  assessment_id: assessmentId,
                  student_id: student.id,
                  score,
                })
                insertedScores += 1
              }
            }
          }
        }

        console.log(
          `  ${klass.name}: ${students.length} students × ${subjects.length} subjects × ${SEQ_NAMES.length} sequences`
        )
      }
    })

    const totals = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM ca_assessments
            WHERE school_id = ? AND term_id = ? AND deleted_at IS NULL
              AND lower(trim(name)) IN ('sequence 1', 'sequence 2')) AS sheets,
           (SELECT COUNT(*) FROM ca_scores sc
            JOIN ca_assessments a ON a.id = sc.assessment_id
            WHERE a.school_id = ? AND a.term_id = ?
              AND a.deleted_at IS NULL AND sc.deleted_at IS NULL
              AND sc.score IS NOT NULL
              AND lower(trim(a.name)) IN ('sequence 1', 'sequence 2')) AS filled_scores`
      )
      .get(school.id, term1.id, school.id, term1.id) as {
      sheets: number
      filled_scores: number
    }

    console.log('\nDone.')
    console.log(`  School:     ${school.name}`)
    console.log(`  Year/Term:  ${year.name} / ${term1.name}`)
    console.log(`  Sheets:     +${createdSheets} created, ${skippedSheets} existing`)
    console.log(
      `  Scores:     +${insertedScores} inserted, ${updatedScores} updated`
    )
    console.log(
      `  Totals:     ${totals.sheets} Term 1 sequence sheets, ${totals.filled_scores} filled scores`
    )
    console.log('\nNext: log in as admin@sunrise.demo / Sofia@Demo1')
    console.log(
      '  → Academic → Results → Process results (Term 1) for each class.'
    )
    console.log('  → Then Report cards → Generate.')
  } finally {
    db.close()
  }
}

main()
