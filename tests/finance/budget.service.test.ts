import { BudgetService, type BudgetRecord, type ExpenseSpend } from '../../main/services/budget'

function budget(overrides: Partial<BudgetRecord> = {}): BudgetRecord {
  return {
    id: 'b1',
    school_id: 'school_1',
    academic_year_id: 'year_1',
    category_key: 'utilities',
    period_start: '2026-09-01',
    period_end: '2027-06-30',
    allocated_amount: 1_000_000,
    status: 'active',
    alert_pct: 70,
    warning_pct: 85,
    critical_pct: 100,
    ...overrides,
  }
}

function store(seed?: { budgets?: BudgetRecord[]; expenses?: ExpenseSpend[] }) {
  const budgets = seed?.budgets ?? []
  const expenseRows = seed?.expenses ?? []
  return {
    list: (schoolId: string) => budgets.filter((b) => b.school_id === schoolId),
    insert: (row: BudgetRecord) => {
      budgets.push(row)
      return row
    },
    expenses: (schoolId: string) =>
      expenseRows.filter((e) => e.school_id === schoolId),
  }
}

describe('BudgetService', () => {
  it('creates a budget with remaining equal to allocation', () => {
    const db = store()
    const service = new BudgetService(db)
    const { id: _id, ...input } = budget()
    const row = service.create(input)
    const snap = service.snapshot(row)
    expect(row.allocated_amount).toBe(1_000_000)
    expect(snap.spent).toBe(0)
    expect(snap.remaining).toBe(1_000_000)
    expect(snap.utilization).toBe(0)
    expect(snap.alert).toBe('none')
  })

  it('rejects non-positive amounts', () => {
    const service = new BudgetService(store())
    expect(() =>
      service.create({ ...budget(), allocated_amount: 0 })
    ).toThrow(/greater than 0/)
  })

  it('rejects overlapping active budgets for the same category and year', () => {
    const existing = budget({ id: 'existing' })
    const service = new BudgetService(store({ budgets: [existing] }))
    expect(() =>
      service.create({
        ...(() => {
          const { id, ...rest } = budget()
          void id
          return rest
        })(),
        period_start: '2026-10-01',
        period_end: '2026-12-31',
      })
    ).toThrow(/already exists/)
  })

  it('maps expenses onto utilization and remaining', () => {
    const row = budget()
    const service = new BudgetService(
      store({
        budgets: [row],
        expenses: [
          {
            school_id: 'school_1',
            category: 'utilities',
            amount: 720_000,
            expense_date: '2026-11-01',
          },
        ],
      })
    )
    const snap = service.snapshot(row)
    expect(snap.spent).toBe(720_000)
    expect(snap.remaining).toBe(280_000)
    expect(snap.utilization).toBe(72)
    expect(snap.alert).toBe('alert')
  })

  it('raises warning then critical as thresholds are crossed', () => {
    const row = budget()
    const warning = new BudgetService(
      store({
        budgets: [row],
        expenses: [
          {
            school_id: 'school_1',
            category: 'utilities',
            amount: 860_000,
            expense_date: '2026-12-01',
          },
        ],
      })
    ).snapshot(row)
    expect(warning.alert).toBe('warning')

    const critical = new BudgetService(
      store({
        budgets: [row],
        expenses: [
          {
            school_id: 'school_1',
            category: 'utilities',
            amount: 1_000_000,
            expense_date: '2026-12-01',
          },
        ],
      })
    ).snapshot(row)
    expect(critical.alert).toBe('critical')
    expect(critical.remaining).toBe(0)
  })

  it('maps supplies expenses onto teaching materials budgets', () => {
    const row = budget({ category_key: 'teaching_materials' })
    const service = new BudgetService(
      store({
        budgets: [row],
        expenses: [
          {
            school_id: 'school_1',
            category: 'supplies',
            amount: 50_000,
            expense_date: '2026-10-01',
          },
        ],
      })
    )
    expect(service.spentFor(row)).toBe(50_000)
  })
})
