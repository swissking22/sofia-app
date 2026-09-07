import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { generateStudentCode } from '../../main/services/student-id'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function setupTestEnvironment() {
  const db = new Database(':memory:')
  createSchema(db)
  const repos = createRepositories(db)

  const school = repos.schools.create({
    name: 'Alpha Beta College',
    short_code: 'ABC',
    address: 'Buea, Cameroon',
    phone: '237670000000',
    email: 'info@abc.school',
  })

  const level1 = repos.academicLevels.create({
    school_id: school.id,
    name: 'Form 1',
    short_name: 'F1',
    category: 'lower_secondary',
    sort_order: 1,
    is_active: 1,
  })

  const level2 = repos.academicLevels.create({
    school_id: school.id,
    name: 'Form 2',
    short_name: 'F2',
    category: 'lower_secondary',
    sort_order: 2,
    is_active: 1,
  })

  const class1 = repos.classes.create({
    school_id: school.id,
    name: 'Form 1A',
    level: '1',
    form_key: 'F1',
    stream: 'A',
    academic_level_id: level1.id,
    section_id: null,
    specialization_id: null,
    capacity: 50,
    is_active: 1,
    class_teacher_id: null,
  })

  const class2 = repos.classes.create({
    school_id: school.id,
    name: 'Form 2A',
    level: '2',
    form_key: 'F2',
    stream: 'A',
    academic_level_id: level2.id,
    section_id: null,
    specialization_id: null,
    capacity: 50,
    is_active: 1,
    class_teacher_id: null,
  })

  return { db, repos, school, level1, level2, class1, class2 }
}

describe('Permanent Student IDs & Atomic Creation', () => {
  it('Test 1 — New student: generates local UUID, permanent student_code, sequence_number, and admission_year', () => {
    const { repos, school, class1, level1 } = setupTestEnvironment()

    const student = repos.students.create({
      name: 'John Doe',
      class_id: class1.id,
      school_id: school.id,
      admission_year: 2026,
      academic_level_id: level1.id,
      gender: 'male',
      date_of_birth: '2012-05-10',
    })

    expect(student).toBeDefined()
    // 1. UUID format
    expect(student.id).toMatch(UUID_REGEX)
    // 2. Permanent student_code without year in default format
    expect(student.student_code).toBe('ABC-0001')
    // 3. Sequence number
    expect(student.sequence_number).toBe(1)
    // 4. Admission year stored separately
    expect(student.admission_year).toBe(2026)
    // 5. Version and sync status
    expect(student.version).toBe(1)
    expect(student.sync_status).toBe('pending')
    expect(student.deleted_at).toBeNull()
  })

  it('Test 2 — Second student: sequence increments correctly (ABC-0001 -> ABC-0002)', () => {
    const { repos, school, class1 } = setupTestEnvironment()

    const first = repos.students.create({
      name: 'First Student',
      class_id: class1.id,
      school_id: school.id,
      admission_year: 2026,
    })

    const second = repos.students.create({
      name: 'Second Student',
      class_id: class1.id,
      school_id: school.id,
      admission_year: 2026,
    })

    expect(first.student_code).toBe('ABC-0001')
    expect(first.sequence_number).toBe(1)

    expect(second.student_code).toBe('ABC-0002')
    expect(second.sequence_number).toBe(2)
    expect(second.id).toMatch(UUID_REGEX)
    expect(second.id).not.toBe(first.id)
  })

  it('Test 3 — Academic year changes: student_code remains unchanged across academic years', () => {
    const { repos, school, class1 } = setupTestEnvironment()

    const student = repos.students.create({
      name: 'Emma Watson',
      class_id: class1.id,
      school_id: school.id,
      admission_year: 2026,
    })

    expect(student.student_code).toBe('ABC-0001')
    expect(student.admission_year).toBe(2026)

    // Simulate system/academic year advancing to 2027 and 2028
    const year2027 = repos.academicYears.create({
      school_id: school.id,
      name: '2027/2028',
      start_date: '2027-09-01',
      end_date: '2028-06-30',
      is_current: 0,
    })
    expect(year2027).toBeDefined()

    // Fetch student again
    const fetched = repos.students.findById(student.id)
    expect(fetched).toBeDefined()
    expect(fetched!.student_code).toBe('ABC-0001')
    expect(fetched!.admission_year).toBe(2026)
    expect(fetched!.sequence_number).toBe(1)
  })

  it('Test 4 — Student promotion: Form 1 -> Form 2 preserves student_code, sequence_number, admission_year', () => {
    const { repos, school, class1, class2, level2 } = setupTestEnvironment()

    const student = repos.students.create({
      name: 'Paul Pogba',
      class_id: class1.id,
      school_id: school.id,
      admission_year: 2026,
    })

    expect(student.student_code).toBe('ABC-0001')
    expect(student.sequence_number).toBe(1)

    // Promote student to Form 2
    const promoted = repos.students.update(student.id, {
      class_id: class2.id,
      academic_level_id: level2.id,
    })

    expect(promoted).toBeDefined()
    expect(promoted!.id).toBe(student.id)
    expect(promoted!.student_code).toBe('ABC-0001')
    expect(promoted!.sequence_number).toBe(1)
    expect(promoted!.admission_year).toBe(2026)
    expect(promoted!.class_id).toBe(class2.id)
    expect(promoted!.academic_level_id).toBe(level2.id)
    expect(promoted!.version).toBe(2)
    expect(promoted!.sync_status).toBe('pending')
  })

  it('Test 5 — Repeat class: repeating Form 2 preserves student_code, sequence_number, admission_year', () => {
    const { repos, school, class2, level2 } = setupTestEnvironment()

    const student = repos.students.create({
      name: 'Samuel Eto',
      class_id: class2.id,
      school_id: school.id,
      admission_year: 2026,
      academic_level_id: level2.id,
    })

    expect(student.student_code).toBe('ABC-0001')

    // Student repeats Form 2 in next academic cycle
    const repeated = repos.students.update(student.id, {
      class_id: class2.id,
      academic_level_id: level2.id,
    })

    expect(repeated!.student_code).toBe('ABC-0001')
    expect(repeated!.sequence_number).toBe(1)
    expect(repeated!.admission_year).toBe(2026)
    expect(repeated!.id).toBe(student.id)
  })

  it('Test 5b — Department / section change preserves student_code, sequence_number, admission_year', () => {
    const { repos, school, class1, level2 } = setupTestEnvironment()

    const student = repos.students.create({
      name: 'Roger Milla',
      class_id: class1.id,
      school_id: school.id,
      admission_year: 2026,
    })

    expect(student.student_code).toBe('ABC-0001')
    expect(student.sequence_number).toBe(1)

    // Create a new section and class for Commercial department
    const section = repos.sections.create({
      school_id: school.id,
      name: 'Commercial Section',
      description: 'COMM',
      is_active: 1,
    })

    const classComm = repos.classes.create({
      school_id: school.id,
      name: 'Form 2 Commercial',
      level: '2',
      form_key: 'F2C',
      stream: 'Commercial',
      academic_level_id: level2.id,
      section_id: section.id,
      specialization_id: null,
      capacity: 40,
      is_active: 1,
      class_teacher_id: null,
    })

    // Move student to different department/section
    const transferred = repos.students.update(student.id, {
      class_id: classComm.id,
      academic_level_id: level2.id,
    })

    expect(transferred!.student_code).toBe('ABC-0001')
    expect(transferred!.sequence_number).toBe(1)
    expect(transferred!.admission_year).toBe(2026)
    expect(transferred!.id).toBe(student.id)
    expect(transferred!.class_id).toBe(classComm.id)
  })

  it('Test 6 — Existing student update: updating details preserves student_code and bumps version', () => {
    const { repos, school, class1 } = setupTestEnvironment()

    const student = repos.students.create({
      name: 'Original Name',
      class_id: class1.id,
      school_id: school.id,
      admission_year: 2026,
      phone: '111111111',
    })

    const updated = repos.students.update(student.id, {
      name: 'Updated Name',
      phone: '999999999',
      address: 'New Town Buea',
      guardian_name: 'Guardian Alpha',
      // Even if an update payload attempts to pass a different student_code, it MUST NOT overwrite existing
      student_code: 'MALICIOUS-CODE-999',
    } as any)

    expect(updated).toBeDefined()
    expect(updated!.name).toBe('Updated Name')
    expect(updated!.phone).toBe('999999999')
    expect(updated!.address).toBe('New Town Buea')
    expect(updated!.student_code).toBe('ABC-0001') // Preserved!
    expect(updated!.sequence_number).toBe(1)
    expect(updated!.admission_year).toBe(2026)
    expect(updated!.version).toBe(2)
    expect(updated!.sync_status).toBe('pending')
  })

  it('Test 7 — Transaction rollback: failure after sequence retrieval rolls back sequence and student insertion', () => {
    const { db, repos, school, class1 } = setupTestEnvironment()

    const settingsBefore = repos.studentIdSettings.findBySchool(school.id)
    const seqBefore = settingsBefore?.next_sequence_number ?? 1

    // Attempt creation with an error thrown right inside the transaction
    expect(() => {
      db.transaction(() => {
        repos.students.create({
          name: 'Failing Student',
          class_id: class1.id,
          school_id: school.id,
        })
        throw new Error('Simulated failure during admission process')
      })()
    }).toThrow('Simulated failure during admission process')

    // 1. Verify no student was inserted
    const students = repos.students.findBySchool(school.id, 'all')
    expect(students.length).toBe(0)

    // 2. Verify sequence number was NOT consumed
    const settingsAfter = repos.studentIdSettings.findBySchool(school.id)
    expect(settingsAfter?.next_sequence_number ?? 1).toBe(seqBefore)

    // 3. Next legitimate student creation gets seqBefore
    const validStudent = repos.students.create({
      name: 'Valid Student',
      class_id: class1.id,
      school_id: school.id,
    })
    expect(validStudent.sequence_number).toBe(seqBefore)
    expect(validStudent.student_code).toBe(`ABC-000${seqBefore}`)
  })

  it('Test 8 — Sync operation: creating student creates pending outbox sync operation with complete payload', () => {
    const { db, repos, school, class1, level1 } = setupTestEnvironment()

    const student = repos.students.create({
      name: 'Sync Test Student',
      class_id: class1.id,
      school_id: school.id,
      academic_level_id: level1.id,
      admission_year: 2026,
      gender: 'female',
      date_of_birth: '2013-08-20',
      phone: '237680000000',
      email: 'student@abc.school',
      address: 'Molyko',
      admission_type: 'new',
      guardian_name: 'Mary Test',
      guardian_phone: '237690000000',
      guardian_email: 'mary@abc.school',
      guardian_relationship: 'Mother',
      residence_type: 'boarding',
    })

    // Query sync_queue for operations on 'students'
    const syncRows = db
      .prepare(
        `SELECT * FROM sync_queue WHERE table_name = 'students' AND record_id = ?`
      )
      .all(student.id) as Array<{
      id: string
      table_name: string
      record_id: string
      operation: string
      payload: string
      status: string
    }>

    expect(syncRows.length).toBe(1)
    const op = syncRows[0]!
    expect(op.table_name).toBe('students')
    expect(op.record_id).toBe(student.id)
    expect(op.operation).toBe('INSERT')
    expect(op.status).toBe('pending')

    const payload = JSON.parse(op.payload)
    expect(payload.id).toBe(student.id)
    expect(payload.school_id).toBe(school.id)
    expect(payload.name).toBe('Sync Test Student')
    expect(payload.class_id).toBe(class1.id)
    expect(payload.student_code).toBe('ABC-0001')
    expect(payload.admission_year).toBe(2026)
    expect(payload.academic_level_id).toBe(level1.id)
    expect(payload.sequence_number).toBe(1)
    expect(payload.gender).toBe('female')
    expect(payload.date_of_birth).toBe('2013-08-20')
    expect(payload.phone).toBe('237680000000')
    expect(payload.email).toBe('student@abc.school')
    expect(payload.address).toBe('Molyko')
    expect(payload.admission_type).toBe('new')
    expect(payload.guardian_name).toBe('Mary Test')
    expect(payload.guardian_phone).toBe('237690000000')
    expect(payload.guardian_email).toBe('mary@abc.school')
    expect(payload.guardian_relationship).toBe('Mother')
    expect(payload.status).toBe('active')
    expect(payload.version).toBe(1)
    expect(payload.sync_status).toBe('pending')
  })

  it('Test 9 — Duplicate prevention: duplicate student code within the same school is rejected', () => {
    const { repos, school, class1 } = setupTestEnvironment()

    // Create first student with explicit code
    repos.students.create({
      name: 'Existing Student',
      class_id: class1.id,
      school_id: school.id,
      student_code: 'ABC-0001',
      sequence_number: 1,
    })

    // Attempting to insert a second student with the exact same student_code in the same school must fail
    expect(() => {
      repos.students.create({
        name: 'Duplicate Code Student',
        class_id: class1.id,
        school_id: school.id,
        student_code: 'ABC-0001',
      })
    }).toThrow(/already exists|UNIQUE constraint failed/)
  })

  it('Fresh database schema: creates tables with {SCHOOL}-{SEQ} default, school scope, and unique index', () => {
    const db = new Database(':memory:')
    createSchema(db)

    // Verify student_id_settings table default schema
    const settingsColDefs = db.prepare(`PRAGMA table_info(student_id_settings)`).all() as Array<{ name: string; dflt_value: string }>
    const patternCol = settingsColDefs.find((c) => c.name === 'pattern')
    const scopeCol = settingsColDefs.find((c) => c.name === 'sequence_scope')
    expect(patternCol?.dflt_value).toBe(`'{SCHOOL}-{SEQ}'`)
    expect(scopeCol?.dflt_value).toBe(`'school'`)

    // Verify unique index on students(school_id, student_code)
    const indexes = db.prepare(`PRAGMA index_list(students)`).all() as Array<{ name: string; unique: number }>
    const uniqueIdx = indexes.find((i) => i.name === 'idx_students_school_code_unique')
    expect(uniqueIdx).toBeDefined()
    expect(uniqueIdx!.unique).toBe(1)
  })

  it('Migration test — safely updates existing student_id_settings to {SCHOOL}-{SEQ} and school scope without altering existing student records', () => {
    const db = new Database(':memory:')
    // Run schema
    createSchema(db)

    // Insert historical school and class
    db.prepare(
      `INSERT INTO schools (
        id, name, short_code, school_code, email, phone, address, created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        'sch_historical', 'Historical School', 'HIST', 'HIST_CODE', 'hist@school.edu', '123456789', 'Buea', datetime('now'), datetime('now'), NULL, 'synced', 1
      )`
    ).run()

    db.prepare(
      `INSERT INTO classes (
        id, school_id, name, created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        'cls_1', 'sch_historical', 'Class 1', datetime('now'), datetime('now'), NULL, 'synced', 1
      )`
    ).run()

    // Simulate an existing database that was created before with old year pattern:
    db.prepare(
      `INSERT OR REPLACE INTO student_id_settings (
        id, school_id, pattern, sequence_scope, next_sequence_number,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        'sett_old', 'sch_historical', '{SCHOOL}-{YEAR}-{SEQ}', 'year', 3,
        datetime('now'), datetime('now'), NULL, 'synced', 1
      )`
    ).run()

    // Add historical students with existing student_code
    db.prepare(
      `INSERT INTO students (
        id, school_id, name, class_id, student_code, sequence_number, admission_year,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        'stu_hist_1', 'sch_historical', 'Historical Student 1', 'cls_1', 'HIST-2024-001', 1, 2024,
        datetime('now'), datetime('now'), NULL, 'synced', 1
      )`
    ).run()

    db.prepare(
      `INSERT INTO students (
        id, school_id, name, class_id, student_code, sequence_number, admission_year,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        'stu_hist_2', 'sch_historical', 'Historical Student 2', 'cls_1', 'HIST-2024-002', 5, 2024,
        datetime('now'), datetime('now'), NULL, 'synced', 1
      )`
    ).run()

    // Add historical student with missing student_code (legacy unassigned)
    db.prepare(
      `INSERT INTO students (
        id, school_id, name, class_id, student_code, sequence_number, admission_year,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        'stu_hist_3', 'sch_historical', 'Historical Student 3 Unassigned', 'cls_1', NULL, NULL, 2023,
        datetime('now'), datetime('now'), NULL, 'synced', 1
      )`
    ).run()

    // Re-run schema migration (simulating upgrade of existing DB)
    createSchema(db)

    // Verify settings were migrated safely:
    const updatedSettings = db
      .prepare(`SELECT * FROM student_id_settings WHERE id = 'sett_old'`)
      .get() as any

    expect(updatedSettings.pattern).toBe('{SCHOOL}-{SEQ}')
    expect(updatedSettings.sequence_scope).toBe('school')
    // Next sequence must have safely advanced past existing sequence max (5 -> 6)
    expect(updatedSettings.next_sequence_number).toBe(6)

    // Verify historical students were NOT rewritten
    const s1 = db
      .prepare(`SELECT * FROM students WHERE id = 'stu_hist_1'`)
      .get() as any
    expect(s1.student_code).toBe('HIST-2024-001')
    expect(s1.admission_year).toBe(2024)
    expect(s1.sequence_number).toBe(1)

    const s2 = db
      .prepare(`SELECT * FROM students WHERE id = 'stu_hist_2'`)
      .get() as any
    expect(s2.student_code).toBe('HIST-2024-002')
    expect(s2.admission_year).toBe(2024)
    expect(s2.sequence_number).toBe(5)

    const s3 = db
      .prepare(`SELECT * FROM students WHERE id = 'stu_hist_3'`)
      .get() as any
    expect(s3.student_code).toBeNull()
    expect(s3.sequence_number).toBeNull()

    // Verify creating a new student post-migration uses new permanent format {SCHOOL}-{SEQ}
    const repos = createRepositories(db)
    const newStudent = repos.students.create({
      name: 'Post Migration Student',
      school_id: 'sch_historical',
      class_id: 'cls_1',
      admission_year: 2026,
    })
    expect(newStudent.student_code).toBe('HIST-0006')
    expect(newStudent.sequence_number).toBe(6)
    expect(newStudent.id).toMatch(UUID_REGEX)
    expect(newStudent.admission_year).toBe(2026)
  })

  it('generateStudentCode helper produces {SCHOOL}-{SEQ} without year by default', () => {
    const { db, school } = setupTestEnvironment()

    const code1 = generateStudentCode(db, school.id, { sequence: 1 })
    expect(code1.student_code).toBe('ABC-0001')
    expect(code1.sequence_number).toBe(1)

    const code2 = generateStudentCode(db, school.id, { sequence: 42 })
    expect(code2.student_code).toBe('ABC-0042')
    expect(code2.sequence_number).toBe(42)
  })
})
