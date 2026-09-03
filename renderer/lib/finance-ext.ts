type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type BudgetPeriodType = 'monthly' | 'termly' | 'annual' | 'custom'

export interface BudgetRow {
  id: string
  academic_year_id: string
  year_name: string | null
  budget_category_id: string
  category_name: string
  category_key: string
  period_type: BudgetPeriodType
  period_start: string
  period_end: string
  allocated_amount: number
  spent: number
  remaining: number
  utilization: number
  status: string
  description: string | null
  alert: 'none' | 'alert' | 'warning' | 'critical'
  latest_alert: string | null
}

export interface OnlineTxn {
  id: string
  student_id: string
  invoice_id: string
  payment_id: string | null
  amount: number
  currency: string
  status: string
  provider_key: string
  provider_reference: string | null
  created_at: string
  completed_at: string | null
}

export interface BankDepositRow {
  id: string
  deposit_number: string
  amount: number
  collection_source: string | null
  collection_date: string | null
  deposit_date: string
  bank_name: string
  bank_account: string | null
  deposit_reference: string | null
  deposited_by: string | null
  notes: string | null
  document_path: string | null
  status: string
  reconciled: number
  unreconciled: number
  allocations: Array<{
    id: string
    payment_id: string
    amount: number
    payment_number: string | null
    student_name: string | null
  }>
}

export async function fetchBudgetMeta() {
  return (await window.ipc.invoke('finance-ext:budget-meta')) as Result<{
    can_manage: boolean
    currency: string
    thresholds: { alert: number; warning: number; critical: number }
    categories: Array<{ id: string; name: string; category_key: string }>
    years: Array<{
      id: string
      name: string
      is_current: number
      start_date: string
      end_date: string
    }>
    terms: Array<{
      id: string
      name: string
      academic_year_id: string
      start_date: string
      end_date: string
    }>
  }>
}

export async function fetchBudgets(academic_year_id?: string) {
  return (await window.ipc.invoke('finance-ext:budgets-list', {
    academic_year_id,
  })) as Result<{
    rows: BudgetRow[]
    totals: {
      allocated: number
      spent: number
      remaining: number
      utilization: number
    }
  }>
}

export async function createBudget(input: {
  academic_year_id: string
  budget_category_id: string
  period_type: BudgetPeriodType
  period_start: string
  period_end: string
  allocated_amount: number
  description?: string | null
}) {
  return (await window.ipc.invoke(
    'finance-ext:budgets-create',
    input
  )) as Result<unknown>
}

export async function createBudgetCategory(name: string) {
  return (await window.ipc.invoke('finance-ext:budget-categories-create', {
    name,
  })) as Result<unknown>
}

export async function saveBudgetThresholds(input: {
  alert: number
  warning: number
  critical: number
}) {
  return (await window.ipc.invoke(
    'finance-ext:budget-thresholds-save',
    input
  )) as Result<unknown>
}

export async function fetchOnlinePayments() {
  return (await window.ipc.invoke('finance-ext:online-list')) as Result<{
    transactions: OnlineTxn[]
  }>
}

export async function initiateOnlinePayment(input: {
  invoice_id: string
  amount: number
  idempotency_key?: string
}) {
  return (await window.ipc.invoke(
    'finance-ext:online-initiate',
    input
  )) as Result<OnlineTxn>
}

export async function completeOnlinePayment(
  id: string,
  status: 'successful' | 'failed' | 'cancelled'
) {
  return (await window.ipc.invoke('finance-ext:online-complete', {
    id,
    status,
  })) as Result<OnlineTxn>
}

export async function fetchBankDeposits() {
  return (await window.ipc.invoke('finance-ext:deposits-list')) as Result<{
    deposits: BankDepositRow[]
  }>
}

export async function createBankDeposit(input: {
  amount: number
  collection_source?: string | null
  collection_date?: string | null
  deposit_date: string
  bank_name: string
  bank_account?: string | null
  deposit_reference?: string | null
  deposited_by?: string | null
  notes?: string | null
  document_path?: string | null
}) {
  return (await window.ipc.invoke(
    'finance-ext:deposits-create',
    input
  )) as Result<BankDepositRow>
}

export async function updateBankDeposit(input: {
  id: string
  amount?: number
  collection_source?: string | null
  collection_date?: string | null
  deposit_date?: string
  bank_name?: string
  bank_account?: string | null
  deposit_reference?: string | null
  deposited_by?: string | null
  notes?: string | null
  document_path?: string | null
}) {
  return (await window.ipc.invoke(
    'finance-ext:deposits-update',
    input
  )) as Result<BankDepositRow>
}

export async function reconcileBankDeposit(
  id: string,
  items: Array<{ payment_id: string; amount: number }>
) {
  return (await window.ipc.invoke('finance-ext:deposits-reconcile', {
    id,
    items,
  })) as Result<BankDepositRow>
}

export async function verifyBankDeposit(id: string) {
  return (await window.ipc.invoke('finance-ext:deposits-verify', {
    id,
  })) as Result<BankDepositRow>
}

export async function postBankDeposit(id: string) {
  return (await window.ipc.invoke('finance-ext:deposits-post', {
    id,
  })) as Result<BankDepositRow>
}

export async function fetchCashCollections() {
  return (await window.ipc.invoke('finance-ext:cash-collections')) as Result<{
    payments: Array<{
      id: string
      payment_number: string
      amount: number
      paid_at: string
      student_id: string
      student_name?: string | null
    }>
  }>
}
