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

/**
 * FIFO allocation of a receipt payment across invoice fee lines.
 * Prior payments on the same invoice are applied first so partial receipts
 * show which components this payment actually covered.
 */
export function allocatePaymentToLines(
  lines: Array<{ description: string; amount: number }>,
  paymentAmount: number,
  priorPaidTowardInvoice = 0
): Array<{ description: string; charged: number; paid: number }> {
  let priorLeft = round2(Math.max(0, priorPaidTowardInvoice))
  let payLeft = round2(Math.max(0, paymentAmount))
  return lines.map((line) => {
    const charged = round2(Number(line.amount) || 0)
    const coveredByPrior = round2(Math.min(charged, priorLeft))
    priorLeft = round2(priorLeft - coveredByPrior)
    const remainingOnLine = round2(Math.max(0, charged - coveredByPrior))
    const paid = round2(Math.min(remainingOnLine, payLeft))
    payLeft = round2(payLeft - paid)
    return {
      description: line.description,
      charged,
      paid,
    }
  })
}

export type InvoiceLineBalance = {
  id: string
  description: string
  charged: number
  paid: number
  remaining: number
}

/**
 * Remaining due per invoice fee line after prior payments.
 * Uses stored payment_allocations when present; otherwise FIFO on cash amount.
 */
export function computeInvoiceLineBalances(
  lines: Array<{ id: string; description: string; amount: number }>,
  paymentsChronological: Array<{
    amount: number
    allocations: Array<{ invoice_line_id: string; amount: number }>
  }>
): InvoiceLineBalance[] {
  const paidByLine = new Map<string, number>()
  for (const line of lines) paidByLine.set(line.id, 0)

  for (const payment of paymentsChronological) {
    const explicit = (payment.allocations ?? []).filter(
      (a) => (Number(a.amount) || 0) > 0
    )
    if (explicit.length > 0) {
      for (const alloc of explicit) {
        if (!paidByLine.has(alloc.invoice_line_id)) continue
        paidByLine.set(
          alloc.invoice_line_id,
          round2(
            (paidByLine.get(alloc.invoice_line_id) || 0) +
              Math.max(0, Number(alloc.amount) || 0)
          )
        )
      }
      continue
    }

    let payLeft = round2(Math.max(0, Number(payment.amount) || 0))
    for (const line of lines) {
      if (payLeft <= 0) break
      const charged = round2(Number(line.amount) || 0)
      const already = paidByLine.get(line.id) || 0
      const remainingOnLine = round2(Math.max(0, charged - already))
      const take = round2(Math.min(remainingOnLine, payLeft))
      if (take <= 0) continue
      paidByLine.set(line.id, round2(already + take))
      payLeft = round2(payLeft - take)
    }
  }

  return lines.map((line) => {
    const charged = round2(Number(line.amount) || 0)
    const paid = round2(Math.min(charged, paidByLine.get(line.id) || 0))
    return {
      id: line.id,
      description: line.description,
      charged,
      paid,
      remaining: round2(Math.max(0, charged - paid)),
    }
  })
}

export type NormalizedPaymentAllocation = {
  invoice_line_id: string
  description: string
  amount: number
  charged: number
}

/**
 * Validate cashier-chosen fee-line amounts for a payment.
 * Sum must equal the amount applied to the invoice (cash applied + credit).
 */
export function normalizePaymentLineAllocations(input: {
  lines: Array<{ id: string; description: string; amount: number }>
  remainingByLineId: Record<string, number>
  allocations: Array<{ invoice_line_id: string; amount: number }>
  appliedAmount: number
}): NormalizedPaymentAllocation[] {
  const applied = round2(Math.max(0, input.appliedAmount))
  if (applied <= 0) {
    throw new Error('Nothing to allocate to fee lines.')
  }
  if (!input.lines.length) {
    throw new Error('Invoice has no fee lines to allocate.')
  }

  const lineById = new Map(input.lines.map((l) => [l.id, l]))
  const merged = new Map<string, number>()
  for (const raw of input.allocations) {
    const id = String(raw.invoice_line_id || '')
    const amount = round2(Number(raw.amount) || 0)
    if (!id || amount <= 0) continue
    const line = lineById.get(id)
    if (!line) {
      throw new Error('One or more selected fee lines are not on this invoice.')
    }
    merged.set(id, round2((merged.get(id) || 0) + amount))
  }

  if (merged.size === 0) {
    throw new Error('Select at least one fee line being paid for.')
  }

  const result: NormalizedPaymentAllocation[] = []
  let total = 0
  for (const [id, amount] of merged) {
    const line = lineById.get(id)!
    const remaining = round2(
      Math.max(
        0,
        input.remainingByLineId[id] ?? round2(Number(line.amount) || 0)
      )
    )
    if (amount > remaining + 0.009) {
      throw new Error(
        `Allocation for "${line.description}" exceeds the remaining amount on that fee line.`
      )
    }
    total = round2(total + amount)
    result.push({
      invoice_line_id: id,
      description: line.description,
      amount,
      charged: round2(Number(line.amount) || 0),
    })
  }

  if (Math.abs(total - applied) > 0.009) {
    throw new Error(
      `Fee line amounts (${total}) must equal the amount applied to the invoice (${applied}).`
    )
  }

  return result
}

/** Build FIFO allocations when the cashier does not pick fee lines. */
export function fifoPaymentAllocations(input: {
  lines: Array<{ id: string; description: string; amount: number }>
  remainingByLineId: Record<string, number>
  appliedAmount: number
}): NormalizedPaymentAllocation[] {
  let payLeft = round2(Math.max(0, input.appliedAmount))
  const result: NormalizedPaymentAllocation[] = []
  for (const line of input.lines) {
    if (payLeft <= 0) break
    const remaining = round2(
      Math.max(
        0,
        input.remainingByLineId[line.id] ?? round2(Number(line.amount) || 0)
      )
    )
    const take = round2(Math.min(remaining, payLeft))
    if (take <= 0) continue
    result.push({
      invoice_line_id: line.id,
      description: line.description,
      amount: take,
      charged: round2(Number(line.amount) || 0),
    })
    payLeft = round2(payLeft - take)
  }
  return result
}

/**
 * Merge invoice line balances by description (e.g. Tuition across terms).
 */
export function aggregateFeeLineSituation(
  balances: InvoiceLineBalance[]
): Array<{
  description: string
  charged: number
  paid: number
  remaining: number
}> {
  const map = new Map<
    string,
    { description: string; charged: number; paid: number; remaining: number }
  >()
  for (const row of balances) {
    const key = row.description.trim() || 'Other'
    const existing = map.get(key) ?? {
      description: key,
      charged: 0,
      paid: 0,
      remaining: 0,
    }
    existing.charged = round2(existing.charged + row.charged)
    existing.paid = round2(existing.paid + row.paid)
    existing.remaining = round2(existing.remaining + row.remaining)
    map.set(key, existing)
  }
  return [...map.values()].sort((a, b) =>
    a.description.localeCompare(b.description, undefined, {
      sensitivity: 'base',
    })
  )
}

/** Sum collected amounts by fee-line description. */
export function aggregateNamedAmounts(
  rows: Array<{ name: string; amount: number }>
): Array<{ name: string; amount: number }> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const name = (row.name || 'Other').trim() || 'Other'
    map.set(name, round2((map.get(name) || 0) + (Number(row.amount) || 0)))
  }
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
}

/** Prefer stored allocations for receipt "Paid for"; fall back to FIFO. */
export function receiptPaidForLines(input: {
  lines: Array<{ id: string; description: string; amount: number }>
  paymentAmount: number
  priorPaidTowardInvoice?: number
  storedAllocations?: Array<{
    invoice_line_id: string
    description: string
    amount: number
  }> | null
}): Array<{ description: string; charged: number; paid: number }> {
  const stored = (input.storedAllocations ?? []).filter(
    (a) => (Number(a.amount) || 0) > 0
  )
  if (stored.length > 0) {
    const chargedById = new Map(
      input.lines.map((l) => [l.id, round2(Number(l.amount) || 0)])
    )
    return stored.map((a) => ({
      description: a.description,
      charged:
        chargedById.get(a.invoice_line_id) ??
        round2(Number(a.amount) || 0),
      paid: round2(Number(a.amount) || 0),
    }))
  }
  return allocatePaymentToLines(
    input.lines.map((l) => ({
      description: l.description,
      amount: l.amount,
    })),
    input.paymentAmount,
    input.priorPaidTowardInvoice ?? 0
  )
}

export function padNum(n: number): string {
  return String(Math.max(1, Math.floor(n))).padStart(5, '0')
}

export function nextDocumentNumber(prefix: string, next: number): string {
  return `${prefix}-${padNum(next)}`
}
