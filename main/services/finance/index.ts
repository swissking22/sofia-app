import type {
  DiscountMode,
  FeeFrequency,
  InvoiceStatus,
} from '../../domain/finance'
import {
  applyPaymentToInvoice,
  aggregateOutstanding,
  computeInvoiceTotals,
  isValidFeeFrequency,
  nextDocumentNumber,
  resolveInvoiceStatus,
  round2,
  todayIso,
} from '../../domain/finance'

/* ---------- Ports (injectable / mockable) ---------- */

export type FeeStructureRecord = {
  id: string
  school_id: string
  name: string
  academic_year_id: string
  class_id: string | null
  is_active: number
}

export type FeeStructureLineRecord = {
  id: string
  fee_structure_id: string
  name: string
  amount: number
  frequency: FeeFrequency
}

export type InvoiceRecord = {
  id: string
  school_id: string
  student_id: string
  invoice_number: string
  fee_structure_id: string | null
  status: InvoiceStatus
  subtotal: number
  discount_total: number
  net_payable: number
  amount_paid: number
  balance: number
  due_date: string | null
  carried_from_invoice_id: string | null
}

export type PaymentRecord = {
  id: string
  school_id: string
  student_id: string
  invoice_id: string
  payment_number: string
  amount: number
  credit_applied: number
}

export type ReceiptRecord = {
  id: string
  payment_id: string
  student_id: string
  receipt_number: string
  amount: number
  balance_remaining: number
}

export type ExpenseRecord = {
  id: string
  school_id: string
  expense_number: string
  category: string
  amount: number
  expense_date: string
  description: string | null
}

export type FinanceSettingsRecord = {
  allow_credit: number
  invoice_prefix: string
  invoice_next_number: number
  payment_prefix: string
  payment_next_number: number
  receipt_prefix: string
  receipt_next_number: number
  expense_prefix: string
  expense_next_number: number
}

export interface FeeStructureRepositoryPort {
  listStructures(schoolId: string): FeeStructureRecord[]
  createStructure(input: {
    school_id: string
    name: string
    academic_year_id: string
    class_id?: string | null
    lines: Array<{ name: string; amount: number; frequency?: FeeFrequency }>
  }): FeeStructureRecord
  getStructure(id: string): FeeStructureRecord | undefined
  getStructureLines(structureId: string): FeeStructureLineRecord[]
  createDiscount(input: {
    school_id: string
    name: string
    discount_mode: DiscountMode
    discount_value: number
  }): { id: string; discount_mode: DiscountMode; discount_value: number }
}

export interface InvoiceRepositoryPort {
  getInvoice(id: string): InvoiceRecord | undefined
  listOpenBalances(schoolId: string, studentId: string): InvoiceRecord[]
  listOutstandingInvoices(schoolId: string): InvoiceRecord[]
  saveInvoice(invoice: InvoiceRecord): InvoiceRecord
  updateInvoice(invoice: InvoiceRecord): InvoiceRecord
}

export interface PaymentRepositoryPort {
  savePayment(payment: PaymentRecord): PaymentRecord
  saveReceipt(receipt: ReceiptRecord): ReceiptRecord
  listReceiptNumbers(schoolId: string): string[]
  getStudentCreditTotal(schoolId: string, studentId: string): number
  getSettings(schoolId: string): FinanceSettingsRecord
  bumpCounter(
    schoolId: string,
    kind: 'invoice' | 'payment' | 'receipt' | 'expense'
  ): string
}

export interface ExpenseRepositoryPort {
  saveExpense(expense: ExpenseRecord): ExpenseRecord
  listExpenses(
    schoolId: string,
    from?: string,
    to?: string
  ): ExpenseRecord[]
  bumpExpenseNumber(schoolId: string): string
}

const EXPENSE_CATEGORIES = new Set([
  'salaries',
  'utilities',
  'maintenance',
  'supplies',
  'transport',
  'miscellaneous',
])

/* ---------- Fee Structure Service ---------- */

export class FeeStructureService {
  constructor(private readonly repo: FeeStructureRepositoryPort) {}

  create(input: {
    school_id: string
    name: string
    academic_year_id: string
    class_id?: string | null
    lines: Array<{ name: string; amount: number; frequency?: FeeFrequency }>
  }): FeeStructureRecord {
    if (!input.academic_year_id) {
      throw new Error('Academic year is required for a fee structure.')
    }
    const name = input.name.trim()
    if (!name) throw new Error('Structure name is required.')
    if (!input.lines.length) throw new Error('Add at least one fee line.')

    for (const line of input.lines) {
      if (round2(line.amount) < 0) {
        throw new Error('Fee line amounts cannot be negative.')
      }
      const freq = line.frequency ?? 'termly'
      if (!isValidFeeFrequency(freq)) {
        throw new Error(`Invalid fee frequency: ${freq}`)
      }
    }

    const existing = this.repo.listStructures(input.school_id)
    const duplicate = existing.find(
      (s) =>
        s.academic_year_id === input.academic_year_id &&
        (s.class_id || null) === (input.class_id || null) &&
        s.is_active === 1
    )
    if (duplicate) {
      throw new Error(
        'An active fee structure already exists for this class and academic year.'
      )
    }

    return this.repo.createStructure({
      ...input,
      name,
      lines: input.lines.map((l) => ({
        ...l,
        frequency: l.frequency ?? 'termly',
        amount: round2(l.amount),
      })),
    })
  }

  applyDiscount(
    subtotal: number,
    mode: DiscountMode,
    value: number
  ): { discount_total: number; net_payable: number } {
    const totals = computeInvoiceTotals({
      lineAmounts: [subtotal],
      discount_mode: mode,
      discount_value: value,
    })
    return {
      discount_total: totals.discount_total,
      net_payable: totals.net_payable,
    }
  }
}

/* ---------- Billing Service ---------- */

export class BillingService {
  constructor(
    private readonly structures: FeeStructureRepositoryPort,
    private readonly invoices: InvoiceRepositoryPort,
    private readonly payments: PaymentRepositoryPort
  ) {}

  generateInvoice(input: {
    school_id: string
    student_id: string
    fee_structure_id: string
    due_date?: string | null
    carry_arrears?: boolean
    discount_mode?: DiscountMode | null
    discount_value?: number | null
    extra_lines?: Array<{ description: string; amount: number }>
    today?: string
  }): InvoiceRecord {
    const structure = this.structures.getStructure(input.fee_structure_id)
    if (!structure || structure.school_id !== input.school_id) {
      throw new Error('Fee structure not found.')
    }
    if (!structure.is_active) throw new Error('Fee structure is inactive.')

    const lines = this.structures.getStructureLines(structure.id)
    const amounts = lines.map((l) => l.amount)
    for (const extra of input.extra_lines ?? []) {
      amounts.push(extra.amount)
    }

    let carriedFrom: string | null = null
    if (input.carry_arrears) {
      const prior = this.invoices.listOpenBalances(
        input.school_id,
        input.student_id
      )
      let arrears = 0
      for (const inv of prior) {
        arrears = round2(arrears + inv.balance)
        carriedFrom = carriedFrom || inv.id
      }
      if (arrears > 0) amounts.push(arrears)
    }

    const totals = computeInvoiceTotals({
      lineAmounts: amounts,
      discount_mode: input.discount_mode,
      discount_value: input.discount_value,
    })

    if (totals.net_payable < 0) {
      throw new Error('Invoice net payable cannot be negative.')
    }

    const today = input.today ?? todayIso()
    const invoice_number = this.payments.bumpCounter(
      input.school_id,
      'invoice'
    )

    const invoice: InvoiceRecord = {
      id: `inv_${invoice_number}`,
      school_id: input.school_id,
      student_id: input.student_id,
      invoice_number,
      fee_structure_id: structure.id,
      status: resolveInvoiceStatus(totals.net_payable, 0, input.due_date ?? null, today),
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      net_payable: totals.net_payable,
      amount_paid: 0,
      balance: totals.net_payable,
      due_date: input.due_date ?? null,
      carried_from_invoice_id: carriedFrom,
    }

    return this.invoices.saveInvoice(invoice)
  }
}

/* ---------- Payment + Receipt Service ---------- */

export class PaymentService {
  constructor(
    private readonly invoices: InvoiceRepositoryPort,
    private readonly payments: PaymentRepositoryPort
  ) {}

  recordPayment(input: {
    school_id: string
    invoice_id: string
    amount: number
    use_credit?: boolean
    today?: string
  }): { payment: PaymentRecord; receipt: ReceiptRecord; invoice: InvoiceRecord } {
    const invoice = this.invoices.getInvoice(input.invoice_id)
    if (!invoice || invoice.school_id !== input.school_id) {
      throw new Error('Invoice not found.')
    }
    if (invoice.status === 'cancelled') {
      throw new Error('Cannot pay a cancelled invoice.')
    }

    const settings = this.payments.getSettings(input.school_id)
    const availableCredit = this.payments.getStudentCreditTotal(
      input.school_id,
      invoice.student_id
    )

    const applied = applyPaymentToInvoice({
      invoiceBalance: invoice.balance,
      invoiceNetPayable: invoice.net_payable,
      invoiceAmountPaid: invoice.amount_paid,
      invoiceDueDate: invoice.due_date,
      cashAmount: input.amount,
      availableCredit,
      useCredit: Boolean(input.use_credit),
      allowCredit: (settings.allow_credit ?? 1) === 1,
      today: input.today,
    })

    const payment_number = this.payments.bumpCounter(
      input.school_id,
      'payment'
    )
    const receipt_number = this.payments.bumpCounter(
      input.school_id,
      'receipt'
    )

    const existingReceipts = this.payments.listReceiptNumbers(input.school_id)
    if (existingReceipts.includes(receipt_number)) {
      throw new Error('Receipt number collision.')
    }

    const payment: PaymentRecord = {
      id: `pay_${payment_number}`,
      school_id: input.school_id,
      student_id: invoice.student_id,
      invoice_id: invoice.id,
      payment_number,
      amount: applied.cashIn,
      credit_applied: applied.creditApplied,
    }

    const updatedInvoice: InvoiceRecord = {
      ...invoice,
      amount_paid: applied.newPaid,
      balance: applied.newBalance,
      status: applied.status,
    }

    const receipt: ReceiptRecord = {
      id: `rcp_${receipt_number}`,
      payment_id: payment.id,
      student_id: invoice.student_id,
      receipt_number,
      amount: applied.cashIn,
      balance_remaining: applied.newBalance,
    }

    this.payments.savePayment(payment)
    this.invoices.updateInvoice(updatedInvoice)
    this.payments.saveReceipt(receipt)

    return { payment, receipt, invoice: updatedInvoice }
  }

  /** Receipts are only created through recordPayment. */
  createReceiptWithoutPayment(): never {
    throw new Error('Cannot create a receipt without a payment.')
  }
}

/* ---------- Outstanding Service ---------- */

export class OutstandingService {
  constructor(private readonly invoices: InvoiceRepositoryPort) {}

  forSchool(schoolId: string, today?: string) {
    const invoices = this.invoices.listOutstandingInvoices(schoolId)
    return aggregateOutstanding({ invoices, today })
  }

  aggregateByClass(
    rows: Array<{
      class_id: string | null
      outstanding: number
      aging_current: number
      aging_30: number
      aging_60: number
    }>
  ) {
    const byClass = new Map<
      string,
      {
        class_id: string | null
        students: number
        outstanding: number
        aging_current: number
        aging_30: number
        aging_60: number
      }
    >()
    for (const r of rows) {
      const key = r.class_id || 'none'
      const row = byClass.get(key) || {
        class_id: r.class_id,
        students: 0,
        outstanding: 0,
        aging_current: 0,
        aging_30: 0,
        aging_60: 0,
      }
      row.students += 1
      row.outstanding = round2(row.outstanding + r.outstanding)
      row.aging_current = round2(row.aging_current + r.aging_current)
      row.aging_30 = round2(row.aging_30 + r.aging_30)
      row.aging_60 = round2(row.aging_60 + r.aging_60)
      byClass.set(key, row)
    }
    return Array.from(byClass.values())
  }
}

/* ---------- Expense Service ---------- */

export class ExpenseService {
  constructor(private readonly repo: ExpenseRepositoryPort) {}

  create(input: {
    school_id: string
    category: string
    amount: number
    expense_date: string
    description?: string | null
  }): ExpenseRecord {
    if (!input.expense_date) throw new Error('Expense date is required.')
    if (!EXPENSE_CATEGORIES.has(input.category)) {
      throw new Error('Invalid expense category.')
    }
    const amount = round2(input.amount)
    if (amount <= 0) throw new Error('Expense amount must be positive.')

    const expense_number = this.repo.bumpExpenseNumber(input.school_id)
    return this.repo.saveExpense({
      id: `exp_${expense_number}`,
      school_id: input.school_id,
      expense_number,
      category: input.category,
      amount,
      expense_date: input.expense_date,
      description: input.description?.trim() || null,
    })
  }

  monthlyTotals(
    schoolId: string,
    year: number,
    month: number
  ): { total: number; byCategory: Record<string, number> } {
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const rows = this.repo.listExpenses(schoolId, from, to)
    const byCategory: Record<string, number> = {}
    let total = 0
    for (const r of rows) {
      total = round2(total + r.amount)
      byCategory[r.category] = round2((byCategory[r.category] || 0) + r.amount)
    }
    return { total, byCategory }
  }
}

export { nextDocumentNumber }
