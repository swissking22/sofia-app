import { ipcMain } from 'electron'
import { getSession, hashPassword } from '../auth'
import type { Repositories } from '../db/repositories'
import {
  ADMIN_ROLES,
  STAFF_TEMP_PASSWORD,
  type StaffSetupData,
  type UpsertAdminInput,
  type UpsertTeacherInput,
} from '../db/repositories/staff.repository'
import type { StaffAdminRole, StaffGender, StaffStatus } from '../db/types'
import {
  tryProvisionStaffAuth,
  type CloudAuthRole,
} from '../services/cloud-auth'
import { prepareTeacherForMobile } from '../services/prepare-teacher-mobile'
import { scheduleTeacherReadySync } from '../sync/auto-sync'

type Ok<T> = { ok: true; data: T; warning?: string }
type Err = { ok: false; error: string }
type Result<T> = Ok<T> | Err

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  return repos.schools.findLatest()?.id ?? null
}

function loadSetup(repos: Repositories, schoolId: string): StaffSetupData {
  const departments = repos.departments.ensureDefaults(schoolId).map((d) => ({
    id: d.id,
    name: d.name,
  }))
  const subjects = repos.subjects.findBySchoolWithClasses(schoolId).map((s) => ({
    id: s.id,
    name: s.name,
    class_ids: s.class_ids,
  }))
  const levels = repos.academicLevels.findBySchool(schoolId)
  const sections = repos.sections.findBySchool(schoolId)
  const levelById = new Map(levels.map((l) => [l.id, l]))
  const sectionById = new Map(sections.map((s) => [s.id, s]))
  const classes = repos.classes.findStructureClasses(schoolId).map((c) => {
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
  })
  return repos.staff.getSetupData(schoolId, { departments, subjects, classes })
}

async function userHelpers(repos: Repositories) {
  const passwordHash = await hashPassword(STAFF_TEMP_PASSWORD)
  return {
    createUser: (input: {
      school_id: string
      email: string
      password_hash: string
      role: 'admin' | 'secretary' | 'teacher'
      staff_id?: string | null
    }) =>
      repos.users.create({
        school_id: input.school_id,
        email: input.email,
        password_hash: input.password_hash,
        role: input.role,
        staff_id: input.staff_id ?? null,
      }),
    findUserByEmail: (email: string) => {
      const u = repos.users.findByEmail(email)
      return u
        ? { id: u.id, school_id: u.school_id, staff_id: u.staff_id }
        : undefined
    },
    setUserStaffId: (userId: string, staffId: string) => {
      repos.users.update(userId, { staff_id: staffId })
    },
    passwordHash,
  }
}

function schoolNameOf(repos: Repositories, schoolId: string): string | null {
  return repos.schools.findById(schoolId)?.name ?? null
}

function adminRoleToCloudRole(adminRole: StaffAdminRole): CloudAuthRole {
  if (adminRole === 'principal' || adminRole === 'vice_principal') {
    return 'admin'
  }
  return 'secretary'
}

async function provisionForStaff(
  repos: Repositories,
  schoolId: string,
  staff: {
    id: string
    email: string | null
    full_name: string
  },
  role: CloudAuthRole,
  userCreated: boolean
): Promise<string | null> {
  if (!staff.email?.trim()) return null
  if (role === 'teacher') {
    return prepareTeacherForMobile({
      repos,
      schoolId,
      staffId: staff.id,
      email: staff.email,
      displayName: staff.full_name,
      schoolName: schoolNameOf(repos, schoolId),
      resetPassword: userCreated,
    })
  }
  const warning = await tryProvisionStaffAuth({
    email: staff.email,
    password: STAFF_TEMP_PASSWORD,
    role,
    schoolId,
    staffId: staff.id,
    schoolName: schoolNameOf(repos, schoolId),
    displayName: staff.full_name,
    resetPassword: userCreated,
  })
  scheduleTeacherReadySync(schoolId)
  return warning
}

export function registerStaffIpc(repos: Repositories): void {
  ipcMain.handle('staff:get', (): Result<StaffSetupData> => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) {
      return { ok: false, error: 'No school found. Complete registration first.' }
    }
    return { ok: true, data: loadSetup(repos, schoolId) }
  })

  ipcMain.handle(
    'staff:upsert-admin',
    async (_e, input: UpsertAdminInput): Promise<Result<StaffSetupData>> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.full_name?.trim()) {
        return { ok: false, error: 'Full name is required.' }
      }
      if (!ADMIN_ROLES.includes(input.admin_role)) {
        return { ok: false, error: 'Select a valid role.' }
      }
      try {
        const { staff, userCreated } = await repos.staff.upsertAdmin(
          schoolId,
          input,
          await userHelpers(repos)
        )
        const warning = await provisionForStaff(
          repos,
          schoolId,
          staff,
          adminRoleToCloudRole(input.admin_role),
          userCreated
        )
        return {
          ok: true,
          data: loadSetup(repos, schoolId),
          ...(warning ? { warning } : {}),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not save staff.',
        }
      }
    }
  )

  ipcMain.handle(
    'staff:clear-admin',
    async (
      _e,
      input: { admin_role: StaffAdminRole }
    ): Promise<Result<StaffSetupData>> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      try {
        await repos.staff.clearAdminRole(schoolId, input.admin_role)
        return { ok: true, data: loadSetup(repos, schoolId) }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not clear role.',
        }
      }
    }
  )

  ipcMain.handle(
    'staff:upsert-teacher',
    async (_e, input: UpsertTeacherInput): Promise<Result<StaffSetupData>> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.full_name?.trim()) {
        return { ok: false, error: 'Full name is required.' }
      }
      try {
        const { staff } = await repos.staff.upsertTeacher(
          schoolId,
          {
            ...input,
            gender: (input.gender as StaffGender | null | undefined) ?? null,
            status: (input.status as StaffStatus | undefined) ?? 'active',
          }
        )
        // Teachers are mobile staff — always refresh Auth metadata + sync when email set.
        const warning = await prepareTeacherForMobile({
          repos,
          schoolId,
          staffId: staff.id,
          email: staff.email,
          displayName: staff.full_name,
          schoolName: schoolNameOf(repos, schoolId),
          resetPassword: !input.id,
        })
        return {
          ok: true,
          data: loadSetup(repos, schoolId),
          ...(warning ? { warning } : {}),
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not save teacher.',
        }
      }
    }
  )

  ipcMain.handle(
    'staff:delete-teacher',
    (_e, input: { id: string }): Result<StaffSetupData> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const row = repos.staff.findById(input.id)
      if (!row || row.staff_type !== 'teaching') {
        return { ok: false, error: 'Teacher not found.' }
      }
      repos.staff.delete(input.id)
      return { ok: true, data: loadSetup(repos, schoolId) }
    }
  )

  ipcMain.handle(
    'staff:import-teachers',
    async (
      _e,
      input: {
        teachers: Array<{
          full_name: string
          gender?: string | null
          phone?: string | null
          email?: string | null
          department_name?: string | null
        }>
      }
    ): Promise<
      Result<StaffSetupData & { imported: number; skipped: number }>
    > => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.teachers?.length) {
        return { ok: false, error: 'No teachers to import.' }
      }

      const departments = repos.departments.ensureDefaults(schoolId)
      let imported = 0
      let skipped = 0
      const helpers = await userHelpers(repos)
      const warnings: string[] = []

      try {
        for (const row of input.teachers) {
          const full_name = row.full_name?.trim()
          if (!full_name) {
            skipped += 1
            continue
          }
          const deptName = row.department_name?.trim().toLowerCase()
          const department_id = deptName
            ? departments.find((d) => d.name.toLowerCase() === deptName)?.id ??
              null
            : null
          const genderRaw = row.gender?.trim().toLowerCase()
          const gender =
            genderRaw === 'male' ||
            genderRaw === 'female' ||
            genderRaw === 'other'
              ? genderRaw
              : null

          const { staff, userCreated } = await repos.staff.upsertTeacher(
            schoolId,
            {
              full_name,
              gender,
              phone: row.phone ?? null,
              email: row.email ?? null,
              department_id,
              subject_ids: [],
              class_ids: [],
              status: 'active',
            },
            helpers
          )
          const warning = await provisionForStaff(
            repos,
            schoolId,
            staff,
            'teacher',
            userCreated
          )
          if (warning) warnings.push(warning)
          imported += 1
        }

        return {
          ok: true,
          data: { ...loadSetup(repos, schoolId), imported, skipped },
          ...(warnings.length
            ? { warning: warnings[0] }
            : {}),
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not import teachers.',
        }
      }
    }
  )
}
