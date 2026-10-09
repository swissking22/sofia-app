/** Finance payroll / payslips IPC helpers. */

export type PayslipStatus = 'draft' | 'issued' | 'paid' | 'void'

export type PayslipLineDto = {
  id: string
  line_type: 'earning' | 'deduction'
  description: string
  amount: number
  sort_order: number
}

export type PayslipDto = {
  id: string
  staff_id: string
  staff_name: string
  employee_code: string | null
  payslip_number: string
  period_year: number
  period_month: number
  issue_date: string
  paid_at: string | null
  status: PayslipStatus
  currency: string
  gross_amount: number
  deduction_amount: number
  net_amount: number
  expense_id: string | null
  expense_number: string | null
  payment_method: string | null
  notes: string | null
  lines: PayslipLineDto[]
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export const PAYSLIP_STATUS_LABELS: Record<PayslipStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  void: 'Void',
}

export function periodLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export async function fetchStaffSalary(staffId: string) {
  return (await window.ipc.invoke('finance-payroll:salaries-get', {
    staff_id: staffId,
  })) as Result<{
    amount: number
    currency: string
    effective_from: string
  } | null>
}

export async function setStaffSalary(input: {
  staff_id: string
  amount: number
  effective_from?: string
  notes?: string | null
}) {
  return (await window.ipc.invoke(
    'finance-payroll:salaries-set',
    input
  )) as Result<unknown>
}

export async function fetchPayslips(filters?: {
  year?: number | null
  month?: number | null
  status?: PayslipStatus | 'all' | null
}) {
  return (await window.ipc.invoke(
    'finance-payroll:payslips-list',
    filters || {}
  )) as Result<PayslipDto[]>
}

export async function generatePayslips(input: {
  year: number
  month: number
  issue_date?: string
}) {
  return (await window.ipc.invoke(
    'finance-payroll:payslips-generate',
    input
  )) as Result<{ created: PayslipDto[]; skipped: number }>
}

export async function markPayslipPaid(input: {
  id: string
  payment_method?: string | null
  paid_at?: string
}) {
  return (await window.ipc.invoke(
    'finance-payroll:payslips-mark-paid',
    input
  )) as Result<{ payslip: PayslipDto; expense_id: string }>
}
