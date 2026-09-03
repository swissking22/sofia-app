/** School day schedule (periods + breaks) IPC helpers. */

export type DayBreakDto = {
  name: string
  after_period: number
  duration_minutes: number
}

export type DayScheduleDto = {
  day_start_time: string
  day_end_time: string
  period_duration_minutes: number
  periods_per_day: number
  breaks: DayBreakDto[]
  periods: Array<{
    period_number: number
    label: string
    start_time: string
    end_time: string
  }>
  blocks: Array<
    | {
        kind: 'period'
        period_number: number
        label: string
        start_time: string
        end_time: string
      }
    | {
        kind: 'break'
        name: string
        after_period: number
        start_time: string
        end_time: string
        duration_minutes: number
      }
  >
  computed_end_time: string
}

export type DayScheduleInput = {
  day_start_time: string
  day_end_time: string
  period_duration_minutes: number
  periods_per_day: number
  breaks: DayBreakDto[]
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchDaySchedule(): Promise<Result<DayScheduleDto>> {
  return (await window.ipc.invoke('day-schedule:get')) as Result<DayScheduleDto>
}

export async function saveDaySchedule(
  input: DayScheduleInput
): Promise<Result<DayScheduleDto>> {
  return (await window.ipc.invoke(
    'day-schedule:save',
    input
  )) as Result<DayScheduleDto>
}
