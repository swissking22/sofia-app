import { BankDepositService, type DepositRecord } from '../../main/services/bank-deposit'

describe('BankDepositService', () => {
  function service(rows: DepositRecord[] = []) {
    return { svc: new BankDepositService(rows), rows }
  }

  it('creates a pending deposit with an audit event', () => {
    const { svc } = service()
    const row = svc.create({
      school_id: 'school_1',
      amount: 500_000,
      collection_date: '2026-08-01',
      deposit_date: '2026-08-03',
    })
    expect(row.status).toBe('pending_verification')
    expect(row.allocations).toHaveLength(0)
    expect(row.audit[0].action).toBe('deposit.create')
    expect(svc.totals(row).unreconciled).toBe(500_000)
  })

  it('rejects a deposit date before the collection date', () => {
    const { svc } = service()
    expect(() =>
      svc.create({
        school_id: 'school_1',
        amount: 1000,
        collection_date: '2026-08-10',
        deposit_date: '2026-08-01',
      })
    ).toThrow(/cannot precede/)
  })

  it('reconciles selected collections and computes remainder', () => {
    const { svc } = service()
    const row = svc.create({
      school_id: 'school_1',
      amount: 500_000,
      collection_date: '2026-08-01',
      deposit_date: '2026-08-03',
    })
    svc.reconcile(row.id, [
      { payment_id: 'p1', amount: 150_000 },
      { payment_id: 'p2', amount: 100_000 },
    ])
    expect(svc.totals(row).reconciled).toBe(250_000)
    expect(svc.totals(row).unreconciled).toBe(250_000)
    expect(row.audit.some((a) => a.action === 'deposit.reconcile')).toBe(true)
  })

  it('supports a full reconciliation that leaves nothing unreconciled', () => {
    const { svc } = service()
    const row = svc.create({
      school_id: 'school_1',
      amount: 500_000,
      collection_date: null,
      deposit_date: '2026-08-03',
    })
    svc.reconcile(row.id, [
      { payment_id: 'p1', amount: 150_000 },
      { payment_id: 'p2', amount: 100_000 },
      { payment_id: 'p3', amount: 200_000 },
      { payment_id: 'p4', amount: 50_000 },
    ])
    expect(svc.totals(row).unreconciled).toBe(0)
  })

  it('rejects reconciliation that exceeds the deposit amount', () => {
    const { svc } = service()
    const row = svc.create({
      school_id: 'school_1',
      amount: 100_000,
      collection_date: null,
      deposit_date: '2026-08-03',
    })
    expect(() =>
      svc.reconcile(row.id, [{ payment_id: 'p1', amount: 150_000 }])
    ).toThrow(/cannot exceed/)
  })

  it('blocks verification when full reconciliation is required', () => {
    const { svc } = service()
    const row = svc.create({
      school_id: 'school_1',
      amount: 200_000,
      collection_date: null,
      deposit_date: '2026-08-03',
    })
    expect(() => svc.verify(row.id, true)).toThrow(/fully reconciled/)
    svc.reconcile(row.id, [{ payment_id: 'p1', amount: 200_000 }])
    const verified = svc.verify(row.id, true)
    expect(verified.status).toBe('verified')
    expect(verified.audit.some((a) => a.action === 'deposit.verify')).toBe(true)
  })

  it('does not allow reconciling a verified deposit', () => {
    const { svc } = service()
    const row = svc.create({
      school_id: 'school_1',
      amount: 50_000,
      collection_date: null,
      deposit_date: '2026-08-03',
    })
    svc.reconcile(row.id, [{ payment_id: 'p1', amount: 50_000 }])
    svc.verify(row.id, true)
    expect(() =>
      svc.reconcile(row.id, [{ payment_id: 'p2', amount: 50_000 }])
    ).toThrow(/verified/)
  })
})
