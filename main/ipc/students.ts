import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type {
  StudentSettingsDto,
  StudentSettingsSaveInput,
} from '../db/repositories/student-settings.repository'
import {
  resolveStudentImport,
  tallySkipReasons,
  type StudentImportCsvRow,
  type StudentImportSkipReason,
} from '../domain/student-import'

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
      input: { students: StudentImportCsvRow[] }
    ): Result<{
      imported: number
      skipped: number
      student_count: number
      skip_reasons: Array<{ reason: StudentImportSkipReason; count: number }>
    }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.students?.length) {
        return { ok: false, error: 'No students to import.' }
      }

      const structure = {
        levels: repos.academicLevels.findBySchool(schoolId),
        sections: repos.sections.findBySchool(schoolId),
        specializations: repos.specializations.findBySchool(schoolId),
        classes: repos.classes.findStructureClasses(schoolId),
      }

      let imported = 0
      const skipReasons: StudentImportSkipReason[] = []

      try {
        for (const row of input.students) {
          const resolved = resolveStudentImport(row, structure)
          if (!resolved.ok) {
            skipReasons.push(resolved.reason)
            continue
          }
          const cls = repos.classes.findById(resolved.data.class_id)
          repos.students.create({
            name: resolved.data.name,
            class_id: resolved.data.class_id,
            school_id: schoolId,
            academic_level_id: cls?.academic_level_id ?? null,
            admission_year: new Date().getFullYear(),
            gender: resolved.data.gender,
            date_of_birth: resolved.data.date_of_birth,
            place_of_birth: resolved.data.place_of_birth,
            residence_type: resolved.data.residence_type,
            guardian_name: resolved.data.guardian_name,
            guardian_phone: resolved.data.guardian_phone,
            guardian_email: resolved.data.guardian_email,
            guardian_relationship: resolved.data.guardian_relationship,
          })
          imported += 1
        }

        const dto = repos.studentSettings.getSetupDto(schoolId)
        return {
          ok: true,
          data: {
            imported,
            skipped: skipReasons.length,
            student_count: dto.student_count,
            skip_reasons: tallySkipReasons(skipReasons),
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
