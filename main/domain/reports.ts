import { round2 } from './finance'

export type InsightSeverity = 'INFO' | 'WARNING' | 'CRITICAL'
export type InsightType =
  | 'academic'
  | 'financial'
  | 'attendance'
  | 'budget'
  | 'staff'
  | 'enrolment'

export type ReportAgingBucket = 'current' | 'aging_30' | 'aging_60' | 'aging_90'

export interface GeneratedInsight {
  type: InsightType
  severity: InsightSeverity
  title: string
  description: string
  entity?: { kind: string; id: string | null; name: string } | null
  generated_at: string
  href?: string | null
}

export function mean(values: number[]): number {
  if (!values.length) return 0
  return round2(values.reduce((s, n) => s + n, 0) / values.length)
}

export function passRate(values: number[], passMark: number): number {
  if (!values.length) return 0
  const passed = values.filter((v) => v >= passMark).length
  return round2((passed / values.length) * 100)
}

export function isPassingGrade(
  grade: string | null | undefined,
  average: number,
  passMark: number
): boolean {
  if (grade && grade.trim()) {
    return !/^f\b/i.test(grade.trim())
  }
  return average >= passMark
}

export function cohortPassRate(
  rows: Array<{ average: number; grade?: string | null }>,
  passMark: number
): number {
  if (!rows.length) return 0
  const passed = rows.filter((r) =>
    isPassingGrade(r.grade, r.average, passMark)
  ).length
  return round2((passed / rows.length) * 100)
}

export const GRADE_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

export function gradeDistribution(
  grades: Array<string | null | undefined>
): Record<(typeof GRADE_KEYS)[number], number> {
  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }
  for (const raw of grades) {
    const key = (raw || '').trim().charAt(0).toUpperCase()
    if (key in counts) {
      counts[key as keyof typeof counts] += 1
    } else if (key === '') {
      /* skip missing */
    }
  }
  return counts
}

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100
  return round2(((current - previous) / Math.abs(previous)) * 100)
}

export function collectionRate(collected: number, billed: number): number {
  if (billed <= 0) return collected > 0 ? 100 : 0
  return round2((collected / billed) * 100)
}

export function attendanceRate(input: {
  present: number
  late?: number
  absent?: number
  excused?: number
}): number {
  const late = input.late ?? 0
  const total =
    input.present + late + (input.absent ?? 0) + (input.excused ?? 0)
  if (total <= 0) return 0
  return round2(((input.present + late) / total) * 100)
}

export function daysPastDue(dueDate: string | null, today: string): number {
  if (!dueDate) return 0
  const due = Date.parse(dueDate)
  const now = Date.parse(today)
  if (!Number.isFinite(due) || !Number.isFinite(now)) return 0
  return Math.floor((now - due) / 86_400_000)
}

export function reportAgingBucket(
  dueDate: string | null,
  today: string
): ReportAgingBucket {
  const age = daysPastDue(dueDate, today)
  if (age <= 0) return 'current'
  if (age <= 30) return 'aging_30'
  if (age <= 60) return 'aging_60'
  return 'aging_90'
}

export function emptyAging(): Record<ReportAgingBucket, number> {
  return { current: 0, aging_30: 0, aging_60: 0, aging_90: 0 }
}

export function scopeBySchool<T extends { school_id: string }>(
  rows: T[],
  schoolId: string
): T[] {
  return rows.filter((r) => r.school_id === schoolId)
}

export function passMarkFromBands(
  bands: Array<{ grade: string; min_score: number }>
): number {
  const passing = bands.filter((b) => !/^f\b/i.test(b.grade.trim()))
  if (!passing.length) return 40
  return Math.min(...passing.map((b) => b.min_score))
}

export function severityFromMagnitude(
  pctPointDrop: number,
  warnAt: number,
  criticalAt: number
): InsightSeverity {
  if (pctPointDrop >= criticalAt) return 'CRITICAL'
  if (pctPointDrop >= warnAt) return 'WARNING'
  return 'INFO'
}

export function academicDeclineInsight(input: {
  entityName: string
  entityId: string
  currentAvg: number
  previousAvg: number
  generatedAt: string
}): GeneratedInsight | null {
  const change = percentChange(input.currentAvg, input.previousAvg)
  if (input.previousAvg <= 0 || change >= -5) return null
  const drop = Math.abs(change)
  return {
    type: 'academic',
    severity: severityFromMagnitude(drop, 10, 20),
    title: `${input.entityName} average has declined`,
    description: `${input.entityName} average has decreased by ${drop}% compared with the previous term (${input.previousAvg} → ${input.currentAvg}).`,
    entity: { kind: 'class', id: input.entityId, name: input.entityName },
    generated_at: input.generatedAt,
    href: `/reports/academic-performance?class_id=${encodeURIComponent(input.entityId)}`,
  }
}

export function outstandingIncreaseInsight(input: {
  current: number
  previous: number
  generatedAt: string
}): GeneratedInsight | null {
  const change = percentChange(input.current, input.previous)
  if (input.previous <= 0 || change <= 5) return null
  return {
    type: 'financial',
    severity: severityFromMagnitude(change, 10, 25),
    title: 'Outstanding fees have increased',
    description: `Outstanding fees have increased by ${change}% compared with the previous term.`,
    entity: { kind: 'finance', id: null, name: 'Outstanding fees' },
    generated_at: input.generatedAt,
    href: '/finance/outstanding',
  }
}

export function attendanceThresholdInsight(input: {
  count: number
  threshold: number
  generatedAt: string
}): GeneratedInsight | null {
  if (input.count <= 0) return null
  return {
    type: 'attendance',
    severity: input.count > 10 ? 'WARNING' : 'INFO',
    title: `Students below ${input.threshold}% attendance`,
    description: `${input.count} student${input.count === 1 ? '' : 's'} currently ${input.count === 1 ? 'has' : 'have'} attendance below ${input.threshold}%.`,
    entity: { kind: 'attendance', id: null, name: 'At-risk students' },
    generated_at: input.generatedAt,
    href: '/reports/attendance?risk=1',
  }
}

export function budgetThresholdInsight(input: {
  categoryName: string
  categoryKey: string
  utilization: number
  generatedAt: string
}): GeneratedInsight | null {
  if (input.utilization < 70) return null
  const severity: InsightSeverity =
    input.utilization >= 100
      ? 'CRITICAL'
      : input.utilization >= 85
        ? 'WARNING'
        : 'INFO'
  return {
    type: 'budget',
    severity,
    title: `${input.categoryName} budget pressure`,
    description: `${input.categoryName} expenses have reached ${input.utilization}% of the allocated budget.`,
    entity: {
      kind: 'budget',
      id: input.categoryKey,
      name: input.categoryName,
    },
    generated_at: input.generatedAt,
    href: '/finance/budgeting',
  }
}
