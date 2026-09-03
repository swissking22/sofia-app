import { OnlinePaymentService, type OnlineTxn } from '../../main/services/online-payment'

function memory() {
  const txns: OnlineTxn[] = []
  const payments: Array<{ id: string; invoice_id: string; amount: number }> = []
  let invoice = { student_id: 'stu_1', balance: 100_000 }
  return {
    invoice,
    payments,
    txns,
    store: {
      get: (id: string) => txns.find((t) => t.id === id),
      findByIdempotency: (schoolId: string, key: string) =>
        txns.find((t) => t.school_id === schoolId && t.idempotency_key === key),
      invoiceBalance: (invoiceId: string) =>
        invoiceId === 'inv_1' ? invoice : undefined,
      save: (txn: OnlineTxn) => {
        const i = txns.findIndex((t) => t.id === txn.id)
        if (i >= 0) txns[i] = txn
        else txns.push(txn)
        return txn
      },
      recordVerifiedPayment: (txn: OnlineTxn) => {
        const id = `pay_${payments.length + 1}`
        payments.push({ id, invoice_id: txn.invoice_id, amount: txn.amount })
        invoice = {
          ...invoice,
          balance: Math.max(0, invoice.balance - txn.amount),
        }
        return { payment_id: id }
      },
    },
  }
}

describe('OnlinePaymentService', () => {
  it('creates a processing request without recording a fee payment', () => {
    const { store, payments, invoice } = memory()
    const service = new OnlinePaymentService(store)
    const txn = service.initiate({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 40_000,
      currency: 'XAF',
    })
    expect(txn.status).toBe('processing')
    expect(txn.payment_id).toBeNull()
    expect(payments).toHaveLength(0)
    expect(invoice.balance).toBe(100_000)
  })

  it('updates the student balance only after a verified success', () => {
    const { store, payments } = memory()
    const service = new OnlinePaymentService(store)
    const txn = service.initiate({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 40_000,
      currency: 'XAF',
    })
    const done = service.complete(txn.id, 'successful')
    expect(done.status).toBe('successful')
    expect(done.payment_id).toBe('pay_1')
    expect(payments).toHaveLength(1)
    expect(store.invoiceBalance('inv_1')?.balance).toBe(60_000)
  })

  it('does not change the balance on failed or cancelled transactions', () => {
    const a = memory()
    const fail = new OnlinePaymentService(a.store).initiate({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 10_000,
      currency: 'XAF',
    })
    new OnlinePaymentService(a.store).complete(fail.id, 'failed')
    expect(a.payments).toHaveLength(0)
    expect(a.invoice.balance).toBe(100_000)

    const b = memory()
    const cancel = new OnlinePaymentService(b.store).initiate({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 10_000,
      currency: 'XAF',
    })
    new OnlinePaymentService(b.store).complete(cancel.id, 'cancelled')
    expect(b.payments).toHaveLength(0)
  })

  it('treats a duplicate successful callback as a no-op', () => {
    const { store, payments } = memory()
    const service = new OnlinePaymentService(store)
    const txn = service.initiate({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 25_000,
      currency: 'XAF',
    })
    service.complete(txn.id, 'successful')
    const again = service.complete(txn.id, 'successful')
    expect(again.payment_id).toBe('pay_1')
    expect(payments).toHaveLength(1)
    expect(store.invoiceBalance('inv_1')?.balance).toBe(75_000)
  })

  it('returns the same row for a matching idempotency key', () => {
    const { store } = memory()
    const service = new OnlinePaymentService(store)
    const first = service.initiate({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 15_000,
      currency: 'XAF',
      idempotency_key: 'pay-once',
    })
    const second = service.initiate({
      school_id: 'school_1',
      invoice_id: 'inv_1',
      amount: 15_000,
      currency: 'XAF',
      idempotency_key: 'pay-once',
    })
    expect(second.id).toBe(first.id)
  })
})
