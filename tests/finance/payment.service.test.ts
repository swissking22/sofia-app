import { PaymentService } from '../../main/services/finance'
import { buildInvoice, resetIds } from '../fixtures/builders'
import { createInMemoryFinanceMocks } from '../mocks/repositories'

describe('PaymentService - recordPayment', () => {
  beforeEach(() => resetIds())

  function setup(invoiceOverrides = {}, settingsOverrides = {}) {
    const invoice = buildInvoice({
      id: 'inv_1',
      invoice_number: 'INV-00001',
      net_payable: 100_000,
      amount_paid: 0,
      balance: 100_000,
      status: 'pending',
      ...invoiceOverrides,
    })
    const mocks = createInMemoryFinanceMocks({
      invoices: [invoice],
      settings: settingsOverrides as never,
    })
    const service = new PaymentService(mocks.invoiceRepo, mocks.paymentRepo)
    return { service, mocks, invoice }
  }

  it('records a full payment and marks invoice paid', () => {
    const { service, mocks } = setup()
    const result = service.recordPayment({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 100_000,
    })

    expect(result.invoice.status).toBe('paid')
    expect(result.invoice.balance).toBe(0)
    expect(result.invoice.amount_paid).toBe(100_000)
    expect(result.payment.invoice_id).toBe('inv_1')
    expect(result.receipt.amount).toBe(100_000)
    expect(result.receipt.balance_remaining).toBe(0)
    expect(mocks.payments).toHaveLength(1)
    expect(mocks.receipts).toHaveLength(1)
  })

  it('records a partial payment and transitions pending → partially_paid', () => {
    const { service } = setup()
    const result = service.recordPayment({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 40_000,
    })

    expect(result.invoice.status).toBe('partially_paid')
    expect(result.invoice.amount_paid).toBe(40_000)
    expect(result.invoice.balance).toBe(60_000)
    expect(result.receipt.balance_remaining).toBe(60_000)
  })

  it('rejects overpayment when credit is disabled', () => {
    const { service } = setup({}, { allow_credit: 0 })
    expect(() =>
      service.recordPayment({
        school_id: 'school_1',
        invoice_id: 'inv_1',
        amount: 120_000,
      })
    ).toThrow(/exceeds outstanding balance/i)
  })

  it('allows overpayment when credit is enabled (creates overpay remainder)', () => {
    const { service } = setup({}, { allow_credit: 1 })
    const result = service.recordPayment({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 120_000,
    })
    expect(result.invoice.status).toBe('paid')
    expect(result.invoice.balance).toBe(0)
    expect(result.payment.amount).toBe(120_000)
  })

  it('links payment to the correct invoice', () => {
    const { service } = setup()
    const result = service.recordPayment({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 10_000,
    })
    expect(result.payment.invoice_id).toBe('inv_1')
    expect(result.payment.student_id).toBe('student_1')
  })

  it('fails for a non-existent invoice', () => {
    const { service } = setup()
    expect(() =>
      service.recordPayment({
        school_id: 'school_1',
        invoice_id: 'missing',
        amount: 10_000,
      })
    ).toThrow(/Invoice not found/i)
  })

  it('rejects zero and negative payment amounts', () => {
    const { service } = setup()
    expect(() =>
      service.recordPayment({
        school_id: 'school_1',
        invoice_id: 'inv_1',
        amount: 0,
      })
    ).toThrow(/must be positive/i)

    expect(() =>
      service.recordPayment({
        school_id: 'school_1',
        invoice_id: 'inv_1',
        amount: -500,
      })
    ).toThrow(/cannot be negative/i)
  })

  it('generates a unique receipt number and reflects remaining balance', () => {
    const { service, mocks } = setup()
    const first = service.recordPayment({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 25_000,
    })
    const second = service.recordPayment({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 25_000,
    })

    expect(first.receipt.receipt_number).not.toBe(second.receipt.receipt_number)
    expect(second.receipt.balance_remaining).toBe(50_000)
    expect(new Set(mocks.receipts.map((r) => r.receipt_number)).size).toBe(2)
  })

  it('prevents creating a receipt without a payment', () => {
    const { service } = setup()
    expect(() => service.createReceiptWithoutPayment()).toThrow(
      /without a payment/i
    )
  })

  it('applies student credit toward balance when requested', () => {
    const { service, mocks } = setup()
    mocks.setStudentCredit(30_000)
    const result = service.recordPayment({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 0,
      use_credit: true,
    })
    expect(result.payment.credit_applied).toBe(30_000)
    expect(result.invoice.balance).toBe(70_000)
    expect(result.invoice.status).toBe('partially_paid')
  })
})
