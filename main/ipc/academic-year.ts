import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type {
  AcademicYearSetupDto,
  AcademicYearSetupInput,
} from '../db/repositories/academic-year.repository'
import type { CalendarEventType } from '../db/types'

export type AcademicYearResult =
  | { ok: true; setup: AcademicYearSetupDto | null }
  | { ok: false; error: string }

export type AcademicYearSaveResult =
  | { ok: true; setup: AcademicYearSetupDto }
  | { ok: false; error: string }

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  return repos.schools.findLatest()?.id ?? null
}

function emptyDefaults(): AcademicYearSetupDto {
  const now = new Date()
  const year = now.getFullYear()
  const startYear = now.getMonth() >= 7 ? year : year - 1
  const name = `${startYear}/${startYear + 1}`

  return {
    id: '',
    school_id: '',
    name,
    start_date: `${startYear}-09-01`,
    end_date: `${startYear + 1}-06-30`,
    terms: [
      {
        id: '',
        term_number: 1,
        name: 'First Term',
        start_date: `${startYear}-09-01`,
        end_date: `${startYear}-12-15`,
      },
      {
        id: '',
        term_number: 2,
        name: 'Second Term',
        start_date: `${startYear + 1}-01-08`,
        end_date: `${startYear + 1}-03-28`,
      },
      {
        id: '',
        term_number: 3,
        name: 'Third Term',
        start_date: `${startYear + 1}-04-14`,
        end_date: `${startYear + 1}-06-30`,
      },
    ],
    events: [],
  }
}

export function registerAcademicYearIpc(repos: Repositories): void {
  ipcMain.handle('academic-year:get', (): AcademicYearResult => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) {
      return { ok: false, error: 'No school found. Complete registration first.' }
    }

    const setup = repos.academicYears.getSetupDto(schoolId)
    if (!setup) {
      const defaults = emptyDefaults()
      defaults.school_id = schoolId
      return { ok: true, setup: defaults }
    }
    return { ok: true, setup }
  })

  ipcMain.handle(
    'academic-year:save',
    (_event, input: AcademicYearSetupInput): AcademicYearSaveResult => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) {
        return {
          ok: false,
          error: 'No school found. Complete registration first.',
        }
      }

      const name = input.name?.trim()
      if (!name) {
        return { ok: false, error: 'Academic year name is required.' }
      }

      const start_date = input.start_date?.trim() || ''
      const end_date = input.end_date?.trim() || ''

      const terms = (input.terms ?? []).map((t) => ({
        term_number: Number(t.term_number),
        name: t.name?.trim(),
        start_date: t.start_date?.trim() || '',
        end_date: t.end_date?.trim() || '',
      }))

      const events = (input.events ?? [])
        .filter((e) => e.title?.trim() && e.start_date && e.end_date)
        .map((e) => ({
          id: e.id ?? null,
          type: (e.type === 'vacation' ? 'vacation' : 'holiday') as CalendarEventType,
          title: e.title.trim(),
          start_date: e.start_date.trim(),
          end_date: e.end_date.trim(),
        }))

      try {
        const setup = repos.academicYears.saveSetup(schoolId, {
          name,
          start_date,
          end_date,
          terms,
          events,
        })
        return { ok: true, setup }
      } catch {
        return { ok: false, error: 'Could not save academic year.' }
      }
    }
  )
}
