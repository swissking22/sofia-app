import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type {
  StudentSettingsDto,
  StudentSettingsSaveInput,
} from '../db/repositories/student-settings.repository'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  return repos.schools.findLatest()?.id ?? null
}

export function registerStudentsIpc(repos: Repositories): void {
  ipcMain.handle('students:get-settings', (): Result<StudentSettingsDto> => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) {
      return { ok: false, error: 'No school found. Complete registration first.' }
    }
    return { ok: true, data: repos.studentSettings.getSetupDto(schoolId) }
  })

  ipcMain.handle(
    'students:save-settings',
    (_e, input: StudentSettingsSaveInput): Result<StudentSettingsDto> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      try {
        return {
          ok: true,
          data: repos.studentSettings.saveSetup(schoolId, input),
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not save student settings.',
        }
      }
    }
  )

  ipcMain.handle(
    'students:import',
    (
      _e,
      input: {
        students: Array<{
          full_name: string
          class_name?: string | null
          gender?: string | null
        }>
      }
    ): Result<{ imported: number; skipped: number; student_count: number }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.students?.length) {
        return { ok: false, error: 'No students to import.' }
      }

      const classes = repos.classes.findStructureClasses(schoolId)
      const byName = new Map(
        classes.map((c) => [c.name.trim().toLowerCase(), c.id])
      )

      let imported = 0
      let skipped = 0

      try {
        for (const row of input.students) {
          const name = row.full_name?.trim()
          if (!name) {
            skipped += 1
            continue
          }
          const className = row.class_name?.trim().toLowerCase()
          const classId = className ? byName.get(className) : undefined
          if (!classId) {
            skipped += 1
            continue
          }
          repos.students.create({ name, class_id: classId })
          imported += 1
        }

        const dto = repos.studentSettings.getSetupDto(schoolId)
        return {
          ok: true,
          data: {
            imported,
            skipped,
            student_count: dto.student_count,
          },
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not import students.',
        }
      }
    }
  )
}
