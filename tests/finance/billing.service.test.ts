import {
  FeeStructureService,
  BillingService,
} from '../../main/services/finance'
import {
  buildFeeLine,
  buildFeeStructure,
  buildInvoice,
  resetIds,
} from '../fixtures/builders'
import { createInMemoryFinanceMocks } from '../mocks/repositories'

describe('FeeStructureService - create', () => {
  beforeEach(() => resetIds())

  it('creates a valid fee structure with termly lines', () => {
    const { feeStructureRepo } = createInMemoryFinanceMocks()
    const service = new FeeStructureService(feeStructureRepo)

    const created = service.create({
      school_id: 'school_1',
      name: 'Form 1 Fees',
      academic_year_id: 'year_2026',
      class_id: 'class_1',
      lines: [
        { name: 'Tuition', amount: 80_000, frequency: 'termly' },
        { name: 'Lab', amount: 20_000, frequency: 'termly' },
      ],
    })

    expect(created.name).toBe('Form 1 Fees')
    expect(created.class_id).toBe('class_1')
    expect(feeStructureRepo.getStructureLines(created.id)).toHaveLength(2)
  })

  it('rejects duplicate active structures for same class + year', () => {
    const existing = buildFeeStructure({
      id: 'fs_existing',
      academic_year_id: 'year_2026',
      class_id: 'class_1',
      is_active: 1,
    })
    const { feeStructureRepo } = createInMemoryFinanceMocks({
      structures: [existing],
    })
    const service = new FeeStructureService(feeStructureRepo)

    expect(() =>
      service.create({
        school_id: 'school_1',
        name: 'Duplicate',
        academic_year_id: 'year_2026',
        class_id: 'class_1',
        lines: [{ name: 'Tuition', amount: 50_000 }],
      })
    ).toThrow(/already exists for this class and academic year/i)
  })

  it('rejects invalid fee frequency types', () => {
    const { feeStructureRepo } = createInMemoryFinanceMocks()
    const service = new FeeStructureService(feeStructureRepo)

    expect(() =>
      service.create({
        school_id: 'school_1',
        name: 'Bad freq',
        academic_year_id: 'year_2026',
        lines: [
          {
            name: 'Tuition',
            amount: 10_000,
            frequency: 'weekly' as 'monthly',
          },
        ],
      })
    ).toThrow(/Invalid fee frequency/i)
  })

  it('applies percent and fixed discounts correctly', () => {
    const { feeStructureRepo } = createInMemoryFinanceMocks()
    const service = new FeeStructureService(feeStructureRepo)

    expect(service.applyDiscount(100_000, 'percent', 10)).toEqual({
      discount_total: 10_000,
      net_payable: 90_000,
    })
    expect(service.applyDiscount(100_000, 'fixed', 15_000)).toEqual({
      discount_total: 15_000,
      net_payable: 85_000,
    })
    // Discount cannot exceed subtotal
    expect(service.applyDiscount(10_000, 'fixed', 50_000).net_payable).toBe(0)
  })
})

describe('BillingService - generateInvoice', () => {
  beforeEach(() => resetIds())

  function setupBilling() {
    const structure = buildFeeStructure({ id: 'fs_1' })
    const lines = [
      buildFeeLine({
        id: 'l1',
        fee_structure_id: 'fs_1',
        name: 'Tuition',
        amount: 80_000,
      }),
      buildFeeLine({
        id: 'l2',
        fee_structure_id: 'fs_1',
        name: 'Lab',
        amount: 20_000,
      }),
    ]
    const mocks = createInMemoryFinanceMocks({ structures: [structure], lines })
    const service = new BillingService(
      mocks.feeStructureRepo,
      mocks.invoiceRepo,
      mocks.paymentRepo
    )
    return { service, mocks }
  }

  it('generates an invoice whose total equals the sum of components', () => {
    const { service } = setupBilling()
    const invoice = service.generateInvoice({
      school_id: 'school_1',
      student_id: 'student_1',
      fee_structure_id: 'fs_1',
      due_date: '2099-09-30',
    })

    expect(invoice.subtotal).toBe(100_000)
    expect(invoice.discount_total).toBe(0)
    expect(invoice.net_payable).toBe(100_000)
    expect(invoice.balance).toBe(100_000)
    expect(invoice.status).toBe('pending')
  })

  it('applies percent discount and computes net payable correctly', () => {
    const { service } = setupBilling()
    const invoice = service.generateInvoice({
      school_id: 'school_1',
      student_id: 'student_1',
      fee_structure_id: 'fs_1',
      discount_mode: 'percent',
      discount_value: 10,
    })

    expect(invoice.subtotal).toBe(100_000)
    expect(invoice.discount_total).toBe(10_000)
    expect(invoice.net_payable).toBe(90_000)
    expect(invoice.balance).toBe(90_000)
  })

  it('carries forward unpaid balances into the new invoice', () => {
    const structure = buildFeeStructure({ id: 'fs_1' })
    const lines = [
      buildFeeLine({ fee_structure_id: 'fs_1', amount: 50_000 }),
    ]
    const prior = buildInvoice({
      id: 'inv_old',
      status: 'partially_paid',
      net_payable: 40_000,
      amount_paid: 10_000,
      balance: 30_000,
    })
    const mocks = createInMemoryFinanceMocks({
      structures: [structure],
      lines,
      invoices: [prior],
    })
    const service = new BillingService(
      mocks.feeStructureRepo,
      mocks.invoiceRepo,
      mocks.paymentRepo
    )

    const invoice = service.generateInvoice({
      school_id: 'school_1',
      student_id: 'student_1',
      fee_structure_id: 'fs_1',
      carry_arrears: true,
    })

    expect(invoice.subtotal).toBe(80_000) // 50k + 30k arrears
    expect(invoice.carried_from_invoice_id).toBe('inv_old')
  })

  it('never produces a negative net payable even with oversized discount', () => {
    const { service } = setupBilling()
    const invoice = service.generateInvoice({
      school_id: 'school_1',
      student_id: 'student_1',
      fee_structure_id: 'fs_1',
      discount_mode: 'fixed',
      discount_value: 999_999,
    })
    expect(invoice.net_payable).toBe(0)
    expect(invoice.balance).toBe(0)
    expect(invoice.status).toBe('paid')
  })

  it('marks invoice overdue when due date is in the past and unpaid', () => {
    const { service } = setupBilling()
    const invoice = service.generateInvoice({
      school_id: 'school_1',
      student_id: 'student_1',
      fee_structure_id: 'fs_1',
      due_date: '2026-01-01',
      today: '2026-08-06',
    })
    expect(invoice.status).toBe('overdue')
  })

  it('rejects inactive fee structures', () => {
    const structure = buildFeeStructure({ id: 'fs_1', is_active: 0 })
    const mocks = createInMemoryFinanceMocks({
      structures: [structure],
      lines: [buildFeeLine({ fee_structure_id: 'fs_1' })],
    })
    const service = new BillingService(
      mocks.feeStructureRepo,
      mocks.invoiceRepo,
      mocks.paymentRepo
    )

    expect(() =>
      service.generateInvoice({
        school_id: 'school_1',
        student_id: 'student_1',
        fee_structure_id: 'fs_1',
      })
    ).toThrow(/inactive/i)
  })
})
