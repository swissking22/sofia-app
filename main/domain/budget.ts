import { round2 } from './finance'

export const DEFAULT_BUDGET_CATEGORIES: Array<{
  key: string
  name: string
  sort_order: number
}> = [
  { key: 'salaries', name: 'Salaries', sort_order: 1 },
  { key: 'utilities', name: 'Utilities', sort_order: 2 },
  { key: 'maintenance', name: 'Maintenance', sort_order: 3 },
  { key: 'teaching_materials', name: 'Teaching Materials', sort_order: 4 },
  { key: 'infrastructure', name: 'Infrastructure', sort_order: 5 },
  { key: 'transport', name: 'Transport', sort_order: 6 },
  { key: 'office_expenses', name: 'Office Expenses', sort_order: 7 },
  { key: 'events', name: 'Events', sort_order: 8 },
  { key: 'other', name: 'Other', sort_order: 9 },
]

/** Map existing expense enum keys onto configurable budget category keys. */
export const EXPENSE_TO_BUDGET_KEY: Record<string, string> = {
  salaries: 'salaries',
  utilities: 'utilities',
  maintenance: 'maintenance',
  supplies: 'teaching_materials',
  transport: 'transport',
  miscellaneous: 'other',
}

export type AlertLevel = 'none' | 'alert' | 'warning' | 'critical'

export function utilizationPercent(allocated: number, spent: number): number {
  if (allocated <= 0) return spent > 0 ? 100 : 0
  return round2((spent / allocated) * 100)
}

export function remainingAmount(allocated: number, spent: number): number {
  return round2(allocated - spent)
}

export function alertLevelFor(
  utilization: number,
  thresholds: { alert: number; warning: number; critical: number }
): AlertLevel {
  if (utilization >= thresholds.critical) return 'critical'
  if (utilization >= thresholds.warning) return 'warning'
  if (utilization >= thresholds.alert) return 'alert'
  return 'none'
}

export function periodsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

export function dateInPeriod(
  date: string,
  start: string,
  end: string
): boolean {
  return date >= start && date <= end
}

export function validateBudgetAmount(amount: number): void {
  if (!(amount > 0)) throw new Error('Budget amount must be greater than 0.')
}

export function validatePeriod(start: string, end: string): void {
  if (!start || !end) throw new Error('Budget period dates are required.')
  if (end < start) {
    throw new Error('Budget period end cannot precede the start date.')
  }
}
