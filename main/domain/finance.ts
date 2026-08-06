/**
 * Pure finance domain helpers — single source of truth for money math.
 * Mirrored by FinanceMgmtRepository / finance IPC.
 */

export type InvoiceStatus =
  | 'pending'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'

export type DiscountMode = 'percent' | 'fixed'
export type FeeFrequency = 'one_time' | 'monthly' | 'termly' | 'yearly'

export const FEE_FREQUENCIES: FeeFrequency[] = [
  'one_time',
  'monthly',
  'termly',
  'yearly',
]

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Resolve invoice status from net, paid amount, and due date. */
export function resolveInvoiceStatus(
  net: number,
  paid: number,
  dueDate: string | null,
  today: string = todayIso()
): InvoiceStatus {
  const balance = Math.max(0, round2(net - paid))
  if (balance <= 0.0001) return 'paid'
  if (paid > 0) return 'partially_paid'
  if (dueDate && dueDate < today) return 'overdue'
  return 'pending'
}

export function computeDiscount(
  subtotal: number,
  mode: DiscountMode | null | undefined,
  value: number | null | undefined
): number {
  const base = round2(Math.max(0, subtotal))
  if (!mode) return 0
  let discount = 0
  if (mode === 'percent') {
    discount = round2((base * (value || 0)) / 100)
  } else if (mode === 'fixed') {
    discount = round2(value || 0)
  }
  return Math.min(Math.max(0, discount), base)
}

export function computeInvoiceTotals(input: {
  lineAmounts: number[]
  discount_mode?: DiscountMode | null
  discount_value?: number | null
}): {
  subtotal: number
  discount_total: number
  net_payable: number
} {
  const subtotal = round2(
    input.lineAmounts.reduce((s, a) => s + round2(a), 0)
  )
  const discount_total = computeDiscount(
    subtotal,
    input.discount_mode,
    input.discount_value
  )
  const net_payable = round2(Math.max(0, subtotal - discount_total))
  return { subtotal, discount_total, net_payable }
}

export type PaymentApplication = {
  cashIn: number
  creditApplied: number
  fromCash: number
  overpay: number
  applied: number
  newPaid: number
  newBalance: number
  status: InvoiceStatus
}

/**
 * Apply cash (+ optional credit) to an invoice balance.
 * Matches FinanceMgmtRepository.recordPayment allocation rules.
 */
export function applyPaymentToInvoice(input: {
  invoiceBalance: number
  invoiceNetPayable: number
  invoiceAmountPaid: number
  invoiceDueDate: string | null
  cashAmount: number
  availableCredit: number
  useCredit: boolean
  allowCredit: boolean
  today?: string
}): PaymentApplication {
  const cashIn = round2(input.cashAmount)
  if (cashIn < 0) {
    throw new Error('Payment amount cannot be negative.')
  }
  if (cashIn === 0 && !input.useCredit) {
    throw new Error('Payment amount must be positive.')
  }
  if (input.invoiceBalance <= 0) {
    throw new Error('Invoice is already paid.')
  }

  let creditApplied = 0
  if (input.useCredit) {
    creditApplied = round2(
      Math.min(input.availableCredit, input.invoiceBalance)
    )
  }

  const remainingBalance = round2(input.invoiceBalance - creditApplied)
  const fromCash = round2(Math.min(cashIn, Math.max(0, remainingBalance)))
  const overpay = round2(cashIn - fromCash)

  if (overpay > 0 && !input.allowCredit) {
    throw new Error(
      'Payment exceeds outstanding balance. Enable credit or reduce amount.'
    )
  }

  const applied = round2(fromCash + creditApplied)
  if (applied <= 0 && overpay <= 0) {
    throw new Error('Nothing to apply.')
  }

  const newPaid = round2(input.invoiceAmountPaid + applied)
  const newBalance = round2(Math.max(0, input.invoiceNetPayable - newPaid))
  const status = resolveInvoiceStatus(
    input.invoiceNetPayable,
    newPaid,
    input.invoiceDueDate,
    input.today
  )

  return {
    cashIn,
    creditApplied,
    fromCash,
    overpay,
    applied,
    newPaid,
    newBalance,
    status,
  }
}

/** Days past due; 0 if not due yet or no due date. */
export function daysPastDue(
  due: string | null,
  today: string = todayIso()
): number {
  if (!due) return 0
  const d = new Date(due + 'T00:00:00')
  const now = new Date(today + 'T00:00:00')
  return Math.floor((now.getTime() - d.getTime()) / 86400000)
}

export type AgingBucket = 'current' | 'aging_30' | 'aging_60'

export function agingBucket(
  due: string | null,
  today: string = todayIso()
): AgingBucket {
  const age = daysPastDue(due, today)
  if (age <= 0) return 'current'
  if (age <= 30) return 'aging_30'
  return 'aging_60'
}

export function aggregateOutstanding(input: {
  invoices: Array<{
    student_id: string
    balance: number
    net_payable: number
    amount_paid: number
    due_date: string | null
  }>
  today?: string
}): Array<{
  student_id: string
  outstanding: number
  total_billed: number
  total_paid: number
  aging_current: number
  aging_30: number
  aging_60: number
}> {
  const today = input.today ?? todayIso()
  const byStudent = new Map<
    string,
    {
      student_id: string
      outstanding: number
      total_billed: number
      total_paid: number
      aging_current: number
      aging_30: number
      aging_60: number
    }
  >()

  for (const inv of input.invoices) {
    if (inv.balance <= 0) continue
    const row = byStudent.get(inv.student_id) || {
      student_id: inv.student_id,
      outstanding: 0,
      total_billed: 0,
      total_paid: 0,
      aging_current: 0,
      aging_30: 0,
      aging_60: 0,
    }
    row.total_billed = round2(row.total_billed + inv.net_payable)
    row.total_paid = round2(row.total_paid + inv.amount_paid)
    row.outstanding = round2(row.outstanding + inv.balance)
    const bucket = agingBucket(inv.due_date, today)
    if (bucket === 'current') row.aging_current = round2(row.aging_current + inv.balance)
    else if (bucket === 'aging_30') row.aging_30 = round2(row.aging_30 + inv.balance)
    else row.aging_60 = round2(row.aging_60 + inv.balance)
    byStudent.set(inv.student_id, row)
  }

  return Array.from(byStudent.values())
}

export function isValidFeeFrequency(value: string): value is FeeFrequency {
  return (FEE_FREQUENCIES as string[]).includes(value)
}

export function padNum(n: number): string {
  return String(Math.max(1, Math.floor(n))).padStart(5, '0')
}

export function nextDocumentNumber(prefix: string, next: number): string {
  return `${prefix}-${padNum(next)}`
}
