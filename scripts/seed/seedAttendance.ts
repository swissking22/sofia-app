import { faker } from '@faker-js/faker'
import { randomUUID } from 'node:crypto'
import type { SeedContext } from './context'
import { baseFields, daysAgo, isoDate, runInTransaction } from './helpers'

const STUDENT_STATUSES = ['present', 'absent', 'late', 'excused'] as const
const STAFF_STATUSES = ['present', 'absent', 'late', 'half_day'] as const
const DAYS = 30

/**
 * Seeds student attendance sessions/records and staff attendance for the last 30 days.
 * Weekends are skipped for a more realistic school calendar.
 */
export function seedAttendance(ctx: SeedContext): void {
  const { db } = ctx
  const now = new Date().toISOString()

  runInTransaction(db, () => {
    const sessionInsert = db.prepare(`
      INSERT INTO attendance_sessions (
        id, school_id, class_id, session_date, notes,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @class_id, @session_date, NULL,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    const recordInsert = db.prepare(`
      INSERT INTO attendance_records (
        id, session_id, student_id, status,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @session_id, @student_id, @status,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    const staffInsert = db.prepare(`
      INSERT INTO staff_attendance (
        id, school_id, staff_id, date, status, notes, marked_by,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @staff_id, @date, @status, NULL, NULL,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    const schoolDays: string[] = []
    for (let i = 0; i < DAYS + 10 && schoolDays.length < DAYS; i++) {
      const d = daysAgo(i)
      const dow = d.getDay()
      if (dow === 0 || dow === 6) continue
      schoolDays.push(isoDate(d))
    }

    for (const school of ctx.schools) {
      const classes = ctx.classes.filter((c) => c.school_id === school.id)
      const studentsByClass = new Map<string, typeof ctx.students>()
      for (const s of ctx.students.filter((x) => x.school_id === school.id)) {
        const list = studentsByClass.get(s.class_id) || []
        list.push(s)
        studentsByClass.set(s.class_id, list)
      }

      for (const cls of classes) {
        const roster = studentsByClass.get(cls.id) || []
        if (!roster.length) continue

        for (const session_date of schoolDays) {
          const sessionId = randomUUID()
          sessionInsert.run({
            ...baseFields(now),
            id: sessionId,
            school_id: school.id,
            class_id: cls.id,
            session_date,
          })

          for (const student of roster) {
            const roll = faker.number.float({ min: 0, max: 1 })
            const status =
              roll < 0.86
                ? 'present'
                : roll < 0.93
                  ? 'late'
                  : roll < 0.98
                    ? 'absent'
                    : 'excused'
            recordInsert.run({
              ...baseFields(now),
              session_id: sessionId,
              student_id: student.id,
              status: status as (typeof STUDENT_STATUSES)[number],
            })
          }
        }
      }

      const staff = ctx.staff.filter((s) => s.school_id === school.id)
      for (const member of staff) {
        for (const date of schoolDays) {
          const roll = faker.number.float({ min: 0, max: 1 })
          const status =
            roll < 0.9
              ? 'present'
              : roll < 0.95
                ? 'late'
                : roll < 0.98
                  ? 'absent'
                  : 'half_day'
          staffInsert.run({
            ...baseFields(now),
            school_id: school.id,
            staff_id: member.id,
            date,
            status: status as (typeof STAFF_STATUSES)[number],
          })
        }
      }
    }
  })

  const sessions = ctx.db
    .prepare(`SELECT COUNT(*) AS n FROM attendance_sessions`)
    .get() as { n: number }
  const staffAtt = ctx.db
    .prepare(`SELECT COUNT(*) AS n FROM staff_attendance`)
    .get() as { n: number }
  console.log(
    `  Attendance sessions: ${sessions.n}, Staff attendance rows: ${staffAtt.n}`
  )
}
