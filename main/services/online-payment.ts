import {
  StubOnlinePaymentProvider,
  assertPayableAmount,
  assertTransition,
  type OnlinePaymentProvider,
  type OnlinePaymentStatus,
} from '../domain/online-payment'

export type OnlineTxn = {
  id: string
  school_id: string
  student_id: string
  invoice_id: string
  payment_id: string | null
  amount: number
  currency: string
  status: OnlinePaymentStatus
  provider_key: string
  provider_reference: string | null
  idempotency_key: string | null
  failure_reason: string | null
}

export interface OnlinePaymentStore {
  get(id: string): OnlineTxn | undefined
  findByIdempotency(schoolId: string, key: string): OnlineTxn | undefined
  invoiceBalance(invoiceId: string): { student_id: string; balance: number } | undefined
  save(txn: OnlineTxn): OnlineTxn
  recordVerifiedPayment(txn: OnlineTxn): { payment_id: string }
}

let seq = 1
function nextId() {
  seq += 1
  return `optxn_${seq}`
}

export class OnlinePaymentService {
  constructor(
    private store: OnlinePaymentStore,
    private provider: OnlinePaymentProvider = new StubOnlinePaymentProvider()
  ) {}

  initiate(input: {
    school_id: string
    invoice_id: string
    amount: number
    currency: string
    idempotency_key?: string | null
  }): OnlineTxn {
    if (input.idempotency_key) {
      const existing = this.store.findByIdempotency(
        input.school_id,
        input.idempotency_key
      )
      if (existing) return existing
    }
    const invoice = this.store.invoiceBalance(input.invoice_id)
    if (!invoice) throw new Error('Invoice not found.')
    assertPayableAmount(input.amount, invoice.balance)
    const checkout = this.provider.createCheckout({
      amount: input.amount,
      currency: input.currency,
      reference: nextId(),
    })
    const txn: OnlineTxn = {
      id: nextId(),
      school_id: input.school_id,
      student_id: invoice.student_id,
      invoice_id: input.invoice_id,
      payment_id: null,
      amount: input.amount,
      currency: input.currency,
      status: checkout.status === 'processing' ? 'processing' : 'pending',
      provider_key: this.provider.key,
      provider_reference: checkout.provider_reference,
      idempotency_key: input.idempotency_key ?? null,
      failure_reason: checkout.failure_reason ?? null,
    }
    return this.store.save(txn)
  }

  /**
   * Provider callback / bursar confirmation.
   * Successful status updates the student balance only here.
   * Duplicate successful callbacks are no-ops.
   */
  complete(
    id: string,
    next: Extract<OnlinePaymentStatus, 'successful' | 'failed' | 'cancelled'>
  ): OnlineTxn {
    const txn = this.store.get(id)
    if (!txn) throw new Error('Online payment not found.')
    if (txn.status === 'successful') return txn
    assertTransition(txn.status, next)
    if (next === 'successful') {
      const { payment_id } = this.store.recordVerifiedPayment(txn)
      return this.store.save({
        ...txn,
        status: 'successful',
        payment_id,
        failure_reason: null,
      })
    }
    return this.store.save({
      ...txn,
      status: next,
      failure_reason: next === 'failed' ? 'Provider declined the payment.' : null,
    })
  }
}
