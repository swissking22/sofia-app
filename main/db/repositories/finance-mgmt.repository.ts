import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type {
  Expense,
  ExpenseCategory,
  FeeDiscount,
  FeeFrequency,
  FeeStructure,
  FeeStructureLine,
  FinanceAuditLog,
  FinanceReminder,
  FinanceSettings,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  LateFeeMode,
  LedgerEntry,
  Payment,
  PaymentMethod,
  Receipt,
  ResidenceApplies,
  StudentCredit,
} from '../types'
import {
  padNum,
  resolveInvoiceStatus as invoiceStatus,
  round2,
  todayIso,
} from '../../domain/finance'
import { structureAppliesToStudent } from '../../domain/boarding'
import { BaseRepository } from './base'

export { round2 }

export class FinanceMgmtRepository extends BaseRepository<Invoice> {
  constructor(db: Database.Database) {
    super(db, 'invoices')
  }

  getSettings(schoolId: string): FinanceSettings {
    const row = this.db
      .prepare(
        `SELECT * FROM finance_settings
         WHERE school_id = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(schoolId) as FinanceSettings | undefined
    if (!row) {
      throw new Error('Finance settings not found. Complete Finance setup first.')
    }
    return {
      ...row,
      invoice_prefix: row.invoice_prefix || 'INV',
      invoice_next_number: row.invoice_next_number ?? 1,
      payment_prefix: row.payment_prefix || 'PAY',
      payment_next_number: row.payment_next_number ?? 1,
      expense_prefix: row.expense_prefix || 'EXP',
      expense_next_number: row.expense_next_number ?? 1,
      allow_credit: row.allow_credit ?? 1,
    }
  }

  private bumpCounter(
    schoolId: string,
    kind: 'invoice' | 'payment' | 'receipt' | 'expense'
  ): string {
    const settings = this.getSettings(schoolId)
    const map = {
      invoice: {
        prefix: settings.invoice_prefix || 'INV',
        field: 'invoice_next_number' as const,
        next: settings.invoice_next_number || 1,
      },
      payment: {
        prefix: settings.payment_prefix || 'PAY',
        field: 'payment_next_number' as const,
        next: settings.payment_next_number || 1,
      },
      receipt: {
        prefix: settings.receipt_prefix || 'RCP',
        field: 'receipt_next_number' as const,
        next: settings.receipt_next_number || 1,
      },
      expense: {
        prefix: settings.expense_prefix || 'EXP',
        field: 'expense_next_number' as const,
        next: settings.expense_next_number || 1,
      },
    }
    const cfg = map[kind]
    const code = `${cfg.prefix}-${padNum(cfg.next)}`
    const updated: FinanceSettings = {
      ...settings,
      [cfg.field]: cfg.next + 1,
      ...this.applyUpdateMeta(settings),
    }
    this.db
      .prepare(
        `UPDATE finance_settings
         SET invoice_prefix = @invoice_prefix,
             invoice_next_number = @invoice_next_number,
             payment_prefix = @payment_prefix,
             payment_next_number = @payment_next_number,
             receipt_prefix = @receipt_prefix,
             receipt_next_number = @receipt_next_number,
             expense_prefix = @expense_prefix,
             expense_next_number = @expense_next_number,
             allow_credit = @allow_credit,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`
      )
      .run(updated)
    enqueueSync(
      this.db,
      'finance_settings',
      updated.id,
      'UPDATE',
      updated as unknown as Record<string, unknown>
    )
    return code
  }

  audit(
    schoolId: string,
    action: string,
    entity_type: string,
    entity_id: string,
    userId: string | null,
    payload?: unknown
  ): void {
    const record: FinanceAuditLog = {
      ...this.buildBaseFields(),
      school_id: schoolId,
      action,
      entity_type,
      entity_id,
      payload_json: payload ? JSON.stringify(payload) : null,
      user_id: userId,
    }
    this.db
      .prepare(
        `INSERT INTO finance_audit_log (
           id, school_id, action, entity_type, entity_id, payload_json, user_id,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @action, @entity_type, @entity_id, @payload_json, @user_id,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'finance_audit_log',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
  }

  postLedger(
    schoolId: string,
    entries: Array<{
      account: string
      debit: number
      credit: number
      description?: string
    }>,
    ref_type: string,
    ref_id: string,
    userId: string | null,
    entry_date = todayIso()
  ): void {
    for (const e of entries) {
      const record: LedgerEntry = {
        ...this.buildBaseFields(),
        school_id: schoolId,
        entry_date,
        account: e.account,
        debit: round2(e.debit),
        credit: round2(e.credit),
        ref_type,
        ref_id,
        description: e.description ?? null,
        created_by: userId,
      }
      this.db
        .prepare(
          `INSERT INTO ledger_entries (
             id, school_id, entry_date, account, debit, credit, ref_type, ref_id,
             description, created_by,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @entry_date, @account, @debit, @credit, @ref_type, @ref_id,
             @description, @created_by,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(record)
      enqueueSync(
        this.db,
        'ledger_entries',
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
    }
  }

  /* ---------- Fee structures ---------- */

  listStructures(schoolId: string): FeeStructure[] {
    return this.db
      .prepare(
        `SELECT * FROM fee_structures
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      )
      .all(schoolId) as FeeStructure[]
  }

  getStructureLines(structureId: string): FeeStructureLine[] {
    return this.db
      .prepare(
        `SELECT * FROM fee_structure_lines
         WHERE fee_structure_id = ? AND deleted_at IS NULL
         ORDER BY sort_order ASC, name ASC`
      )
      .all(structureId) as FeeStructureLine[]
  }

  createStructure(input: {
    school_id: string
    name: string
    academic_year_id: string
    academic_term_id?: string | null
    academic_level_id?: string | null
    class_id?: string | null
    notes?: string | null
    applies_to_residence?: ResidenceApplies
    lines: Array<{
      fee_category_id?: string | null
      name: string
      amount: number
      frequency?: FeeFrequency
      is_mandatory?: boolean
      late_fee_mode?: LateFeeMode
      late_fee_value?: number
    }>
  }): FeeStructure {
    if (!input.academic_year_id) {
      throw new Error('Academic year is required for a fee structure.')
    }
    const name = input.name.trim()
    if (!name) throw new Error('Structure name is required.')
    if (!input.lines.length) throw new Error('Add at least one fee line.')

    const structure: FeeStructure = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      name,
      academic_year_id: input.academic_year_id,
      academic_term_id: input.academic_term_id ?? null,
      academic_level_id: input.academic_level_id ?? null,
      class_id: input.class_id ?? null,
      is_active: 1,
      notes: input.notes?.trim() || null,
      applies_to_residence: input.applies_to_residence ?? 'all',
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO fee_structures (
             id, school_id, name, academic_year_id, academic_term_id,
             academic_level_id, class_id, is_active, notes, applies_to_residence,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @name, @academic_year_id, @academic_term_id,
             @academic_level_id, @class_id, @is_active, @notes, @applies_to_residence,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(structure)
      enqueueSync(
        this.db,
        'fee_structures',
        structure.id,
        'INSERT',
        structure as unknown as Record<string, unknown>
      )

      input.lines.forEach((line, idx) => {
        const row: FeeStructureLine = {
          ...this.buildBaseFields(),
          school_id: input.school_id,
          fee_structure_id: structure.id,
          fee_category_id: line.fee_category_id ?? null,
          name: line.name.trim(),
          amount: round2(line.amount),
          frequency: line.frequency ?? 'termly',
          is_mandatory: line.is_mandatory === false ? 0 : 1,
          late_fee_mode: line.late_fee_mode ?? 'none',
          late_fee_value: round2(line.late_fee_value ?? 0),
          sort_order: idx,
        }
        this.db
          .prepare(
            `INSERT INTO fee_structure_lines (
               id, school_id, fee_structure_id, fee_category_id, name, amount,
               frequency, is_mandatory, late_fee_mode, late_fee_value, sort_order,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (
               @id, @school_id, @fee_structure_id, @fee_category_id, @name, @amount,
               @frequency, @is_mandatory, @late_fee_mode, @late_fee_value, @sort_order,
               @created_at, @updated_at, @deleted_at, @sync_status, @version
             )`
          )
          .run(row)
        enqueueSync(
          this.db,
          'fee_structure_lines',
          row.id,
          'INSERT',
          row as unknown as Record<string, unknown>
        )
      })
    })
    tx()
    return structure
  }

  setStructureActive(id: string, is_active: boolean): FeeStructure | undefined {
    const existing = this.db
      .prepare(
        `SELECT * FROM fee_structures WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as FeeStructure | undefined
    if (!existing) return undefined
    const record: FeeStructure = {
      ...existing,
      is_active: is_active ? 1 : 0,
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE fee_structures
         SET is_active = @is_active,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)
    enqueueSync(
      this.db,
      'fee_structures',
      record.id,
      'UPDATE',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  deleteStructure(id: string): void {
    const existing = this.db
      .prepare(
        `SELECT * FROM fee_structures WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as FeeStructure | undefined
    if (!existing) return
    const now = new Date().toISOString()
    const updated = {
      ...existing,
      deleted_at: now,
      updated_at: now,
      version: existing.version + 1,
      sync_status: 'pending' as const,
    }
    this.db
      .prepare(
        `UPDATE fee_structures
         SET deleted_at = @deleted_at, updated_at = @updated_at,
             version = @version, sync_status = @sync_status
         WHERE id = @id`
      )
      .run(updated)
    enqueueSync(
      this.db,
      'fee_structures',
      id,
      'DELETE',
      updated as unknown as Record<string, unknown>
    )
  }

  /* ---------- Discounts ---------- */

  listDiscounts(schoolId: string): FeeDiscount[] {
    return this.db
      .prepare(
        `SELECT * FROM fee_discounts
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY name ASC`
      )
      .all(schoolId) as FeeDiscount[]
  }

  createDiscount(input: {
    school_id: string
    name: string
    discount_mode: 'percent' | 'fixed'
    discount_value: number
    academic_year_id?: string | null
    notes?: string | null
  }): FeeDiscount {
    const record: FeeDiscount = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      name: input.name.trim(),
      discount_mode: input.discount_mode,
      discount_value: round2(input.discount_value),
      academic_year_id: input.academic_year_id ?? null,
      is_active: 1,
      notes: input.notes?.trim() || null,
    }
    this.db
      .prepare(
        `INSERT INTO fee_discounts (
           id, school_id, name, discount_mode, discount_value, academic_year_id,
           is_active, notes,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @name, @discount_mode, @discount_value, @academic_year_id,
           @is_active, @notes,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'fee_discounts',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  /* ---------- Invoices ---------- */

  listInvoices(
    schoolId: string,
    filters?: {
      status?: InvoiceStatus | 'all'
      studentId?: string | null
      classId?: string | null
      search?: string | null
    }
  ): Invoice[] {
    let rows = this.db
      .prepare(
        `SELECT * FROM invoices
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY issue_date DESC, created_at DESC`
      )
      .all(schoolId) as Invoice[]

    if (filters?.status && filters.status !== 'all') {
      rows = rows.filter((r) => r.status === filters.status)
    }
    if (filters?.studentId) {
      rows = rows.filter((r) => r.student_id === filters.studentId)
    }
    return rows
  }

  getInvoice(id: string): Invoice | undefined {
    return this.findById(id)
  }

  getInvoiceLines(invoiceId: string): InvoiceLine[] {
    return this.db
      .prepare(
        `SELECT * FROM invoice_lines
         WHERE invoice_id = ? AND deleted_at IS NULL
         ORDER BY sort_order ASC`
      )
      .all(invoiceId) as InvoiceLine[]
  }

  private insertInvoiceWithLines(
    invoice: Invoice,
    lines: Array<{
      fee_category_id?: string | null
      description: string
      amount: number
      is_adjustment?: boolean
    }>,
    userId: string | null
  ): Invoice {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO invoices (
             id, school_id, student_id, invoice_number, academic_year_id, academic_term_id,
             fee_structure_id, billing_period, issue_date, due_date, status,
             subtotal, discount_total, net_payable, amount_paid, balance,
             carried_from_invoice_id, notes,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @student_id, @invoice_number, @academic_year_id, @academic_term_id,
             @fee_structure_id, @billing_period, @issue_date, @due_date, @status,
             @subtotal, @discount_total, @net_payable, @amount_paid, @balance,
             @carried_from_invoice_id, @notes,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(invoice)
      enqueueSync(
        this.db,
        'invoices',
        invoice.id,
        'INSERT',
        invoice as unknown as Record<string, unknown>
      )

      lines.forEach((line, idx) => {
        const row: InvoiceLine = {
          ...this.buildBaseFields(),
          school_id: invoice.school_id,
          invoice_id: invoice.id,
          fee_category_id: line.fee_category_id ?? null,
          description: line.description.trim(),
          amount: round2(line.amount),
          is_adjustment: line.is_adjustment ? 1 : 0,
          sort_order: idx,
        }
        this.db
          .prepare(
            `INSERT INTO invoice_lines (
               id, school_id, invoice_id, fee_category_id, description, amount,
               is_adjustment, sort_order,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (
               @id, @school_id, @invoice_id, @fee_category_id, @description, @amount,
               @is_adjustment, @sort_order,
               @created_at, @updated_at, @deleted_at, @sync_status, @version
             )`
          )
          .run(row)
        enqueueSync(
          this.db,
          'invoice_lines',
          row.id,
          'INSERT',
          row as unknown as Record<string, unknown>
        )
      })

      this.postLedger(
        invoice.school_id,
        [
          {
            account: 'accounts_receivable',
            debit: invoice.net_payable,
            credit: 0,
            description: `Invoice ${invoice.invoice_number}`,
          },
          {
            account: 'fee_revenue',
            debit: 0,
            credit: invoice.net_payable,
            description: `Invoice ${invoice.invoice_number}`,
          },
        ],
        'invoice',
        invoice.id,
        userId,
        invoice.issue_date
      )
    })
    tx()
    return invoice
  }

  generateInvoice(input: {
    school_id: string
    student_id: string
    fee_structure_id: string
    due_date?: string | null
    billing_period?: string | null
    notes?: string | null
    carry_arrears?: boolean
    userId: string | null
    discount_mode?: 'percent' | 'fixed' | null
    discount_value?: number
    extra_lines?: Array<{ description: string; amount: number }>
  }): Invoice {
    const structure = this.db
      .prepare(
        `SELECT * FROM fee_structures WHERE id = ? AND deleted_at IS NULL`
      )
      .get(input.fee_structure_id) as FeeStructure | undefined
    if (!structure || structure.school_id !== input.school_id) {
      throw new Error('Fee structure not found.')
    }
    if (!structure.is_active) throw new Error('Fee structure is inactive.')

    const student = this.db
      .prepare(
        `SELECT residence_type FROM students WHERE id = ? AND deleted_at IS NULL`
      )
      .get(input.student_id) as { residence_type?: string } | undefined
    if (
      !structureAppliesToStudent(
        structure.applies_to_residence,
        student?.residence_type
      )
    ) {
      throw new Error(
        'This fee structure does not apply to the student residence type (day / boarding).'
      )
    }

    const lines = this.getStructureLines(structure.id).filter(
      (l) => l.is_mandatory === 1 || true
    )
    const chargeLines = lines.map((l) => ({
      fee_category_id: l.fee_category_id,
      description: l.name,
      amount: l.amount,
    }))

    for (const extra of input.extra_lines ?? []) {
      chargeLines.push({
        fee_category_id: null,
        description: extra.description,
        amount: extra.amount,
      })
    }

    let arrears = 0
    let carriedFrom: string | null = null
    if (input.carry_arrears) {
      const prior = this.db
        .prepare(
          `SELECT * FROM invoices
           WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL
             AND status IN ('pending','partially_paid','overdue')
             AND balance > 0
           ORDER BY due_date ASC`
        )
        .all(input.school_id, input.student_id) as Invoice[]
      for (const inv of prior) {
        arrears = round2(arrears + inv.balance)
        carriedFrom = carriedFrom || inv.id
      }
      if (arrears > 0) {
        chargeLines.push({
          fee_category_id: null,
          description: 'Arrears carry-forward',
          amount: arrears,
        })
      }
    }

    const subtotal = round2(chargeLines.reduce((s, l) => s + l.amount, 0))
    let discount_total = 0
    if (input.discount_mode === 'percent') {
      discount_total = round2((subtotal * (input.discount_value || 0)) / 100)
    } else if (input.discount_mode === 'fixed') {
      discount_total = round2(input.discount_value || 0)
    }
    discount_total = Math.min(discount_total, subtotal)
    const net_payable = round2(subtotal - discount_total)
    const invoice_number = this.bumpCounter(input.school_id, 'invoice')
    const issue_date = todayIso()
    const due_date = input.due_date || null

    const invoice: Invoice = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      student_id: input.student_id,
      invoice_number,
      academic_year_id: structure.academic_year_id,
      academic_term_id: structure.academic_term_id,
      fee_structure_id: structure.id,
      billing_period: input.billing_period?.trim() || structure.name,
      issue_date,
      due_date,
      status: invoiceStatus(net_payable, 0, due_date),
      subtotal,
      discount_total,
      net_payable,
      amount_paid: 0,
      balance: net_payable,
      carried_from_invoice_id: carriedFrom,
      notes: input.notes?.trim() || null,
    }

    const finalLines =
      discount_total > 0
        ? [
            ...chargeLines,
            {
              fee_category_id: null as string | null,
              description: 'Discount',
              amount: -discount_total,
              is_adjustment: true,
            },
          ]
        : chargeLines.map((l) => ({ ...l, is_adjustment: false }))

    const created = this.insertInvoiceWithLines(
      invoice,
      finalLines,
      input.userId
    )
    this.audit(
      input.school_id,
      'invoice.create',
      'invoice',
      created.id,
      input.userId,
      { invoice_number, net_payable }
    )
    return created
  }

  adjustInvoice(
    invoiceId: string,
    lines: Array<{ description: string; amount: number }>,
    userId: string | null
  ): Invoice {
    const invoice = this.getInvoice(invoiceId)
    if (!invoice) throw new Error('Invoice not found.')
    if (invoice.status === 'cancelled') {
      throw new Error('Cannot adjust a cancelled invoice.')
    }
    if (invoice.amount_paid > 0) {
      throw new Error('Cannot fully rebuild a paid invoice; add adjustment lines only.')
    }

    const existingLines = this.getInvoiceLines(invoiceId)
    const all = [
      ...existingLines.map((l) => ({
        fee_category_id: l.fee_category_id,
        description: l.description,
        amount: l.amount,
        is_adjustment: l.is_adjustment === 1,
      })),
      ...lines.map((l) => ({
        fee_category_id: null as string | null,
        description: l.description,
        amount: l.amount,
        is_adjustment: true,
      })),
    ]
    const subtotal = round2(
      all.filter((l) => l.amount >= 0).reduce((s, l) => s + l.amount, 0)
    )
    const discount_total = round2(
      Math.abs(
        all.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0)
      )
    )
    const net_payable = round2(all.reduce((s, l) => s + l.amount, 0))
    const amount_paid = invoice.amount_paid
    const balance = round2(Math.max(0, net_payable - amount_paid))
    const status = invoiceStatus(net_payable, amount_paid, invoice.due_date)

    const tx = this.db.transaction(() => {
      for (const line of lines) {
        const row: InvoiceLine = {
          ...this.buildBaseFields(),
          school_id: invoice.school_id,
          invoice_id: invoice.id,
          fee_category_id: null,
          description: line.description.trim(),
          amount: round2(line.amount),
          is_adjustment: 1,
          sort_order: existingLines.length + 1,
        }
        this.db
          .prepare(
            `INSERT INTO invoice_lines (
               id, school_id, invoice_id, fee_category_id, description, amount,
               is_adjustment, sort_order,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (
               @id, @school_id, @invoice_id, @fee_category_id, @description, @amount,
               @is_adjustment, @sort_order,
               @created_at, @updated_at, @deleted_at, @sync_status, @version
             )`
          )
          .run(row)
        enqueueSync(
          this.db,
          'invoice_lines',
          row.id,
          'INSERT',
          row as unknown as Record<string, unknown>
        )
      }

      const delta = round2(net_payable - invoice.net_payable)
      const updated: Invoice = {
        ...invoice,
        subtotal,
        discount_total,
        net_payable,
        balance,
        status,
        ...this.applyUpdateMeta(invoice),
      }
      this.db
        .prepare(
          `UPDATE invoices
           SET subtotal = @subtotal,
               discount_total = @discount_total,
               net_payable = @net_payable,
               balance = @balance,
               status = @status,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(updated)
      enqueueSync(
        this.db,
        'invoices',
        updated.id,
        'UPDATE',
        updated as unknown as Record<string, unknown>
      )

      if (Math.abs(delta) > 0.0001) {
        if (delta > 0) {
          this.postLedger(
            invoice.school_id,
            [
              {
                account: 'accounts_receivable',
                debit: delta,
                credit: 0,
                description: `Adjustment ${invoice.invoice_number}`,
              },
              {
                account: 'fee_revenue',
                debit: 0,
                credit: delta,
                description: `Adjustment ${invoice.invoice_number}`,
              },
            ],
            'invoice_adjustment',
            invoice.id,
            userId
          )
        } else {
          this.postLedger(
            invoice.school_id,
            [
              {
                account: 'fee_revenue',
                debit: Math.abs(delta),
                credit: 0,
                description: `Adjustment ${invoice.invoice_number}`,
              },
              {
                account: 'accounts_receivable',
                debit: 0,
                credit: Math.abs(delta),
                description: `Adjustment ${invoice.invoice_number}`,
              },
            ],
            'invoice_adjustment',
            invoice.id,
            userId
          )
        }
      }
    })
    tx()
    this.audit(
      invoice.school_id,
      'invoice.adjust',
      'invoice',
      invoiceId,
      userId,
      { lines }
    )
    return this.getInvoice(invoiceId)!
  }

  refreshOverdue(schoolId: string): number {
    const rows = this.listInvoices(schoolId).filter(
      (i) =>
        i.balance > 0 &&
        i.due_date &&
        i.due_date < todayIso() &&
        i.status !== 'cancelled' &&
        i.status !== 'paid'
    )
    let n = 0
    for (const inv of rows) {
      if (inv.status === 'overdue') continue
      const updated: Invoice = {
        ...inv,
        status: 'overdue',
        ...this.applyUpdateMeta(inv),
      }
      this.db
        .prepare(
          `UPDATE invoices SET status = @status, updated_at = @updated_at,
             version = @version, sync_status = @sync_status WHERE id = @id`
        )
        .run(updated)
      enqueueSync(
        this.db,
        'invoices',
        updated.id,
        'UPDATE',
        updated as unknown as Record<string, unknown>
      )
      n += 1
    }
    return n
  }

  /* ---------- Payments & receipts ---------- */

  studentCreditTotal(schoolId: string, studentId: string): number {
    const rows = this.db
      .prepare(
        `SELECT remaining FROM student_credits
         WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL
           AND remaining > 0`
      )
      .all(schoolId, studentId) as Array<{ remaining: number }>
    return round2(rows.reduce((s, r) => s + r.remaining, 0))
  }

  recordPayment(input: {
    school_id: string
    invoice_id: string
    amount: number
    method: PaymentMethod
    reference?: string | null
    paid_at?: string | null
    notes?: string | null
    use_credit?: boolean
    userId: string | null
  }): { payment: Payment; receipt: Receipt } {
    const invoice = this.getInvoice(input.invoice_id)
    if (!invoice || invoice.school_id !== input.school_id) {
      throw new Error('Invoice not found.')
    }
    if (invoice.status === 'cancelled') {
      throw new Error('Cannot pay a cancelled invoice.')
    }
    if (invoice.balance <= 0) throw new Error('Invoice is already paid.')

    const settings = this.getSettings(input.school_id)
    const cashIn = round2(input.amount)
    if (cashIn < 0) throw new Error('Payment amount cannot be negative.')
    if (cashIn === 0 && !input.use_credit) {
      throw new Error('Payment amount must be positive.')
    }

    let credit_applied = 0
    if (input.use_credit) {
      const available = this.studentCreditTotal(
        input.school_id,
        invoice.student_id
      )
      credit_applied = round2(Math.min(available, invoice.balance))
    }

    let remainingBalance = round2(invoice.balance - credit_applied)
    let fromCash = round2(Math.min(cashIn, Math.max(0, remainingBalance)))
    let overpay = round2(cashIn - fromCash)
    if (overpay > 0 && !(settings.allow_credit ?? 1)) {
      throw new Error(
        'Payment exceeds outstanding balance. Enable credit or reduce amount.'
      )
    }

    const applied = round2(fromCash + credit_applied)
    if (applied <= 0 && overpay <= 0) {
      throw new Error('Nothing to apply.')
    }

    const payment_number = this.bumpCounter(input.school_id, 'payment')
    const receipt_number = this.bumpCounter(input.school_id, 'receipt')
    const paid_at = input.paid_at || todayIso()

    const payment: Payment = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      student_id: invoice.student_id,
      invoice_id: invoice.id,
      payment_number,
      amount: cashIn,
      method: input.method,
      reference: input.reference?.trim() || null,
      paid_at,
      recorded_by: input.userId,
      notes: input.notes?.trim() || null,
      credit_applied,
    }

    let receipt!: Receipt

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO payments (
             id, school_id, student_id, invoice_id, payment_number, amount, method,
             reference, paid_at, recorded_by, notes, credit_applied,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @student_id, @invoice_id, @payment_number, @amount, @method,
             @reference, @paid_at, @recorded_by, @notes, @credit_applied,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(payment)
      enqueueSync(
        this.db,
        'payments',
        payment.id,
        'INSERT',
        payment as unknown as Record<string, unknown>
      )

      if (credit_applied > 0) {
        this.consumeCredit(
          input.school_id,
          invoice.student_id,
          credit_applied
        )
      }

      const newPaid = round2(invoice.amount_paid + applied)
      const newBalance = round2(Math.max(0, invoice.net_payable - newPaid))
      const updated: Invoice = {
        ...invoice,
        amount_paid: newPaid,
        balance: newBalance,
        status: invoiceStatus(invoice.net_payable, newPaid, invoice.due_date),
        ...this.applyUpdateMeta(invoice),
      }
      this.db
        .prepare(
          `UPDATE invoices
           SET amount_paid = @amount_paid,
               balance = @balance,
               status = @status,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(updated)
      enqueueSync(
        this.db,
        'invoices',
        updated.id,
        'UPDATE',
        updated as unknown as Record<string, unknown>
      )

      const cashAmount = round2(payment.amount)
      if (cashAmount > 0) {
        const ledgerRows: Array<{
          account: string
          debit: number
          credit: number
          description?: string
        }> = [
          {
            account: 'cash',
            debit: cashAmount,
            credit: 0,
            description: `Payment ${payment_number}`,
          },
        ]
        if (fromCash > 0) {
          ledgerRows.push({
            account: 'accounts_receivable',
            debit: 0,
            credit: fromCash,
            description: `Payment ${payment_number}`,
          })
        }
        if (overpay > 0) {
          ledgerRows.push({
            account: 'student_credit',
            debit: 0,
            credit: overpay,
            description: `Overpay credit ${payment_number}`,
          })
        }
        this.postLedger(
          input.school_id,
          ledgerRows,
          'payment',
          payment.id,
          input.userId,
          paid_at
        )
      }
      if (credit_applied > 0) {
        this.postLedger(
          input.school_id,
          [
            {
              account: 'student_credit',
              debit: credit_applied,
              credit: 0,
              description: `Credit applied ${payment_number}`,
            },
            {
              account: 'accounts_receivable',
              debit: 0,
              credit: credit_applied,
              description: `Credit applied ${payment_number}`,
            },
          ],
          'payment',
          payment.id,
          input.userId,
          paid_at
        )
      }

      if (overpay > 0) {
        const credit: StudentCredit = {
          ...this.buildBaseFields(),
          school_id: input.school_id,
          student_id: invoice.student_id,
          source_payment_id: payment.id,
          amount: overpay,
          remaining: overpay,
          notes: `Overpayment on ${invoice.invoice_number}`,
        }
        this.db
          .prepare(
            `INSERT INTO student_credits (
               id, school_id, student_id, source_payment_id, amount, remaining, notes,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (
               @id, @school_id, @student_id, @source_payment_id, @amount, @remaining, @notes,
               @created_at, @updated_at, @deleted_at, @sync_status, @version
             )`
          )
          .run(credit)
        enqueueSync(
          this.db,
          'student_credits',
          credit.id,
          'INSERT',
          credit as unknown as Record<string, unknown>
        )
      }

      receipt = {
        ...this.buildBaseFields(),
        school_id: input.school_id,
        payment_id: payment.id,
        student_id: invoice.student_id,
        receipt_number,
        amount: payment.amount,
        balance_remaining: newBalance,
        issued_at: paid_at,
        reprint_count: 0,
      }
      this.db
        .prepare(
          `INSERT INTO receipts (
             id, school_id, payment_id, student_id, receipt_number, amount,
             balance_remaining, issued_at, reprint_count,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @payment_id, @student_id, @receipt_number, @amount,
             @balance_remaining, @issued_at, @reprint_count,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(receipt)
      enqueueSync(
        this.db,
        'receipts',
        receipt.id,
        'INSERT',
        receipt as unknown as Record<string, unknown>
      )
    })
    tx()

    this.audit(
      input.school_id,
      'payment.record',
      'payment',
      payment.id,
      input.userId,
      { amount: payment.amount, invoice_id: invoice.id }
    )

    return { payment, receipt }
  }

  private consumeCredit(
    schoolId: string,
    studentId: string,
    amount: number
  ): void {
    let left = amount
    const rows = this.db
      .prepare(
        `SELECT * FROM student_credits
         WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL
           AND remaining > 0
         ORDER BY created_at ASC`
      )
      .all(schoolId, studentId) as StudentCredit[]
    for (const row of rows) {
      if (left <= 0) break
      const take = Math.min(row.remaining, left)
      const updated: StudentCredit = {
        ...row,
        remaining: round2(row.remaining - take),
        ...this.applyUpdateMeta(row),
      }
      this.db
        .prepare(
          `UPDATE student_credits
           SET remaining = @remaining,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(updated)
      enqueueSync(
        this.db,
        'student_credits',
        updated.id,
        'UPDATE',
        updated as unknown as Record<string, unknown>
      )
      left = round2(left - take)
    }
  }

  listPayments(schoolId: string, studentId?: string | null): Payment[] {
    if (studentId) {
      return this.db
        .prepare(
          `SELECT * FROM payments
           WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL
           ORDER BY paid_at DESC`
        )
        .all(schoolId, studentId) as Payment[]
    }
    return this.db
      .prepare(
        `SELECT * FROM payments
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY paid_at DESC`
      )
      .all(schoolId) as Payment[]
  }

  listReceipts(schoolId: string): Receipt[] {
    return this.db
      .prepare(
        `SELECT * FROM receipts
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY issued_at DESC`
      )
      .all(schoolId) as Receipt[]
  }

  getReceipt(id: string): Receipt | undefined {
    return this.db
      .prepare(
        `SELECT * FROM receipts WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as Receipt | undefined
  }

  reprintReceipt(id: string, userId: string | null): Receipt {
    const receipt = this.getReceipt(id)
    if (!receipt) throw new Error('Receipt not found.')
    const updated: Receipt = {
      ...receipt,
      reprint_count: receipt.reprint_count + 1,
      ...this.applyUpdateMeta(receipt),
    }
    this.db
      .prepare(
        `UPDATE receipts
         SET reprint_count = @reprint_count,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`
      )
      .run(updated)
    enqueueSync(
      this.db,
      'receipts',
      updated.id,
      'UPDATE',
      updated as unknown as Record<string, unknown>
    )
    this.audit(
      receipt.school_id,
      'receipt.reprint',
      'receipt',
      id,
      userId,
      { reprint_count: updated.reprint_count }
    )
    return updated
  }

  /* ---------- Expenses ---------- */

  listExpenses(
    schoolId: string,
    from?: string | null,
    to?: string | null
  ): Expense[] {
    let rows = this.db
      .prepare(
        `SELECT * FROM expenses
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY expense_date DESC`
      )
      .all(schoolId) as Expense[]
    if (from) rows = rows.filter((r) => r.expense_date >= from)
    if (to) rows = rows.filter((r) => r.expense_date <= to)
    return rows
  }

  createExpense(input: {
    school_id: string
    category: ExpenseCategory
    amount: number
    expense_date: string
    description?: string | null
    vendor?: string | null
    payment_method?: string | null
    is_recurring?: boolean
    recurring_interval?: string | null
    userId: string | null
  }): Expense {
    if (input.amount <= 0) throw new Error('Expense amount must be positive.')
    const expense_number = this.bumpCounter(input.school_id, 'expense')
    const record: Expense = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      expense_number,
      category: input.category,
      amount: round2(input.amount),
      expense_date: input.expense_date,
      description: input.description?.trim() || null,
      vendor: input.vendor?.trim() || null,
      payment_method: input.payment_method ?? null,
      receipt_path: null,
      is_recurring: input.is_recurring ? 1 : 0,
      recurring_interval: input.recurring_interval ?? null,
    }
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO expenses (
             id, school_id, expense_number, category, amount, expense_date,
             description, vendor, payment_method, receipt_path,
             is_recurring, recurring_interval,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @expense_number, @category, @amount, @expense_date,
             @description, @vendor, @payment_method, @receipt_path,
             @is_recurring, @recurring_interval,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(record)
      enqueueSync(
        this.db,
        'expenses',
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
      this.postLedger(
        input.school_id,
        [
          {
            account: `expense_${input.category}`,
            debit: record.amount,
            credit: 0,
            description: record.description || record.expense_number,
          },
          {
            account: 'cash',
            debit: 0,
            credit: record.amount,
            description: record.expense_number,
          },
        ],
        'expense',
        record.id,
        input.userId,
        record.expense_date
      )
    })
    tx()
    this.audit(
      input.school_id,
      'expense.create',
      'expense',
      record.id,
      input.userId,
      { amount: record.amount, category: record.category }
    )
    return record
  }

  /* ---------- Reminders ---------- */

  createReminder(input: {
    school_id: string
    student_id: string
    invoice_id?: string | null
    message?: string | null
    userId: string | null
  }): FinanceReminder {
    const record: FinanceReminder = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      student_id: input.student_id,
      invoice_id: input.invoice_id ?? null,
      channel: 'in_app',
      message: input.message?.trim() || null,
      sent_at: new Date().toISOString(),
    }
    this.db
      .prepare(
        `INSERT INTO finance_reminders (
           id, school_id, student_id, invoice_id, channel, message, sent_at,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @student_id, @invoice_id, @channel, @message, @sent_at,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'finance_reminders',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    this.audit(
      input.school_id,
      'reminder.send',
      'reminder',
      record.id,
      input.userId,
      { student_id: input.student_id }
    )
    return record
  }
}
