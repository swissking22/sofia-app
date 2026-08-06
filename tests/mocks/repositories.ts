import type {
  ExpenseRepositoryPort,
  ExpenseRecord,
  FeeStructureLineRecord,
  FeeStructureRecord,
  FeeStructureRepositoryPort,
  FinanceSettingsRecord,
  InvoiceRecord,
  InvoiceRepositoryPort,
  PaymentRecord,
  PaymentRepositoryPort,
  ReceiptRecord,
} from '../../main/services/finance'
import { nextDocumentNumber } from '../../main/services/finance'
import type {
  AttendanceRecord,
  AttendanceRepositoryPort,
  LeaveBalanceRecord,
  LeaveRepositoryPort,
  LeaveRequestRecord,
} from '../../main/services/staff'
import type { FeeFrequency } from '../../main/domain/finance'
import type {
  LeaveType,
  StaffAttendanceStatus,
} from '../../main/domain/staff'
import { buildSettings } from '../fixtures/builders'

export function createInMemoryFinanceMocks(seed?: {
  structures?: FeeStructureRecord[]
  lines?: FeeStructureLineRecord[]
  invoices?: InvoiceRecord[]
  settings?: FinanceSettingsRecord
}) {
  const structures = [...(seed?.structures ?? [])]
  const lines = [...(seed?.lines ?? [])]
  const invoices = [...(seed?.invoices ?? [])]
  const payments: PaymentRecord[] = []
  const receipts: ReceiptRecord[] = []
  const expenses: ExpenseRecord[] = []
  const settings = { ...buildSettings(), ...seed?.settings }
  const counters = {
    invoice: settings.invoice_next_number,
    payment: settings.payment_next_number,
    receipt: settings.receipt_next_number,
    expense: settings.expense_next_number,
  }
  let studentCredit = 0

  const feeStructureRepo: FeeStructureRepositoryPort = {
    listStructures: (schoolId) =>
      structures.filter((s) => s.school_id === schoolId),
    getStructure: (id) => structures.find((s) => s.id === id),
    getStructureLines: (structureId) =>
      lines.filter((l) => l.fee_structure_id === structureId),
    createStructure: (input) => {
      const row: FeeStructureRecord = {
        id: `fs_${structures.length + 1}`,
        school_id: input.school_id,
        name: input.name,
        academic_year_id: input.academic_year_id,
        class_id: input.class_id ?? null,
        is_active: 1,
      }
      structures.push(row)
      input.lines.forEach((l, i) => {
        lines.push({
          id: `fsl_${lines.length + 1}`,
          fee_structure_id: row.id,
          name: l.name,
          amount: l.amount,
          frequency: (l.frequency ?? 'termly') as FeeFrequency,
        })
        void i
      })
      return row
    },
    createDiscount: (input) => ({
      id: `disc_1`,
      discount_mode: input.discount_mode,
      discount_value: input.discount_value,
    }),
  }

  const invoiceRepo: InvoiceRepositoryPort = {
    getInvoice: (id) => invoices.find((i) => i.id === id),
    listOpenBalances: (schoolId, studentId) =>
      invoices.filter(
        (i) =>
          i.school_id === schoolId &&
          i.student_id === studentId &&
          i.balance > 0 &&
          ['pending', 'partially_paid', 'overdue'].includes(i.status)
      ),
    listOutstandingInvoices: (schoolId) =>
      invoices.filter((i) => i.school_id === schoolId && i.balance > 0),
    saveInvoice: (invoice) => {
      invoices.push(invoice)
      return invoice
    },
    updateInvoice: (invoice) => {
      const idx = invoices.findIndex((i) => i.id === invoice.id)
      if (idx >= 0) invoices[idx] = invoice
      return invoice
    },
  }

  const paymentRepo: PaymentRepositoryPort = {
    savePayment: (p) => {
      payments.push(p)
      return p
    },
    saveReceipt: (r) => {
      receipts.push(r)
      return r
    },
    listReceiptNumbers: () => receipts.map((r) => r.receipt_number),
    getStudentCreditTotal: () => studentCredit,
    getSettings: () => settings,
    bumpCounter: (_schoolId, kind) => {
      const prefix =
        kind === 'invoice'
          ? settings.invoice_prefix
          : kind === 'payment'
            ? settings.payment_prefix
            : kind === 'receipt'
              ? settings.receipt_prefix
              : settings.expense_prefix
      const code = nextDocumentNumber(prefix, counters[kind])
      counters[kind] += 1
      return code
    },
  }

  const expenseRepo: ExpenseRepositoryPort = {
    saveExpense: (e) => {
      expenses.push(e)
      return e
    },
    listExpenses: (schoolId, from, to) =>
      expenses.filter((e) => {
        if (e.school_id !== schoolId) return false
        if (from && e.expense_date < from) return false
        if (to && e.expense_date > to) return false
        return true
      }),
    bumpExpenseNumber: (schoolId) => paymentRepo.bumpCounter(schoolId, 'expense'),
  }

  return {
    structures,
    lines,
    invoices,
    payments,
    receipts,
    expenses,
    settings,
    setStudentCredit: (n: number) => {
      studentCredit = n
    },
    feeStructureRepo,
    invoiceRepo,
    paymentRepo,
    expenseRepo,
  }
}

export function createInMemoryStaffMocks(seed?: {
  attendance?: AttendanceRecord[]
  leaves?: LeaveRequestRecord[]
  balances?: LeaveBalanceRecord[]
}) {
  const attendance = [...(seed?.attendance ?? [])]
  const leaves = [...(seed?.leaves ?? [])]
  const balances = [...(seed?.balances ?? [])]

  const attendanceRepo: AttendanceRepositoryPort = {
    findByStaffDate: (schoolId, staffId, date) =>
      attendance.find(
        (a) =>
          a.school_id === schoolId &&
          a.staff_id === staffId &&
          a.date === date
      ),
    upsertDay: (input) => {
      const existing = attendance.find(
        (a) =>
          a.school_id === input.school_id &&
          a.staff_id === input.staff_id &&
          a.date === input.date
      )
      if (existing) {
        existing.status = input.status
        existing.notes = input.notes ?? null
        return existing
      }
      const row: AttendanceRecord = {
        id: `att_${attendance.length + 1}`,
        school_id: input.school_id,
        staff_id: input.staff_id,
        date: input.date,
        status: input.status as StaffAttendanceStatus,
        notes: input.notes ?? null,
      }
      attendance.push(row)
      return row
    },
    findBySchoolMonth: (schoolId, year, month) => {
      const prefix = `${year}-${String(month).padStart(2, '0')}`
      return attendance.filter(
        (a) => a.school_id === schoolId && a.date.startsWith(prefix)
      )
    },
  }

  const leaveRepo: LeaveRepositoryPort = {
    listActiveRequests: (schoolId, staffId) =>
      leaves.filter(
        (l) =>
          l.school_id === schoolId &&
          l.staff_id === staffId &&
          (l.status === 'pending' || l.status === 'approved')
      ),
    getBalance: (_s, staffId, leaveType, year) =>
      balances.find(
        (b) =>
          b.staff_id === staffId &&
          b.leave_type === leaveType &&
          b.year === year
      ),
    createRequest: (input) => {
      const row: LeaveRequestRecord = {
        id: `leave_${leaves.length + 1}`,
        school_id: input.school_id,
        staff_id: input.staff_id,
        leave_type: input.leave_type as LeaveType,
        start_date: input.start_date,
        end_date: input.end_date,
        days: input.days,
        status: 'pending',
        reason: input.reason ?? null,
      }
      leaves.push(row)
      return row
    },
    findById: (id) => leaves.find((l) => l.id === id),
    decide: (id, status) => {
      const row = leaves.find((l) => l.id === id)
      if (!row) throw new Error('missing')
      row.status = status
      return row
    },
    addUsed: (balanceId, days) => {
      const bal = balances.find((b) => b.id === balanceId)
      if (bal) bal.used += days
    },
  }

  return { attendance, leaves, balances, attendanceRepo, leaveRepo }
}
