/**
 * Demo scenario tests — readable end-to-end business flows for MVP demos.
 */
import {
  BillingService,
  FeeStructureService,
  OutstandingService,
  PaymentService,
} from '../../main/services/finance'
import { AttendanceService, LeaveService } from '../../main/services/staff'
import {
  buildFeeLine,
  buildFeeStructure,
  buildLeaveBalance,
  resetIds,
} from '../fixtures/builders'
import {
  createInMemoryFinanceMocks,
  createInMemoryStaffMocks,
} from '../mocks/repositories'

describe('Demo scenarios', () => {
  beforeEach(() => resetIds())

  it('Student with partial payments and outstanding balance → fully paid', () => {
    // 1) Fee structure
    const structure = buildFeeStructure({ id: 'fs_demo' })
    const lines = [
      buildFeeLine({
        fee_structure_id: 'fs_demo',
        name: 'Tuition',
        amount: 100_000,
      }),
      buildFeeLine({
        fee_structure_id: 'fs_demo',
        name: 'Transport',
        amount: 20_000,
      }),
    ]
    const mocks = createInMemoryFinanceMocks({
      structures: [structure],
      lines,
      settings: { allow_credit: 0 } as never,
    })

    const feeService = new FeeStructureService(mocks.feeStructureRepo)
    // sanity: discount helper used at billing time
    expect(feeService.applyDiscount(120_000, 'percent', 0).net_payable).toBe(
      120_000
    )

    const billing = new BillingService(
      mocks.feeStructureRepo,
      mocks.invoiceRepo,
      mocks.paymentRepo
    )
    const payments = new PaymentService(mocks.invoiceRepo, mocks.paymentRepo)
    const outstanding = new OutstandingService(mocks.invoiceRepo)

    // 2) Generate invoice
    const invoice = billing.generateInvoice({
      school_id: 'school_1',
      student_id: 'student_ada',
      fee_structure_id: 'fs_demo',
      due_date: '2026-08-01',
      today: '2026-08-06',
    })
    expect(invoice.net_payable).toBe(120_000)
    expect(invoice.status).toBe('overdue')

    // 3) Partial payment
    const partial = payments.recordPayment({
      school_id: 'school_1',
      invoice_id: invoice.id,
      amount: 50_000,
      today: '2026-08-06',
    })
    expect(partial.invoice.status).toBe('partially_paid')
    expect(partial.invoice.balance).toBe(70_000)
    expect(partial.receipt.balance_remaining).toBe(70_000)

    // 4) Outstanding check
    const rows = outstanding.forSchool('school_1', '2026-08-06')
    const ada = rows.find((r) => r.student_id === 'student_ada')
    expect(ada?.outstanding).toBe(70_000)
    expect(ada?.aging_30).toBe(70_000) // due 5 days ago → 30-day bucket

    // 5) Complete payment
    const finalPay = payments.recordPayment({
      school_id: 'school_1',
      invoice_id: invoice.id,
      amount: 70_000,
      today: '2026-08-06',
    })
    expect(finalPay.invoice.status).toBe('paid')
    expect(finalPay.invoice.balance).toBe(0)

    // 6) Outstanding cleared
    expect(outstanding.forSchool('school_1', '2026-08-06')).toHaveLength(0)
  })

  it('Sibling invoices: arrears carry-forward then settle with credit-enabled overpay', () => {
    const structure = buildFeeStructure({ id: 'fs_1' })
    const lines = [
      buildFeeLine({ fee_structure_id: 'fs_1', amount: 50_000 }),
    ]
    const mocks = createInMemoryFinanceMocks({
      structures: [structure],
      lines,
      settings: { allow_credit: 1 } as never,
    })
    const billing = new BillingService(
      mocks.feeStructureRepo,
      mocks.invoiceRepo,
      mocks.paymentRepo
    )
    const payments = new PaymentService(mocks.invoiceRepo, mocks.paymentRepo)

    const first = billing.generateInvoice({
      school_id: 'school_1',
      student_id: 'student_1',
      fee_structure_id: 'fs_1',
      due_date: '2026-07-01',
      today: '2026-08-06',
    })
    expect(first.balance).toBe(50_000)

    const second = billing.generateInvoice({
      school_id: 'school_1',
      student_id: 'student_1',
      fee_structure_id: 'fs_1',
      carry_arrears: true,
      today: '2026-08-06',
    })
    // 50k new + 50k arrears
    expect(second.net_payable).toBe(100_000)
    expect(second.carried_from_invoice_id).toBe(first.id)

    const overpay = payments.recordPayment({
      school_id: 'school_1',
      invoice_id: second.id,
      amount: 110_000,
    })
    expect(overpay.invoice.status).toBe('paid')
    expect(overpay.payment.amount).toBe(110_000)
  })

  it('Discounted billing → partial → paid status transitions', () => {
    const structure = buildFeeStructure({ id: 'fs_1' })
    const lines = [
      buildFeeLine({ fee_structure_id: 'fs_1', amount: 200_000 }),
    ]
    const mocks = createInMemoryFinanceMocks({
      structures: [structure],
      lines,
    })
    const billing = new BillingService(
      mocks.feeStructureRepo,
      mocks.invoiceRepo,
      mocks.paymentRepo
    )
    const payments = new PaymentService(mocks.invoiceRepo, mocks.paymentRepo)

    const invoice = billing.generateInvoice({
      school_id: 'school_1',
      student_id: 'student_1',
      fee_structure_id: 'fs_1',
      discount_mode: 'percent',
      discount_value: 25,
      due_date: '2026-12-01',
      today: '2026-08-06',
    })
    expect(invoice.status).toBe('pending')
    expect(invoice.net_payable).toBe(150_000)

    const p1 = payments.recordPayment({
      school_id: 'school_1',
      invoice_id: invoice.id,
      amount: 50_000,
    })
    expect(p1.invoice.status).toBe('partially_paid')

    const p2 = payments.recordPayment({
      school_id: 'school_1',
      invoice_id: invoice.id,
      amount: 100_000,
    })
    expect(p2.invoice.status).toBe('paid')
    expect(p2.receipt.balance_remaining).toBe(0)
  })

  it('Teacher attendance month + leave approve deducts balance', () => {
    const staffMocks = createInMemoryStaffMocks({
      balances: [
        buildLeaveBalance({
          id: 'bal_sick',
          staff_id: 'teacher_1',
          leave_type: 'sick',
          entitled: 10,
          used: 0,
        }),
      ],
    })
    const attendance = new AttendanceService(staffMocks.attendanceRepo)
    const leave = new LeaveService(staffMocks.leaveRepo)

    attendance.mark({
      school_id: 'school_1',
      staff_id: 'teacher_1',
      date: '2026-08-04',
      status: 'present',
    })
    attendance.mark({
      school_id: 'school_1',
      staff_id: 'teacher_1',
      date: '2026-08-05',
      status: 'absent',
    })
    // Correction same day — still one row
    attendance.mark({
      school_id: 'school_1',
      staff_id: 'teacher_1',
      date: '2026-08-05',
      status: 'late',
    })

    const report = attendance.monthlyReport('school_1', 2026, 8)
    expect(report.teacher_1).toMatchObject({
      present: 1,
      late: 1,
      total: 2,
    })

    const req = leave.apply({
      school_id: 'school_1',
      staff_id: 'teacher_1',
      leave_type: 'sick',
      start_date: '2026-08-11',
      end_date: '2026-08-12',
    })
    expect(req.days).toBe(2)
    expect(staffMocks.balances[0].used).toBe(0) // not yet deducted

    leave.decide({ id: req.id, decision: 'approved' })
    expect(staffMocks.balances[0].used).toBe(2)
  })

  it('Rejecting leave never consumes entitlement', () => {
    const staffMocks = createInMemoryStaffMocks({
      balances: [
        buildLeaveBalance({
          id: 'bal_1',
          staff_id: 'teacher_1',
          leave_type: 'casual',
          entitled: 5,
          used: 1,
        }),
      ],
    })
    const leave = new LeaveService(staffMocks.leaveRepo)
    const req = leave.apply({
      school_id: 'school_1',
      staff_id: 'teacher_1',
      leave_type: 'casual',
      start_date: '2026-09-01',
      end_date: '2026-09-01',
    })
    leave.decide({ id: req.id, decision: 'rejected' })
    expect(staffMocks.balances[0].used).toBe(1)
  })
})
