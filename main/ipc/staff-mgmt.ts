import { ipcMain } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import type { StaffDto } from '../db/repositories/staff.repository'
import { LEAVE_TYPES } from '../db/repositories/leave.repository'
import { countLeaveDays } from '../domain/staff'
import { prepareTeacherForMobile } from '../services/prepare-teacher-mobile'
import { scheduleTeacherReadySync } from '../sync/auto-sync'
import type {
  LeaveRequestStatus,
  LeaveType,
  StaffAttendanceStatus,
  StaffJobRole,
  StaffStatus,
  StaffType,
} from '../db/types'

type Result<T> = { ok: true; data: T; warning?: string } | { ok: false; error: string }

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function requireSession(): SessionData | null {
  return getSession()
}

/** School owner, principal, secretary, or anyone with staff write permissions. */
function isManager(repos: Repositories, session: SessionData): boolean {
  if (
    session.role === 'admin' ||
    session.role === 'secretary' ||
    session.role === 'principal'
  ) {
    return true
  }
  try {
    const perms = repos.roles.getPermissionNamesForUser(session.userId)
    return (
      perms.includes('staff.create') ||
      perms.includes('staff.update') ||
      perms.includes('staff.delete')
    )
  } catch {
    return false
  }
}

function resolveSchoolId(repos: Repositories, session: SessionData): string {
  return session.schoolId || repos.schools.findLatest()?.id || ''
}

function lookups(repos: Repositories, schoolId: string) {
  const levels = repos.academicLevels.findBySchool(schoolId)
  const sections = repos.sections.findBySchool(schoolId)
  const levelById = new Map(levels.map((l) => [l.id, l]))
  const sectionById = new Map(sections.map((s) => [s.id, s]))
  return {
    departments: repos.departments
      .findBySchool(schoolId)
      .map((d) => ({ id: d.id, name: d.name })),
    subjects: repos.subjects
      .findBySchoolWithClasses(schoolId)
      .map((s) => ({ id: s.id, name: s.name, class_ids: s.class_ids })),
    classes: repos.classes.findBySchool(schoolId).map((c) => {
      const level = c.academic_level_id
        ? levelById.get(c.academic_level_id)
        : undefined
      const section = c.section_id ? sectionById.get(c.section_id) : undefined
      return {
        id: c.id,
        name: c.name,
        academic_level_id: c.academic_level_id,
        academic_level_name: level?.name ?? null,
        level_sort_order: level?.sort_order ?? null,
        section_id: c.section_id,
        section_name: section?.name ?? null,
      }
    }),
  }
}

function enrichStaff(
  repos: Repositories,
  schoolId: string,
  staffId: string
): StaffDto | null {
  const row = repos.staff.findById(staffId)
  if (!row || row.school_id !== schoolId) return null
  const dto = repos.staff.toDto(row, lookups(repos, schoolId)) as StaffDto & {
    monthly_salary?: number | null
  }
  const homeroomIds = repos.staff.findHomeroomClassIds(staffId)
  const classLookup = lookups(repos, schoolId).classes
  dto.homeroom_class_ids = homeroomIds
  dto.homeroom_class_names = homeroomIds
    .map((id) => classLookup.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n))
  const salary = repos.payroll.currentSalary(schoolId, staffId)
  dto.monthly_salary = salary?.amount ?? null
  return dto
}

function maxPeriods(repos: Repositories, schoolId: string): number {
  const school = repos.schools.findById(schoolId)
  return school?.max_teacher_periods ?? 30
}

function sessionStaffId(
  repos: Repositories,
  session: SessionData
): string | null {
  return repos.staff.findByUserId(session.userId)?.id ?? null
}

function notifyAdmins(
  repos: Repositories,
  schoolId: string,
  title: string,
  body: string,
  link: string
): void {
  const admins = repos.users
    .findAll()
    .filter(
      (u) =>
        u.school_id === schoolId &&
        !u.deleted_at &&
        (u.role === 'admin' || u.role === 'secretary')
    )
  for (const u of admins) {
    repos.staffNotifications.create({
      school_id: schoolId,
      user_id: u.id,
      title,
      body,
      link,
    })
  }
}

export function registerStaffMgmtIpc(repos: Repositories): void {
  ipcMain.handle('staff-mgmt:meta', (): Result<{
    departments: Array<{ id: string; name: string }>
    subjects: Array<{ id: string; name: string; class_ids: string[] }>
    classes: Array<{
      id: string
      name: string
      class_teacher_id: string | null
      academic_level_id: string | null
      academic_level_name: string | null
      level_sort_order: number | null
      section_id: string | null
      section_name: string | null
    }>
    max_teacher_periods: number
    leave_types: LeaveType[]
    job_roles: StaffJobRole[]
    can_manage: boolean
    self_staff_id: string | null
  }> => {
    const session = requireSession()
    if (!session) return { ok: false, error: 'Not signed in.' }
    const schoolId = resolveSchoolId(repos, session)
    if (!schoolId) return { ok: false, error: 'No school found.' }
    const lu = lookups(repos, schoolId)
    const classTeacherById = new Map(
      repos.classes.findBySchool(schoolId).map((c) => [
        c.id,
        c.class_teacher_id ?? null,
      ])
    )
    return {
      ok: true,
      data: {
        departments: lu.departments,
        subjects: lu.subjects,
        classes: lu.classes.map((c) => ({
          ...c,
          class_teacher_id: classTeacherById.get(c.id) ?? null,
        })),
        max_teacher_periods: maxPeriods(repos, schoolId),
        leave_types: LEAVE_TYPES,
        job_roles: ['teacher', 'head_of_department', 'admin', 'support'],
        can_manage: isManager(repos, session),
        self_staff_id: sessionStaffId(repos, session),
      },
    }
  })

  ipcMain.handle(
    'staff-mgmt:teachers-list',
    (
      _e,
      input?: {
        status?: StaffStatus | 'all'
        search?: string | null
        departmentId?: string | null
        jobRole?: StaffJobRole | 'all'
      }
    ): Result<{ teachers: StaffDto[] }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      const schoolId = resolveSchoolId(repos, session)
      if (!schoolId) return { ok: false, error: 'No school found.' }

      let rows = repos.staff
        .findBySchool(schoolId)
        .filter((s) => s.staff_type === 'teaching')

      if (!isManager(repos, session)) {
        const selfId = sessionStaffId(repos, session)
        rows = selfId ? rows.filter((s) => s.id === selfId) : []
      }

      if (input?.status && input.status !== 'all') {
        rows = rows.filter((s) => s.status === input.status)
      }
      if (input?.departmentId) {
        rows = rows.filter((s) => s.department_id === input.departmentId)
      }
      if (input?.jobRole && input.jobRole !== 'all') {
        rows = rows.filter((s) => s.job_role === input.jobRole)
      }
      const q = input?.search?.trim().toLowerCase()
      if (q) {
        rows = rows.filter(
          (s) =>
            s.full_name.toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q) ||
            (s.phone || '').toLowerCase().includes(q) ||
            (s.employee_code || '').toLowerCase().includes(q)
        )
      }

      return {
        ok: true,
        data: {
          teachers: rows
            .map((r) => enrichStaff(repos, schoolId, r.id))
            .filter((d): d is StaffDto => Boolean(d)),
        },
      }
    }
  )

  ipcMain.handle(
    'staff-mgmt:directory-list',
    (
      _e,
      input?: {
        status?: StaffStatus | 'all'
        search?: string | null
        staffType?: StaffType | 'all'
        jobRole?: StaffJobRole | 'all'
      }
    ): Result<{ staff: StaffDto[] }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      const schoolId = resolveSchoolId(repos, session)
      if (!schoolId) return { ok: false, error: 'No school found.' }

      let rows = repos.staff.findBySchool(schoolId)
      if (!isManager(repos, session)) {
        const selfId = sessionStaffId(repos, session)
        rows = selfId ? rows.filter((s) => s.id === selfId) : []
      }
      if (input?.status && input.status !== 'all') {
        rows = rows.filter((s) => s.status === input.status)
      }
      if (input?.staffType && input.staffType !== 'all') {
        rows = rows.filter((s) => s.staff_type === input.staffType)
      }
      if (input?.jobRole && input.jobRole !== 'all') {
        rows = rows.filter((s) => s.job_role === input.jobRole)
      }
      const q = input?.search?.trim().toLowerCase()
      if (q) {
        rows = rows.filter(
          (s) =>
            s.full_name.toLowerCase().includes(q) ||
            (s.job_role || '').toLowerCase().includes(q) ||
            (s.admin_role || '').toLowerCase().includes(q) ||
            (s.employee_code || '').toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q) ||
            (s.phone || '').toLowerCase().includes(q)
        )
      }

      return {
        ok: true,
        data: {
          staff: rows
            .map((r) => enrichStaff(repos, schoolId, r.id))
            .filter((d): d is StaffDto => Boolean(d)),
        },
      }
    }
  )

  ipcMain.handle(
    'staff-mgmt:get',
    (_e, input: { id: string }): Result<StaffDto> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      const schoolId = resolveSchoolId(repos, session)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.id) return { ok: false, error: 'Staff id is required.' }

      if (!isManager(repos, session)) {
        const selfId = sessionStaffId(repos, session)
        if (selfId !== input.id) {
          return { ok: false, error: 'You can only view your own profile.' }
        }
      }

      const dto = enrichStaff(repos, schoolId, input.id)
      if (!dto) return { ok: false, error: 'Staff not found.' }
      return { ok: true, data: dto }
    }
  )

  ipcMain.handle(
    'staff-mgmt:create',
    async (
      _e,
      input: {
        full_name: string
        employee_code?: string | null
        email?: string | null
        phone?: string | null
        department_id?: string | null
        job_role?: StaffJobRole | null
        joining_date?: string | null
        status?: StaffStatus
        address?: string | null
        gender?: 'male' | 'female' | 'other' | null
        subject_ids?: string[]
        class_ids?: string[]
        homeroom_class_ids?: string[]
        teaching_assignments?: Array<{ class_id: string; subject_id: string }>
        staff_type?: StaffType
        monthly_salary?: number | null
      }
    ): Promise<Result<StaffDto>> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      if (!isManager(repos, session)) {
        return { ok: false, error: 'Only admins can create staff.' }
      }
      const schoolId = resolveSchoolId(repos, session)
      if (!schoolId) return { ok: false, error: 'No school found.' }

      const full_name = input?.full_name?.trim()
      if (!full_name) return { ok: false, error: 'Full name is required.' }

      const staff_type: StaffType = input.staff_type ?? 'teaching'
      let employee_code = input.employee_code?.trim() || null
      if (!employee_code) employee_code = repos.staff.nextEmployeeCode(schoolId)
      if (repos.staff.findByEmployeeCode(schoolId, employee_code)) {
        return { ok: false, error: 'Employee ID already exists.' }
      }
      if (input.email?.trim()) {
        if (repos.staff.findByEmail(schoolId, input.email.trim())) {
          return { ok: false, error: 'Email already used by another staff member.' }
        }
      }
      if (
        staff_type === 'teaching' &&
        repos.staff.findTeacherByFullName(schoolId, full_name)
      ) {
        return {
          ok: false,
          error: `A teacher named "${full_name}" already exists. Use a distinguishing name or edit the existing record.`,
        }
      }

      const job_role: StaffJobRole =
        input.job_role ??
        (staff_type === 'teaching' ? 'teacher' : 'support')

      try {
        const staff = repos.staff.create({
          school_id: schoolId,
          full_name,
          gender: input.gender ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          staff_type,
          admin_role: null,
          department_id: input.department_id ?? null,
          status: input.status ?? 'active',
          user_id: null,
          employee_code,
          joining_date: input.joining_date || null,
          address: input.address ?? null,
          job_role,
        })

        if (staff_type === 'teaching') {
          repos.staff.setTeachingAssignments(staff.id, {
            teaching_assignments: input.teaching_assignments,
            subject_ids: input.subject_ids,
            class_ids: input.class_ids,
          })
          for (const classId of input.homeroom_class_ids ?? []) {
            const cls = repos.classes.findById(classId)
            if (cls && (cls.school_id === schoolId || !cls.school_id)) {
              repos.classes.update(classId, { class_teacher_id: staff.id })
            }
          }
        }

        if (
          input.monthly_salary != null &&
          Number(input.monthly_salary) > 0
        ) {
          repos.payroll.setMonthlySalary({
            school_id: schoolId,
            staff_id: staff.id,
            amount: Number(input.monthly_salary),
            effective_from: input.joining_date || undefined,
          })
        }

        let warning: string | null = null
        const email = input.email?.trim()
        if (staff_type === 'teaching') {
          // Teachers are Sofia Teacher (mobile) staff — not Administration desktop users.
          warning = await prepareTeacherForMobile({
            schoolId,
            staffId: staff.id,
            email,
            displayName: full_name,
            schoolName: repos.schools.findById(schoolId)?.name ?? null,
            resetPassword: true,
          })
        } else {
          scheduleTeacherReadySync(schoolId)
        }

        const dto = enrichStaff(repos, schoolId, staff.id)
        if (!dto) return { ok: false, error: 'Could not load created staff.' }
        return {
          ok: true,
          data: dto,
          ...(warning ? { warning } : {}),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not create staff.',
        }
      }
    }
  )

  ipcMain.handle(
    'staff-mgmt:update',
    async (
      _e,
      input: {
        id: string
        full_name?: string
        employee_code?: string | null
        email?: string | null
        phone?: string | null
        department_id?: string | null
        job_role?: StaffJobRole | null
        joining_date?: string | null
        status?: StaffStatus
        address?: string | null
        gender?: 'male' | 'female' | 'other' | null
        subject_ids?: string[]
        class_ids?: string[]
        homeroom_class_ids?: string[]
        teaching_assignments?: Array<{ class_id: string; subject_id: string }>
        monthly_salary?: number | null
      }
    ): Promise<Result<StaffDto>> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      if (!isManager(repos, session)) {
        return { ok: false, error: 'Only admins can update staff.' }
      }
      const schoolId = resolveSchoolId(repos, session)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const existing = repos.staff.findById(input.id)
      if (!existing || existing.school_id !== schoolId) {
        return { ok: false, error: 'Staff not found.' }
      }

      if (input.employee_code?.trim()) {
        const clash = repos.staff.findByEmployeeCode(
          schoolId,
          input.employee_code.trim(),
          input.id
        )
        if (clash) return { ok: false, error: 'Employee ID already exists.' }
      }
      if (input.email?.trim()) {
        const clash = repos.staff.findByEmail(
          schoolId,
          input.email.trim(),
          input.id
        )
        if (clash) {
          return { ok: false, error: 'Email already used by another staff member.' }
        }
      }
      const nextName = input.full_name?.trim()
      if (
        nextName &&
        existing.staff_type === 'teaching' &&
        repos.staff.findTeacherByFullName(schoolId, nextName, input.id)
      ) {
        return {
          ok: false,
          error: `A teacher named "${nextName}" already exists. Use a distinguishing name or edit the existing record.`,
        }
      }

      try {
        repos.staff.update(input.id, {
          full_name: input.full_name,
          employee_code:
            input.employee_code !== undefined
              ? input.employee_code?.trim() || null
              : undefined,
          email: input.email,
          phone: input.phone,
          department_id: input.department_id,
          job_role: input.job_role,
          joining_date: input.joining_date,
          status: input.status,
          address: input.address,
          gender: input.gender,
        })

        if (
          input.monthly_salary != null &&
          Number(input.monthly_salary) > 0
        ) {
          repos.payroll.setMonthlySalary({
            school_id: schoolId,
            staff_id: input.id,
            amount: Number(input.monthly_salary),
          })
        }

        if (existing.staff_type === 'teaching') {
          if (
            input.teaching_assignments !== undefined ||
            input.subject_ids !== undefined ||
            input.class_ids !== undefined
          ) {
            repos.staff.setTeachingAssignments(input.id, {
              teaching_assignments: input.teaching_assignments,
              subject_ids: input.subject_ids,
              class_ids: input.class_ids,
            })
          }
          if (input.homeroom_class_ids) {
            const all = repos.classes.findBySchool(schoolId)
            for (const cls of all) {
              if (cls.class_teacher_id === input.id) {
                repos.classes.update(cls.id, { class_teacher_id: null })
              }
            }
            for (const classId of input.homeroom_class_ids) {
              const cls = repos.classes.findById(classId)
              if (cls) {
                repos.classes.update(classId, { class_teacher_id: input.id })
              }
            }
          }
        }

        const updated = repos.staff.findById(input.id)!
        let warning: string | null = null
        if (updated.staff_type === 'teaching') {
          // Refresh Auth staff_id metadata; keep existing Auth password.
          warning = await prepareTeacherForMobile({
            schoolId,
            staffId: updated.id,
            email: updated.email,
            displayName: updated.full_name,
            schoolName: repos.schools.findById(schoolId)?.name ?? null,
            resetPassword: false,
          })
        } else {
          scheduleTeacherReadySync(schoolId)
        }

        const dto = enrichStaff(repos, schoolId, input.id)
        if (!dto) return { ok: false, error: 'Could not load staff.' }
        return {
          ok: true,
          data: dto,
          ...(warning ? { warning } : {}),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not update staff.',
        }
      }
    }
  )

  ipcMain.handle(
    'staff-mgmt:delete',
    (_e, input: { id: string }): Result<{ id: string }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      if (!isManager(repos, session)) {
        return { ok: false, error: 'Only admins can delete staff.' }
      }
      const schoolId = resolveSchoolId(repos, session)
      const existing = repos.staff.findById(input.id)
      if (!existing || existing.school_id !== schoolId) {
        return { ok: false, error: 'Staff not found.' }
      }
      for (const cls of repos.classes.findBySchool(schoolId)) {
        if (cls.class_teacher_id === input.id) {
          repos.classes.update(cls.id, { class_teacher_id: null })
        }
      }
      repos.staff.delete(input.id)
      return { ok: true, data: { id: input.id } }
    }
  )

  ipcMain.handle(
    'staff-mgmt:set-class-teacher',
    (
      _e,
      input: { class_id: string; staff_id: string | null }
    ): Result<{ class_id: string; staff_id: string | null }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      if (!isManager(repos, session)) {
        return { ok: false, error: 'Only admins can assign class teachers.' }
      }
      const schoolId = resolveSchoolId(repos, session)
      const cls = repos.classes.findById(input.class_id)
      if (!cls || (cls.school_id && cls.school_id !== schoolId)) {
        return { ok: false, error: 'Class not found.' }
      }
      if (input.staff_id) {
        const staff = repos.staff.findById(input.staff_id)
        if (
          !staff ||
          staff.school_id !== schoolId ||
          staff.staff_type !== 'teaching' ||
          staff.status !== 'active'
        ) {
          return {
            ok: false,
            error: 'Class teacher must be an active teaching staff member.',
          }
        }
      }
      repos.classes.update(input.class_id, {
        class_teacher_id: input.staff_id,
      })
      return {
        ok: true,
        data: { class_id: input.class_id, staff_id: input.staff_id },
      }
    }
  )

  ipcMain.handle(
    'staff-mgmt:workload-summary',
    (): Result<{
      max_periods: number
      rows: Array<{
        staff_id: string
        full_name: string
        employee_code: string | null
        period_count: number
        subject_count: number
        class_count: number
        over_max: boolean
        has_conflict: boolean
      }>
    }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      const schoolId = resolveSchoolId(repos, session)
      const max = maxPeriods(repos, schoolId)
      let teachers = repos.staff
        .findBySchool(schoolId)
        .filter((s) => s.staff_type === 'teaching' && s.status === 'active')

      if (!isManager(repos, session)) {
        const selfId = sessionStaffId(repos, session)
        teachers = selfId ? teachers.filter((t) => t.id === selfId) : []
      }

      const rows = teachers.map((t) => {
        const slots = repos.timetable.findByStaff(t.id)
        const seen = new Set<string>()
        let has_conflict = false
        for (const s of slots) {
          const key = `${s.day_of_week}-${s.period_number}`
          if (seen.has(key)) has_conflict = true
          seen.add(key)
        }
        const period_count = slots.length
        return {
          staff_id: t.id,
          full_name: t.full_name,
          employee_code: t.employee_code,
          period_count,
          subject_count: repos.staff.findSubjectIds(t.id).length,
          class_count: repos.staff.findClassIds(t.id).length,
          over_max: period_count > max,
          has_conflict,
        }
      })

      return { ok: true, data: { max_periods: max, rows } }
    }
  )

  ipcMain.handle(
    'staff-mgmt:workload-detail',
    (_e, input: { staff_id: string }): Result<{
      staff: StaffDto
      max_periods: number
      period_count: number
      over_max: boolean
      conflicts: Array<{ day_of_week: number; period_number: number }>
      slots: Array<{
        id: string
        day_of_week: number
        day_name: string
        period_number: number
        class_id: string
        class_name: string | null
        subject_id: string | null
        subject_name: string | null
        room: string | null
      }>
    }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      const schoolId = resolveSchoolId(repos, session)
      if (!isManager(repos, session)) {
        const selfId = sessionStaffId(repos, session)
        if (selfId !== input.staff_id) {
          return { ok: false, error: 'You can only view your own workload.' }
        }
      }
      const dto = enrichStaff(repos, schoolId, input.staff_id)
      if (!dto) return { ok: false, error: 'Teacher not found.' }

      const slots = repos.timetable.findByStaff(input.staff_id)
      const lu = lookups(repos, schoolId)
      const keyCount = new Map<string, number>()
      for (const s of slots) {
        const key = `${s.day_of_week}-${s.period_number}`
        keyCount.set(key, (keyCount.get(key) || 0) + 1)
      }
      const conflicts = Array.from(keyCount.entries())
        .filter(([, n]) => n > 1)
        .map(([key]) => {
          const [d, p] = key.split('-').map(Number)
          return { day_of_week: d, period_number: p }
        })

      const max = maxPeriods(repos, schoolId)
      return {
        ok: true,
        data: {
          staff: dto,
          max_periods: max,
          period_count: slots.length,
          over_max: slots.length > max,
          conflicts,
          slots: slots.map((s) => ({
            id: s.id,
            day_of_week: s.day_of_week,
            day_name: DAY_NAMES[s.day_of_week - 1] ?? String(s.day_of_week),
            period_number: s.period_number,
            class_id: s.class_id,
            class_name:
              lu.classes.find((c) => c.id === s.class_id)?.name ?? null,
            subject_id: s.subject_id,
            subject_name: s.subject_id
              ? lu.subjects.find((x) => x.id === s.subject_id)?.name ?? null
              : null,
            room: s.room,
          })),
        },
      }
    }
  )

  ipcMain.handle(
    'staff-mgmt:attendance-day-get',
    (
      _e,
      input: { date: string }
    ): Result<{
      date: string
      rows: Array<{
        staff_id: string
        full_name: string
        employee_code: string | null
        status: StaffAttendanceStatus | null
        notes: string | null
      }>
    }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      if (!isManager(repos, session)) {
        return { ok: false, error: 'Only admins can mark attendance.' }
      }
      const schoolId = resolveSchoolId(repos, session)
      const date = input?.date
      if (!date) return { ok: false, error: 'Date is required.' }

      const teachers = repos.staff
        .findBySchool(schoolId)
        .filter((s) => s.staff_type === 'teaching' && s.status === 'active')
      const existing = repos.staffAttendance.findBySchoolDate(schoolId, date)
      const byStaff = new Map(existing.map((e) => [e.staff_id, e]))

      return {
        ok: true,
        data: {
          date,
          rows: teachers.map((t) => {
            const row = byStaff.get(t.id)
            return {
              staff_id: t.id,
              full_name: t.full_name,
              employee_code: t.employee_code,
              status: row?.status ?? null,
              notes: row?.notes ?? null,
            }
          }),
        },
      }
    }
  )

  ipcMain.handle(
    'staff-mgmt:attendance-day-save',
    (
      _e,
      input: {
        date: string
        marks: Array<{
          staff_id: string
          status: StaffAttendanceStatus
          notes?: string | null
        }>
      }
    ): Result<{ saved: number }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      if (!isManager(repos, session)) {
        return { ok: false, error: 'Only admins can mark attendance.' }
      }
      const schoolId = resolveSchoolId(repos, session)
      if (!input?.date) return { ok: false, error: 'Date is required.' }
      const valid: StaffAttendanceStatus[] = [
        'present',
        'absent',
        'late',
        'half_day',
      ]
      let saved = 0
      for (const mark of input.marks ?? []) {
        if (!valid.includes(mark.status)) continue
        const staff = repos.staff.findById(mark.staff_id)
        if (!staff || staff.school_id !== schoolId) continue
        repos.staffAttendance.upsertDay({
          school_id: schoolId,
          staff_id: mark.staff_id,
          date: input.date,
          status: mark.status,
          notes: mark.notes,
          marked_by: session.userId,
        })
        saved += 1
      }
      return { ok: true, data: { saved } }
    }
  )

  ipcMain.handle(
    'staff-mgmt:attendance-month',
    (
      _e,
      input: { year: number; month: number }
    ): Result<{
      year: number
      month: number
      rows: Array<{
        staff_id: string
        full_name: string
        present: number
        absent: number
        late: number
        half_day: number
      }>
    }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      const schoolId = resolveSchoolId(repos, session)
      const year = input?.year
      const month = input?.month
      if (!year || !month) return { ok: false, error: 'Year and month required.' }

      let teachers = repos.staff
        .findBySchool(schoolId)
        .filter((s) => s.staff_type === 'teaching')
      if (!isManager(repos, session)) {
        const selfId = sessionStaffId(repos, session)
        teachers = selfId ? teachers.filter((t) => t.id === selfId) : []
      }

      const records = repos.staffAttendance.findBySchoolMonth(
        schoolId,
        year,
        month
      )
      const rows = teachers.map((t) => {
        const mine = records.filter((r) => r.staff_id === t.id)
        return {
          staff_id: t.id,
          full_name: t.full_name,
          present: mine.filter((r) => r.status === 'present').length,
          absent: mine.filter((r) => r.status === 'absent').length,
          late: mine.filter((r) => r.status === 'late').length,
          half_day: mine.filter((r) => r.status === 'half_day').length,
        }
      })
      return { ok: true, data: { year, month, rows } }
    }
  )

  ipcMain.handle(
    'staff-mgmt:attendance-history',
    (
      _e,
      input: { staff_id: string; from?: string | null; to?: string | null }
    ): Result<{
      records: Array<{
        id: string
        date: string
        status: StaffAttendanceStatus
        notes: string | null
      }>
    }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      if (!isManager(repos, session)) {
        const selfId = sessionStaffId(repos, session)
        if (selfId !== input.staff_id) {
          return { ok: false, error: 'You can only view your own attendance.' }
        }
      }
      const records = repos.staffAttendance.findByStaff(
        input.staff_id,
        input.from,
        input.to
      )
      return {
        ok: true,
        data: {
          records: records.map((r) => ({
            id: r.id,
            date: r.date,
            status: r.status,
            notes: r.notes,
          })),
        },
      }
    }
  )

  ipcMain.handle(
    'staff-mgmt:attendance-export-csv',
    (
      _e,
      input: { year: number; month: number }
    ): Result<{ filename: string; csv: string }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      if (!isManager(repos, session)) {
        return { ok: false, error: 'Only admins can export attendance.' }
      }
      const schoolId = resolveSchoolId(repos, session)
      const records = repos.staffAttendance.findBySchoolMonth(
        schoolId,
        input.year,
        input.month
      )
      const nameById = new Map(
        repos.staff.findBySchool(schoolId).map((s) => [s.id, s.full_name])
      )
      const lines = ['Date,Teacher,Employee Code,Status,Notes']
      for (const r of records) {
        const staff = repos.staff.findById(r.staff_id)
        lines.push(
          [
            r.date,
            `"${(nameById.get(r.staff_id) || '').replace(/"/g, '""')}"`,
            staff?.employee_code || '',
            r.status,
            `"${(r.notes || '').replace(/"/g, '""')}"`,
          ].join(',')
        )
      }
      const filename = `teacher-attendance-${input.year}-${String(input.month).padStart(2, '0')}.csv`
      return { ok: true, data: { filename, csv: lines.join('\n') } }
    }
  )

  ipcMain.handle(
    'staff-mgmt:leave-balances',
    (
      _e,
      input?: { staff_id?: string | null; year?: number | null }
    ): Result<{
      year: number
      balances: Array<{
        staff_id: string
        full_name: string
        leave_type: LeaveType
        entitled: number | null
        used: number
        remaining: number | null
      }>
    }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      const schoolId = resolveSchoolId(repos, session)
      const year = input?.year ?? new Date().getFullYear()
      let staffIds: string[]
      if (!isManager(repos, session)) {
        const selfId = sessionStaffId(repos, session)
        if (!selfId) return { ok: false, error: 'No staff profile linked.' }
        staffIds = [selfId]
      } else if (input?.staff_id) {
        staffIds = [input.staff_id]
      } else {
        staffIds = repos.staff
          .findBySchool(schoolId)
          .filter((s) => s.status === 'active')
          .map((s) => s.id)
      }

      const balances: Array<{
        staff_id: string
        full_name: string
        leave_type: LeaveType
        entitled: number | null
        used: number
        remaining: number | null
      }> = []

      for (const staffId of staffIds) {
        const staff = repos.staff.findById(staffId)
        if (!staff) continue
        for (const bal of repos.leave.getBalances(schoolId, staffId, year)) {
          balances.push({
            staff_id: staffId,
            full_name: staff.full_name,
            leave_type: bal.leave_type,
            entitled: bal.entitled,
            used: bal.used,
            remaining:
              bal.entitled == null ? null : Math.max(0, bal.entitled - bal.used),
          })
        }
      }
      return { ok: true, data: { year, balances } }
    }
  )

  ipcMain.handle(
    'staff-mgmt:leave-list',
    (
      _e,
      input?: {
        status?: LeaveRequestStatus | 'all'
        staff_id?: string | null
        year?: number | null
      }
    ): Result<{
      requests: Array<{
        id: string
        staff_id: string
        staff_name: string
        leave_type: LeaveType
        start_date: string
        end_date: string
        days: number
        reason: string | null
        status: LeaveRequestStatus
        review_notes: string | null
        created_at: string
      }>
    }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      const schoolId = resolveSchoolId(repos, session)
      let staffFilter = input?.staff_id ?? null
      if (!isManager(repos, session)) {
        staffFilter = sessionStaffId(repos, session)
        if (!staffFilter) {
          return { ok: false, error: 'No staff profile linked.' }
        }
      }
      const rows = repos.leave.findBySchool(schoolId, {
        status: input?.status ?? 'all',
        staffId: staffFilter,
        year: input?.year,
      })
      return {
        ok: true,
        data: {
          requests: rows.map((r) => ({
            id: r.id,
            staff_id: r.staff_id,
            staff_name: repos.staff.findById(r.staff_id)?.full_name ?? '—',
            leave_type: r.leave_type,
            start_date: r.start_date,
            end_date: r.end_date,
            days: r.days,
            reason: r.reason,
            status: r.status,
            review_notes: r.review_notes,
            created_at: r.created_at,
          })),
        },
      }
    }
  )

  ipcMain.handle(
    'staff-mgmt:leave-apply',
    (
      _e,
      input: {
        staff_id?: string | null
        leave_type: LeaveType
        start_date: string
        end_date: string
        reason?: string | null
      }
    ): Result<{ id: string }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      const schoolId = resolveSchoolId(repos, session)

      let staffId = input.staff_id ?? null
      if (!isManager(repos, session)) {
        staffId = sessionStaffId(repos, session)
      }
      if (!staffId) return { ok: false, error: 'Staff is required.' }
      const staff = repos.staff.findById(staffId)
      if (!staff || staff.school_id !== schoolId) {
        return { ok: false, error: 'Staff not found.' }
      }
      if (!LEAVE_TYPES.includes(input.leave_type)) {
        return { ok: false, error: 'Invalid leave type.' }
      }
      const days = countLeaveDays(input.start_date, input.end_date)
      if (days <= 0) {
        return { ok: false, error: 'End date must be on or after start date.' }
      }

      const year = Number(input.start_date.slice(0, 4))
      const bal = repos.leave.getBalanceRow(
        schoolId,
        staffId,
        input.leave_type,
        year
      )
      if (bal && bal.entitled != null && bal.used + days > bal.entitled) {
        return {
          ok: false,
          error: `Insufficient ${input.leave_type} leave balance.`,
        }
      }

      const req = repos.leave.createRequest({
        school_id: schoolId,
        staff_id: staffId,
        leave_type: input.leave_type,
        start_date: input.start_date,
        end_date: input.end_date,
        days,
        reason: input.reason,
      })

      notifyAdmins(
        repos,
        schoolId,
        'Leave application',
        `${staff.full_name} applied for ${days} day(s) of ${input.leave_type} leave.`,
        '/staff/leave'
      )

      return { ok: true, data: { id: req.id } }
    }
  )

  ipcMain.handle(
    'staff-mgmt:leave-decide',
    (
      _e,
      input: {
        id: string
        decision: 'approved' | 'rejected' | 'cancelled'
        review_notes?: string | null
      }
    ): Result<{ id: string; status: string }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      const schoolId = resolveSchoolId(repos, session)
      const existing = repos.leave.findById(input.id)
      if (!existing || existing.school_id !== schoolId) {
        return { ok: false, error: 'Leave request not found.' }
      }

      if (input.decision === 'cancelled') {
        const selfId = sessionStaffId(repos, session)
        if (
          !isManager(repos, session) &&
          selfId !== existing.staff_id
        ) {
          return { ok: false, error: 'You can only cancel your own leave.' }
        }
        if (existing.status !== 'pending') {
          return { ok: false, error: 'Only pending requests can be cancelled.' }
        }
      } else if (!isManager(repos, session)) {
        return { ok: false, error: 'Only admins can approve or reject leave.' }
      } else if (existing.status !== 'pending') {
        return { ok: false, error: 'Only pending requests can be decided.' }
      }

      const updated = repos.leave.decide(input.id, {
        status: input.decision,
        reviewed_by: session.userId,
        review_notes: input.review_notes,
      })
      if (!updated) return { ok: false, error: 'Could not update leave.' }

      if (input.decision === 'approved') {
        const year = Number(existing.start_date.slice(0, 4))
        const bal = repos.leave.getBalanceRow(
          schoolId,
          existing.staff_id,
          existing.leave_type,
          year
        )
        if (bal) repos.leave.addUsed(bal.id, existing.days)
      }

      const staff = repos.staff.findById(existing.staff_id)
      if (staff?.user_id) {
        repos.staffNotifications.create({
          school_id: schoolId,
          user_id: staff.user_id,
          title: `Leave ${input.decision}`,
          body: `Your ${existing.leave_type} leave request was ${input.decision}.`,
          link: '/staff/leave',
        })
      }

      return { ok: true, data: { id: updated.id, status: updated.status } }
    }
  )

  ipcMain.handle(
    'staff-mgmt:leave-calendar',
    (
      _e,
      input: { from: string; to: string }
    ): Result<{
      events: Array<{
        id: string
        staff_id: string
        staff_name: string
        leave_type: LeaveType
        start_date: string
        end_date: string
        days: number
      }>
    }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      const schoolId = resolveSchoolId(repos, session)
      if (!input?.from || !input?.to) {
        return { ok: false, error: 'Date range is required.' }
      }
      let events = repos.leave.findCalendar(schoolId, input.from, input.to)
      if (!isManager(repos, session)) {
        const selfId = sessionStaffId(repos, session)
        events = selfId ? events.filter((e) => e.staff_id === selfId) : []
      }
      return {
        ok: true,
        data: {
          events: events.map((e) => ({
            id: e.id,
            staff_id: e.staff_id,
            staff_name: repos.staff.findById(e.staff_id)?.full_name ?? '—',
            leave_type: e.leave_type,
            start_date: e.start_date,
            end_date: e.end_date,
            days: e.days,
          })),
        },
      }
    }
  )

  ipcMain.handle(
    'staff-mgmt:notifications-list',
    (): Result<{
      notifications: Array<{
        id: string
        title: string
        body: string | null
        link: string | null
        read_at: string | null
        created_at: string
      }>
    }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      const rows = repos.staffNotifications.findByUser(session.userId)
      return {
        ok: true,
        data: {
          notifications: rows.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            link: n.link,
            read_at: n.read_at,
            created_at: n.created_at,
          })),
        },
      }
    }
  )

  ipcMain.handle(
    'staff-mgmt:notifications-mark-read',
    (
      _e,
      input?: { id?: string | null; all?: boolean }
    ): Result<{ updated: number }> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      if (input?.all) {
        return {
          ok: true,
          data: { updated: repos.staffNotifications.markAllRead(session.userId) },
        }
      }
      if (!input?.id) return { ok: false, error: 'Notification id required.' }
      const updated = repos.staffNotifications.markRead(input.id, session.userId)
      return { ok: true, data: { updated: updated ? 1 : 0 } }
    }
  )
}
