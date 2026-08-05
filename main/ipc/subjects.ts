import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type { SubjectWithClasses } from '../db/repositories/subject.repository'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface SubjectDto {
  id: string
  name: string
  department_id: string | null
  department_name: string | null
  coefficient: number
  academic_level_id: string | null
  academic_level_name: string | null
  class_ids: string[]
  class_names: string[]
}

export interface SubjectsSetupDto {
  subjects: SubjectDto[]
  departments: Array<{ id: string; name: string }>
  levels: Array<{ id: string; name: string; sort_order: number }>
  classes: Array<{
    id: string
    name: string
    academic_level_id: string | null
  }>
}

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  return repos.schools.findLatest()?.id ?? null
}

function resolveLevelId(
  classIds: string[],
  classes: Array<{ id: string; academic_level_id: string | null }>
): string | null {
  const counts = new Map<string, number>()
  for (const id of classIds) {
    const levelId = classes.find((c) => c.id === id)?.academic_level_id
    if (!levelId) continue
    counts.set(levelId, (counts.get(levelId) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [levelId, count] of counts) {
    if (count > bestCount) {
      best = levelId
      bestCount = count
    }
  }
  return best
}

function toSubjectDto(
  row: SubjectWithClasses,
  departments: Array<{ id: string; name: string }>,
  levels: Array<{ id: string; name: string }>,
  classes: Array<{
    id: string
    name: string
    academic_level_id: string | null
  }>
): SubjectDto {
  const classMap = new Map(classes.map((c) => [c.id, c.name]))
  const academic_level_id = resolveLevelId(row.class_ids, classes)
  return {
    id: row.id,
    name: row.name,
    department_id: row.department_id,
    department_name:
      departments.find((d) => d.id === row.department_id)?.name ?? null,
    coefficient: row.coefficient,
    academic_level_id,
    academic_level_name:
      levels.find((l) => l.id === academic_level_id)?.name ?? null,
    class_ids: row.class_ids,
    class_names: row.class_ids
      .map((id) => classMap.get(id))
      .filter((n): n is string => Boolean(n)),
  }
}

function loadSetup(repos: Repositories, schoolId: string): SubjectsSetupDto {
  const departments = repos.departments.ensureDefaults(schoolId).map((d) => ({
    id: d.id,
    name: d.name,
  }))
  const levels = repos.academicLevels.findBySchool(schoolId).map((l) => ({
    id: l.id,
    name: l.name,
    sort_order: l.sort_order,
  }))
  const classes = repos.classes.findStructureClasses(schoolId).map((c) => ({
    id: c.id,
    name: c.name,
    academic_level_id: c.academic_level_id,
  }))
  const subjects = repos.subjects
    .findBySchoolWithClasses(schoolId)
    .map((s) => toSubjectDto(s, departments, levels, classes))

  return { subjects, departments, levels, classes }
}

function classIdsForLevel(
  repos: Repositories,
  schoolId: string,
  academicLevelId: string
): string[] {
  return repos.classes
    .findStructureClasses(schoolId)
    .filter((c) => c.academic_level_id === academicLevelId)
    .map((c) => c.id)
}

export function registerSubjectsIpc(repos: Repositories): void {
  ipcMain.handle('subjects:list', (): Result<SubjectsSetupDto> => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) {
      return { ok: false, error: 'No school found. Complete registration first.' }
    }
    return { ok: true, data: loadSetup(repos, schoolId) }
  })

  ipcMain.handle(
    'subjects:create',
    (
      _e,
      input: {
        name: string
        department_id: string
        coefficient: number
        academic_level_id: string
        class_ids?: string[]
      }
    ): Result<SubjectsSetupDto> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }

      const name = input?.name?.trim()
      if (!name) return { ok: false, error: 'Subject name is required.' }
      if (!input?.department_id) {
        return { ok: false, error: 'Select a department.' }
      }
      if (!input?.academic_level_id) {
        return { ok: false, error: 'Select an academic level first.' }
      }

      const levelClasses = classIdsForLevel(
        repos,
        schoolId,
        input.academic_level_id
      )
      if (!levelClasses.length) {
        return {
          ok: false,
          error: 'No classes exist for this level. Create classes first.',
        }
      }

      const class_ids =
        input.class_ids?.filter((id) => levelClasses.includes(id)) ??
        levelClasses
      if (!class_ids.length) {
        return {
          ok: false,
          error: 'Assign the subject to at least one class in this level.',
        }
      }

      try {
        repos.subjects.createWithClasses({
          school_id: schoolId,
          name,
          department_id: input.department_id,
          coefficient: Math.max(0.5, Number(input.coefficient) || 1),
          class_ids,
        })
        return { ok: true, data: loadSetup(repos, schoolId) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not create subject.',
        }
      }
    }
  )

  ipcMain.handle(
    'subjects:update',
    (
      _e,
      input: {
        id: string
        name: string
        department_id: string
        coefficient: number
        academic_level_id: string
        class_ids?: string[]
      }
    ): Result<SubjectsSetupDto> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }

      const name = input?.name?.trim()
      if (!input?.id || !name) {
        return { ok: false, error: 'Subject id and name are required.' }
      }
      if (!input.department_id) {
        return { ok: false, error: 'Select a department.' }
      }
      if (!input.academic_level_id) {
        return { ok: false, error: 'Select an academic level first.' }
      }

      const existing = repos.subjects.findById(input.id)
      if (!existing || (existing.school_id && existing.school_id !== schoolId)) {
        return { ok: false, error: 'Subject not found.' }
      }

      const levelClasses = classIdsForLevel(
        repos,
        schoolId,
        input.academic_level_id
      )
      if (!levelClasses.length) {
        return {
          ok: false,
          error: 'No classes exist for this level. Create classes first.',
        }
      }

      const class_ids =
        input.class_ids?.filter((id) => levelClasses.includes(id)) ??
        levelClasses
      if (!class_ids.length) {
        return {
          ok: false,
          error: 'Assign the subject to at least one class in this level.',
        }
      }

      try {
        const updated = repos.subjects.updateWithClasses(input.id, {
          name,
          department_id: input.department_id,
          coefficient: Math.max(0.5, Number(input.coefficient) || 1),
          class_ids,
        })
        if (!updated) return { ok: false, error: 'Subject not found.' }
        return { ok: true, data: loadSetup(repos, schoolId) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not update subject.',
        }
      }
    }
  )

  ipcMain.handle(
    'subjects:delete',
    (_e, input: { id: string }): Result<SubjectsSetupDto> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.id) return { ok: false, error: 'Subject id is required.' }

      const existing = repos.subjects.findById(input.id)
      if (!existing || (existing.school_id && existing.school_id !== schoolId)) {
        return { ok: false, error: 'Subject not found.' }
      }

      try {
        repos.subjects.delete(input.id)
        return { ok: true, data: loadSetup(repos, schoolId) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not delete subject.',
        }
      }
    }
  )
}
