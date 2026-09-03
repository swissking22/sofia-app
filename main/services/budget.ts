import {
  EXPENSE_TO_BUDGET_KEY,
  alertLevelFor,
  dateInPeriod,
  periodsOverlap,
  remainingAmount,
  utilizationPercent,
  validateBudgetAmount,
  validatePeriod,
  type AlertLevel,
} from '../domain/budget'

export type BudgetRecord = {
  id: string
  school_id: string
  academic_year_id: string
  category_key: string
  period_start: string
  period_end: string
  allocated_amount: number
  status: 'draft' | 'active' | 'closed'
  alert_pct: number
  warning_pct: number
  critical_pct: number
}

export type ExpenseSpend = {
  school_id: string
  category: string
  amount: number
  expense_date: string
}

export interface BudgetStore {
  list(schoolId: string): BudgetRecord[]
  insert(budget: BudgetRecord): BudgetRecord
  expenses(schoolId: string): ExpenseSpend[]
}

let seq = 1
function nextId() {
  seq += 1
  return `budget_${seq}`
}

export class BudgetService {
  constructor(private store: BudgetStore) {}

  create(input: Omit<BudgetRecord, 'id'>): BudgetRecord {
    validateBudgetAmount(input.allocated_amount)
    validatePeriod(input.period_start, input.period_end)
    if (input.status === 'active') {
      const clash = this.store.list(input.school_id).find(
        (b) =>
          b.status === 'active' &&
          b.category_key === input.category_key &&
          b.academic_year_id === input.academic_year_id &&
          periodsOverlap(
            b.period_start,
            b.period_end,
            input.period_start,
            input.period_end
          )
      )
      if (clash) {
        throw new Error(
          'An active budget already exists for this category and period.'
        )
      }
    }
    return this.store.insert({ ...input, id: nextId() })
  }

  spentFor(budget: BudgetRecord): number {
    const key = budget.category_key
    return this.store
      .expenses(budget.school_id)
      .filter((e) => {
        const mapped = EXPENSE_TO_BUDGET_KEY[e.category] || e.category
        return (
          mapped === key &&
          dateInPeriod(e.expense_date, budget.period_start, budget.period_end)
        )
      })
      .reduce((s, e) => s + e.amount, 0)
  }

  snapshot(budget: BudgetRecord): {
    allocated: number
    spent: number
    remaining: number
    utilization: number
    alert: AlertLevel
  } {
    const spent = this.spentFor(budget)
    const utilization = utilizationPercent(budget.allocated_amount, spent)
    return {
      allocated: budget.allocated_amount,
      spent,
      remaining: remainingAmount(budget.allocated_amount, spent),
      utilization,
      alert: alertLevelFor(utilization, {
        alert: budget.alert_pct,
        warning: budget.warning_pct,
        critical: budget.critical_pct,
      }),
    }
  }
}
