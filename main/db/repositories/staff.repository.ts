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
  homeroom_class_ids: string[]
  homeroom_class_names: string[]
}

export interface StaffSetupData {
  schoolId: string
  adminStaff: StaffDto[]
  teachers: StaffDto[]
  departments: Array<{ id: string; name: string }>
  subjects: Array<{ id: string; name: string }>
  classes: Array<{ id: string; name: string }>
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
      subjects: Array<{ id: string; name: string }>
      classes: Array<{ id: string; name: string }>
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
      subjects: lookups.subjects,
      classes: lookups.classes,
      tempPassword: STAFF_TEMP_PASSWORD,
    }
  }

  toDto(
    row: Staff,
    lookups: {
      departments: Array<{ id: string; name: string }>
      subjects: Array<{ id: string; name: string }>
      classes: Array<{ id: string; name: string }>
    }
  ): StaffDto {
    const subject_ids = this.findSubjectIds(row.id)
    const class_ids = this.findClassIds(row.id)
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
      homeroom_class_ids: [],
      homeroom_class_names: [],
    }
  }

  findSubjectIds(staffId: string): string[] {
    return (
      this.db
        .prepare(
          `SELECT subject_id FROM staff_subjects
           WHERE staff_id = ? AND deleted_at IS NULL`
        )
        .all(staffId) as Array<{ subject_id: string }>
    ).map((r) => r.subject_id)
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
    }) => { id: string },
    findUserByEmail: (email: string) => { id: string; school_id: string } | undefined,
    staff: Staff,
    role: UserRole,
    passwordHash: string
  ): Promise<string | null> {
    if (!staff.email) return staff.user_id

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
      return existingUser.id
    }

    const user = createUser({
      school_id: staff.school_id,
      email: staff.email,
      password_hash: passwordHash,
      role,
    })
    this.update(staff.id, { user_id: user.id })
    return user.id
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
      }) => { id: string }
      findUserByEmail: (
        email: string
      ) => { id: string; school_id: string } | undefined
      passwordHash: string
    }
  ): Promise<Staff> {
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

    await this.ensureUserAccount(
      userHelpers.createUser,
      userHelpers.findUserByEmail,
      staff,
      adminRoleToUserRole(input.admin_role),
      userHelpers.passwordHash
    )
    return this.findById(staff.id)!
  }

  async clearAdminRole(
    schoolId: string,
    adminRole: StaffAdminRole
  ): Promise<void> {
    const existing = this.findAdminByRole(schoolId, adminRole)
    if (existing) this.delete(existing.id)
  }

  async upsertTeacher(
    schoolId: string,
    input: UpsertTeacherInput,
    userHelpers: {
      createUser: (input: {
        school_id: string
        email: string
        password_hash: string
        role: UserRole
      }) => { id: string }
      findUserByEmail: (
        email: string
      ) => { id: string; school_id: string } | undefined
      passwordHash: string
    }
  ): Promise<Staff> {
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

    this.replaceSubjects(staff.id, input.subject_ids ?? [])
    this.replaceClasses(staff.id, input.class_ids ?? [])

    await this.ensureUserAccount(
      userHelpers.createUser,
      userHelpers.findUserByEmail,
      this.findById(staff.id)!,
      'teacher',
      userHelpers.passwordHash
    )
    return this.findById(staff.id)!
  }

  setSubjects(staffId: string, subjectIds: string[]): void {
    this.replaceSubjects(staffId, subjectIds)
  }

  setClasses(staffId: string, classIds: string[]): void {
    this.replaceClasses(staffId, classIds)
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

  private replaceSubjects(staffId: string, subjectIds: string[]): void {
    const existing = this.db
      .prepare(
        `SELECT * FROM staff_subjects
         WHERE staff_id = ? AND deleted_at IS NULL`
      )
      .all(staffId) as StaffSubject[]

    const keep = new Set(subjectIds)
    for (const row of existing) {
      if (!keep.has(row.subject_id)) {
        this.softDeleteJunction('staff_subjects', row)
      }
    }

    const existingIds = new Set(existing.map((e) => e.subject_id))
    for (const subject_id of subjectIds) {
      if (existingIds.has(subject_id)) continue
      const record: StaffSubject = {
        ...this.buildBaseFields(),
        staff_id: staffId,
        subject_id,
      }
      this.db
        .prepare(
          `INSERT INTO staff_subjects (
             id, staff_id, subject_id,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @staff_id, @subject_id,
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
