/**
 * Canonical calendar date display for Sofia.
 * Order is always Day → Month → Year (en-GB).
 *
 * Storage / HTML date inputs remain ISO `YYYY-MM-DD`.
 * These helpers are for human-facing UI, exports, and print.
 */

export const SOFIA_DATE_LOCALE = 'en-GB'

export function parseSofiaDate(
  value: string | Date | null | undefined
): Date | null {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const raw = String(value).trim()
  if (!raw) return null
  // Date-only ISO: force local noon to avoid timezone day shifts.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T12:00:00`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(raw.includes('T') ? raw : `${raw.slice(0, 10)}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Default UI date: `23 Sept 2026` (en-GB short month) */
export function formatDisplayDate(
  value: string | Date | null | undefined,
  empty = '—'
): string {
  const d = parseSofiaDate(value)
  if (!d) return value ? String(value) : empty
  return d.toLocaleDateString(SOFIA_DATE_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Long form: `23 September 2026` */
export function formatDisplayDateLong(
  value: string | Date | null | undefined,
  empty = '—'
): string {
  const d = parseSofiaDate(value)
  if (!d) return value ? String(value) : empty
  return d.toLocaleDateString(SOFIA_DATE_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Numeric: `23/09/2026` */
export function formatDisplayDateNumeric(
  value: string | Date | null | undefined,
  empty = '—'
): string {
  const d = parseSofiaDate(value)
  if (!d) return value ? String(value) : empty
  return d.toLocaleDateString(SOFIA_DATE_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** With weekday: `Wed, 23 Sept 2026` */
export function formatDisplayDateWithWeekday(
  value: string | Date | null | undefined,
  empty = '—'
): string {
  const d = parseSofiaDate(value)
  if (!d) return value ? String(value) : empty
  return d.toLocaleDateString(SOFIA_DATE_LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Charts / compact: `23 Sept` */
export function formatDisplayDateDayMonth(
  value: string | Date | null | undefined,
  empty = '—'
): string {
  const d = parseSofiaDate(value)
  if (!d) return value ? String(value) : empty
  return d.toLocaleDateString(SOFIA_DATE_LOCALE, {
    day: 'numeric',
    month: 'short',
  })
}

/** Date + time, date still Day Month Year: `23 Sept 2026, 14:32` */
export function formatDisplayDateTime(
  value: string | Date | null | undefined,
  empty = '—'
): string {
  if (value == null || value === '') return empty
  const d =
    value instanceof Date
      ? value
      : new Date(String(value))
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(SOFIA_DATE_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Month + year only: `September 2026` */
export function formatDisplayMonthYear(
  value: string | Date | null | undefined,
  empty = '—'
): string {
  const d = parseSofiaDate(value)
  if (!d) {
    // Allow year-month like 2026-09
    if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) {
      const m = new Date(`${value}-01T12:00:00`)
      if (!Number.isNaN(m.getTime())) {
        return m.toLocaleDateString(SOFIA_DATE_LOCALE, {
          month: 'long',
          year: 'numeric',
        })
      }
    }
    return value ? String(value) : empty
  }
  return d.toLocaleDateString(SOFIA_DATE_LOCALE, {
    month: 'long',
    year: 'numeric',
  })
}
