/** Finance setup types + IPC helpers. */

export const PAYMENT_METHOD_OPTIONS = [
  { key: 'cash', label: 'Cash' },
  { key: 'mobile_money', label: 'Mobile Money' },
  { key: 'bank_transfer', label: 'Bank Transfer' },
  { key: 'cheque', label: 'Cheque' },
] as const

export const CURRENCY_OPTIONS = ['XAF', 'USD', 'EUR', 'NGN', 'GHS'] as const

export type PaymentMethodKey = (typeof PAYMENT_METHOD_OPTIONS)[number]['key']

export interface FeeCategoryDto {
  id: string
  name: string
  category_key: string
  is_system: boolean
  is_active: boolean
  sort_order: number
}

export interface FeeStructureRow {
  academic_level_id: string
  level_name: string
  amounts: Record<string, number>
}

export interface FinanceSetup {
  schoolId: string
  categories: FeeCategoryDto[]
  levels: Array<{ id: string; name: string }>
  structure: FeeStructureRow[]
  currency: string
  payment_methods: PaymentMethodKey[]
  receipt_prefix: string
  receipt_next_number: number
  receipt_example: string
}

export interface FinanceSaveInput {
  categories: Array<{
    id?: string | null
    name: string
    category_key?: string | null
    is_active: boolean
  }>
  amounts: Array<{
    academic_level_id: string
    fee_category_id: string
    amount: number
  }>
  currency: string
  payment_methods: string[]
  receipt_prefix: string
  receipt_next_number: number
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchFinanceSetup(): Promise<Result<FinanceSetup>> {
  return (await window.ipc.invoke('finance:get-setup')) as Result<FinanceSetup>
}

export async function saveFinanceSetup(
  input: FinanceSaveInput
): Promise<Result<FinanceSetup>> {
  return (await window.ipc.invoke(
    'finance:save-setup',
    input
  )) as Result<FinanceSetup>
}

/** Full amount with thousands separators — use for CSV export and print. */
export function formatMoney(amount: number, currency: string): string {
  const n = Number.isFinite(amount) ? amount : 0
  const formatted = Math.round(n).toLocaleString('en-GB', {
    maximumFractionDigits: 0,
  })
  return currency ? `${formatted} ${currency}` : formatted
}

/** Short screen amounts (K / M). Prefer finance-mgmt for reports UI. */
export function formatCompactMoney(amount: number, currency = ''): string {
  const n = Number.isFinite(amount) ? amount : 0
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  let body: string
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000
    body = `${Number(m.toFixed(m >= 10 ? 1 : 2))}M`.replace(/\.0+M$/, 'M')
  } else if (abs >= 1_000) {
    const k = abs / 1_000
    body = `${Number(k.toFixed(k >= 100 ? 0 : 1))}K`.replace(/\.0K$/, 'K')
  } else {
    body = Math.round(abs).toLocaleString('en-GB', { maximumFractionDigits: 0 })
  }
  const withSign = `${sign}${body}`
  return currency ? `${withSign} ${currency}` : withSign
}
