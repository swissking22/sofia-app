import { allocatePaymentToLines } from '../../main/domain/finance'

describe('allocatePaymentToLines', () => {
  const lines = [
    { description: 'Tuition', amount: 50_000 },
    { description: 'PTA', amount: 10_000 },
    { description: 'Sports', amount: 5_000 },
  ]

  it('allocates a full payment across all fee lines', () => {
    const result = allocatePaymentToLines(lines, 65_000, 0)
    expect(result).toEqual([
      { description: 'Tuition', charged: 50_000, paid: 50_000 },
      { description: 'PTA', charged: 10_000, paid: 10_000 },
      { description: 'Sports', charged: 5_000, paid: 5_000 },
    ])
  })

  it('shows only the components covered by a partial payment', () => {
    const result = allocatePaymentToLines(lines, 55_000, 0)
    expect(result.map((r) => r.paid)).toEqual([50_000, 5_000, 0])
  })

  it('skips lines already covered by prior payments', () => {
    const result = allocatePaymentToLines(lines, 10_000, 50_000)
    expect(result.map((r) => r.paid)).toEqual([0, 10_000, 0])
  })
})
