import { faker } from '@faker-js/faker'
import { hashSync } from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import type { SeedContext } from './context'
import {
  normalizeSubjectName,
  subjectIdentityKey,
} from '../../main/domain/subject-names'
import {
  baseFields,
  isoDate,
  padNum,
  round2,
  runInTransaction,
} from './helpers'

const DEMO_PASSWORD = 'Sofia@Demo1'
const SHORT_CODE = 'LWM'
const ADMIN_EMAIL = 'admin@lightworld.demo'
const SCHOOL_NAME =
  'Light World Mission Anglo-Saxon Boarding and Day College'

type FeeBand = {
  fee: number
  registration: number
  boarding_fee?: number
  health: number
  computer: number
  magazine: number
  total: number
}

const DAY_FEES: Record<string, FeeBand> = {
  F1_F2_GEN_COM: {
    fee: 130000,
    registration: 20000,
    health: 5000,
    computer: 1000,
    magazine: 1500,
    total: 157500,
  },
  F1_F2_TECH: {
    fee: 150000,
    registration: 20000,
    health: 5000,
    computer: 5000,
    magazine: 1500,
    total: 177500,
  },
  F3_GEN_COM: {
    fee: 140000,
    registration: 20000,
    health: 5000,
    computer: 5000,
    magazine: 1500,
    total: 167500,
  },
  F3_TECH: {
    fee: 160000,
    registration: 20000,
    health: 5000,
    computer: 5000,
    magazine: 1500,
    total: 187500,
  },
  F4_F5_GEN_COM: {
    fee: 150000,
    registration: 20000,
    health: 5000,
    computer: 5000,
    magazine: 1500,
    total: 177500,
  },
  F4_F5_TECH: {
    fee: 160000,
    registration: 20000,
    health: 5000,
    computer: 5000,
    magazine: 1500,
    total: 187500,
  },
  LSA: {
    fee: 150000,
    registration: 20000,
    health: 5000,
    computer: 5000,
    magazine: 1500,
    total: 177500,
  },
  LSS: {
    fee: 160000,
    registration: 20000,
    health: 5000,
    computer: 5000,
    magazine: 1500,
    total: 187500,
  },
  LSC: {
    fee: 170000,
    registration: 20000,
    health: 5000,
    computer: 5000,
    magazine: 1500,
    total: 197500,
  },
  US_ASC: {
    fee: 170000,
    registration: 20000,
    health: 5000,
    computer: 5000,
    magazine: 1500,
    total: 197500,
  },
  LS_US_TECH: {
    fee: 180000,
    registration: 20000,
    health: 5000,
    computer: 5000,
    magazine: 1500,
    total: 207500,
  },
}

const BOARDER_FEES: Record<string, FeeBand> = {
  F1_F2_GEN_COM: {
    fee: 130000,
    registration: 20000,
    boarding_fee: 270000,
    health: 10000,
    computer: 1000,
    magazine: 1500,
    total: 432500,
  },
  F1_F2_TECH: {
    fee: 150000,
    registration: 20000,
    boarding_fee: 270000,
    health: 10000,
    computer: 5000,
    magazine: 1500,
    total: 452500,
  },
  F3_GEN_COM: {
    fee: 140000,
    registration: 20000,
    boarding_fee: 270000,
    health: 10000,
    computer: 5000,
    magazine: 1500,
    total: 442500,
  },
  F3_TECH: {
    fee: 160000,
    registration: 20000,
    boarding_fee: 270000,
    health: 10000,
    computer: 5000,
    magazine: 1500,
    total: 462500,
  },
  F4_F5_GEN_COM: {
    fee: 150000,
    registration: 20000,
    boarding_fee: 270000,
    health: 10000,
    computer: 5000,
    magazine: 1500,
    total: 452500,
  },
  F4_F5_TECH: {
    fee: 160000,
    registration: 20000,
    boarding_fee: 270000,
    health: 10000,
    computer: 5000,
    magazine: 1500,
    total: 462500,
  },
  LSA: {
    fee: 150000,
    registration: 20000,
    boarding_fee: 270000,
    health: 10000,
    computer: 5000,
    magazine: 1500,
    total: 452500,
  },
  LSS: {
    fee: 160000,
    registration: 20000,
    boarding_fee: 270000,
    health: 10000,
    computer: 5000,
    magazine: 1500,
    total: 462500,
  },
  LSC: {
    fee: 170000,
    registration: 20000,
    boarding_fee: 270000,
    health: 10000,
    computer: 5000,
    magazine: 1500,
    total: 472500,
  },
  US_ASC: {
    fee: 170000,
    registration: 20000,
    boarding_fee: 270000,
    health: 10000,
    computer: 5000,
    magazine: 1500,
    total: 472500,
  },
  LS_US_TECH: {
    fee: 180000,
    registration: 20000,
    boarding_fee: 270000,
    health: 10000,
    computer: 5000,
    magazine: 1500,
    total: 482500,
  },
}

const GEN_F12 = [
  'Mathematics',
  'English',
  'French',
  'History',
  'Geography',
  'Physics',
  'Chemistry',
  'Computer Science',
  'Religious Studies',
  'Sports and Physical Education',
  'Literature',
  'Biology',
  'Citizenship',
]
const GEN_F3 = [...GEN_F12, 'Food and Nutrition', 'Economics', 'Commerce']
const GEN_F45 = [...GEN_F3, 'Additional Mathematics', 'Geology']
const GEN_SIXTH = [
  'Mathematics',
  'English',
  'French',
  'History',
  'Geography',
  'Economics',
  'Chemistry',
  'Biology',
  'Physics',
  'Computer Science',
  'ICT',
  'Food Science',
  'Geology',
  'Literature',
]

const COM_F123 = [
  'Mathematics',
  'English',
  'French',
  'Marketing',
  'Economics',
  'Commerce',
  'Business Mathematics',
  'Entrepreneurship',
  'Sports and Physical Education',
  'Law and Government',
  'Accounting',
]
const COM_F45 = [
  ...COM_F123.filter((s) => s !== 'Accounting' && s !== 'Marketing'),
  'IT',
  'Product Mastery',
  'International Financial Accounting',
  'OHADA Financial Accounting',
  'OHADA Financial Reporting',
  'Digital Marketing',
  'Sales Method',
]
const COM_SIXTH = [
  'Business Mathematics',
  'Business Management',
  'Financial Accounting',
  'Corporate Accounting',
  'Cost and Management Accounting',
  'Entrepreneurship',
  'Economics',
  'Commerce and Finance',
  'IT',
  'Digital Marketing Practice',
  'Professional Marketing Practice',
  'Marketing Skills',
]

const BC1 = [
  'Mathematics',
  'English',
  'French',
  'Computer Science',
  'Religious Studies',
  'Sports and Physical Education',
  'BC Drawing',
  'Automobile Technology',
  'Engineering Science',
]
const BC23 = [
  ...BC1.filter((s) => s !== 'Automobile Technology' && s !== 'Religious Studies'),
  'BC Technology',
]
const BC45 = [
  ...BC23,
  'Entrepreneurship',
  'Quantity and Estimate',
  'Soils and Survey',
]
const BC67 = [
  'Mathematics',
  'BC Drawing',
  'BC Technology',
  'Project Management',
  'Engineering Science',
  'Computer Science',
  'ICT',
  'Professional Law',
]

type ClassDef = {
  name: string
  level: string
  section: string
  dept: string
  feeKey: keyof typeof DAY_FEES
  subjects: string[]
}

const CLASS_DEFS: ClassDef[] = [
  { name: 'Form 1 General', level: 'Form 1', section: 'General', dept: 'General', feeKey: 'F1_F2_GEN_COM', subjects: GEN_F12 },
  { name: 'Form 2 General', level: 'Form 2', section: 'General', dept: 'General', feeKey: 'F1_F2_GEN_COM', subjects: GEN_F12 },
  { name: 'Form 3 General', level: 'Form 3', section: 'General', dept: 'General', feeKey: 'F3_GEN_COM', subjects: GEN_F3 },
  { name: 'Form 4 General', level: 'Form 4', section: 'General', dept: 'General', feeKey: 'F4_F5_GEN_COM', subjects: GEN_F45 },
  { name: 'Form 5 General', level: 'Form 5', section: 'General', dept: 'General', feeKey: 'F4_F5_GEN_COM', subjects: GEN_F45 },
  { name: 'LSA', level: 'Lower Sixth', section: 'General', dept: 'General', feeKey: 'LSA', subjects: GEN_SIXTH },
  { name: 'USA', level: 'Upper Sixth', section: 'General', dept: 'General', feeKey: 'US_ASC', subjects: GEN_SIXTH },
  { name: 'LSS', level: 'Lower Sixth', section: 'General', dept: 'General', feeKey: 'LSS', subjects: GEN_SIXTH },
  { name: 'USS', level: 'Upper Sixth', section: 'General', dept: 'General', feeKey: 'US_ASC', subjects: GEN_SIXTH },
  { name: 'Form 1 Commercial', level: 'Form 1', section: 'Commercial', dept: 'Commercial', feeKey: 'F1_F2_GEN_COM', subjects: COM_F123 },
  { name: 'Form 2 Commercial', level: 'Form 2', section: 'Commercial', dept: 'Commercial', feeKey: 'F1_F2_GEN_COM', subjects: COM_F123 },
  { name: 'Form 3 Commercial', level: 'Form 3', section: 'Commercial', dept: 'Commercial', feeKey: 'F3_GEN_COM', subjects: COM_F123 },
  { name: 'Form 4 Commercial', level: 'Form 4', section: 'Commercial', dept: 'Commercial', feeKey: 'F4_F5_GEN_COM', subjects: COM_F45 },
  { name: 'Form 5 Commercial', level: 'Form 5', section: 'Commercial', dept: 'Commercial', feeKey: 'F4_F5_GEN_COM', subjects: COM_F45 },
  { name: 'LSC', level: 'Lower Sixth', section: 'Commercial', dept: 'Commercial', feeKey: 'LSC', subjects: COM_SIXTH },
  { name: 'USC', level: 'Upper Sixth', section: 'Commercial', dept: 'Commercial', feeKey: 'US_ASC', subjects: COM_SIXTH },
  { name: 'BC 1 (Form 1 Tech)', level: 'Form 1', section: 'Technical', dept: 'Building & Construction', feeKey: 'F1_F2_TECH', subjects: BC1 },
  { name: 'BC 2 (Form 2 Tech)', level: 'Form 2', section: 'Technical', dept: 'Building & Construction', feeKey: 'F1_F2_TECH', subjects: BC23 },
  { name: 'BC 3 (Form 3 Tech)', level: 'Form 3', section: 'Technical', dept: 'Building & Construction', feeKey: 'F3_TECH', subjects: BC23 },
  { name: 'BC 4 (Form 4 Tech)', level: 'Form 4', section: 'Technical', dept: 'Building & Construction', feeKey: 'F4_F5_TECH', subjects: BC45 },
  { name: 'BC 5 (Form 5 Tech)', level: 'Form 5', section: 'Technical', dept: 'Building & Construction', feeKey: 'F4_F5_TECH', subjects: BC45 },
  { name: 'BC 6 (Lower Sixth Tech)', level: 'Lower Sixth', section: 'Technical', dept: 'Building & Construction', feeKey: 'LS_US_TECH', subjects: BC67 },
  { name: 'BC 7 (Upper Sixth Tech)', level: 'Upper Sixth', section: 'Technical', dept: 'Building & Construction', feeKey: 'LS_US_TECH', subjects: BC67 },
]

const LEVELS = [
  { name: 'Form 1', category: 'lower_secondary', sort_order: 1 },
  { name: 'Form 2', category: 'lower_secondary', sort_order: 2 },
  { name: 'Form 3', category: 'lower_secondary', sort_order: 3 },
  { name: 'Form 4', category: 'upper_secondary', sort_order: 4 },
  { name: 'Form 5', category: 'upper_secondary', sort_order: 5 },
  { name: 'Lower Sixth', category: 'upper_secondary', sort_order: 6 },
  { name: 'Upper Sixth', category: 'upper_secondary', sort_order: 7 },
] as const

const INSTALLMENT_NOTES = `Day students: 1st 100,000 FRS (Sep–Oct); 2nd 30,000 FRS (Nov–Dec); remainder (Jan–Feb).
Boarders: 1st 300,000 FRS (Sep–Oct); 2nd 100,000 FRS (Nov–Dec); remainder (Jan–Feb).`

const ADDITIONAL_LINES: Array<{ name: string; amount: number }> = [
  { name: 'Internship (Form 5 / U6 Industrial)', amount: 25000 },
  { name: 'Internship (Form 5 / U6 Commercial)', amount: 20000 },
  { name: 'Practical fee (Form 5 / U6 Industrial)', amount: 10000 },
  { name: 'Practical fee (LSS / USS)', amount: 20000 },
  { name: 'Uniform (1st cycle)', amount: 31000 },
  { name: 'Uniform (2nd cycle)', amount: 31500 },
  { name: 'Food and Nutrition practicals', amount: 7500 },
  { name: 'August course (day)', amount: 10000 },
  { name: 'August course (boarders)', amount: 20000 },
  { name: 'April course (day)', amount: 10000 },
  { name: 'April course (boarders)', amount: 20000 },
  { name: 'Graduation fee', amount: 10000 },
  { name: 'Mock exams fee', amount: 6000 },
  { name: 'Field trip — Geology (Ordinary Level)', amount: 15000 },
  { name: 'Field trip — Geology (Advanced Level)', amount: 25000 },
  { name: 'Field trip — Geography (A Level)', amount: 15000 },
  { name: 'Textbook deposit (day students only)', amount: 60000 },
]

function shortLevel(name: string): string {
  return name
    .replace('Form ', 'F')
    .replace('Lower Sixth', 'L6')
    .replace('Upper Sixth', 'U6')
}

type LwmClassMeta = {
  id: string
  school_id: string
  name: string
  level: string
  academic_level_id: string
  department_id: string | null
  section_id: string | null
  feeKey: keyof typeof DAY_FEES
  subjects: string[]
  dept: string
}

/**
 * Soft-delete existing LWM subjects and class/teacher links, then recreate
 * one subject per academic level + name, linked to every class at that level
 * that offers it (General / Commercial / Technical share Maths, English, etc.).
 */
function rebuildLightWorldSubjects(
  ctx: SeedContext,
  schoolId: string,
  classMeta: LwmClassMeta[],
  teachers: string[],
  now: string
): void {
  const { db } = ctx
  const oldSubjects = db
    .prepare(
      `SELECT id FROM subjects WHERE school_id = ? AND deleted_at IS NULL`
    )
    .all(schoolId) as Array<{ id: string }>

  const softDelete = db.prepare(
    `UPDATE subjects SET deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`
  )
  const softDeleteSc = db.prepare(
    `UPDATE subject_classes SET deleted_at = ?, updated_at = ?, sync_status = 'pending'
     WHERE subject_id = ? AND deleted_at IS NULL`
  )
  const softDeleteSs = db.prepare(
    `UPDATE staff_subjects SET deleted_at = ?, updated_at = ?, sync_status = 'pending'
     WHERE subject_id = ? AND deleted_at IS NULL`
  )
  const clearSlots = db.prepare(
    `UPDATE timetable_slots SET subject_id = NULL, staff_id = NULL, updated_at = ?, sync_status = 'pending'
     WHERE subject_id = ?`
  )

  for (const row of oldSubjects) {
    softDelete.run(now, now, row.id)
    softDeleteSc.run(now, now, row.id)
    softDeleteSs.run(now, now, row.id)
    clearSlots.run(now, row.id)
  }

  const subjectInsert = db.prepare(
    `INSERT INTO subjects (
      id, name, class_id, school_id, department_id, coefficient,
      created_at, updated_at, deleted_at, sync_status, version
    ) VALUES (
      @id, @name, @class_id, @school_id, @department_id, 1,
      @created_at, @updated_at, @deleted_at, @sync_status, @version
    )`
  )
  const subjectClassInsert = db.prepare(
    `INSERT INTO subject_classes (
      id, subject_id, class_id,
      created_at, updated_at, deleted_at, sync_status, version
    ) VALUES (
      @id, @subject_id, @class_id,
      @created_at, @updated_at, @deleted_at, @sync_status, @version
    )`
  )
  const staffSubjectInsert = db.prepare(
    `INSERT INTO staff_subjects (
      id, staff_id, subject_id, class_id,
      created_at, updated_at, deleted_at, sync_status, version
    ) VALUES (
      @id, @staff_id, @subject_id, @class_id,
      @created_at, @updated_at, @deleted_at, @sync_status, @version
    )`
  )

  const subjectIds = new Map<string, string>()
  const subjectTeachers = new Map<string, string>()

  for (const cls of classMeta) {
    for (const rawName of cls.subjects) {
      const subjectName = normalizeSubjectName(rawName)
      const key = subjectIdentityKey(cls.level, subjectName)
      let sid = subjectIds.get(key)
      if (!sid) {
        sid = randomUUID()
        subjectIds.set(key, sid)
        subjectInsert.run({
          ...baseFields(now),
          id: sid,
          name: subjectName,
          class_id: cls.id,
          school_id: schoolId,
          department_id: null,
        })
        ctx.subjects.push({
          id: sid,
          school_id: schoolId,
          name: subjectName,
          class_id: cls.id,
          department_id: null,
        })
        if (teachers.length > 0) {
          subjectTeachers.set(key, teachers[subjectIds.size % teachers.length])
        }
      }
      subjectClassInsert.run({
        ...baseFields(now),
        subject_id: sid,
        class_id: cls.id,
      })
      const teacher = subjectTeachers.get(key)
      if (teacher) {
        staffSubjectInsert.run({
          ...baseFields(now),
          staff_id: teacher,
          subject_id: sid,
          class_id: cls.id,
        })
      }
    }
  }

  console.log(
    `  Subjects: ${subjectIds.size} (level-scoped; shared across streams at each level)`
  )
}

function repairExistingLightWorldSubjects(ctx: SeedContext, schoolId: string): void {
  const { db } = ctx
  const now = new Date().toISOString()
  const classRows = db
    .prepare(
      `SELECT id, name, level, academic_level_id, section_id
       FROM classes WHERE school_id = ? AND deleted_at IS NULL`
    )
    .all(schoolId) as Array<{
    id: string
    name: string
    level: string
    academic_level_id: string
    section_id: string | null
  }>

  const deptRows = db
    .prepare(
      `SELECT id, name FROM departments WHERE school_id = ? AND deleted_at IS NULL`
    )
    .all(schoolId) as Array<{ id: string; name: string }>
  const deptByName = new Map(deptRows.map((d) => [d.name, d.id]))

  const classMeta: LwmClassMeta[] = []
  for (const row of classRows) {
    const def = CLASS_DEFS.find((d) => d.name === row.name)
    if (!def) {
      console.warn(`  Skipping class without curriculum def: ${row.name}`)
      continue
    }
    classMeta.push({
      id: row.id,
      school_id: schoolId,
      name: row.name,
      level: row.level || def.level,
      academic_level_id: row.academic_level_id,
      department_id: deptByName.get(def.dept) ?? null,
      section_id: row.section_id,
      feeKey: def.feeKey,
      subjects: def.subjects,
      dept: def.dept,
    })
  }

  const teachers = (
    db
      .prepare(
        `SELECT id FROM staff
         WHERE school_id = ? AND deleted_at IS NULL AND staff_type = 'teaching'
         ORDER BY full_name`
      )
      .all(schoolId) as Array<{ id: string }>
  ).map((r) => r.id)

  runInTransaction(db, () => {
    rebuildLightWorldSubjects(ctx, schoolId, classMeta, teachers, now)
  })
}

/**
 * Seeds Light World Mission College (Simbock, Yaoundé) with published
 * 2025/2026 fee bands, streams, and subject lists.
 * If LWM already exists, rebuilds subjects so shared titles are one per level.
 */
export function seedLightWorld(ctx: SeedContext): void {
  const { db } = ctx
  const existing = db
    .prepare(
      `SELECT id FROM schools WHERE short_code = ? AND deleted_at IS NULL`
    )
    .get(SHORT_CODE) as { id: string } | undefined
  if (existing) {
    console.log(
      '  Light World Mission already present — repairing shared subjects…'
    )
    repairExistingLightWorldSubjects(ctx, existing.id)
    return
  }

  faker.seed(2026)
  const now = new Date().toISOString()
  const password_hash = hashSync(DEMO_PASSWORD, 10)

  runInTransaction(db, () => {
    const schoolId = randomUUID()
    db.prepare(
      `INSERT INTO schools (
        id, name, email, phone, country, address, logo_path,
        school_code, short_code, school_type, education_system, school_category,
        region, division, subdivision, website, stamp_path, principal_signature_path,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @name, @email, @phone, @country, @address, NULL,
        @school_code, @short_code, 'secondary', 'anglophone', 'private',
        @region, @division, @subdivision, @website, NULL, NULL,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    ).run({
      ...baseFields(now),
      id: schoolId,
      name: SCHOOL_NAME,
      email: ADMIN_EMAIL,
      phone: '+237 6 77 21 40 18',
      country: 'Cameroon',
      address: 'Simbock, Yaoundé',
      school_code: SHORT_CODE,
      short_code: SHORT_CODE,
      region: 'Centre',
      division: 'Mfoundi',
      subdivision: 'Yaoundé III',
      website: 'https://lwm.demo',
    })
    try {
      db.prepare(`UPDATE schools SET max_teacher_periods = 30 WHERE id = ?`).run(
        schoolId
      )
    } catch {
      /* column may be absent */
    }

    const roleId = randomUUID()
    db.prepare(
      `INSERT INTO roles (
        id, school_id, name, description, is_system,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @name, @description, 1,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    ).run({
      ...baseFields(now),
      id: roleId,
      school_id: schoolId,
      name: 'Principal',
      description: 'Full access administrator',
    })

    const allPerms = db
      .prepare(`SELECT id FROM permissions WHERE deleted_at IS NULL`)
      .all() as Array<{ id: string }>
    const rpInsert = db.prepare(
      `INSERT INTO role_permissions (
        id, role_id, permission_id,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @role_id, @permission_id,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )
    for (const p of allPerms) {
      rpInsert.run({
        ...baseFields(now),
        role_id: roleId,
        permission_id: p.id,
      })
    }

    const userId = randomUUID()
    db.prepare(
      `INSERT INTO users (
        id, school_id, email, password_hash, role, role_id,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @email, @password_hash, 'admin', @role_id,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    ).run({
      ...baseFields(now),
      id: userId,
      school_id: schoolId,
      email: ADMIN_EMAIL,
      password_hash,
      role_id: roleId,
    })
    try {
      db.prepare(
        `UPDATE users SET first_name = ?, last_name = ?, status = 'active' WHERE id = ?`
      ).run('Grace', 'Nfor', userId)
    } catch {
      /* older schema */
    }

    ctx.schools.push({
      id: schoolId,
      name: SCHOOL_NAME,
      short_code: SHORT_CODE,
      email: ADMIN_EMAIL,
    })
    ctx.adminEmails.push(ADMIN_EMAIL)
    ctx.counters.set(schoolId, {
      invoice: 1,
      payment: 1,
      receipt: 1,
      expense: 1,
    })

    const yearId = randomUUID()
    db.prepare(
      `INSERT INTO academic_years (
        id, school_id, name, start_date, end_date, is_current,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @name, @start_date, @end_date, 1,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    ).run({
      ...baseFields(now),
      id: yearId,
      school_id: schoolId,
      name: '2025/2026',
      start_date: '2025-09-01',
      end_date: '2026-06-30',
    })
    ctx.years.set(schoolId, yearId)

    const termIds: string[] = []
    const termDefs = [
      { name: 'Term 1', n: 1, start: '2025-09-01', end: '2025-12-15' },
      { name: 'Term 2', n: 2, start: '2026-01-07', end: '2026-03-28' },
      { name: 'Term 3', n: 3, start: '2026-04-14', end: '2026-06-30' },
    ]
    const termInsert = db.prepare(
      `INSERT INTO academic_terms (
        id, academic_year_id, name, term_number, start_date, end_date,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @academic_year_id, @name, @term_number, @start_date, @end_date,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )
    for (const t of termDefs) {
      const tid = randomUUID()
      termInsert.run({
        ...baseFields(now),
        id: tid,
        academic_year_id: yearId,
        name: t.name,
        term_number: t.n,
        start_date: t.start,
        end_date: t.end,
      })
      termIds.push(tid)
    }
    ctx.terms.set(schoolId, termIds)

    const deptMap = new Map<string, string>()
    const deptInsert = db.prepare(
      `INSERT INTO departments (
        id, school_id, name,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @name,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )
    for (const name of ['General', 'Commercial', 'Building & Construction']) {
      const id = randomUUID()
      deptInsert.run({ ...baseFields(now), id, school_id: schoolId, name })
      deptMap.set(name, id)
    }
    ctx.departments.set(schoolId, deptMap)

    const levelMap = new Map<string, string>()
    const levelInsert = db.prepare(
      `INSERT INTO academic_levels (
        id, school_id, name, short_name, category, is_active, sort_order,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @name, @short_name, @category, 1, @sort_order,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )
    for (const level of LEVELS) {
      const id = randomUUID()
      levelInsert.run({
        ...baseFields(now),
        id,
        school_id: schoolId,
        name: level.name,
        short_name: shortLevel(level.name),
        category: level.category,
        sort_order: level.sort_order,
      })
      levelMap.set(level.name, id)
    }
    ctx.levels.set(schoolId, levelMap)

    const sectionMap = new Map<string, string>()
    const sectionInsert = db.prepare(
      `INSERT INTO sections (
        id, school_id, name, description, is_active,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @name, @description, 1,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )
    for (const section of [
      { name: 'General', description: 'General academic stream' },
      { name: 'Commercial', description: 'Business and commercial studies' },
      { name: 'Technical', description: 'Building and construction (technical)' },
    ]) {
      const id = randomUUID()
      sectionInsert.run({
        ...baseFields(now),
        id,
        school_id: schoolId,
        name: section.name,
        description: section.description,
      })
      sectionMap.set(section.name, id)
    }
    ctx.sections.set(schoolId, sectionMap)

    const classInsert = db.prepare(
      `INSERT INTO classes (
        id, name, school_id, level, form_key, stream,
        academic_level_id, section_id, specialization_id, capacity, is_active,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @name, @school_id, @level, @form_key, @stream,
        @academic_level_id, @section_id, NULL, 40, 1,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )

    const classMeta = CLASS_DEFS.map((def) => {
      const id = randomUUID()
      const academic_level_id = levelMap.get(def.level)!
      const section_id = sectionMap.get(def.section)!
      classInsert.run({
        ...baseFields(now),
        id,
        name: def.name,
        school_id: schoolId,
        level: def.level,
        form_key: def.level.toLowerCase().replace(/\s+/g, '_'),
        stream: def.section.toLowerCase(),
        academic_level_id,
        section_id,
      })
      const row = {
        id,
        school_id: schoolId,
        name: def.name,
        level: def.level,
        academic_level_id,
        department_id: deptMap.get(def.dept) ?? null,
        section_id,
        feeKey: def.feeKey,
        subjects: def.subjects,
        dept: def.dept,
      }
      ctx.classes.push(row)
      return row
    })

    try {
      db.prepare(
        `INSERT INTO finance_settings (
          id, school_id, currency, payment_methods,
          receipt_prefix, receipt_next_number,
          invoice_prefix, invoice_next_number,
          payment_prefix, payment_next_number,
          expense_prefix, expense_next_number,
          allow_credit,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, 'XAF', @payment_methods,
          'LWM-RCP', 1, 'LWM-INV', 1, 'LWM-PAY', 1, 'LWM-EXP', 1, 1,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )`
      ).run({
        ...baseFields(now),
        school_id: schoolId,
        payment_methods: JSON.stringify(['cash', 'mobile_money', 'bank_transfer']),
      })
    } catch {
      /* unique / schema */
    }

    const structureInsert = db.prepare(
      `INSERT INTO fee_structures (
        id, school_id, name, academic_year_id, academic_term_id,
        academic_level_id, class_id, is_active, notes, applies_to_residence,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @name, @academic_year_id, NULL,
        @academic_level_id, @class_id, @is_active, @notes, @applies_to_residence,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )
    const lineInsert = db.prepare(
      `INSERT INTO fee_structure_lines (
        id, school_id, fee_structure_id, fee_category_id, name, amount,
        frequency, is_mandatory, late_fee_mode, late_fee_value, sort_order,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @fee_structure_id, NULL, @name, @amount,
        @frequency, @is_mandatory, 'none', 0, @sort_order,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )

    const feeByClassResidence = new Map<string, { id: string; total: number }>()

    for (const cls of classMeta) {
      for (const residence of ['day', 'boarding'] as const) {
        const band =
          residence === 'day' ? DAY_FEES[cls.feeKey] : BOARDER_FEES[cls.feeKey]
        const id = randomUUID()
        structureInsert.run({
          ...baseFields(now),
          id,
          school_id: schoolId,
          name: `${cls.name} — ${residence === 'day' ? 'Day' : 'Boarder'} 2025/2026`,
          academic_year_id: yearId,
          academic_level_id: cls.academic_level_id,
          class_id: cls.id,
          is_active: 1,
          notes: INSTALLMENT_NOTES,
          applies_to_residence: residence,
        })
        const lines: Array<{ name: string; amount: number }> = [
          { name: 'Tuition', amount: band.fee },
          { name: 'Registration', amount: band.registration },
        ]
        if (band.boarding_fee) {
          lines.push({ name: 'Boarding', amount: band.boarding_fee })
        }
        lines.push(
          { name: 'Health', amount: band.health },
          { name: 'Computer', amount: band.computer },
          { name: 'Magazine', amount: band.magazine }
        )
        lines.forEach((line, sort_order) => {
          lineInsert.run({
            ...baseFields(now),
            school_id: schoolId,
            fee_structure_id: id,
            name: line.name,
            amount: line.amount,
            frequency: 'yearly',
            is_mandatory: 1,
            sort_order,
          })
        })
        feeByClassResidence.set(`${cls.id}:${residence}`, {
          id,
          total: band.total,
        })
        ctx.feeStructures.push({
          id,
          school_id: schoolId,
          class_id: cls.id,
          academic_year_id: yearId,
          total: band.total,
        })
      }
    }

    const extraId = randomUUID()
    structureInsert.run({
      ...baseFields(now),
      id: extraId,
      school_id: schoolId,
      name: 'Additional payments catalogue 2025/2026',
      academic_year_id: yearId,
      academic_level_id: null,
      class_id: null,
      is_active: 0,
      notes:
        'Optional charges (internship, uniforms, courses, field trips, textbook deposit). Apply per student as needed.',
      applies_to_residence: 'all',
    })
    ADDITIONAL_LINES.forEach((line, sort_order) => {
      lineInsert.run({
        ...baseFields(now),
        school_id: schoolId,
        fee_structure_id: extraId,
        name: line.name,
        amount: line.amount,
        frequency: 'one_time',
        is_mandatory: 0,
        sort_order,
      })
    })

    const staffInsert = db.prepare(
      `INSERT INTO staff (
        id, school_id, full_name, gender, phone, email, staff_type, admin_role,
        department_id, status, user_id,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @full_name, @gender, @phone, @email, @staff_type, @admin_role,
        @department_id, 'active', NULL,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )
    const uniqueSubjects = [...new Set(CLASS_DEFS.flatMap((c) => c.subjects))]
    const teacherCount = Math.max(18, uniqueSubjects.length)
    const teachers: string[] = []
    const deptNames = [...deptMap.keys()]

    for (let i = 0; i < teacherCount + 3; i++) {
      const gender = faker.helpers.arrayElement(['male', 'female'] as const)
      const first = faker.person.firstName(gender)
      const last = faker.person.lastName()
      const isOffice = i < 3
      const department_id = deptMap.get(deptNames[i % deptNames.length]) ?? null
      const id = randomUUID()
      staffInsert.run({
        ...baseFields(now),
        id,
        school_id: schoolId,
        full_name: `${first} ${last}`,
        gender,
        phone: faker.phone.number({ style: 'national' }),
        email: faker.internet
          .email({ firstName: first, lastName: last, provider: 'lwm.demo' })
          .toLowerCase(),
        staff_type: isOffice && i === 0 ? 'non_teaching' : 'teaching',
        admin_role:
          i === 0 ? 'principal' : i === 1 ? 'bursar' : i === 2 ? 'secretary' : null,
        department_id,
      })
      try {
        db.prepare(
          `UPDATE staff SET employee_code = ?, joining_date = ?, job_role = ?, address = ? WHERE id = ?`
        ).run(
          `${SHORT_CODE}-EMP-${String(i + 1).padStart(3, '0')}`,
          isoDate(faker.date.past({ years: 10 })),
          i === 0 ? 'admin' : i === 1 ? 'admin' : i === 2 ? 'admin' : 'teacher',
          'Simbock, Yaoundé',
          id
        )
      } catch {
        /* ok */
      }
      ctx.staff.push({
        id,
        school_id: schoolId,
        full_name: `${first} ${last}`,
        department_id,
        staff_type: isOffice && i === 0 ? 'non_teaching' : 'teaching',
        job_role: isOffice ? 'admin' : 'teacher',
        email: null,
      })
      if (!(isOffice && i === 0)) teachers.push(id)
    }

    classMeta.forEach((cls, i) => {
      try {
        db.prepare(`UPDATE classes SET class_teacher_id = ? WHERE id = ?`).run(
          teachers[i % teachers.length],
          cls.id
        )
      } catch {
        /* ok */
      }
    })

    rebuildLightWorldSubjects(ctx, schoolId, classMeta, teachers, now)

    const studentInsert = db.prepare(
      `INSERT INTO students (
        id, name, class_id, school_id, student_code, admission_year,
        academic_level_id, sequence_number, gender, date_of_birth,
        phone, email, address, admission_type,
        guardian_name, guardian_phone, guardian_email, guardian_relationship,
        status, residence_type,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @name, @class_id, @school_id, @student_code, 2025,
        @academic_level_id, @sequence_number, @gender, @date_of_birth,
        @phone, @email, @address, 'regular',
        @guardian_name, @guardian_phone, @guardian_email, @guardian_relationship,
        'active', @residence_type,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )

    type LocalStudent = {
      id: string
      class_id: string
      residence: 'day' | 'boarding'
    }
    const localStudents: LocalStudent[] = []
    let seq = 1
    const perClass = 8

    for (const cls of classMeta) {
      for (let i = 0; i < perClass; i++) {
        const gender = faker.helpers.arrayElement(['male', 'female'] as const)
        const first = faker.person.firstName(gender)
        const last = faker.person.lastName()
        const id = randomUUID()
        const residence: 'day' | 'boarding' = i % 3 === 0 ? 'boarding' : 'day'
        const student_code = `${SHORT_CODE}-2025-${String(seq).padStart(4, '0')}`
        studentInsert.run({
          ...baseFields(now),
          id,
          name: `${first} ${last}`,
          class_id: cls.id,
          school_id: schoolId,
          student_code,
          academic_level_id: cls.academic_level_id,
          sequence_number: seq,
          gender,
          date_of_birth: isoDate(
            faker.date.birthdate({ min: 11, max: 20, mode: 'age' })
          ),
          phone: null,
          email: null,
          address: faker.helpers.arrayElement([
            'Simbock, Yaoundé',
            'Mvan, Yaoundé',
            'Nsimeyong, Yaoundé',
            'Melen, Yaoundé',
          ]),
          guardian_name: faker.person.fullName(),
          guardian_phone: faker.phone.number({ style: 'national' }),
          guardian_email: faker.internet.email().toLowerCase(),
          guardian_relationship: faker.helpers.arrayElement([
            'mother',
            'father',
            'guardian',
          ]),
          residence_type: residence,
        })
        ctx.students.push({
          id,
          school_id: schoolId,
          class_id: cls.id,
          name: `${first} ${last}`,
          student_code,
          academic_level_id: cls.academic_level_id,
        })
        localStudents.push({ id, class_id: cls.id, residence })
        seq += 1
      }
    }

    const invoiceInsert = db.prepare(
      `INSERT INTO invoices (
        id, school_id, student_id, invoice_number, academic_year_id, academic_term_id,
        fee_structure_id, billing_period, issue_date, due_date, status,
        subtotal, discount_total, net_payable, amount_paid, balance,
        carried_from_invoice_id, notes,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @student_id, @invoice_number, @academic_year_id, NULL,
        @fee_structure_id, @billing_period, @issue_date, @due_date, @status,
        @subtotal, 0, @net_payable, @amount_paid, @balance,
        NULL, @notes,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )
    const invoiceLineInsert = db.prepare(
      `INSERT INTO invoice_lines (
        id, school_id, invoice_id, fee_category_id, description, amount,
        is_adjustment, sort_order,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @invoice_id, NULL, @description, @amount,
        0, 0,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )
    const paymentInsert = db.prepare(
      `INSERT INTO payments (
        id, school_id, student_id, invoice_id, payment_number, amount, method,
        reference, paid_at, recorded_by, notes, credit_applied,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @student_id, @invoice_id, @payment_number, @amount, @method,
        @reference, @paid_at, NULL, @notes, 0,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )
    const receiptInsert = db.prepare(
      `INSERT INTO receipts (
        id, school_id, payment_id, student_id, receipt_number, amount,
        balance_remaining, issued_at, reprint_count,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @payment_id, @student_id, @receipt_number, @amount,
        @balance_remaining, @issued_at, 0,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )`
    )

    const counters = ctx.counters.get(schoolId)!
    const next = (kind: 'invoice' | 'payment' | 'receipt') => {
      const prefixes = { invoice: 'LWM-INV', payment: 'LWM-PAY', receipt: 'LWM-RCP' }
      const code = `${prefixes[kind]}-${padNum(counters[kind])}`
      counters[kind] += 1
      return code
    }

    localStudents.forEach((student, index) => {
      const pack = feeByClassResidence.get(`${student.class_id}:${student.residence}`)
      if (!pack) return
      const firstInstalment = student.residence === 'boarding' ? 300000 : 100000
      const net = pack.total
      const bucket = index % 5
      let amount_paid = 0
      let status: 'pending' | 'partially_paid' | 'paid' | 'overdue' = 'pending'
      if (bucket === 0) {
        amount_paid = net
        status = 'paid'
      } else if (bucket === 1 || bucket === 2) {
        amount_paid = Math.min(firstInstalment, net)
        status = 'partially_paid'
      } else if (bucket === 3) {
        amount_paid = 0
        status = 'overdue'
      }
      const balance = round2(net - amount_paid)
      const invoiceId = randomUUID()
      invoiceInsert.run({
        ...baseFields(now),
        id: invoiceId,
        school_id: schoolId,
        student_id: student.id,
        invoice_number: next('invoice'),
        academic_year_id: yearId,
        fee_structure_id: pack.id,
        billing_period: '2025/2026',
        issue_date: '2025-09-05',
        due_date: status === 'overdue' ? '2025-10-15' : '2026-02-28',
        status,
        subtotal: net,
        net_payable: net,
        amount_paid,
        balance,
        notes:
          student.residence === 'boarding'
            ? 'Boarder. 1st instalment 300,000 FRS (Sep–Oct).'
            : 'Day student. 1st instalment 100,000 FRS (Sep–Oct).',
      })
      invoiceLineInsert.run({
        ...baseFields(now),
        school_id: schoolId,
        invoice_id: invoiceId,
        description: 'Annual fees 2025/2026',
        amount: net,
      })
      if (amount_paid > 0) {
        const paymentId = randomUUID()
        paymentInsert.run({
          ...baseFields(now),
          id: paymentId,
          school_id: schoolId,
          student_id: student.id,
          invoice_id: invoiceId,
          payment_number: next('payment'),
          amount: amount_paid,
          method: faker.helpers.arrayElement([
            'cash',
            'mobile_money',
            'bank_transfer',
          ]),
          reference: null,
          paid_at: '2025-09-20',
          notes: amount_paid === net ? 'Fees paid in full' : 'First instalment',
        })
        receiptInsert.run({
          ...baseFields(now),
          id: randomUUID(),
          school_id: schoolId,
          payment_id: paymentId,
          student_id: student.id,
          receipt_number: next('receipt'),
          amount: amount_paid,
          balance_remaining: balance,
          issued_at: '2025-09-20',
        })
      }
    })
  })

  const schoolClasses = ctx.classes.filter((c) => c.name.includes('BC ') || c.name.startsWith('Form') || ['LSA', 'USA', 'LSS', 'USS', 'LSC', 'USC'].includes(c.name))
  const lwmClasses = ctx.classes.filter((c) =>
    ctx.schools.some((s) => s.short_code === SHORT_CODE && s.id === c.school_id)
  )
  const lwmStudents = ctx.students.filter((s) =>
    ctx.schools.some((sch) => sch.short_code === SHORT_CODE && sch.id === s.school_id)
  )
  void schoolClasses
  console.log(
    `  Light World Mission: ${lwmClasses.length} classes, ${lwmStudents.length} students, login ${ADMIN_EMAIL}`
  )
}
