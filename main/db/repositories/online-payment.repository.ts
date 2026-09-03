import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  StubOnlinePaymentProvider,
  assertPayableAmount,
  assertTransition,
  type OnlinePaymentProvider,
} from '../../domain/online-payment'
import { round2 } from '../../domain/finance'
import type { OnlinePaymentStatus, OnlinePaymentTransaction } from '../types'
import { BaseRepository } from './base'
import type { FinanceMgmtRepository } from './finance-mgmt.repository'

export class OnlinePaymentRepository extends BaseRepository<OnlinePaymentTransaction> {
  constructor(
    db: Database.Database,
    private finance: FinanceMgmtRepository,
    private provider: OnlinePaymentProvider = new StubOnlinePaymentProvider()
  ) {
    super(db, 'online_payment_transactions')
  }

  list(schoolId: string): OnlinePaymentTransaction[] {
    return this.db
      .prepare(
        `SELECT * FROM online_payment_transactions
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 300`
      )
      .all(schoolId) as OnlinePaymentTransaction[]
  }

  findByIdempotency(
    schoolId: string,
    key: string
  ): OnlinePaymentTransaction | undefined {
    return this.db
      .prepare(
        `SELECT * FROM online_payment_transactions
         WHERE school_id = ? AND idempotency_key = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(schoolId, key) as OnlinePaymentTransaction | undefined
  }

  initiate(input: {
    school_id: string
    invoice_id: string
    amount: number
    currency: string
    userId: string | null
    idempotency_key?: string | null
  }): OnlinePaymentTransaction {
    if (input.idempotency_key) {
      const existing = this.findByIdempotency(
        input.school_id,
        input.idempotency_key
      )
      if (existing) return existing
    }
    const invoice = this.finance.getInvoice(input.invoice_id)
    if (!invoice || invoice.school_id !== input.school_id) {
      throw new Error('Invoice not found.')
    }
    if (invoice.status === 'cancelled' || invoice.status === 'paid') {
      throw new Error('This invoice cannot accept an online payment.')
    }
    assertPayableAmount(round2(input.amount), invoice.balance)

    const checkout = this.provider.createCheckout({
      amount: round2(input.amount),
      currency: input.currency,
      reference: `INV-${invoice.invoice_number}`,
    })

    const record: OnlinePaymentTransaction = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      student_id: invoice.student_id,
      invoice_id: invoice.id,
      payment_id: null,
      amount: round2(input.amount),
      currency: input.currency,
      status: checkout.status === 'processing' ? 'processing' : 'pending',
      provider_key: this.provider.key,
      provider_reference: checkout.provider_reference,
      idempotency_key: input.idempotency_key ?? null,
      failure_reason: checkout.failure_reason ?? null,
      initiated_by: input.userId,
      completed_at: null,
    }
    this.db
      .prepare(
        `INSERT INTO online_payment_transactions (
           id, school_id, student_id, invoice_id, payment_id, amount, currency,
           status, provider_key, provider_reference, idempotency_key, failure_reason,
           initiated_by, completed_at,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @student_id, @invoice_id, @payment_id, @amount, @currency,
           @status, @provider_key, @provider_reference, @idempotency_key, @failure_reason,
           @initiated_by, @completed_at,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)
    enqueueSync(
      this.db,
      this.tableName,
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  complete(
    id: string,
    schoolId: string,
    next: Extract<OnlinePaymentStatus, 'successful' | 'failed' | 'cancelled'>,
    userId: string | null
  ): OnlinePaymentTransaction {
    const existing = this.findById(id)
    if (!existing || existing.school_id !== schoolId) {
      throw new Error('Online payment not found.')
    }
    if (existing.status === 'successful') return existing
    assertTransition(existing.status, next)

    let paymentId = existing.payment_id
    if (next === 'successful') {
      const invoice = this.finance.getInvoice(existing.invoice_id)
      if (!invoice) throw new Error('Invoice not found.')
      const result = this.finance.recordPayment({
        school_id: schoolId,
        invoice_id: existing.invoice_id,
        amount: existing.amount,
        method: 'online',
        reference: existing.provider_reference,
        notes: 'Online payment (verified)',
        userId,
      })
      paymentId = result.payment.id
    }

    const record: OnlinePaymentTransaction = {
      ...existing,
      status: next,
      payment_id: paymentId,
      completed_at: new Date().toISOString(),
      failure_reason:
        next === 'failed'
          ? existing.failure_reason || 'Payment failed.'
          : next === 'cancelled'
            ? 'Cancelled'
            : null,
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE online_payment_transactions SET
           status = @status, payment_id = @payment_id, completed_at = @completed_at,
           failure_reason = @failure_reason,
           updated_at = @updated_at, version = @version, sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)
    enqueueSync(
      this.db,
      this.tableName,
      record.id,
      'UPDATE',
      record as unknown as Record<string, unknown>
    )
    return record
  }
}
