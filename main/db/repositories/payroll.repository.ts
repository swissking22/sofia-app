import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  computePayslipTotals,
  monthBounds,
  salaryCoversPeriod,
} from '../../domain/payroll'
import { padNum, round2, todayIso } from '../../domain/finance'
import type {
  FinanceSettings,
  Payslip,
  PayslipLine,
  PayslipStatus,
  StaffSalaryTerm,
} from '../types'
import { BaseRepository } from './base'
import type { FinanceMgmtRepository } from './finance-mgmt.repository'

export type PayslipDto = Payslip & {
  staff_name: string
  employee_code: string | null
  expense_number: string | null
  lines: PayslipLine[]
}

export class PayrollRepository extends BaseRepository<Payslip> {
  constructor(
    db: Database.Database,
    private readonly financeMgmt: FinanceMgmtRepository
  ) {
    super(db, 'payslips')
  }

  /* ---------- Salary terms ---------- */

  listSalaryTerms(schoolId: string, staffId?: string): StaffSalaryTerm[] {
    if (staffId) {
      return this.db
        .prepare(
          `SELECT * FROM staff_salary_terms
           WHERE school_id = ? AND staff_id = ? AND deleted_at IS NULL
           ORDER BY effective_from DESC`
        )
        .all(schoolId, staffId) as StaffSalaryTerm[]
    }
    return this.db
      .prepare(
        `SELECT * FROM staff_salary_terms
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY effective_from DESC`
      )
      .all(schoolId) as StaffSalaryTerm[]
  }

  currentSalary(
    schoolId: string,
    staffId: string,
    onDate = todayIso()
  ): StaffSalaryTerm | null {
    const rows = this.listSalaryTerms(schoolId, staffId)
    return (
      rows.find(
        (t) =>
          t.effective_from <= onDate &&
          (!t.effective_to || t.effective_to >= onDate)
      ) || null
    )
  }

  setMonthlySalary(input: {
    school_id: string
    staff_id: string
    amount: number
    effective_from?: string
    currency?: string
    notes?: string | null
  }): StaffSalaryTerm {
    if (!(input.amount > 0)) throw new Error('Salary amount must be positive.')
    const staff = this.db
      .prepare(
        `SELECT id FROM staff WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .get(input.staff_id, input.school_id) as { id: string } | undefined
    if (!staff) throw new Error('Staff member not found.')

    const effectiveFrom = input.effective_from || todayIso()
    const currency =
      input.currency || this.safeCurrency(input.school_id) || 'XAF'

    const tx = this.db.transaction(() => {
      const open = this.db
        .prepare(
          `SELECT * FROM staff_salary_terms
           WHERE school_id = ? AND staff_id = ?
             AND deleted_at IS NULL AND effective_to IS NULL
           ORDER BY effective_from DESC LIMIT 1`
        )
        .get(input.school_id, input.staff_id) as StaffSalaryTerm | undefined

      if (open) {
        if (open.amount === round2(input.amount) && open.currency === currency) {
          return open
        }
        const dayBefore = new Date(`${effectiveFrom}T00:00:00Z`)
        dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
        const closeDate = dayBefore.toISOString().slice(0, 10)
        if (closeDate >= open.effective_from) {
          const closed: StaffSalaryTerm = {
            ...open,
            effective_to: closeDate,
            ...this.applyUpdateMeta(open),
          }
          this.db
            .prepare(
              `UPDATE staff_salary_terms
               SET effective_to = @effective_to, updated_at = @updated_at,
                   version = @version, sync_status = @sync_status
               WHERE id = @id`
            )
            .run(closed)
          enqueueSync(
            this.db,
            'staff_salary_terms',
            closed.id,
            'UPDATE',
            closed as unknown as Record<string, unknown>
          )
        }
      }

      const record: StaffSalaryTerm = {
        ...this.buildBaseFields(),
        school_id: input.school_id,
        staff_id: input.staff_id,
        amount: round2(input.amount),
        currency,
        pay_frequency: 'monthly',
        effective_from: effectiveFrom,
        effective_to: null,
        notes: input.notes?.trim() || null,
      }
      this.db
        .prepare(
          `INSERT INTO staff_salary_terms (
             id, school_id, staff_id, amount, currency, pay_frequency,
             effective_from, effective_to, notes,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @staff_id, @amount, @currency, @pay_frequency,
             @effective_from, @effective_to, @notes,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(record)
      enqueueSync(
        this.db,
        'staff_salary_terms',
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
      return record
    })
    return tx()
  }

  /* ---------- Payslips ---------- */

  listPayslips(
    schoolId: string,
    filters?: { year?: number; month?: number; status?: PayslipStatus | 'all' }
  ): PayslipDto[] {
    let rows = this.db
      .prepare(
        `SELECT p.*,
                s.full_name AS staff_name,
                s.employee_code AS employee_code,
                e.expense_number AS expense_number
         FROM payslips p
         JOIN staff s ON s.id = p.staff_id
         LEFT JOIN expenses e ON e.id = p.expense_id AND e.deleted_at IS NULL
         WHERE p.school_id = ? AND p.deleted_at IS NULL
         ORDER BY p.period_year DESC, p.period_month DESC, s.full_name ASC`
      )
      .all(schoolId) as Array<
      Payslip & {
        staff_name: string
        employee_code: string | null
        expense_number: string | null
      }
    >
    if (filters?.year) rows = rows.filter((r) => r.period_year === filters.year)
    if (filters?.month) {
      rows = rows.filter((r) => r.period_month === filters.month)
    }
    if (filters?.status && filters.status !== 'all') {
      rows = rows.filter((r) => r.status === filters.status)
    }
    return rows.map((r) => ({
      ...r,
      lines: this.listLines(r.id),
    }))
  }

  getPayslip(schoolId: string, id: string): PayslipDto | null {
    const row = this.db
      .prepare(
        `SELECT p.*,
                s.full_name AS staff_name,
                s.employee_code AS employee_code,
                e.expense_number AS expense_number
         FROM payslips p
         JOIN staff s ON s.id = p.staff_id
         LEFT JOIN expenses e ON e.id = p.expense_id AND e.deleted_at IS NULL
         WHERE p.id = ? AND p.school_id = ? AND p.deleted_at IS NULL`
      )
      .get(id, schoolId) as
      | (Payslip & {
          staff_name: string
          employee_code: string | null
          expense_number: string | null
        })
      | undefined
    if (!row) return null
    return { ...row, lines: this.listLines(row.id) }
  }

  private listLines(payslipId: string): PayslipLine[] {
    return this.db
      .prepare(
        `SELECT * FROM payslip_lines
         WHERE payslip_id = ? AND deleted_at IS NULL
         ORDER BY sort_order ASC, created_at ASC`
      )
      .all(payslipId) as PayslipLine[]
  }

  private bumpPayslipNumber(schoolId: string): string {
    const settings = this.financeMgmt.getSettings(schoolId)
    const prefix = settings.payslip_prefix || 'PSL'
    const next = settings.payslip_next_number ?? 1
    const code = `${prefix}-${padNum(next)}`
    const updated: FinanceSettings = {
      ...settings,
      payslip_prefix: prefix,
      payslip_next_number: next + 1,
      ...this.applyUpdateMeta(settings),
    }
    this.db
      .prepare(
        `UPDATE finance_settings
         SET payslip_prefix = @payslip_prefix,
             payslip_next_number = @payslip_next_number,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`
      )
      .run({
        id: updated.id,
        payslip_prefix: updated.payslip_prefix,
        payslip_next_number: updated.payslip_next_number,
        updated_at: updated.updated_at,
        version: updated.version,
        sync_status: updated.sync_status,
      })
    enqueueSync(
      this.db,
      'finance_settings',
      updated.id,
      'UPDATE',
      updated as unknown as Record<string, unknown>
    )
    return code
  }

  private safeCurrency(schoolId: string): string {
    try {
      return this.financeMgmt.getSettings(schoolId).currency || 'XAF'
    } catch {
      return 'XAF'
    }
  }

  /**
   * Generate issued payslips for all active staff with a salary covering the month.
   * Skips staff who already have a non-void payslip for that period.
   */
  generateMonth(input: {
    school_id: string
    year: number
    month: number
    issue_date?: string
    userId: string | null
  }): { created: PayslipDto[]; skipped: number } {
    if (input.month < 1 || input.month > 12) {
      throw new Error('Month must be between 1 and 12.')
    }
    const { start, end } = monthBounds(input.year, input.month)
    const issueDate = input.issue_date || end
    const currency = this.safeCurrency(input.school_id)

    const staffRows = this.db
      .prepare(
        `SELECT id, full_name FROM staff
         WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'
         ORDER BY full_name ASC`
      )
      .all(input.school_id) as Array<{ id: string; full_name: string }>

    const created: PayslipDto[] = []
    let skipped = 0

    const tx = this.db.transaction(() => {
      for (const staff of staffRows) {
        const existing = this.db
          .prepare(
            `SELECT id, status FROM payslips
             WHERE school_id = ? AND staff_id = ?
               AND period_year = ? AND period_month = ?
               AND deleted_at IS NULL
             LIMIT 1`
          )
          .get(
            input.school_id,
            staff.id,
            input.year,
            input.month
          ) as { id: string; status: string } | undefined
        if (existing && existing.status !== 'void') {
          skipped += 1
          continue
        }

        const terms = this.listSalaryTerms(input.school_id, staff.id)
        const term = terms.find((t) => salaryCoversPeriod(t, start, end))
        if (!term || !(term.amount > 0)) {
          skipped += 1
          continue
        }

        const payslipNumber = this.bumpPayslipNumber(input.school_id)
        const payslip: Payslip = {
          ...this.buildBaseFields(),
          school_id: input.school_id,
          staff_id: staff.id,
          payslip_number: payslipNumber,
          period_year: input.year,
          period_month: input.month,
          issue_date: issueDate,
          paid_at: null,
          status: 'issued',
          currency: term.currency || currency,
          gross_amount: round2(term.amount),
          deduction_amount: 0,
          net_amount: round2(term.amount),
          expense_id: null,
          payment_method: null,
          notes: null,
        }

        this.db
          .prepare(
            `INSERT INTO payslips (
               id, school_id, staff_id, payslip_number, period_year, period_month,
               issue_date, paid_at, status, currency, gross_amount, deduction_amount,
               net_amount, expense_id, payment_method, notes,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (
               @id, @school_id, @staff_id, @payslip_number, @period_year, @period_month,
               @issue_date, @paid_at, @status, @currency, @gross_amount, @deduction_amount,
               @net_amount, @expense_id, @payment_method, @notes,
               @created_at, @updated_at, @deleted_at, @sync_status, @version
             )`
          )
          .run(payslip)

        const line: PayslipLine = {
          ...this.buildBaseFields(),
          school_id: input.school_id,
          payslip_id: payslip.id,
          line_type: 'earning',
          description: 'Monthly salary',
          amount: round2(term.amount),
          sort_order: 0,
        }
        this.db
          .prepare(
            `INSERT INTO payslip_lines (
               id, school_id, payslip_id, line_type, description, amount, sort_order,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (
               @id, @school_id, @payslip_id, @line_type, @description, @amount, @sort_order,
               @created_at, @updated_at, @deleted_at, @sync_status, @version
             )`
          )
          .run(line)

        enqueueSync(
          this.db,
          'payslips',
          payslip.id,
          'INSERT',
          payslip as unknown as Record<string, unknown>
        )
        enqueueSync(
          this.db,
          'payslip_lines',
          line.id,
          'INSERT',
          line as unknown as Record<string, unknown>
        )

        created.push({
          ...payslip,
          staff_name: staff.full_name,
          employee_code: null,
          expense_number: null,
          lines: [line],
        })
      }
    })
    tx()
    void input.userId
    return { created, skipped }
  }

  /**
   * Mark payslip paid: create salaries expense (budget-traced) and link it.
   */
  markPaid(input: {
    school_id: string
    payslip_id: string
    payment_method?: string | null
    paid_at?: string
    userId: string | null
  }): { payslip: PayslipDto; expense_id: string } {
    const payslip = this.getPayslip(input.school_id, input.payslip_id)
    if (!payslip) throw new Error('Payslip not found.')
    if (payslip.status === 'paid') {
      throw new Error('Payslip is already paid.')
    }
    if (payslip.status === 'void') {
      throw new Error('Cannot pay a void payslip.')
    }
    if (!(payslip.net_amount > 0)) {
      throw new Error('Payslip net amount must be positive.')
    }

    const paidAt = input.paid_at || todayIso()
    const expense = this.financeMgmt.createExpense({
      school_id: input.school_id,
      category: 'salaries',
      amount: payslip.net_amount,
      expense_date: paidAt,
      description: `Payslip ${payslip.payslip_number} — ${payslip.staff_name} (${String(payslip.period_month).padStart(2, '0')}/${payslip.period_year})`,
      vendor: payslip.staff_name,
      payment_method: input.payment_method ?? 'cash',
      userId: input.userId,
    })

    const totals = computePayslipTotals(payslip.lines)
    const updated: Payslip = {
      ...payslip,
      status: 'paid',
      paid_at: paidAt,
      expense_id: expense.id,
      payment_method: input.payment_method ?? 'cash',
      gross_amount: totals.gross,
      deduction_amount: totals.deductions,
      net_amount: totals.net,
      ...this.applyUpdateMeta(payslip),
    }

    this.db
      .prepare(
        `UPDATE payslips
         SET status = @status, paid_at = @paid_at, expense_id = @expense_id,
             payment_method = @payment_method, gross_amount = @gross_amount,
             deduction_amount = @deduction_amount, net_amount = @net_amount,
             updated_at = @updated_at, version = @version, sync_status = @sync_status
         WHERE id = @id`
      )
      .run(updated)

    enqueueSync(
      this.db,
      'payslips',
      updated.id,
      'UPDATE',
      updated as unknown as Record<string, unknown>
    )

    const dto = this.getPayslip(input.school_id, updated.id)
    if (!dto) throw new Error('Could not reload payslip after payment.')
    return { payslip: dto, expense_id: expense.id }
  }
}
