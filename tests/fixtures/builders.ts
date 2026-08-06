import type {
  ExpenseRecord,
  FeeStructureLineRecord,
  FeeStructureRecord,
  FinanceSettingsRecord,
  InvoiceRecord,
  PaymentRecord,
  ReceiptRecord,
} from '../../main/services/finance'
import type {
  AttendanceRecord,
  LeaveBalanceRecord,
  LeaveRequestRecord,
} from '../../main/services/staff'
import type { FeeFrequency, InvoiceStatus } from '../../main/domain/finance'
import type {
  LeaveRequestStatus,
  LeaveType,
  StaffAttendanceStatus,
} from '../../main/domain/staff'

let seq = 0
export function resetIds(): void {
  seq = 0
}
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${seq}`
}

export function buildFeeStructure(
  overrides: Partial<FeeStructureRecord> = {}
): FeeStructureRecord {
  return {
    id: nextId('fs'),
    school_id: 'school_1',
    name: 'Form 1 Term Fees',
    academic_year_id: 'year_2026',
    class_id: 'class_1',
    is_active: 1,
    ...overrides,
  }
}

export function buildFeeLine(
  overrides: Partial<FeeStructureLineRecord> = {}
): FeeStructureLineRecord {
  return {
    id: nextId('fsl'),
    fee_structure_id: 'fs_1',
    name: 'Tuition',
    amount: 100_000,
    frequency: 'termly' as FeeFrequency,
    ...overrides,
  }
}

export function buildInvoice(
  overrides: Partial<InvoiceRecord> = {}
): InvoiceRecord {
  return {
    id: nextId('inv'),
    school_id: 'school_1',
    student_id: 'student_1',
    invoice_number: 'INV-00001',
    fee_structure_id: 'fs_1',
    status: 'pending' as InvoiceStatus,
    subtotal: 100_000,
    discount_total: 0,
    net_payable: 100_000,
    amount_paid: 0,
    balance: 100_000,
    due_date: '2026-09-30',
    carried_from_invoice_id: null,
    ...overrides,
  }
}

export function buildSettings(
  overrides: Partial<FinanceSettingsRecord> = {}
): FinanceSettingsRecord {
  return {
    allow_credit: 1,
    invoice_prefix: 'INV',
    invoice_next_number: 1,
    payment_prefix: 'PAY',
    payment_next_number: 1,
    receipt_prefix: 'RCP',
    receipt_next_number: 1,
    expense_prefix: 'EXP',
    expense_next_number: 1,
    ...overrides,
  }
}

export function buildExpense(
  overrides: Partial<ExpenseRecord> = {}
): ExpenseRecord {
  return {
    id: nextId('exp'),
    school_id: 'school_1',
    expense_number: 'EXP-00001',
    category: 'utilities',
    amount: 25_000,
    expense_date: '2026-08-01',
    description: 'Electricity',
    ...overrides,
  }
}

export function buildAttendance(
  overrides: Partial<AttendanceRecord> = {}
): AttendanceRecord {
  return {
    id: nextId('att'),
    school_id: 'school_1',
    staff_id: 'staff_1',
    date: '2026-08-06',
    status: 'present' as StaffAttendanceStatus,
    notes: null,
    ...overrides,
  }
}

export function buildLeaveRequest(
  overrides: Partial<LeaveRequestRecord> = {}
): LeaveRequestRecord {
  return {
    id: nextId('leave'),
    school_id: 'school_1',
    staff_id: 'staff_1',
    leave_type: 'sick' as LeaveType,
    start_date: '2026-08-10',
    end_date: '2026-08-12',
    days: 3,
    status: 'pending' as LeaveRequestStatus,
    reason: null,
    ...overrides,
  }
}

export function buildLeaveBalance(
  overrides: Partial<LeaveBalanceRecord> = {}
): LeaveBalanceRecord {
  return {
    id: nextId('bal'),
    staff_id: 'staff_1',
    leave_type: 'sick',
    year: 2026,
    entitled: 10,
    used: 0,
    ...overrides,
  }
}

export type {
  PaymentRecord,
  ReceiptRecord,
}
