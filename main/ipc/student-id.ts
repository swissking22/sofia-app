import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type {
  StudentIdSettingsDto,
  StudentIdSettingsSaveInput,
} from '../db/repositories/student-id-settings.repository'
import {
  DEFAULT_STUDENT_ID_PATTERN,
  buildStudentId,
  padSequence,
} from '../helpers/student-id'
import { generateStudentId } from '../services/student-id'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function resolveSchool(repos: Repositories) {
  const session = getSession()
  if (session?.schoolId) {
    const bySession = repos.schools.findById(session.schoolId)
    if (bySession) return repos.schools.ensureSchoolCode(bySession)
  }
  const latest = repos.schools.findLatest()
  return latest ? repos.schools.ensureSchoolCode(latest) : undefined
}

export function registerStudentIdIpc(repos: Repositories): void {
  ipcMain.handle(
    'student-id:get-settings',
    (): Result<StudentIdSettingsDto> => {
      const school = resolveSchool(repos)
      if (!school) {
        return {
          ok: false,
          error: 'No school found. Complete registration first.',
        }
      }
      return {
        ok: true,
        data: repos.studentIdSettings.getSetupDto(school.id, school),
      }
    }
  )

  ipcMain.handle(
    'student-id:save-settings',
    (_e, input: StudentIdSettingsSaveInput): Result<StudentIdSettingsDto> => {
      const school = resolveSchool(repos)
      if (!school) return { ok: false, error: 'No school found.' }
      try {
        repos.studentIdSettings.saveSetup(school.id, input)
        return {
          ok: true,
          data: repos.studentIdSettings.getSetupDto(school.id, school),
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not save student ID settings.',
        }
      }
    }
  )

  ipcMain.handle(
    'student-id:preview',
    (
      _e,
      input: {
        pattern: string
        admissionYear?: number
        levelShort?: string
        sectionName?: string
        specializationAbbr?: string
        sequence?: number
      }
    ): Result<{ preview: string }> => {
      const school = resolveSchool(repos)
      if (!school) return { ok: false, error: 'No school found.' }
      const year = input.admissionYear ?? new Date().getFullYear()
      const levels = repos.academicLevels.findBySchool(school.id)
      const levelShort =
        input.levelShort?.trim() || levels[0]?.short_name || 'F1'
      const preview = buildStudentId(
        input.pattern || DEFAULT_STUDENT_ID_PATTERN,
        {
          SCHOOL: school.short_code,
          YEAR: year,
          LEVEL: levelShort,
          SECTION: input.sectionName || 'GEN',
          SPECIALIZATION: input.specializationAbbr || 'EL',
          SEQ: padSequence(input.sequence ?? 1),
        }
      )
      return { ok: true, data: { preview } }
    }
  )

  ipcMain.handle(
    'student-id:generate',
    (
      _e,
      input: {
        admissionYear: number
        academicLevelId?: string | null
        sectionName?: string | null
        specializationAbbr?: string | null
      }
    ): Result<{
      student_code: string
      sequence_number: number
      pattern: string
    }> => {
      const school = resolveSchool(repos)
      if (!school) return { ok: false, error: 'No school found.' }
      try {
        const result = generateStudentId(repos, {
          schoolId: school.id,
          admissionYear: input.admissionYear,
          academicLevelId: input.academicLevelId,
          sectionName: input.sectionName,
          specializationAbbr: input.specializationAbbr,
        })
        return { ok: true, data: result }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not generate student ID.',
        }
      }
    }
  )
}
