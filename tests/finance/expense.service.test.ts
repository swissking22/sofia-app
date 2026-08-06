import { ExpenseService } from '../../main/services/finance'
import { resetIds } from '../fixtures/builders'
import { createInMemoryFinanceMocks } from '../mocks/repositories'

describe('ExpenseService - create', () => {
  beforeEach(() => resetIds())

  it('creates a valid expense entry', () => {
    const { expenseRepo, expenses } = createInMemoryFinanceMocks()
    const service = new ExpenseService(expenseRepo)

    const expense = service.create({
      school_id: 'school_1',
      category: 'utilities',
      amount: 45_000.555,
      expense_date: '2026-08-01',
      description: 'Water bill',
    })

    expect(expense.amount).toBe(45_000.56)
    expect(expense.category).toBe('utilities')
    expect(expense.expense_number).toMatch(/^EXP-/)
    expect(expenses).toHaveLength(1)
  })

  it('requires expense date and valid category', () => {
    const { expenseRepo } = createInMemoryFinanceMocks()
    const service = new ExpenseService(expenseRepo)

    expect(() =>
      service.create({
        school_id: 'school_1',
        category: 'utilities',
        amount: 1000,
        expense_date: '',
      })
    ).toThrow(/date is required/i)

    expect(() =>
      service.create({
        school_id: 'school_1',
        category: 'pets',
        amount: 1000,
        expense_date: '2026-08-01',
      })
    ).toThrow(/Invalid expense category/i)
  })

  it('rejects zero and negative amounts', () => {
    const { expenseRepo } = createInMemoryFinanceMocks()
    const service = new ExpenseService(expenseRepo)

    expect(() =>
      service.create({
        school_id: 'school_1',
        category: 'supplies',
        amount: 0,
        expense_date: '2026-08-01',
      })
    ).toThrow(/must be positive/i)

    expect(() =>
      service.create({
        school_id: 'school_1',
        category: 'supplies',
        amount: -10,
        expense_date: '2026-08-01',
      })
    ).toThrow(/must be positive/i)
  })

  it('aggregates monthly totals by category correctly', () => {
    const { expenseRepo } = createInMemoryFinanceMocks()
    const service = new ExpenseService(expenseRepo)

    service.create({
      school_id: 'school_1',
      category: 'utilities',
      amount: 10_000,
      expense_date: '2026-08-05',
    })
    service.create({
      school_id: 'school_1',
      category: 'utilities',
      amount: 5_000,
      expense_date: '2026-08-20',
    })
    service.create({
      school_id: 'school_1',
      category: 'salaries',
      amount: 200_000,
      expense_date: '2026-08-28',
    })
    // Outside month
    service.create({
      school_id: 'school_1',
      category: 'salaries',
      amount: 50_000,
      expense_date: '2026-07-31',
    })

    const summary = service.monthlyTotals('school_1', 2026, 8)
    expect(summary.total).toBe(215_000)
    expect(summary.byCategory.utilities).toBe(15_000)
    expect(summary.byCategory.salaries).toBe(200_000)
  })
})
