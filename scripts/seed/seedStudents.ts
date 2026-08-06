import { faker } from '@faker-js/faker'
import { randomUUID } from 'node:crypto'
import type { SeedContext } from './context'
import { baseFields, isoDate, runInTransaction } from './helpers'

const STUDENTS_PER_SCHOOL = 150

/**
 * Seeds students evenly across classes with unique student_code per school.
 */
export function seedStudents(ctx: SeedContext): void {
  const { db } = ctx
  const now = new Date().toISOString()

  runInTransaction(db, () => {
    try {
      db.exec(`ALTER TABLE students ADD COLUMN photo_path TEXT`)
    } catch {
      /* ok */
    }

    const insert = db.prepare(`
      INSERT INTO students (
        id, name, class_id, school_id, student_code, admission_year,
        academic_level_id, sequence_number, gender, date_of_birth,
        phone, email, address, admission_type,
        guardian_name, guardian_phone, guardian_email, guardian_relationship,
        status,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @name, @class_id, @school_id, @student_code, @admission_year,
        @academic_level_id, @sequence_number, @gender, @date_of_birth,
        @phone, @email, @address, 'regular',
        @guardian_name, @guardian_phone, @guardian_email, @guardian_relationship,
        'active',
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    for (const school of ctx.schools) {
      const classes = ctx.classes.filter((c) => c.school_id === school.id)
      if (!classes.length) continue

      let seq = 1
      for (let i = 0; i < STUDENTS_PER_SCHOOL; i++) {
        const cls = classes[i % classes.length]
        const gender = faker.helpers.arrayElement(['male', 'female'] as const)
        const first = faker.person.firstName(gender)
        const last = faker.person.lastName()
        const id = randomUUID()
        const student_code = `${school.short_code}-2025-${String(seq).padStart(4, '0')}`

        insert.run({
          ...baseFields(now),
          id,
          name: `${first} ${last}`,
          class_id: cls.id,
          school_id: school.id,
          student_code,
          admission_year: 2025,
          academic_level_id: cls.academic_level_id,
          sequence_number: seq,
          gender,
          date_of_birth: isoDate(
            faker.date.birthdate({ min: 12, max: 19, mode: 'age' })
          ),
          phone: faker.helpers.maybe(() => faker.phone.number(), {
            probability: 0.3,
          }) ?? null,
          email: faker.helpers.maybe(
            () =>
              faker.internet
                .email({ firstName: first, lastName: last })
                .toLowerCase(),
            { probability: 0.2 }
          ) ?? null,
          address: faker.location.streetAddress(),
          guardian_name: faker.person.fullName(),
          guardian_phone: faker.phone.number({ style: 'national' }),
          guardian_email: faker.internet.email().toLowerCase(),
          guardian_relationship: faker.helpers.arrayElement([
            'parent',
            'mother',
            'father',
            'guardian',
          ]),
        })

        ctx.students.push({
          id,
          school_id: school.id,
          class_id: cls.id,
          name: `${first} ${last}`,
          student_code,
          academic_level_id: cls.academic_level_id,
        })
        seq += 1
      }
    }
  })

  console.log(`  Students: ${ctx.students.length}`)
}
