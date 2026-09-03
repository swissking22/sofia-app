/**
 * School day schedule: start/end, period length, breaks → period clock times.
 */

export type DayBreakInput = {
  name: string
  /** Teaching period after which this break starts (1-based). */
  after_period: number
  duration_minutes: number
}

export type DayScheduleConfig = {
  day_start_time: string
  day_end_time: string
  period_duration_minutes: number
  periods_per_day: number
  breaks: DayBreakInput[]
}

export type ScheduleBlock =
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

export const DEFAULT_DAY_SCHEDULE: DayScheduleConfig = {
  day_start_time: '08:00',
  day_end_time: '15:00',
  period_duration_minutes: 45,
  periods_per_day: 8,
  breaks: [
    { name: 'Break', after_period: 2, duration_minutes: 15 },
    { name: 'Lunch', after_period: 5, duration_minutes: 40 },
  ],
}

/** Parse HH:MM to minutes from midnight. */
export function parseTimeToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

export function formatMinutesAsTime(total: number): string {
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function normalizeBreaks(breaks: DayBreakInput[]): DayBreakInput[] {
  const seen = new Set<number>()
  const out: DayBreakInput[] = []
  for (const b of breaks) {
    const name = b.name.trim() || 'Break'
    const after = Math.floor(Number(b.after_period))
    const duration = Math.floor(Number(b.duration_minutes))
    if (!Number.isFinite(after) || after < 1) continue
    if (!Number.isFinite(duration) || duration < 1) continue
    if (seen.has(after)) continue
    seen.add(after)
    out.push({ name, after_period: after, duration_minutes: duration })
  }
  return out.sort((a, b) => a.after_period - b.after_period)
}

export function validateDaySchedule(
  input: DayScheduleConfig
): string | null {
  const start = parseTimeToMinutes(input.day_start_time)
  const end = parseTimeToMinutes(input.day_end_time)
  if (start == null) return 'Day start time must be HH:MM.'
  if (end == null) return 'Day end time must be HH:MM.'
  if (end <= start) return 'Day end time must be after day start time.'
  const duration = Math.floor(Number(input.period_duration_minutes))
  if (!Number.isFinite(duration) || duration < 15 || duration > 180) {
    return 'Period duration must be between 15 and 180 minutes.'
  }
  const periods = Math.floor(Number(input.periods_per_day))
  if (!Number.isFinite(periods) || periods < 1 || periods > 16) {
    return 'Periods per day must be between 1 and 16.'
  }
  for (const b of normalizeBreaks(input.breaks)) {
    if (b.after_period > periods) {
      return `Break “${b.name}” is after period ${b.after_period}, but there are only ${periods} periods.`
    }
  }
  const built = buildDaySchedule({
    ...input,
    period_duration_minutes: duration,
    periods_per_day: periods,
    breaks: normalizeBreaks(input.breaks),
  })
  if (built.overflow_minutes > 0) {
    return `This schedule runs ${built.overflow_minutes} minutes past the day end time (${input.day_end_time}). Shorten periods, reduce breaks, or move the end time.`
  }
  return null
}

export function buildDaySchedule(input: DayScheduleConfig): {
  blocks: ScheduleBlock[]
  periods: Array<{
    period_number: number
    label: string
    start_time: string
    end_time: string
  }>
  computed_end_time: string
  overflow_minutes: number
} {
  const start = parseTimeToMinutes(input.day_start_time) ?? 8 * 60
  const endLimit = parseTimeToMinutes(input.day_end_time) ?? 15 * 60
  const duration = Math.max(1, Math.floor(input.period_duration_minutes))
  const periodsCount = Math.max(1, Math.floor(input.periods_per_day))
  const breaks = normalizeBreaks(input.breaks)
  const breakByPeriod = new Map(breaks.map((b) => [b.after_period, b]))

  let cursor = start
  const blocks: ScheduleBlock[] = []
  const periods: Array<{
    period_number: number
    label: string
    start_time: string
    end_time: string
  }> = []

  for (let p = 1; p <= periodsCount; p++) {
    const periodStart = cursor
    const periodEnd = cursor + duration
    const label = `Period ${p}`
    const block = {
      kind: 'period' as const,
      period_number: p,
      label,
      start_time: formatMinutesAsTime(periodStart),
      end_time: formatMinutesAsTime(periodEnd),
    }
    blocks.push(block)
    periods.push({
      period_number: p,
      label,
      start_time: block.start_time,
      end_time: block.end_time,
    })
    cursor = periodEnd
    const br = breakByPeriod.get(p)
    if (br) {
      const breakEnd = cursor + br.duration_minutes
      blocks.push({
        kind: 'break',
        name: br.name,
        after_period: p,
        start_time: formatMinutesAsTime(cursor),
        end_time: formatMinutesAsTime(breakEnd),
        duration_minutes: br.duration_minutes,
      })
      cursor = breakEnd
    }
  }

  return {
    blocks,
    periods,
    computed_end_time: formatMinutesAsTime(cursor),
    overflow_minutes: Math.max(0, cursor - endLimit),
  }
}

export function mergeDaySchedule(
  partial?: Partial<DayScheduleConfig> | null
): DayScheduleConfig {
  return {
    day_start_time:
      partial?.day_start_time?.trim() || DEFAULT_DAY_SCHEDULE.day_start_time,
    day_end_time:
      partial?.day_end_time?.trim() || DEFAULT_DAY_SCHEDULE.day_end_time,
    period_duration_minutes:
      partial?.period_duration_minutes ??
      DEFAULT_DAY_SCHEDULE.period_duration_minutes,
    periods_per_day:
      partial?.periods_per_day ?? DEFAULT_DAY_SCHEDULE.periods_per_day,
    breaks:
      partial?.breaks !== undefined
        ? normalizeBreaks(partial.breaks)
        : DEFAULT_DAY_SCHEDULE.breaks.map((b) => ({ ...b })),
  }
}
