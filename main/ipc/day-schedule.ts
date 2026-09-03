import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type { DayBreakInput } from '../domain/day-schedule'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  return repos.schools.findLatest()?.id ?? null
}

export function registerDayScheduleIpc(repos: Repositories): void {
  ipcMain.handle('day-schedule:get', (): Result<unknown> => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) {
      return { ok: false, error: 'No school found. Complete registration first.' }
    }
    return { ok: true, data: repos.schools.getDayScheduleDto(schoolId) }
  })

  ipcMain.handle(
    'day-schedule:save',
    (
      _e,
      input: {
        day_start_time: string
        day_end_time: string
        period_duration_minutes: number
        periods_per_day: number
        breaks: DayBreakInput[]
      }
    ): Result<unknown> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) {
        return {
          ok: false,
          error: 'No school found. Complete registration first.',
        }
      }

      try {
        const data = repos.schools.saveDaySchedule(schoolId, {
          day_start_time: input?.day_start_time ?? '',
          day_end_time: input?.day_end_time ?? '',
          period_duration_minutes: Number(input?.period_duration_minutes),
          periods_per_day: Number(input?.periods_per_day),
          breaks: Array.isArray(input?.breaks) ? input.breaks : [],
        })
        return { ok: true, data }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not save school day schedule.',
        }
      }
    }
  )
}
