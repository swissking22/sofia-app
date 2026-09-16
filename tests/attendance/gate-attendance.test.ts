import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { studentQrPayload } from '../../main/domain/id-card-classic-tokens'
import {
  isGateScanRawAcceptable,
  localSchoolDayIso,
  normalizeGateScanRaw,
} from '../../main/domain/gate-attendance'
import { processGateScan } from '../../main/services/gate-attendance'

function setup() {
  const db = new Database(':memory:')
  createSchema(db)
  const repos = createRepositories(db)

  const school = repos.schools.create({
    name: 'Gate Test College',
    short_code: 'GTC',
    address: 'Buea',
    phone: '237670000000',
    email: 'info@gtc.school',
  })

  const otherSchool = repos.schools.create({
    name: 'Other School',
    short_code: 'OTH',
    address: 'Douala',
    phone: '237671111111',
    email: 'info@oth.school',
  })

  const level = repos.academicLevels.create({
    school_id: school.id,
    name: 'Form 4',
    short_name: 'F4',
    category: 'upper_secondary',
    sort_order: 4,
    is_active: 1,
  })

  const cls = repos.classes.create({
    school_id: school.id,
    name: 'Form 4A',
    level: '4',
    form_key: 'F4',
    stream: 'A',
    academic_level_id: level.id,
    section_id: null,
    specialization_id: null,
    capacity: 50,
    is_active: 1,
    class_teacher_id: null,
  })

  const otherLevel = repos.academicLevels.create({
    school_id: otherSchool.id,
    name: 'Form 1',
    short_name: 'F1',
    category: 'lower_secondary',
    sort_order: 1,
    is_active: 1,
  })

  const otherClass = repos.classes.create({
    school_id: otherSchool.id,
    name: 'Form 1A',
    level: '1',
    form_key: 'F1',
    stream: 'A',
    academic_level_id: otherLevel.id,
    section_id: null,
    specialization_id: null,
    capacity: 40,
    is_active: 1,
    class_teacher_id: null,
  })

  const studentA = repos.students.create({
    name: 'John Nkong',
    class_id: cls.id,
    school_id: school.id,
    admission_year: 2026,
    academic_level_id: level.id,
    gender: 'male',
    date_of_birth: '2010-01-15',
  })

  const studentB = repos.students.create({
    name: 'Mary Atangana',
    class_id: cls.id,
    school_id: school.id,
    admission_year: 2026,
    academic_level_id: level.id,
    gender: 'female',
    date_of_birth: '2010-03-20',
  })

  const alumni = repos.students.create({
    name: 'Alumni Student',
    class_id: cls.id,
    school_id: school.id,
    admission_year: 2020,
    academic_level_id: level.id,
    gender: 'male',
    status: 'alumni',
  })

  const foreign = repos.students.create({
    name: 'Other School Kid',
    class_id: otherClass.id,
    school_id: otherSchool.id,
    admission_year: 2026,
    academic_level_id: otherLevel.id,
    gender: 'female',
  })

  return {
    db,
    repos,
    school,
    otherSchool,
    studentA,
    studentB,
    alumni,
    foreign,
    codeA: studentA.student_code!,
    codeB: studentB.student_code!,
    codeOther: foreign.student_code!,
  }
}

describe('Gate attendance scanner', () => {
  it('normalizes and rejects empty / oversized raw input', () => {
    expect(normalizeGateScanRaw('  SCH-26-1\r\n ')).toBe('SCH-26-1')
    expect(isGateScanRawAcceptable('')).toBe(false)
    expect(isGateScanRawAcceptable('   ')).toBe(false)
    expect(isGateScanRawAcceptable('x'.repeat(200))).toBe(false)
    expect(isGateScanRawAcceptable('GTC-0001')).toBe(true)
  })

  it('records gate attendance for a valid QR payload', () => {
    const { repos, school, studentA, codeA } = setup()
    const qr = studentQrPayload(codeA)
    expect(qr).toBe(`sofia:stu:${codeA}`)
    expect(qr).not.toMatch(/Nkong|2010|phone/i)

    const result = processGateScan(repos, {
      schoolId: school.id,
      raw: qr,
      userId: 'user-1',
      deviceId: 'device-test',
    })

    expect(result.outcome).toBe('recorded')
    expect(result.student?.id).toBe(studentA.id)
    expect(result.student?.name).toBe('John Nkong')
    expect(result.student?.class_name).toBe('Form 4A')
    expect(result.attendance?.attendance_type).toBe('gate')
    expect(result.attendance?.status).toBe('present')
    expect(result.attendance?.attendance_date).toBe(localSchoolDayIso())
    expect(result.student?.photo_url).toBeNull()
  })

  it('accepts bare student_code from keyboard wedge', () => {
    const { repos, school, codeA, studentA } = setup()
    const result = processGateScan(repos, {
      schoolId: school.id,
      raw: `  ${codeA}\n`,
      userId: null,
    })
    expect(result.outcome).toBe('recorded')
    expect(result.student?.id).toBe(studentA.id)
  })

  it('rejects empty and invalid payloads without writing rows', () => {
    const { repos, school } = setup()
    expect(
      processGateScan(repos, { schoolId: school.id, raw: '', userId: null }).outcome
    ).toBe('invalid')
    expect(
      processGateScan(repos, {
        schoolId: school.id,
        raw: 'sofia:v1:ABCDEF',
        userId: null,
      }).outcome
    ).toBe('invalid')
    expect(
      processGateScan(repos, {
        schoolId: school.id,
        raw: 'not a code!!',
        userId: null,
      }).outcome
    ).toBe('invalid')
    expect(repos.gateAttendance.todaySummary(school.id).present).toBe(0)
  })

  it('returns not_found for unknown codes', () => {
    const { repos, school } = setup()
    const result = processGateScan(repos, {
      schoolId: school.id,
      raw: 'GTC-99999',
      userId: null,
    })
    expect(result.outcome).toBe('not_found')
    expect(result.student).toBeNull()
    expect(result.attendance).toBeNull()
  })

  it('blocks inactive / alumni students', () => {
    const { repos, school, alumni } = setup()
    const result = processGateScan(repos, {
      schoolId: school.id,
      raw: alumni.student_code!,
      userId: null,
    })
    expect(result.outcome).toBe('inactive')
    expect(result.attendance).toBeNull()
  })

  it('detects duplicate gate scans for the same school day', () => {
    const { repos, school, codeA } = setup()
    const first = processGateScan(repos, {
      schoolId: school.id,
      raw: codeA,
      userId: null,
    })
    expect(first.outcome).toBe('recorded')
    const second = processGateScan(repos, {
      schoolId: school.id,
      raw: studentQrPayload(codeA),
      userId: null,
    })
    expect(second.outcome).toBe('duplicate')
    expect(second.attendance?.id).toBe(first.attendance?.id)
    expect(repos.gateAttendance.todaySummary(school.id).present).toBe(1)
  })

  it('supports rapid consecutive scans for different students', () => {
    const { repos, school, codeA, codeB } = setup()
    const a = processGateScan(repos, { schoolId: school.id, raw: codeA, userId: null })
    const b = processGateScan(repos, { schoolId: school.id, raw: codeB, userId: null })
    expect(a.outcome).toBe('recorded')
    expect(b.outcome).toBe('recorded')
    expect(a.student?.id).not.toBe(b.student?.id)
    expect(repos.gateAttendance.todaySummary(school.id).present).toBe(2)
  })

  it('scopes lookup to the current school', () => {
    const { repos, school, codeOther } = setup()
    const result = processGateScan(repos, {
      schoolId: school.id,
      raw: codeOther,
      userId: null,
    })
    expect(result.outcome).toBe('not_found')
  })

  it('enforces unique permanent IDs per school and stable QR payload', () => {
    const { codeA, codeB, studentA, studentB } = setup()
    expect(codeA).not.toBe(codeB)
    expect(studentA.student_code).toBe(codeA)
    expect(studentB.student_code).toBe(codeB)
    expect(studentQrPayload(codeA)).toBe(studentQrPayload(codeA))
    expect(studentQrPayload(codeA)).not.toBe(studentQrPayload(codeB))
  })

  it('updates today summary counts', () => {
    const { repos, school, codeA } = setup()
    const before = repos.gateAttendance.todaySummary(school.id)
    expect(before.present).toBe(0)
    expect(before.total_active).toBe(2)
    expect(before.not_yet_scanned).toBe(2)
    processGateScan(repos, { schoolId: school.id, raw: codeA, userId: null })
    const after = repos.gateAttendance.todaySummary(school.id)
    expect(after.present).toBe(1)
    expect(after.not_yet_scanned).toBe(1)
  })

  it('does not break class attendance sessions', () => {
    const { repos, school, studentA, codeA } = setup()
    const session = repos.attendance.createSession({
      school_id: school.id,
      class_id: studentA.class_id,
      session_date: localSchoolDayIso(),
      notes: null,
    })
    repos.attendance.upsertRecord({
      session_id: session.id,
      student_id: studentA.id,
      status: 'present',
    })
    processGateScan(repos, { schoolId: school.id, raw: codeA, userId: null })
    const records = repos.attendance.findRecords(session.id)
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe('present')
    expect(repos.gateAttendance.todaySummary(school.id).present).toBe(1)
  })
})
