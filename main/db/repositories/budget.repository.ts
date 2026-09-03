import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  DEFAULT_BUDGET_CATEGORIES,
  EXPENSE_TO_BUDGET_KEY,
  alertLevelFor,
  dateInPeriod,
  periodsOverlap,
  remainingAmount,
  utilizationPercent,
  validateBudgetAmount,
  validatePeriod,
  type AlertLevel,
} from '../../domain/budget'
import { round2 } from '../../domain/finance'
import type {
  Budget,
  BudgetAlert,
  BudgetAlertLevel,
  BudgetCategory,
  BudgetPeriodType,
  BudgetStatus,
} from '../types'
import { BaseRepository } from './base'

export interface BudgetRowDto {
  id: string
  academic_year_id: string
  year_name: string | null
  budget_category_id: string
  category_name: string
  category_key: string
  period_type: BudgetPeriodType
  period_start: string
  period_end: string
  allocated_amount: number
  spent: number
  remaining: number
  utilization: number
  status: BudgetStatus
  description: string | null
  alert: AlertLevel
  latest_alert: string | null
}

export class BudgetRepository extends BaseRepository<Budget> {
  constructor(db: Database.Database) {
    super(db, 'budgets')
  }

  ensureCategories(schoolId: string): void {
    for (const seed of DEFAULT_BUDGET_CATEGORIES) {
      const existing = this.db
        .prepare(
          `SELECT id FROM budget_categories
           WHERE school_id = ? AND category_key = ? AND deleted_at IS NULL`
        )
        .get(schoolId, seed.key) as { id: string } | undefined
      if (existing) continue
      const record: BudgetCategory = {
        ...this.buildBaseFields(),
        school_id: schoolId,
        name: seed.name,
        category_key: seed.key,
        is_system: 1,
        is_active: 1,
        sort_order: seed.sort_order,
      }
      this.db
        .prepare(
          `INSERT INTO budget_categories (
             id, school_id, name, category_key, is_system, is_active, sort_order,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @name, @category_key, @is_system, @is_active, @sort_order,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(record)
      enqueueSync(
        this.db,
        'budget_categories',
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
    }
  }

  listCategories(schoolId: string): BudgetCategory[] {
    this.ensureCategories(schoolId)
    return this.db
      .prepare(
        `SELECT * FROM budget_categories
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY sort_order, name`
      )
      .all(schoolId) as BudgetCategory[]
  }

  createCategory(input: {
    school_id: string
    name: string
    category_key?: string
  }): BudgetCategory {
    this.ensureCategories(input.school_id)
    const name = input.name.trim()
    if (!name) throw new Error('Category name is required.')
    const key =
      input.category_key?.trim() ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^-|-$/g, '')
    const record: BudgetCategory = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      name,
      category_key: key,
      is_system: 0,
      is_active: 1,
      sort_order: 99,
    }
    this.db
      .prepare(
        `INSERT INTO budget_categories (
           id, school_id, name, category_key, is_system, is_active, sort_order,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @name, @category_key, @is_system, @is_active, @sort_order,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'budget_categories',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  private schoolThresholds(schoolId: string): {
    alert: number
    warning: number
    critical: number
  } {
    const row = this.db
      .prepare(
        `SELECT budget_alert_pct, budget_warning_pct, budget_critical_pct
         FROM finance_settings WHERE school_id = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(schoolId) as
      | {
          budget_alert_pct: number | null
          budget_warning_pct: number | null
          budget_critical_pct: number | null
        }
      | undefined
    return {
      alert: row?.budget_alert_pct ?? 70,
      warning: row?.budget_warning_pct ?? 85,
      critical: row?.budget_critical_pct ?? 100,
    }
  }

  spentFor(budget: Budget, categoryKey: string): number {
    const expenseKeys = Object.entries(EXPENSE_TO_BUDGET_KEY)
      .filter(([, mapped]) => mapped === categoryKey)
      .map(([k]) => k)
    const keys = expenseKeys.length ? expenseKeys : [categoryKey]
    const placeholders = keys.map(() => '?').join(',')
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
         WHERE school_id = ? AND deleted_at IS NULL
           AND category IN (${placeholders})
           AND expense_date >= ? AND expense_date <= ?`
      )
      .get(
        budget.school_id,
        ...keys,
        budget.period_start,
        budget.period_end
      ) as { total: number }
    return round2(row.total || 0)
  }

  list(schoolId: string, yearId?: string | null): BudgetRowDto[] {
    this.ensureCategories(schoolId)
    const params: Array<string> = [schoolId]
    let sql = `
      SELECT b.*, c.name AS category_name, c.category_key, y.name AS year_name
      FROM budgets b
      JOIN budget_categories c ON c.id = b.budget_category_id
      LEFT JOIN academic_years y ON y.id = b.academic_year_id
      WHERE b.school_id = ? AND b.deleted_at IS NULL
    `
    if (yearId) {
      sql += ` AND b.academic_year_id = ?`
      params.push(yearId)
    }
    sql += ` ORDER BY c.sort_order, b.period_start DESC`
    const rows = this.db.prepare(sql).all(...params) as Array<
      Budget & { category_name: string; category_key: string; year_name: string | null }
    >
    const schoolTh = this.schoolThresholds(schoolId)
    return rows.map((b) => {
      const spent = this.spentFor(b, b.category_key)
      const allocated = b.allocated_amount
      const utilization = utilizationPercent(allocated, spent)
      const thresholds = {
        alert: b.alert_pct ?? schoolTh.alert,
        warning: b.warning_pct ?? schoolTh.warning,
        critical: b.critical_pct ?? schoolTh.critical,
      }
      const latest = this.db
        .prepare(
          `SELECT message FROM budget_alerts
           WHERE budget_id = ? AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(b.id) as { message: string } | undefined
      return {
        id: b.id,
        academic_year_id: b.academic_year_id,
        year_name: b.year_name,
        budget_category_id: b.budget_category_id,
        category_name: b.category_name,
        category_key: b.category_key,
        period_type: b.period_type,
        period_start: b.period_start,
        period_end: b.period_end,
        allocated_amount: allocated,
        spent,
        remaining: remainingAmount(allocated, spent),
        utilization,
        status: b.status,
        description: b.description,
        alert: alertLevelFor(utilization, thresholds),
        latest_alert: latest?.message ?? null,
      }
    })
  }

  create(input: {
    school_id: string
    academic_year_id: string
    budget_category_id: string
    period_type: BudgetPeriodType
    period_start: string
    period_end: string
    allocated_amount: number
    description?: string | null
    status?: BudgetStatus
    alert_pct?: number | null
    warning_pct?: number | null
    critical_pct?: number | null
    created_by?: string | null
  }): Budget {
    validateBudgetAmount(input.allocated_amount)
    validatePeriod(input.period_start, input.period_end)
    const status = input.status ?? 'active'
    if (status === 'active') {
      const cat = this.db
        .prepare(
          `SELECT category_key FROM budget_categories WHERE id = ? AND deleted_at IS NULL`
        )
        .get(input.budget_category_id) as { category_key: string } | undefined
      const existing = this.db
        .prepare(
          `SELECT b.* FROM budgets b
           WHERE b.school_id = ? AND b.budget_category_id = ? AND b.status = 'active'
             AND b.deleted_at IS NULL AND b.academic_year_id = ?`
        )
        .all(
          input.school_id,
          input.budget_category_id,
          input.academic_year_id
        ) as Budget[]
      const clash = existing.find((b) =>
        periodsOverlap(
          b.period_start,
          b.period_end,
          input.period_start,
          input.period_end
        )
      )
      if (clash) {
        throw new Error(
          `An active ${cat?.category_key ?? 'category'} budget already covers this period.`
        )
      }
    }

    const record: Budget = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      academic_year_id: input.academic_year_id,
      budget_category_id: input.budget_category_id,
      period_type: input.period_type,
      period_start: input.period_start,
      period_end: input.period_end,
      allocated_amount: round2(input.allocated_amount),
      description: input.description?.trim() || null,
      status,
      alert_pct: input.alert_pct ?? null,
      warning_pct: input.warning_pct ?? null,
      critical_pct: input.critical_pct ?? null,
      created_by: input.created_by ?? null,
    }
    this.db
      .prepare(
        `INSERT INTO budgets (
           id, school_id, academic_year_id, budget_category_id, period_type,
           period_start, period_end, allocated_amount, description, status,
           alert_pct, warning_pct, critical_pct, created_by,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @academic_year_id, @budget_category_id, @period_type,
           @period_start, @period_end, @allocated_amount, @description, @status,
           @alert_pct, @warning_pct, @critical_pct, @created_by,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'budgets',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  update(id: string, schoolId: string, patch: Partial<Budget>): Budget {
    const existing = this.findById(id)
    if (!existing || existing.school_id !== schoolId) {
      throw new Error('Budget not found.')
    }
    const record: Budget = {
      ...existing,
      ...patch,
      allocated_amount: round2(patch.allocated_amount ?? existing.allocated_amount),
      ...this.applyUpdateMeta(existing),
    }
    if (record.allocated_amount) validateBudgetAmount(record.allocated_amount)
    validatePeriod(record.period_start, record.period_end)
    this.db
      .prepare(
        `UPDATE budgets SET
           period_type = @period_type, period_start = @period_start, period_end = @period_end,
           allocated_amount = @allocated_amount, description = @description, status = @status,
           alert_pct = @alert_pct, warning_pct = @warning_pct, critical_pct = @critical_pct,
           updated_at = @updated_at, version = @version, sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)
    enqueueSync(
      this.db,
      'budgets',
      record.id,
      'UPDATE',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  saveThresholds(
    schoolId: string,
    input: { alert: number; warning: number; critical: number }
  ): void {
    this.db
      .prepare(
        `UPDATE finance_settings
         SET budget_alert_pct = @alert,
             budget_warning_pct = @warning,
             budget_critical_pct = @critical
         WHERE school_id = @school_id AND deleted_at IS NULL`
      )
      .run({
        alert: input.alert,
        warning: input.warning,
        critical: input.critical,
        school_id: schoolId,
      })
  }

  /** Recalculate matching budgets after an expense is posted. */
  applyExpense(input: {
    school_id: string
    category: string
    amount: number
    expense_date: string
  }): BudgetAlert[] {
    const mapped = EXPENSE_TO_BUDGET_KEY[input.category] || input.category
    const matching = this.db
      .prepare(
        `SELECT b.*, c.category_key, c.name AS category_name
         FROM budgets b
         JOIN budget_categories c ON c.id = b.budget_category_id
         WHERE b.school_id = ? AND b.status = 'active' AND b.deleted_at IS NULL
           AND c.category_key = ?`
      )
      .all(input.school_id, mapped) as Array<
      Budget & { category_key: string; category_name: string }
    >
    const schoolTh = this.schoolThresholds(input.school_id)
    const created: BudgetAlert[] = []
    for (const budget of matching) {
      if (
        !dateInPeriod(input.expense_date, budget.period_start, budget.period_end)
      ) {
        continue
      }
      const spent = this.spentFor(budget, budget.category_key)
      const utilization = utilizationPercent(budget.allocated_amount, spent)
      const thresholds = {
        alert: budget.alert_pct ?? schoolTh.alert,
        warning: budget.warning_pct ?? schoolTh.warning,
        critical: budget.critical_pct ?? schoolTh.critical,
      }
      const level = alertLevelFor(utilization, thresholds)
      if (level === 'none') continue
      const already = this.db
        .prepare(
          `SELECT id FROM budget_alerts
           WHERE budget_id = ? AND level = ? AND deleted_at IS NULL LIMIT 1`
        )
        .get(budget.id, level) as { id: string } | undefined
      if (already) continue
      const message = `${budget.category_name} is at ${utilization}% (${level}).`
      const alert: BudgetAlert = {
        ...this.buildBaseFields(),
        school_id: input.school_id,
        budget_id: budget.id,
        level: level as BudgetAlertLevel,
        utilization,
        spent,
        allocated: budget.allocated_amount,
        message,
      }
      this.db
        .prepare(
          `INSERT INTO budget_alerts (
             id, school_id, budget_id, level, utilization, spent, allocated, message,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @budget_id, @level, @utilization, @spent, @allocated, @message,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(alert)
      enqueueSync(
        this.db,
        'budget_alerts',
        alert.id,
        'INSERT',
        alert as unknown as Record<string, unknown>
      )
      created.push(alert)
    }
    return created
  }
}
