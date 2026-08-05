import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type { Department } from '../db/types'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface DepartmentDto {
  id: string
  name: string
  staff_count: number
  subject_count: number
}

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  return repos.schools.findLatest()?.id ?? null
}

function toDto(repos: Repositories, row: Department): DepartmentDto {
  return {
    id: row.id,
    name: row.name,
    staff_count: repos.departments.countStaff(row.id),
    subject_count: repos.departments.countSubjects(row.id),
  }
}

function listDepartments(repos: Repositories, schoolId: string): DepartmentDto[] {
  return repos.departments.ensureDefaults(schoolId).map((d) => toDto(repos, d))
}

export function registerDepartmentsIpc(repos: Repositories): void {
  ipcMain.handle('departments:list', (): Result<DepartmentDto[]> => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) {
      return { ok: false, error: 'No school found. Complete registration first.' }
    }
    return { ok: true, data: listDepartments(repos, schoolId) }
  })

  ipcMain.handle(
    'departments:create',
    (_e, input: { name: string }): Result<DepartmentDto[]> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const name = input?.name?.trim()
      if (!name) return { ok: false, error: 'Department name is required.' }

      const dup = repos.departments
        .findBySchool(schoolId)
        .find((d) => d.name.toLowerCase() === name.toLowerCase())
      if (dup) {
        return { ok: false, error: 'A department with that name already exists.' }
      }

      try {
        repos.departments.create({ school_id: schoolId, name })
        return { ok: true, data: listDepartments(repos, schoolId) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not create department.',
        }
      }
    }
  )

  ipcMain.handle(
    'departments:update',
    (_e, input: { id: string; name: string }): Result<DepartmentDto[]> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const name = input?.name?.trim()
      if (!input?.id || !name) {
        return { ok: false, error: 'Department id and name are required.' }
      }

      const existing = repos.departments.findById(input.id)
      if (!existing || existing.school_id !== schoolId) {
        return { ok: false, error: 'Department not found.' }
      }

      const dup = repos.departments
        .findBySchool(schoolId)
        .find(
          (d) =>
            d.id !== input.id && d.name.toLowerCase() === name.toLowerCase()
        )
      if (dup) {
        return { ok: false, error: 'A department with that name already exists.' }
      }

      try {
        repos.departments.update(input.id, { name })
        return { ok: true, data: listDepartments(repos, schoolId) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not update department.',
        }
      }
    }
  )

  ipcMain.handle(
    'departments:delete',
    (_e, input: { id: string }): Result<DepartmentDto[]> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.id) return { ok: false, error: 'Department id is required.' }

      const existing = repos.departments.findById(input.id)
      if (!existing || existing.school_id !== schoolId) {
        return { ok: false, error: 'Department not found.' }
      }

      const staff = repos.departments.countStaff(input.id)
      if (staff > 0) {
        return {
          ok: false,
          error: `Cannot delete: ${staff} staff member(s) are assigned to this department.`,
        }
      }
      const subjects = repos.departments.countSubjects(input.id)
      if (subjects > 0) {
        return {
          ok: false,
          error: `Cannot delete: ${subjects} subject(s) use this department.`,
        }
      }

      try {
        repos.departments.delete(input.id)
        return { ok: true, data: listDepartments(repos, schoolId) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not delete department.',
        }
      }
    }
  )
}
