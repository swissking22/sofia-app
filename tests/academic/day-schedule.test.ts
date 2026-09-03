import {
  DEFAULT_DAY_SCHEDULE,
  buildDaySchedule,
  mergeDaySchedule,
  validateDaySchedule,
} from '../../main/domain/day-schedule'

describe('day schedule', () => {
  it('builds period clock times with breaks', () => {
    const built = buildDaySchedule(DEFAULT_DAY_SCHEDULE)
    expect(built.periods).toHaveLength(8)
    expect(built.periods[0]).toMatchObject({
      period_number: 1,
      start_time: '08:00',
      end_time: '08:45',
    })
    // Break after period 2 (15 min) then period 3
    expect(built.periods[2]).toMatchObject({
      period_number: 3,
      start_time: '09:45',
      end_time: '10:30',
    })
    expect(built.overflow_minutes).toBe(0)
  })

  it('rejects schedules that overrun the day end', () => {
    const error = validateDaySchedule({
      ...DEFAULT_DAY_SCHEDULE,
      day_end_time: '10:00',
      periods_per_day: 8,
    })
    expect(error).toMatch(/past the day end/i)
  })

  it('rejects a break after the last period count', () => {
    const error = validateDaySchedule({
      ...DEFAULT_DAY_SCHEDULE,
      periods_per_day: 4,
      breaks: [{ name: 'Late', after_period: 6, duration_minutes: 10 }],
    })
    expect(error).toMatch(/only 4 periods/i)
  })

  it('merges partial config onto defaults', () => {
    const merged = mergeDaySchedule({
      day_start_time: '07:30',
      periods_per_day: 6,
    })
    expect(merged.day_start_time).toBe('07:30')
    expect(merged.periods_per_day).toBe(6)
    expect(merged.period_duration_minutes).toBe(45)
    expect(merged.breaks.length).toBeGreaterThan(0)
  })
})
