/**
 * Pure dashboard aggregation helpers — testable without SQLite/Electron.
 */

import { attendanceRate, collectionRate, mean } from './reports'
import { round2, todayIso } from './finance'
import { formatDisplayDateDayMonth } from './date-format'

export { isIncompleteStudentProfile } from './student-profile'

export type DashboardDistributionMode = 'level' | 'department' | 'class'

export type AttendanceTrendRange = '7d' | '30d' | 'term'

export interface DailyAttendancePoint {
  date: string
  present: number
  late: number
  absent: number
  excused: number
}

export interface TrendPoint {
  key: string
  label: string
  value: number
}

export interface DistributionBar {
  id: string
  label: string
  value: number
  href?: string | null
}

export interface PerformanceBar {
  id: string
  label: string
  average: number
  studentCount: number
  href?: string | null
}

export interface AttentionItem {
  id: string
  severity: 'critical' | 'warning' | 'info'
  label: string
  count: number
  href: string
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Short dashboard amounts: K for thousands, M for millions. */
export function formatCompactCurrency(
  amount: number,
  currency: string
): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  let body: string
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000
    body = `${Number(m.toFixed(m >= 10 ? 1 : 2))}M`.replace(/\.0+M$/, 'M')
  } else if (abs >= 1_000) {
    const k = abs / 1_000
    body = `${Number(k.toFixed(k >= 100 ? 0 : 1))}K`.replace(/\.0K$/, 'K')
  } else {
    body = Math.round(abs).toLocaleString('en-GB', { maximumFractionDigits: 0 })
  }
  return `${sign}${body}${currency ? ` ${currency}` : ''}`.trim()
}

/** Present + late count as attendance (matches reports.attendanceRate). */
export function summarizeAttendanceMarks(marks: {
  present: number
  late: number
  absent: number
  excused: number
}): {
  recorded: boolean
  rate: number | null
  present: number
  late: number
  absent: number
  excused: number
  total: number
} {
  const total =
    marks.present + marks.late + marks.absent + marks.excused
  if (total <= 0) {
    return {
      recorded: false,
      rate: null,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      total: 0,
    }
  }
  return {
    recorded: true,
    rate: attendanceRate(marks),
    present: marks.present,
    late: marks.late,
    absent: marks.absent,
    excused: marks.excused,
    total,
  }
}

export function buildAttendanceTrend(
  daily: DailyAttendancePoint[],
  options?: { minPoints?: number }
): { points: TrendPoint[]; available: boolean; summary: string } {
  const minPoints = options?.minPoints ?? 2
  const points: TrendPoint[] = []
  for (const day of daily) {
    const summary = summarizeAttendanceMarks(day)
    if (!summary.recorded || summary.rate == null) continue
    points.push({
      key: day.date,
      label: formatShortDate(day.date),
      value: summary.rate,
    })
  }
  if (points.length < minPoints) {
    return {
      points: [],
      available: false,
      summary: 'Not enough attendance data',
    }
  }
  const latest = points[points.length - 1]
  const avg = mean(points.map((p) => p.value))
  return {
    points,
    available: true,
    summary: `Attendance averaged ${avg}% across ${points.length} school days; latest ${latest.label} was ${latest.value}%.`,
  }
}

export function buildFeeCollectionTrend(
  payments: Array<{ paid_at: string; amount: number }>,
  range: { from: string; to: string },
  granularity: 'day' | 'week' | 'month'
): { points: TrendPoint[]; available: boolean; summary: string } {
  const filtered = payments.filter((p) => {
    const d = p.paid_at.slice(0, 10)
    return d >= range.from && d <= range.to
  })
  if (!filtered.length) {
    return {
      points: [],
      available: false,
      summary: 'No fee collection data yet.',
    }
  }

  const buckets = new Map<string, number>()
  for (const p of filtered) {
    const day = p.paid_at.slice(0, 10)
    const key =
      granularity === 'month'
        ? day.slice(0, 7)
        : granularity === 'week'
          ? isoWeekKey(day)
          : day
    buckets.set(key, round2((buckets.get(key) || 0) + p.amount))
  }

  const points = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key,
      label: granularity === 'day' ? formatShortDate(key) : key,
      value,
    }))

  const total = round2(points.reduce((s, p) => s + p.value, 0))
  return {
    points,
    available: true,
    summary: `Collected ${total.toLocaleString()} across ${points.length} ${granularity} period(s).`,
  }
}

export function suggestFeeGranularity(
  from: string,
  to: string
): 'day' | 'week' | 'month' {
  const days = Math.max(1, daysBetween(from, to) + 1)
  if (days <= 14) return 'day'
  if (days <= 90) return 'week'
  return 'month'
}

export function aggregateDistribution(
  students: Array<{
    id: string
    class_id: string
    academic_level_id: string | null
  }>,
  classes: Array<{
    id: string
    name: string
    academic_level_id: string | null
    section_id: string | null
  }>,
  levels: Array<{ id: string; name: string; sort_order: number }>,
  sections: Array<{ id: string; name: string }>,
  mode: DashboardDistributionMode
): DistributionBar[] {
  const classById = new Map(classes.map((c) => [c.id, c]))
  const levelById = new Map(levels.map((l) => [l.id, l]))
  const sectionById = new Map(sections.map((s) => [s.id, s]))
  const counts = new Map<
    string,
    { id: string; label: string; value: number; sort: number }
  >()

  for (const student of students) {
    const cls = classById.get(student.class_id)
    let id: string
    let label: string
    let sort = 999
    let href: string | null = null

    if (mode === 'class') {
      if (!cls) continue
      id = cls.id
      label = cls.name
      sort = 0
      href = `/students?class_id=${encodeURIComponent(cls.id)}`
    } else if (mode === 'department') {
      const sectionId = cls?.section_id
      if (!sectionId) continue
      const section = sectionById.get(sectionId)
      id = sectionId
      label = section?.name ?? 'Unknown'
      sort = 0
      href = `/students?section_id=${encodeURIComponent(sectionId)}`
    } else {
      const levelId =
        student.academic_level_id || cls?.academic_level_id || null
      if (!levelId) continue
      const level = levelById.get(levelId)
      id = levelId
      label = level?.name ?? 'Unknown'
      sort = level?.sort_order ?? 999
      href = `/students?level_id=${encodeURIComponent(levelId)}`
    }

    const existing = counts.get(id)
    if (existing) existing.value += 1
    else counts.set(id, { id, label, value: 1, sort })
    void href
  }

  // Rebuild with hrefs
  const bars: DistributionBar[] = []
  for (const row of counts.values()) {
    let href: string | null = null
    if (mode === 'class') href = `/students?class_id=${encodeURIComponent(row.id)}`
    else if (mode === 'department')
      href = `/students?section_id=${encodeURIComponent(row.id)}`
    else href = `/students?level_id=${encodeURIComponent(row.id)}`
    bars.push({
      id: row.id,
      label: row.label,
      value: row.value,
      href,
    })
  }

  return bars.sort((a, b) => {
    const sa = counts.get(a.id)?.sort ?? 999
    const sb = counts.get(b.id)?.sort ?? 999
    if (sa !== sb) return sa - sb
    return a.label.localeCompare(b.label)
  })
}

export function shouldShowDepartmentDonut(
  bars: DistributionBar[]
): boolean {
  return bars.length >= 2 && bars.length <= 5
}

export function aggregateAcademicPerformance(
  summaries: Array<{
    average: number
    class_id: string
    level_id: string | null
    level_name: string | null
    level_sort: number
  }>
): { bars: PerformanceBar[]; available: boolean; summary: string } {
  if (!summaries.length) {
    return {
      bars: [],
      available: false,
      summary: 'No academic results available yet.',
    }
  }

  const byLevel = new Map<
    string,
    { id: string; label: string; averages: number[]; sort: number }
  >()

  for (const row of summaries) {
    const id = row.level_id || row.class_id
    const label = row.level_name || 'Unknown'
    const existing = byLevel.get(id) || {
      id,
      label,
      averages: [] as number[],
      sort: row.level_sort,
    }
    existing.averages.push(row.average)
    byLevel.set(id, existing)
  }

  const bars: PerformanceBar[] = [...byLevel.values()]
    .map((row) => ({
      id: row.id,
      label: row.label,
      average: mean(row.averages),
      studentCount: row.averages.length,
      href: '/academic/results',
    }))
    .sort((a, b) => {
      const sa = byLevel.get(a.id)?.sort ?? 999
      const sb = byLevel.get(b.id)?.sort ?? 999
      if (sa !== sb) return sa - sb
      return a.label.localeCompare(b.label)
    })

  const best = [...bars].sort((a, b) => b.average - a.average)[0]
  return {
    bars,
    available: true,
    summary: best
      ? `${best.label} has the highest average performance at ${best.average}%.`
      : 'Academic performance by level.',
  }
}

export function feePeriodStats(input: {
  billed: number
  collected: number
}): {
  collected: number
  billed: number
  outstandingEligible: boolean
  percentOfExpected: number | null
} {
  const billed = round2(Math.max(0, input.billed))
  const collected = round2(Math.max(0, input.collected))
  return {
    collected,
    billed,
    outstandingEligible: billed > 0,
    percentOfExpected: billed > 0 ? collectionRate(collected, billed) : null,
  }
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00`)
  const b = Date.parse(`${to}T00:00:00`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.floor((b - a) / 86_400_000)
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatShortDate(iso: string): string {
  return formatDisplayDateDayMonth(iso, iso)
}

export function isoWeekKey(isoDate: string): string {
  const dt = new Date(`${isoDate}T00:00:00`)
  const year = dt.getFullYear()
  const onejan = new Date(year, 0, 1)
  const week = Math.ceil(
    ((dt.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7
  )
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function resolveAttendanceRange(
  range: AttendanceTrendRange,
  today: string,
  term?: { start_date: string; end_date: string } | null
): { from: string; to: string } {
  if (range === 'term' && term) {
    return {
      from: term.start_date,
      to: term.end_date < today ? term.end_date : today,
    }
  }
  const days = range === '30d' ? 29 : 6
  return { from: addDaysIso(today, -days), to: today }
}

export { todayIso, round2, attendanceRate, collectionRate, mean }
