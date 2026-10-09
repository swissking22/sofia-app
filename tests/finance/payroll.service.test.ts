import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import {
  computePayslipTotals,
  monthBounds,
  salaryCoversPeriod,
} from '../../main/domain/payroll'

describe('payroll domain helpers', () => {
  it('computes month bounds', () => {
    expect(monthBounds(2026, 2)).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    })
    expect(monthBounds(2024, 2).end).toBe('2024-02-29')
  })

  it('checks salary coverage', () => {
    expect(
      salaryCoversPeriod(
        { effective_from: '2026-01-01', effective_to: null },
        '2026-03-01',
        '2026-03-31'
      )
    ).toBe(true)
    expect(
      salaryCoversPeriod(
        { effective_from: '2026-04-01', effective_to: null },
        '2026-03-01',
        '2026-03-31'
      )
    ).toBe(false)
  })

  it('computes gross / deductions / net', () => {
    expect(
      computePayslipTotals([
        { line_type: 'earning', amount: 100_000 },
        { line_type: 'deduction', amount: 5_000.555 },
      ])
    ).toEqual({ gross: 100_000, deductions: 5_000.56, net: 94_999.45 })
  })
})

describe('PayrollRepository', () => {
  let db: Database.Database
  let repos: ReturnType<typeof createRepositories>
  let schoolId: string
  let staffId: string

  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
    repos = createRepositories(db)
    const school = repos.schools.create({
      name: 'Payroll School',
      short_code: 'PAY',
      email: 'admin@pay.school',
    })
    schoolId = school.id
    repos.finance.ensureDefaults(schoolId)
    const staff = repos.staff.create({
      school_id: schoolId,
      full_name: 'Ada Teacher',
      gender: null,
      phone: null,
      email: null,
      staff_type: 'teaching',
      admin_role: null,
      department_id: null,
      status: 'active',
      user_id: null,
      employee_code: 'EMP-001',
      joining_date: '2026-01-01',
      address: null,
      job_role: 'teacher',
    })
    staffId = staff.id
  })

  afterEach(() => {
    db.close()
  })

  it('sets monthly salary and generates + pays a payslip into salaries expense', () => {
    const term = repos.payroll.setMonthlySalary({
      school_id: schoolId,
      staff_id: staffId,
      amount: 150_000,
      effective_from: '2026-01-01',
    })
    expect(term.amount).toBe(150_000)

    const generated = repos.payroll.generateMonth({
      school_id: schoolId,
      year: 2026,
      month: 3,
      userId: null,
    })
    expect(generated.created).toHaveLength(1)
    expect(generated.created[0].net_amount).toBe(150_000)
    expect(generated.created[0].status).toBe('issued')
    expect(generated.created[0].payslip_number).toMatch(/^PSL-/)

    const again = repos.payroll.generateMonth({
      school_id: schoolId,
      year: 2026,
      month: 3,
      userId: null,
    })
    expect(again.created).toHaveLength(0)
    expect(again.skipped).toBeGreaterThanOrEqual(1)

    const paid = repos.payroll.markPaid({
      school_id: schoolId,
      payslip_id: generated.created[0].id,
      payment_method: 'cash',
      paid_at: '2026-03-31',
      userId: null,
    })
    expect(paid.payslip.status).toBe('paid')
    expect(paid.expense_id).toBeTruthy()

    const expense = repos.financeMgmt
      .listExpenses(schoolId)
      .find((e) => e.id === paid.expense_id)
    expect(expense).toBeTruthy()
    expect(expense?.category).toBe('salaries')
    expect(expense?.amount).toBe(150_000)
    expect(expense?.description).toMatch(/PSL-/)
  })

  it('skips staff without a salary term', () => {
    const result = repos.payroll.generateMonth({
      school_id: schoolId,
      year: 2026,
      month: 4,
      userId: null,
    })
    expect(result.created).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })
})
