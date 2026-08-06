import { faker } from '@faker-js/faker'
import { randomUUID } from 'node:crypto'
import type { SeedContext } from './context'
import { baseFields, isoDate, runInTransaction } from './helpers'

const SUBJECT_BY_DEPT: Record<string, string[]> = {
  General: ['Mathematics', 'English', 'Biology'],
  Science: ['Mathematics', 'English', 'Biology', 'Physics', 'Chemistry'],
  Commercial: ['Accounting', 'Economics', 'Commerce', 'English'],
  Technical: ['Woodwork', 'Metalwork', 'Technical Drawing', 'Mathematics'],
}

const STAFF_PER_SCHOOL = 22

/**
 * Seeds staff, subjects, and staff↔subject mappings.
 * No photos.
 */
export function seedStaff(ctx: SeedContext): void {
  const { db } = ctx
  const now = new Date().toISOString()

  runInTransaction(db, () => {
    try {
      db.exec(`ALTER TABLE staff ADD COLUMN employee_code TEXT`)
      db.exec(`ALTER TABLE staff ADD COLUMN joining_date TEXT`)
      db.exec(`ALTER TABLE staff ADD COLUMN address TEXT`)
      db.exec(`ALTER TABLE staff ADD COLUMN job_role TEXT`)
    } catch {
      /* columns may already exist */
    }

    const staffInsert = db.prepare(`
      INSERT INTO staff (
        id, school_id, full_name, gender, phone, email, staff_type, admin_role,
        department_id, status, user_id,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @full_name, @gender, @phone, @email, @staff_type, @admin_role,
        @department_id, 'active', NULL,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    const subjectInsert = db.prepare(`
      INSERT INTO subjects (
        id, name, class_id, school_id, department_id, coefficient,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @name, @class_id, @school_id, @department_id, 1,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    const staffSubjectInsert = db.prepare(`
      INSERT INTO staff_subjects (
        id, staff_id, subject_id,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @staff_id, @subject_id,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    const subjectClassInsert = db.prepare(`
      INSERT INTO subject_classes (
        id, subject_id, class_id,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @subject_id, @class_id,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    for (const school of ctx.schools) {
      const depts = ctx.departments.get(school.id)!
      const schoolClasses = ctx.classes.filter((c) => c.school_id === school.id)
      const teachers: string[] = []

      for (let i = 0; i < STAFF_PER_SCHOOL; i++) {
        const gender = faker.helpers.arrayElement(['male', 'female'] as const)
        const first = faker.person.firstName(gender)
        const last = faker.person.lastName()
        const isAdminLike = i < 3
        const deptName = faker.helpers.arrayElement([
          ...depts.keys(),
        ] as string[])
        const department_id = depts.get(deptName) ?? null
        const staff_type = isAdminLike && i === 0 ? 'non_teaching' : 'teaching'
        const job_role =
          i === 0
            ? 'admin'
            : i === 1
              ? 'admin'
              : i === 2
                ? 'admin'
                : 'teacher'
        // Map demo roles: Admin / Bursar / Teacher for display via job_role/admin_role
        const admin_role =
          i === 0 ? 'principal' : i === 1 ? 'bursar' : i === 2 ? 'secretary' : null

        const id = randomUUID()
        const email = faker.internet
          .email({ firstName: first, lastName: last, provider: 'sofia.demo' })
          .toLowerCase()

        staffInsert.run({
          ...baseFields(now),
          id,
          school_id: school.id,
          full_name: `${first} ${last}`,
          gender,
          phone: faker.phone.number({ style: 'national' }),
          email,
          staff_type,
          admin_role,
          department_id,
        })

        try {
          db.prepare(
            `UPDATE staff SET employee_code = ?, joining_date = ?, job_role = ?, address = ? WHERE id = ?`
          ).run(
            `${school.short_code}-EMP-${String(i + 1).padStart(3, '0')}`,
            isoDate(faker.date.past({ years: 8 })),
            job_role,
            faker.location.streetAddress(),
            id
          )
        } catch {
          /* ok */
        }

        ctx.staff.push({
          id,
          school_id: school.id,
          full_name: `${first} ${last}`,
          department_id,
          staff_type,
          job_role,
          email,
        })
        if (staff_type === 'teaching') teachers.push(id)
      }

      // Assign class teachers
      for (let ci = 0; ci < schoolClasses.length; ci++) {
        const teacherId = teachers[ci % teachers.length]
        try {
          db.prepare(
            `UPDATE classes SET class_teacher_id = ? WHERE id = ?`
          ).run(teacherId, schoolClasses[ci].id)
        } catch {
          /* ok */
        }
      }

      // Subjects per department, anchored to a class (schema requires class_id)
      for (const [deptName, subjectNames] of Object.entries(SUBJECT_BY_DEPT)) {
        const department_id = depts.get(deptName) ?? null
        const anchorClass =
          schoolClasses.find((c) => c.department_id === department_id) ||
          schoolClasses[0]
        if (!anchorClass) continue

        for (const subjectName of subjectNames) {
          const sid = randomUUID()
          subjectInsert.run({
            ...baseFields(now),
            id: sid,
            name: subjectName,
            class_id: anchorClass.id,
            school_id: school.id,
            department_id,
          })
          ctx.subjects.push({
            id: sid,
            school_id: school.id,
            name: subjectName,
            class_id: anchorClass.id,
            department_id,
          })

          // Link subject to all classes in that department stream (or all)
          for (const cls of schoolClasses) {
            subjectClassInsert.run({
              ...baseFields(now),
              subject_id: sid,
              class_id: cls.id,
            })
          }

          // Assign 1–2 teachers
          const assignees = faker.helpers.arrayElements(
            teachers,
            Math.min(2, teachers.length)
          )
          for (const staff_id of assignees) {
            staffSubjectInsert.run({
              ...baseFields(now),
              staff_id,
              subject_id: sid,
            })
          }
        }
      }
    }
  })

  console.log(
    `  Staff: ${ctx.staff.length}, Subjects: ${ctx.subjects.length}`
  )
}
