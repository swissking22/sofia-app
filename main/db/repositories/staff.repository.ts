import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type {
  Staff,
  StaffAdminRole,
  StaffClass,
  StaffGender,
  StaffJobRole,
  StaffStatus,
  StaffSubject,
  StaffType,
  UserRole,
} from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'
import {
  expandLegacyTeachingAssignments,
  normalizeTeachingAssignments,
  type TeachingAssignment,
} from '../../domain/staff'

/** Temporary password for prepared staff accounts (shown in setup UI). */
export const STAFF_TEMP_PASSWORD = 'Sofia@Staff1'

export const ADMIN_ROLE_LABELS: Record<StaffAdminRole, string> = {
  principal: 'Principal',
  vice_principal: 'Vice Principal',
  bursar: 'Bursar',
  secretary: 'Secretary',
}

export const ADMIN_ROLES: StaffAdminRole[] = [
  'principal',
  'vice_principal',
  'bursar',
  'secretary',
]

function adminRoleToUserRole(role: StaffAdminRole): UserRole {
  if (role === 'principal' || role === 'vice_principal') return 'admin'
  return 'secretary'
}

export interface StaffDto {
  id: string
  school_id: string
  full_name: string
  gender: StaffGender | null
  phone: string | null
  email: string | null
  staff_type: StaffType
  admin_role: StaffAdminRole | null
  department_id: string | null
  department_name: string | null
  status: StaffStatus
  user_id: string | null
  employee_code: string | null
  joining_date: string | null
  address: string | null
  job_role: StaffJobRole | null
  subject_ids: string[]
  subject_names: string[]
  class_ids: string[]
  class_names: string[]
  teaching_assignments: Array<{
    class_id: string
    subject_id: string
    class_name: string | null
    subject_name: string | null
  }>
  homeroom_class_ids: string[]
  homeroom_class_names: string[]
}

export interface StaffSetupData {
  schoolId: string
  adminStaff: StaffDto[]
  teachers: StaffDto[]
  departments: Array<{ id: string; name: string }>
  subjects: Array<{ id: string; name: string; class_ids: string[] }>
  classes: Array<{
    id: string
    name: string
    academic_level_id?: string | null
    academic_level_name?: string | null
    level_sort_order?: number | null
    section_id?: string | null
    section_name?: string | null
  }>
  tempPassword: string
}

export interface UpsertAdminInput {
  id?: string | null
  admin_role: StaffAdminRole
  full_name: string
  phone?: string | null
  email?: string | null
}

export interface UpsertTeacherInput {
  id?: string | null
  full_name: string
  gender?: StaffGender | null
  phone?: string | null
  email?: string | null
  department_id?: string | null
  subject_ids?: string[]
  class_ids?: string[]
  teaching_assignments?: TeachingAssignment[]
  status?: StaffStatus
}

export class StaffRepository extends BaseRepository<Staff> {
  constructor(db: Database.Database) {
    super(db, 'staff')
  }

  findBySchool(schoolId: string): Staff[] {
    return this.db
      .prepare(
        `SELECT * FROM staff
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY full_name ASC`
      )
      .all(schoolId) as Staff[]
  }

  findAdminByRole(
    schoolId: string,
    adminRole: StaffAdminRole
  ): Staff | undefined {
    return this.db
      .prepare(
        `SELECT * FROM staff
         WHERE school_id = ?
           AND staff_type = 'administrative'
           AND admin_role = ?
           AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId, adminRole) as Staff | undefined
  }

  getSetupData(
    schoolId: string,
    lookups: {
      departments: Array<{ id: string; name: string }>
      subjects: Array<{ id: string; name: string; class_ids?: string[] }>
      classes: Array<{
        id: string
        name: string
        academic_level_id?: string | null
        academic_level_name?: string | null
        level_sort_order?: number | null
        section_id?: string | null
        section_name?: string | null
      }>
    }
  ): StaffSetupData {
    const all = this.findBySchool(schoolId).map((row) =>
      this.toDto(row, lookups)
    )
    return {
      schoolId,
      adminStaff: all.filter((s) => s.staff_type === 'administrative'),
      teachers: all.filter((s) => s.staff_type === 'teaching'),
      departments: lookups.departments,
      subjects: lookups.subjects.map((s) => ({
        id: s.id,
        name: s.name,
        class_ids: s.class_ids ?? [],
      })),
      classes: lookups.classes,
      tempPassword: STAFF_TEMP_PASSWORD,
    }
  }

  toDto(
    row: Staff,
    lookups: {
      departments: Array<{ id: string; name: string }>
      subjects: Array<{ id: string; name: string; class_ids?: string[] }>
      classes: Array<{ id: string; name: string }>
    }
  ): StaffDto {
    const assignments = this.findAssignments(row.id)
    const subject_ids = [...new Set(assignments.map((a) => a.subject_id))]
    const class_ids = [...new Set(assignments.map((a) => a.class_id))]
    return {
      id: row.id,
      school_id: row.school_id,
      full_name: row.full_name,
      gender: row.gender,
      phone: row.phone,
      email: row.email,
      staff_type: row.staff_type,
      admin_role: row.admin_role,
      department_id: row.department_id,
      department_name:
        lookups.departments.find((d) => d.id === row.department_id)?.name ??
        null,
      status: row.status,
      user_id: row.user_id,
      employee_code: row.employee_code,
      joining_date: row.joining_date,
      address: row.address,
      job_role: row.job_role,
      subject_ids,
      subject_names: subject_ids
        .map((id) => lookups.subjects.find((s) => s.id === id)?.name)
        .filter((n): n is string => Boolean(n)),
      class_ids,
      class_names: class_ids
        .map((id) => lookups.classes.find((c) => c.id === id)?.name)
        .filter((n): n is string => Boolean(n)),
      teaching_assignments: assignments.map((a) => ({
        class_id: a.class_id,
        subject_id: a.subject_id,
        class_name: lookups.classes.find((c) => c.id === a.class_id)?.name ?? null,
        subject_name:
          lookups.subjects.find((s) => s.id === a.subject_id)?.name ?? null,
      })),
      homeroom_class_ids: [],
      homeroom_class_names: [],
    }
  }

  findAssignments(staffId: string): TeachingAssignment[] {
    return (
      this.db
        .prepare(
          `SELECT class_id, subject_id FROM staff_subjects
           WHERE staff_id = ? AND deleted_at IS NULL
             AND class_id IS NOT NULL AND class_id != ''`
        )
        .all(staffId) as TeachingAssignment[]
    )
  }

  findStaffIdForClassSubject(
    classId: string,
    subjectId: string
  ): string | null {
    const row = this.db
      .prepare(
        `SELECT staff_id FROM staff_subjects
         WHERE class_id = ? AND subject_id = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(classId, subjectId) as { staff_id: string } | undefined
    return row?.staff_id ?? null
  }

  findSubjectIds(staffId: string): string[] {
    return [
      ...new Set(
        (
          this.db
            .prepare(
              `SELECT subject_id FROM staff_subjects
               WHERE staff_id = ? AND deleted_at IS NULL`
            )
            .all(staffId) as Array<{ subject_id: string }>
        ).map((r) => r.subject_id)
      ),
    ]
  }

  findClassIds(staffId: string): string[] {
    return (
      this.db
        .prepare(
          `SELECT class_id FROM staff_classes
           WHERE staff_id = ? AND deleted_at IS NULL`
        )
        .all(staffId) as Array<{ class_id: string }>
    ).map((r) => r.class_id)
  }

  create(input: CreateInput<Staff>): Staff {
    const record: Staff = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      full_name: input.full_name.trim(),
      gender: input.gender ?? null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      staff_type: input.staff_type,
      admin_role: input.admin_role ?? null,
      department_id: input.department_id ?? null,
      status: input.status ?? 'active',
      user_id: input.user_id ?? null,
      employee_code: input.employee_code?.trim() || null,
      joining_date: input.joining_date ?? null,
      address: input.address?.trim() || null,
      job_role: input.job_role ?? null,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO staff (
             id, school_id, full_name, gender, phone, email,
             staff_type, admin_role, department_id, status, user_id,
             employee_code, joining_date, address, job_role,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @full_name, @gender, @phone, @email,
             @staff_type, @admin_role, @department_id, @status, @user_id,
             @employee_code, @joining_date, @address, @job_role,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(record)

      enqueueSync(
        this.db,
        this.tableName,
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
    })
    tx()
    return record
  }

  update(id: string, input: UpdateInput<Staff>): Staff | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    const record: Staff = {
      ...existing,
      ...input,
      full_name: input.full_name?.trim() ?? existing.full_name,
      phone:
        input.phone !== undefined
          ? input.phone?.trim() || null
          : existing.phone,
      email:
        input.email !== undefined
          ? input.email?.trim().toLowerCase() || null
          : existing.email,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE staff
           SET school_id = @school_id,
               full_name = @full_name,
               gender = @gender,
               phone = @phone,
               email = @email,
               staff_type = @staff_type,
               admin_role = @admin_role,
               department_id = @department_id,
               status = @status,
               user_id = @user_id,
               employee_code = @employee_code,
               joining_date = @joining_date,
               address = @address,
               job_role = @job_role,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(record)

      enqueueSync(
        this.db,
        this.tableName,
        record.id,
        'UPDATE',
        record as unknown as Record<string, unknown>
      )
    })
    tx()
    return record
  }

  async ensureUserAccount(
    createUser: (input: {
      school_id: string
      email: string
      password_hash: string
      role: UserRole
      staff_id?: string | null
    }) => { id: string },
    findUserByEmail: (
      email: string
    ) => { id: string; school_id: string; staff_id?: string | null } | undefined,
    setUserStaffId: (userId: string, staffId: string) => void,
    staff: Staff,
    role: UserRole,
    passwordHash: string
  ): Promise<{ userId: string | null; created: boolean }> {
    if (!staff.email) return { userId: staff.user_id, created: false }

    const existingUser = findUserByEmail(staff.email)
    if (existingUser) {
      if (existingUser.school_id !== staff.school_id) {
        throw new Error(
          `Email ${staff.email} is already used by another school account.`
        )
      }
      if (staff.user_id !== existingUser.id) {
        this.update(staff.id, { user_id: existingUser.id })
      }
      if (existingUser.staff_id !== staff.id) {
        setUserStaffId(existingUser.id, staff.id)
      }
      return { userId: existingUser.id, created: false }
    }

    const user = createUser({
      school_id: staff.school_id,
      email: staff.email,
      password_hash: passwordHash,
      role,
      staff_id: staff.id,
    })
    this.update(staff.id, { user_id: user.id })
    return { userId: user.id, created: true }
  }

  async upsertAdmin(
    schoolId: string,
    input: UpsertAdminInput,
    userHelpers: {
      createUser: (input: {
        school_id: string
        email: string
        password_hash: string
        role: UserRole
        staff_id?: string | null
      }) => { id: string }
      findUserByEmail: (
        email: string
      ) => { id: string; school_id: string; staff_id?: string | null } | undefined
      setUserStaffId: (userId: string, staffId: string) => void
      passwordHash: string
    }
  ): Promise<{ staff: Staff; userCreated: boolean }> {
    const full_name = input.full_name.trim()
    if (!full_name) throw new Error('Full name is required.')
    if (!ADMIN_ROLES.includes(input.admin_role)) {
      throw new Error('Invalid administrative role.')
    }

    const existing =
      (input.id ? this.findById(input.id) : undefined) ??
      this.findAdminByRole(schoolId, input.admin_role)

    let staff: Staff
    if (existing) {
      staff = this.update(existing.id, {
        full_name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        staff_type: 'administrative',
        admin_role: input.admin_role,
        status: 'active',
      })!
    } else {
      staff = this.create({
        school_id: schoolId,
        full_name,
        gender: null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        staff_type: 'administrative',
        admin_role: input.admin_role,
        department_id: null,
        status: 'active',
        user_id: null,
        employee_code: null,
        joining_date: null,
        address: null,
        job_role: 'admin',
      })
    }

    const account = await this.ensureUserAccount(
      userHelpers.createUser,
      userHelpers.findUserByEmail,
      userHelpers.setUserStaffId,
      staff,
      adminRoleToUserRole(input.admin_role),
      userHelpers.passwordHash
    )
    return {
      staff: this.findById(staff.id)!,
      userCreated: account.created,
    }
  }

  async clearAdminRole(
    schoolId: string,
    adminRole: StaffAdminRole
  ): Promise<void> {
    const existing = this.findAdminByRole(schoolId, adminRole)
    if (existing) this.delete(existing.id)
  }

  /**
   * Create/update teaching staff + assignments.
   * Teachers are mobile staff — no desktop `users` account is created here.
   * Cloud Auth + sync are handled by IPC (`prepareTeacherForMobile`).
   */
  async upsertTeacher(
    schoolId: string,
    input: UpsertTeacherInput,
    _userHelpers?: {
      createUser: (input: {
        school_id: string
        email: string
        password_hash: string
        role: UserRole
        staff_id?: string | null
      }) => { id: string }
      findUserByEmail: (
        email: string
      ) => { id: string; school_id: string; staff_id?: string | null } | undefined
      setUserStaffId: (userId: string, staffId: string) => void
      passwordHash: string
    }
  ): Promise<{ staff: Staff; userCreated: boolean }> {
    const full_name = input.full_name.trim()
    if (!full_name) throw new Error('Full name is required.')

    let staff: Staff
    if (input.id) {
      const updated = this.update(input.id, {
        full_name,
        gender: input.gender ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        department_id: input.department_id ?? null,
        status: input.status ?? 'active',
        staff_type: 'teaching',
        admin_role: null,
      })
      if (!updated) throw new Error('Teacher not found.')
      staff = updated
    } else {
      staff = this.create({
        school_id: schoolId,
        full_name,
        gender: input.gender ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        staff_type: 'teaching',
        admin_role: null,
        department_id: input.department_id ?? null,
        status: input.status ?? 'active',
        user_id: null,
        employee_code: null,
        joining_date: null,
        address: null,
        job_role: 'teacher',
      })
    }

    this.setTeachingAssignments(staff.id, {
      teaching_assignments: input.teaching_assignments,
      subject_ids: input.subject_ids,
      class_ids: input.class_ids,
    })

    return {
      staff: this.findById(staff.id)!,
      userCreated: false,
    }
  }

  setTeachingAssignments(
    staffId: string,
    input: {
      teaching_assignments?: TeachingAssignment[]
      subject_ids?: string[]
      class_ids?: string[]
    }
  ): void {
    const offered = this.offeredBySubject()
    const pairs =
      input.teaching_assignments !== undefined
        ? normalizeTeachingAssignments(input.teaching_assignments, offered)
        : expandLegacyTeachingAssignments(
            input.subject_ids ?? [],
            input.class_ids ?? [],
            offered
          )
    this.replaceAssignments(staffId, pairs)
  }

  setSubjects(staffId: string, subjectIds: string[]): void {
    this.setTeachingAssignments(staffId, {
      subject_ids: subjectIds,
      class_ids: this.findClassIds(staffId),
    })
  }

  setClasses(staffId: string, classIds: string[]): void {
    this.setTeachingAssignments(staffId, {
      subject_ids: this.findSubjectIds(staffId),
      class_ids: classIds,
    })
  }

  nextEmployeeCode(schoolId: string): string {
    const year = new Date().getFullYear()
    const prefix = `EMP-${year}-`
    const rows = this.db
      .prepare(
        `SELECT employee_code FROM staff
         WHERE school_id = ? AND deleted_at IS NULL
           AND employee_code LIKE ?`
      )
      .all(schoolId, `${prefix}%`) as Array<{ employee_code: string }>
    let max = 0
    for (const row of rows) {
      const n = Number(row.employee_code.slice(prefix.length))
      if (!Number.isNaN(n) && n > max) max = n
    }
    return `${prefix}${String(max + 1).padStart(3, '0')}`
  }

  findByEmployeeCode(
    schoolId: string,
    code: string,
    excludeId?: string
  ): Staff | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM staff
         WHERE school_id = ? AND employee_code = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId, code) as Staff | undefined
    if (!row) return undefined
    if (excludeId && row.id === excludeId) return undefined
    return row
  }

  /** Teaching staff with the same full name (case-insensitive). */
  findTeacherByFullName(
    schoolId: string,
    fullName: string,
    excludeId?: string
  ): Staff | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM staff
         WHERE school_id = ?
           AND staff_type = 'teaching'
           AND deleted_at IS NULL
           AND lower(trim(full_name)) = lower(trim(?))
         LIMIT 1`
      )
      .get(schoolId, fullName) as Staff | undefined
    if (!row) return undefined
    if (excludeId && row.id === excludeId) return undefined
    return row
  }

  findByEmail(
    schoolId: string,
    email: string,
    excludeId?: string
  ): Staff | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM staff
         WHERE school_id = ? AND lower(email) = lower(?) AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId, email) as Staff | undefined
    if (!row) return undefined
    if (excludeId && row.id === excludeId) return undefined
    return row
  }

  findByUserId(userId: string): Staff | undefined {
    return this.db
      .prepare(
        `SELECT * FROM staff WHERE user_id = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(userId) as Staff | undefined
  }

  findHomeroomClassIds(staffId: string): string[] {
    return (
      this.db
        .prepare(
          `SELECT id FROM classes
           WHERE class_teacher_id = ? AND deleted_at IS NULL`
        )
        .all(staffId) as Array<{ id: string }>
    ).map((r) => r.id)
  }

  private offeredBySubject(): Map<string, string[]> {
    const rows = this.db
      .prepare(
        `SELECT subject_id, class_id FROM subject_classes WHERE deleted_at IS NULL`
      )
      .all() as Array<{ subject_id: string; class_id: string }>
    const map = new Map<string, string[]>()
    for (const row of rows) {
      const list = map.get(row.subject_id) ?? []
      list.push(row.class_id)
      map.set(row.subject_id, list)
    }
    return map
  }

  private replaceAssignments(
    staffId: string,
    pairs: TeachingAssignment[]
  ): void {
    const existing = this.db
      .prepare(
        `SELECT * FROM staff_subjects
         WHERE staff_id = ? AND deleted_at IS NULL`
      )
      .all(staffId) as StaffSubject[]

    const keep = new Set(
      pairs.map((p) => `${p.class_id}::${p.subject_id}`)
    )
    for (const row of existing) {
      const key =
        row.class_id && row.class_id !== ''
          ? `${row.class_id}::${row.subject_id}`
          : ''
      if (!key || !keep.has(key)) {
        this.softDeleteJunction('staff_subjects', row)
      }
    }

    const existingKeys = new Set(
      existing
        .filter((e) => e.class_id)
        .map((e) => `${e.class_id}::${e.subject_id}`)
    )
    for (const pair of pairs) {
      const key = `${pair.class_id}::${pair.subject_id}`
      if (existingKeys.has(key)) continue
      const record: StaffSubject = {
        ...this.buildBaseFields(),
        staff_id: staffId,
        subject_id: pair.subject_id,
        class_id: pair.class_id,
      }
      this.db
        .prepare(
          `INSERT INTO staff_subjects (
             id, staff_id, subject_id, class_id,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @staff_id, @subject_id, @class_id,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(record)
      enqueueSync(
        this.db,
        'staff_subjects',
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
    }

    this.replaceClasses(
      staffId,
      [...new Set(pairs.map((p) => p.class_id))]
    )
  }

  private replaceClasses(staffId: string, classIds: string[]): void {
    const existing = this.db
      .prepare(
        `SELECT * FROM staff_classes
         WHERE staff_id = ? AND deleted_at IS NULL`
      )
      .all(staffId) as StaffClass[]

    const keep = new Set(classIds)
    for (const row of existing) {
      if (!keep.has(row.class_id)) {
        this.softDeleteJunction('staff_classes', row)
      }
    }

    const existingIds = new Set(existing.map((e) => e.class_id))
    for (const class_id of classIds) {
      if (existingIds.has(class_id)) continue
      const record: StaffClass = {
        ...this.buildBaseFields(),
        staff_id: staffId,
        class_id,
      }
      this.db
        .prepare(
          `INSERT INTO staff_classes (
             id, staff_id, class_id,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @staff_id, @class_id,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(record)
      enqueueSync(
        this.db,
        'staff_classes',
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
    }
  }

  private softDeleteJunction(
    tableName: 'staff_subjects' | 'staff_classes',
    row: StaffSubject | StaffClass
  ): void {
    const now = new Date().toISOString()
    const updated = {
      ...row,
      deleted_at: now,
      updated_at: now,
      version: row.version + 1,
      sync_status: 'pending' as const,
    }
    this.db
      .prepare(
        `UPDATE ${tableName}
         SET deleted_at = @deleted_at,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`
      )
      .run(updated)
    enqueueSync(
      this.db,
      tableName,
      row.id,
      'DELETE',
      updated as unknown as Record<string, unknown>
    )
  }
}
