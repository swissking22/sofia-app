import { faker } from '@faker-js/faker'
import { randomUUID } from 'node:crypto'
import type { SeedContext } from './context'
import {
  baseFields,
  daysAgo,
  isoDate,
  padNum,
  round2,
  runInTransaction,
} from './helpers'

const METHODS = ['cash', 'mobile_money', 'bank_transfer'] as const
const EXPENSE_CATEGORIES = [
  'utilities',
  'maintenance',
  'supplies',
  'transport',
  'miscellaneous',
] as const

type PayBucket = 'paid' | 'partial' | 'unpaid'

/**
 * Fee structures per class, invoices per student (40/40/20 pay mix),
 * receipts, and expenses — including named demo scenarios.
 */
export function seedFinance(ctx: SeedContext): void {
  const { db } = ctx
  const now = new Date().toISOString()

  runInTransaction(db, () => {
    seedFinanceSettings(ctx, now)
    seedFeeStructures(ctx, now)
    seedInvoicesPaymentsReceipts(ctx, now)
    seedExpenses(ctx, now)
  })

  const inv = db.prepare(`SELECT COUNT(*) AS n FROM invoices`).get() as {
    n: number
  }
  const pay = db.prepare(`SELECT COUNT(*) AS n FROM payments`).get() as {
    n: number
  }
  const exp = db.prepare(`SELECT COUNT(*) AS n FROM expenses`).get() as {
    n: number
  }
  console.log(
    `  Fee structures: ${ctx.feeStructures.length}, Invoices: ${inv.n}, Payments: ${pay.n}, Expenses: ${exp.n}`
  )
}

function seedFinanceSettings(ctx: SeedContext, now: string): void {
  const { db } = ctx
  const insert = db.prepare(`
    INSERT INTO finance_settings (
      id, school_id, currency, payment_methods,
      receipt_prefix, receipt_next_number,
      invoice_prefix, invoice_next_number,
      payment_prefix, payment_next_number,
      expense_prefix, expense_next_number,
      allow_credit,
      created_at, updated_at, deleted_at, sync_status, version
    ) VALUES (
      @id, @school_id, 'XAF', @payment_methods,
      'RCP', 1, 'INV', 1, 'PAY', 1, 'EXP', 1, 1,
      @created_at, @updated_at, @deleted_at, @sync_status, @version
    )
  `)

  // Some DBs may miss newer columns — migrations in createSchema should add them
  for (const school of ctx.schools) {
    insert.run({
      ...baseFields(now),
      school_id: school.id,
      payment_methods: JSON.stringify(['cash', 'mobile_money', 'bank_transfer']),
    })
  }
}

function seedFeeStructures(ctx: SeedContext, now: string): void {
  const { db } = ctx
  const structureInsert = db.prepare(`
    INSERT INTO fee_structures (
      id, school_id, name, academic_year_id, academic_term_id,
      academic_level_id, section_id, class_id, is_active, notes,
      created_at, updated_at, deleted_at, sync_status, version
    ) VALUES (
      @id, @school_id, @name, @academic_year_id, @academic_term_id,
      @academic_level_id, @section_id, @class_id, 1, @notes,
      @created_at, @updated_at, @deleted_at, @sync_status, @version
    )
  `)
  const lineInsert = db.prepare(`
    INSERT INTO fee_structure_lines (
      id, school_id, fee_structure_id, fee_category_id, name, amount,
      frequency, is_mandatory, late_fee_mode, late_fee_value, sort_order,
      created_at, updated_at, deleted_at, sync_status, version
    ) VALUES (
      @id, @school_id, @fee_structure_id, NULL, @name, @amount,
      'termly', 1, 'none', 0, @sort_order,
      @created_at, @updated_at, @deleted_at, @sync_status, @version
    )
  `)

  for (const cls of ctx.classes) {
    const yearId = ctx.years.get(cls.school_id)!
    const termId = ctx.terms.get(cls.school_id)?.[0] ?? null
    const tuition = faker.number.int({ min: 80_000, max: 150_000 })
    const development = faker.number.int({ min: 10_000, max: 25_000 })
    const exam = faker.number.int({ min: 5_000, max: 15_000 })
    const total = tuition + development + exam
    const id = randomUUID()

    structureInsert.run({
      ...baseFields(now),
      id,
      school_id: cls.school_id,
      name: `${cls.name} — Term Fees`,
      academic_year_id: yearId,
      academic_term_id: termId,
      academic_level_id: cls.academic_level_id,
      section_id: cls.section_id ?? null,
      class_id: cls.id,
      notes: 'Seeded fee structure',
    })

    const lines = [
      { name: 'Tuition', amount: tuition, sort_order: 0 },
      { name: 'Development Fee', amount: development, sort_order: 1 },
      { name: 'Exam Fee', amount: exam, sort_order: 2 },
    ]
    for (const line of lines) {
      lineInsert.run({
        ...baseFields(now),
        school_id: cls.school_id,
        fee_structure_id: id,
        name: line.name,
        amount: line.amount,
        sort_order: line.sort_order,
      })
    }

    ctx.feeStructures.push({
      id,
      school_id: cls.school_id,
      class_id: cls.id,
      academic_year_id: yearId,
      total,
    })
  }
}

function nextCode(
  ctx: SeedContext,
  schoolId: string,
  kind: 'invoice' | 'payment' | 'receipt' | 'expense'
): string {
  const c = ctx.counters.get(schoolId)!
  const prefixes = {
    invoice: 'INV',
    payment: 'PAY',
    receipt: 'RCP',
    expense: 'EXP',
  } as const
  const code = `${prefixes[kind]}-${padNum(c[kind])}`
  c[kind] += 1
  return code
}

function assignBucket(index: number, total: number): PayBucket {
  // First few reserved for explicit demo scenarios
  if (index === 0) return 'partial'
  if (index === 1) return 'paid'
  if (index === 2) return 'unpaid'
  const r = index / Math.max(1, total)
  if (r < 0.4) return 'paid'
  if (r < 0.8) return 'partial'
  return 'unpaid'
}

function seedInvoicesPaymentsReceipts(ctx: SeedContext, now: string): void {
  const { db } = ctx

  const invoiceInsert = db.prepare(`
    INSERT INTO invoices (
      id, school_id, student_id, invoice_number, academic_year_id, academic_term_id,
      fee_structure_id, billing_period, issue_date, due_date, status,
      subtotal, discount_total, net_payable, amount_paid, balance,
      carried_from_invoice_id, notes,
      created_at, updated_at, deleted_at, sync_status, version
    ) VALUES (
      @id, @school_id, @student_id, @invoice_number, @academic_year_id, @academic_term_id,
      @fee_structure_id, @billing_period, @issue_date, @due_date, @status,
      @subtotal, @discount_total, @net_payable, @amount_paid, @balance,
      NULL, @notes,
      @created_at, @updated_at, @deleted_at, @sync_status, @version
    )
  `)

  const lineInsert = db.prepare(`
    INSERT INTO invoice_lines (
      id, school_id, invoice_id, fee_category_id, description, amount,
      is_adjustment, sort_order,
      created_at, updated_at, deleted_at, sync_status, version
    ) VALUES (
      @id, @school_id, @invoice_id, NULL, @description, @amount,
      @is_adjustment, @sort_order,
      @created_at, @updated_at, @deleted_at, @sync_status, @version
    )
  `)

  const paymentInsert = db.prepare(`
    INSERT INTO payments (
      id, school_id, student_id, invoice_id, payment_number, amount, method,
      reference, paid_at, recorded_by, notes, credit_applied,
      created_at, updated_at, deleted_at, sync_status, version
    ) VALUES (
      @id, @school_id, @student_id, @invoice_id, @payment_number, @amount, @method,
      @reference, @paid_at, NULL, @notes, 0,
      @created_at, @updated_at, @deleted_at, @sync_status, @version
    )
  `)

  const receiptInsert = db.prepare(`
    INSERT INTO receipts (
      id, school_id, payment_id, student_id, receipt_number, amount,
      balance_remaining, issued_at, reprint_count,
      created_at, updated_at, deleted_at, sync_status, version
    ) VALUES (
      @id, @school_id, @payment_id, @student_id, @receipt_number, @amount,
      @balance_remaining, @issued_at, 0,
      @created_at, @updated_at, @deleted_at, @sync_status, @version
    )
  `)

  const structureByClass = new Map(
    ctx.feeStructures.map((f) => [f.class_id, f])
  )

  for (const school of ctx.schools) {
    const students = ctx.students.filter((s) => s.school_id === school.id)
    const yearId = ctx.years.get(school.id)!
    const termId = ctx.terms.get(school.id)?.[0] ?? null

    students.forEach((student, index) => {
      const structure = structureByClass.get(student.class_id)
      if (!structure) return

      const subtotal = structure.total
      const discount =
        index % 11 === 0
          ? round2(subtotal * 0.1)
          : index % 17 === 0
            ? 5_000
            : 0
      const net = round2(Math.max(0, subtotal - discount))
      const bucket = assignBucket(index, students.length)

      let amount_paid = 0
      let status: 'pending' | 'partially_paid' | 'paid' | 'overdue' = 'pending'
      let balance = net

      if (bucket === 'paid') {
        amount_paid = net
        balance = 0
        status = 'paid'
      } else if (bucket === 'partial') {
        amount_paid = round2(net * faker.number.float({ min: 0.25, max: 0.7 }))
        balance = round2(net - amount_paid)
        status = 'partially_paid'
      } else {
        // 20% unpaid — half overdue for aging demos
        amount_paid = 0
        balance = net
        status = index % 2 === 0 ? 'overdue' : 'pending'
      }

      const invoiceId = randomUUID()
      const invoice_number = nextCode(ctx, school.id, 'invoice')
      const due_date =
        status === 'overdue'
          ? isoDate(daysAgo(45))
          : isoDate(daysAgo(-20)) // future-ish due
      const issue_date = isoDate(daysAgo(faker.number.int({ min: 5, max: 40 })))

      const demoNote =
        index === 0
          ? 'DEMO: partial payment + outstanding'
          : index === 1
            ? 'DEMO: fully paid student'
            : index === 2
              ? 'DEMO: unpaid / outstanding'
              : null

      invoiceInsert.run({
        ...baseFields(now),
        id: invoiceId,
        school_id: school.id,
        student_id: student.id,
        invoice_number,
        academic_year_id: yearId,
        academic_term_id: termId,
        fee_structure_id: structure.id,
        billing_period: 'Term 1 2025/2026',
        issue_date,
        due_date,
        status,
        subtotal,
        discount_total: discount,
        net_payable: net,
        amount_paid,
        balance,
        notes: demoNote,
      })

      lineInsert.run({
        ...baseFields(now),
        school_id: school.id,
        invoice_id: invoiceId,
        description: 'Tuition + fees',
        amount: subtotal,
        is_adjustment: 0,
        sort_order: 0,
      })
      if (discount > 0) {
        lineInsert.run({
          ...baseFields(now),
          school_id: school.id,
          invoice_id: invoiceId,
          description: 'Discount',
          amount: -discount,
          is_adjustment: 1,
          sort_order: 1,
        })
      }

      if (amount_paid > 0) {
        // One payment covering amount_paid (partial or full)
        const paymentId = randomUUID()
        const payment_number = nextCode(ctx, school.id, 'payment')
        const receipt_number = nextCode(ctx, school.id, 'receipt')
        const paid_at = isoDate(daysAgo(faker.number.int({ min: 1, max: 25 })))
        const method = faker.helpers.arrayElement(METHODS)

        paymentInsert.run({
          ...baseFields(now),
          id: paymentId,
          school_id: school.id,
          student_id: student.id,
          invoice_id: invoiceId,
          payment_number,
          amount: amount_paid,
          method,
          reference: faker.string.alphanumeric(8).toUpperCase(),
          paid_at,
          notes: demoNote,
        })

        receiptInsert.run({
          ...baseFields(now),
          school_id: school.id,
          payment_id: paymentId,
          student_id: student.id,
          receipt_number,
          amount: amount_paid,
          balance_remaining: balance,
          issued_at: paid_at,
        })
      }
    })

    // Bump finance_settings counters to stay ahead of seeded numbers
    const c = ctx.counters.get(school.id)!
    db.prepare(
      `UPDATE finance_settings
       SET invoice_next_number = ?, payment_next_number = ?,
           receipt_next_number = ?, expense_next_number = ?
       WHERE school_id = ?`
    ).run(c.invoice, c.payment, c.receipt, c.expense, school.id)
  }
}

function seedExpenses(ctx: SeedContext, now: string): void {
  const { db } = ctx
  const insert = db.prepare(`
    INSERT INTO expenses (
      id, school_id, expense_number, category, amount, expense_date,
      description, vendor, payment_method, receipt_path,
      is_recurring, recurring_interval,
      created_at, updated_at, deleted_at, sync_status, version
    ) VALUES (
      @id, @school_id, @expense_number, @category, @amount, @expense_date,
      @description, @vendor, @payment_method, NULL,
      0, NULL,
      @created_at, @updated_at, @deleted_at, @sync_status, @version
    )
  `)

  for (const school of ctx.schools) {
    const count = faker.number.int({ min: 25, max: 45 })
    for (let i = 0; i < count; i++) {
      const category = faker.helpers.arrayElement(EXPENSE_CATEGORIES)
      insert.run({
        ...baseFields(now),
        school_id: school.id,
        expense_number: nextCode(ctx, school.id, 'expense'),
        category,
        amount: round2(
          faker.number.int({ min: 5_000, max: 250_000 })
        ),
        expense_date: isoDate(daysAgo(faker.number.int({ min: 0, max: 90 }))),
        description: `${category} — ${faker.commerce.productName()}`,
        vendor: faker.company.name(),
        payment_method: faker.helpers.arrayElement(METHODS),
      })
    }
    const c = ctx.counters.get(school.id)!
    db.prepare(
      `UPDATE finance_settings SET expense_next_number = ? WHERE school_id = ?`
    ).run(c.expense, school.id)
  }
}
