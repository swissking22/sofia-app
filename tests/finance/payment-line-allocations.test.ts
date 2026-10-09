import {
  aggregateFeeLineSituation,
  aggregateNamedAmounts,
  computeInvoiceLineBalances,
  fifoPaymentAllocations,
  normalizePaymentLineAllocations,
  receiptPaidForLines,
} from '../../main/domain/finance'

const lines = [
  { id: 'l1', description: 'Tuition', amount: 50_000 },
  { id: 'l2', description: 'PTA', amount: 10_000 },
  { id: 'l3', description: 'Sports', amount: 5_000 },
]

describe('payment fee-line allocations', () => {
  it('normalizes cashier-selected fee lines', () => {
    const result = normalizePaymentLineAllocations({
      lines,
      remainingByLineId: { l1: 50_000, l2: 10_000, l3: 5_000 },
      allocations: [
        { invoice_line_id: 'l1', amount: 40_000 },
        { invoice_line_id: 'l2', amount: 10_000 },
      ],
      appliedAmount: 50_000,
    })
    expect(result).toEqual([
      {
        invoice_line_id: 'l1',
        description: 'Tuition',
        amount: 40_000,
        charged: 50_000,
      },
      {
        invoice_line_id: 'l2',
        description: 'PTA',
        amount: 10_000,
        charged: 10_000,
      },
    ])
  })

  it('rejects allocations that do not equal the applied amount', () => {
    expect(() =>
      normalizePaymentLineAllocations({
        lines,
        remainingByLineId: { l1: 50_000, l2: 10_000, l3: 5_000 },
        allocations: [{ invoice_line_id: 'l2', amount: 10_000 }],
        appliedAmount: 15_000,
      })
    ).toThrow(/must equal the amount applied/i)
  })

  it('rejects over-allocating a fee line', () => {
    expect(() =>
      normalizePaymentLineAllocations({
        lines,
        remainingByLineId: { l1: 5_000, l2: 10_000, l3: 5_000 },
        allocations: [{ invoice_line_id: 'l1', amount: 10_000 }],
        appliedAmount: 10_000,
      })
    ).toThrow(/exceeds the remaining amount/i)
  })

  it('builds FIFO allocations when lines are not chosen', () => {
    const result = fifoPaymentAllocations({
      lines,
      remainingByLineId: { l1: 50_000, l2: 10_000, l3: 5_000 },
      appliedAmount: 55_000,
    })
    expect(result.map((r) => r.amount)).toEqual([50_000, 5_000])
  })

  it('computes remaining balances from stored allocations', () => {
    const balances = computeInvoiceLineBalances(lines, [
      {
        amount: 50_000,
        allocations: [{ invoice_line_id: 'l1', amount: 50_000 }],
      },
    ])
    expect(balances.map((b) => b.remaining)).toEqual([0, 10_000, 5_000])
  })

  it('receipt Paid for prefers stored allocations over FIFO', () => {
    const result = receiptPaidForLines({
      lines,
      paymentAmount: 10_000,
      priorPaidTowardInvoice: 0,
      storedAllocations: [
        { invoice_line_id: 'l2', description: 'PTA', amount: 10_000 },
      ],
    })
    expect(result).toEqual([
      { description: 'PTA', charged: 10_000, paid: 10_000 },
    ])
  })

  it('aggregates fee-line situation by description', () => {
    const result = aggregateFeeLineSituation([
      {
        id: 'a',
        description: 'Tuition',
        charged: 50_000,
        paid: 20_000,
        remaining: 30_000,
      },
      {
        id: 'b',
        description: 'Tuition',
        charged: 50_000,
        paid: 50_000,
        remaining: 0,
      },
      {
        id: 'c',
        description: 'PTA',
        charged: 10_000,
        paid: 0,
        remaining: 10_000,
      },
    ])
    expect(result).toEqual([
      {
        description: 'PTA',
        charged: 10_000,
        paid: 0,
        remaining: 10_000,
      },
      {
        description: 'Tuition',
        charged: 100_000,
        paid: 70_000,
        remaining: 30_000,
      },
    ])
  })

  it('aggregates named collection amounts', () => {
    expect(
      aggregateNamedAmounts([
        { name: 'Tuition', amount: 40_000 },
        { name: 'PTA', amount: 10_000 },
        { name: 'Tuition', amount: 5_000 },
      ])
    ).toEqual([
      { name: 'Tuition', amount: 45_000 },
      { name: 'PTA', amount: 10_000 },
    ])
  })
})
