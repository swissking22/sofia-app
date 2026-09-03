export const ONLINE_PAYMENT_STATUSES = [
  'pending',
  'processing',
  'successful',
  'failed',
  'cancelled',
  'refunded',
] as const

export type OnlinePaymentStatus = (typeof ONLINE_PAYMENT_STATUSES)[number]

const ALLOWED: Record<OnlinePaymentStatus, OnlinePaymentStatus[]> = {
  pending: ['processing', 'successful', 'failed', 'cancelled'],
  processing: ['successful', 'failed', 'cancelled'],
  successful: ['refunded'],
  failed: [],
  cancelled: [],
  refunded: [],
}

export function canTransition(
  from: OnlinePaymentStatus,
  to: OnlinePaymentStatus
): boolean {
  return ALLOWED[from]?.includes(to) ?? false
}

export function assertTransition(
  from: OnlinePaymentStatus,
  to: OnlinePaymentStatus
): void {
  if (from === to) return
  if (!canTransition(from, to)) {
    throw new Error(`Cannot change online payment from ${from} to ${to}.`)
  }
}

export function assertPayableAmount(amount: number, invoiceBalance: number): void {
  if (!(amount > 0)) throw new Error('Payment amount must be greater than 0.')
  if (amount - invoiceBalance > 0.0001) {
    throw new Error('Amount cannot exceed the outstanding invoice balance.')
  }
}

export interface PaymentProviderResult {
  ok: boolean
  provider_reference: string
  status: 'processing' | 'successful' | 'failed'
  failure_reason?: string
}

export interface OnlinePaymentProvider {
  readonly key: string
  createCheckout(input: {
    amount: number
    currency: string
    reference: string
  }): PaymentProviderResult
  confirm(provider_reference: string): PaymentProviderResult
}

/** Offline-first stub: never auto-succeeds. Bursar confirms after the provider settles. */
export class StubOnlinePaymentProvider implements OnlinePaymentProvider {
  readonly key = 'stub'

  createCheckout(input: {
    amount: number
    currency: string
    reference: string
  }): PaymentProviderResult {
    void input.amount
    void input.currency
    return {
      ok: true,
      provider_reference: `STUB-${input.reference}`,
      status: 'processing',
    }
  }

  confirm(provider_reference: string): PaymentProviderResult {
    if (!provider_reference) {
      return {
        ok: false,
        provider_reference: '',
        status: 'failed',
        failure_reason: 'Missing provider reference.',
      }
    }
    return {
      ok: true,
      provider_reference,
      status: 'successful',
    }
  }
}
