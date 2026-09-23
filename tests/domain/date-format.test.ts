import {
  formatDisplayDate,
  formatDisplayDateDayMonth,
  formatDisplayDateLong,
  formatDisplayDateNumeric,
  formatDisplayDateTime,
  formatDisplayDateWithWeekday,
  formatDisplayMonthYear,
  parseSofiaDate,
} from '../../main/domain/date-format'
import { formatShortDate } from '../../main/domain/dashboard'

describe('date-format (Day → Month → Year)', () => {
  it('parses ISO date-only without timezone shift', () => {
    const d = parseSofiaDate('2026-09-23')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(8)
    expect(d!.getDate()).toBe(23)
  })

  it('formats default display as day month year', () => {
    // en-GB short September is "Sept" on modern ICU
    expect(formatDisplayDate('2026-09-23')).toMatch(/^23 Sept? 2026$/)
  })

  it('formats long, numeric, weekday, and day-month variants', () => {
    expect(formatDisplayDateLong('2026-09-23')).toBe('23 September 2026')
    expect(formatDisplayDateNumeric('2026-09-23')).toBe('23/09/2026')
    expect(formatDisplayDateWithWeekday('2026-09-23')).toMatch(
      /^[A-Za-z]{3}, 23 Sept? 2026$/
    )
    expect(formatDisplayDateDayMonth('2026-09-23')).toMatch(/^23 Sept?$/)
  })

  it('formats month-year and dashboard short labels', () => {
    expect(formatDisplayMonthYear('2026-09')).toBe('September 2026')
    expect(formatShortDate('2026-09-23')).toMatch(/^23 Sept?$/)
  })

  it('formats date-time with day-month-year first', () => {
    const out = formatDisplayDateTime('2026-09-23T14:32:00')
    expect(out).toMatch(/^23 Sept? 2026/)
    expect(out).toMatch(/14:32|2:32/)
  })

  it('returns empty placeholder for nullish values', () => {
    expect(formatDisplayDate(null)).toBe('—')
    expect(formatDisplayDate(undefined, '')).toBe('')
  })

  it('keeps day before month for mid-year dates', () => {
    expect(formatDisplayDate('2026-03-05')).toMatch(/^5 Mar 2026$/)
    expect(formatDisplayDateNumeric('2026-03-05')).toBe('05/03/2026')
  })
})
