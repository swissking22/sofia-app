/** Finance & Fees IPC helpers. */

export type FeeFrequency = "one_time" | "monthly" | "termly" | "yearly";
export type LateFeeMode = "none" | "fixed" | "percent";
export type DiscountMode = "percent" | "fixed";
export type InvoiceStatus =
  | "pending"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";
export type PaymentMethod =
  | "cash"
  | "mobile_money"
  | "bank_transfer"
  | "card"
  | "cheque"
  | "online";
export type ExpenseCategory =
  | "salaries"
  | "utilities"
  | "maintenance"
  | "supplies"
  | "transport"
  | "miscellaneous";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface FinanceMeta {
  can_manage: boolean;
  currency: string;
  payment_methods: string[];
  categories: Array<{ id: string; name: string; category_key: string }>;
  levels: Array<{ id: string; name: string }>;
  classes: Array<{
    id: string;
    name: string;
    academic_level_id: string | null;
  }>;
  years: Array<{ id: string; name: string; is_current: number }>;
  terms: Array<{ id: string; name: string; academic_year_id: string }>;
  students: Array<{
    id: string;
    name: string;
    student_code: string | null;
    class_id: string;
    class_name: string | null;
    academic_level_id: string | null;
  }>;
}

export interface FeeStructureLineDto {
  id: string;
  fee_category_id: string | null;
  name: string;
  amount: number;
  frequency: FeeFrequency;
  is_mandatory: number;
  late_fee_mode: LateFeeMode;
  late_fee_value: number;
  sort_order: number;
}

export interface FeeStructureDto {
  id: string;
  name: string;
  academic_year_id: string;
  academic_term_id: string | null;
  academic_level_id: string | null;
  class_id: string | null;
  is_active: number;
  notes: string | null;
  year_name: string | null;
  level_name: string | null;
  class_name: string | null;
  applies_to_residence?: "all" | "day" | "boarding";
  lines: FeeStructureLineDto[];
  total: number;
}

export interface FeeDiscountDto {
  id: string;
  name: string;
  discount_mode: DiscountMode;
  discount_value: number;
  academic_year_id: string | null;
  is_active: number;
  notes: string | null;
}

export interface InvoiceDto {
  id: string;
  student_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  subtotal: number;
  discount_total: number;
  net_payable: number;
  amount_paid: number;
  balance: number;
  notes: string | null;
  fee_structure_id: string | null;
  student_name?: string;
  student_code?: string | null;
  class_name?: string | null;
}

export interface InvoiceLineDto {
  id: string;
  description: string;
  amount: number;
  is_adjustment: number;
  fee_category_id: string | null;
}

export interface InvoiceDetailDto extends InvoiceDto {
  lines: InvoiceLineDto[];
  credit_balance: number;
}

export interface PaymentDto {
  id: string;
  student_id: string;
  invoice_id: string;
  payment_number: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paid_at: string;
  notes: string | null;
  credit_applied: number;
  student_name?: string;
  invoice_number?: string | null;
}

export interface ReceiptDto {
  id: string;
  payment_id: string;
  student_id: string;
  receipt_number: string;
  amount: number;
  balance_remaining: number;
  issued_at: string;
  reprint_count: number;
  student_name?: string;
  student_code?: string | null;
  payment_number?: string | null;
  method?: PaymentMethod | null;
}

export interface ReceiptDetailDto {
  receipt: ReceiptDto;
  student: {
    id: string;
    name: string;
    student_code: string | null;
  } | null;
  payment: PaymentDto | null;
  invoice: InvoiceDto | null;
  school_name: string;
  template: {
    header_text: string;
    footer_text: string;
    title: string;
  } | null;
  rendered_html?: string | null;
  print_css?: string | null;
}

export interface OutstandingStudentRow {
  student_id: string;
  student_name: string;
  student_code: string | null;
  class_id: string | null;
  class_name: string | null;
  total_billed: number;
  total_paid: number;
  outstanding: number;
  aging_current: number;
  aging_30: number;
  aging_60: number;
  invoice_ids: string[];
}

export interface OutstandingClassRow {
  class_id: string | null;
  class_name: string | null;
  students: number;
  outstanding: number;
  aging_current: number;
  aging_30: number;
  aging_60: number;
}

export interface ExpenseDto {
  id: string;
  expense_number: string;
  category: ExpenseCategory;
  amount: number;
  expense_date: string;
  description: string | null;
  vendor: string | null;
  payment_method: string | null;
  is_recurring: number;
  recurring_interval: string | null;
}

export interface FinanceReportDto {
  from: string;
  to: string;
  revenue: number;
  collected: number;
  outstanding: number;
  expenses: number;
  profit_loss: number;
  payment_by_method: Record<string, number>;
  expense_by_category: Record<string, number>;
  invoice_count: number;
  payment_count: number;
}

export interface StudentFinanceSummary {
  invoices: InvoiceDto[];
  payments: PaymentDto[];
  credit_balance: number;
  outstanding: number;
}

export const FREQUENCY_LABELS: Record<FeeFrequency, string> = {
  one_time: "One-time",
  monthly: "Monthly",
  termly: "Termly",
  yearly: "Yearly",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: "Pending",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  mobile_money: "Mobile money",
  bank_transfer: "Bank transfer",
  card: "Card",
  cheque: "Cheque",
  online: "Online payment",
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  salaries: "Salaries",
  utilities: "Utilities",
  maintenance: "Maintenance",
  supplies: "Supplies",
  transport: "Transport",
  miscellaneous: "Miscellaneous",
};

export const EXPENSE_CATEGORIES = Object.keys(
  EXPENSE_CATEGORY_LABELS
) as ExpenseCategory[];

export function formatMoney(amount: number, currency: string): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString()} ${currency}`;
}

export async function fetchFinanceMeta(): Promise<Result<FinanceMeta>> {
  return (await window.ipc.invoke("finance-mgmt:meta")) as Result<FinanceMeta>;
}

export async function fetchStructures(): Promise<Result<FeeStructureDto[]>> {
  return (await window.ipc.invoke(
    "finance-mgmt:structures-list"
  )) as Result<FeeStructureDto[]>;
}

export async function createStructure(input: {
  name: string;
  academic_year_id: string;
  academic_term_id?: string | null;
  academic_level_id?: string | null;
  class_id?: string | null;
  notes?: string | null;
  applies_to_residence?: "all" | "day" | "boarding";
  lines: Array<{
    fee_category_id?: string | null;
    name: string;
    amount: number;
    frequency?: FeeFrequency;
    is_mandatory?: boolean;
    late_fee_mode?: LateFeeMode;
    late_fee_value?: number;
  }>;
}): Promise<Result<FeeStructureDto>> {
  return (await window.ipc.invoke(
    "finance-mgmt:structures-create",
    input
  )) as Result<FeeStructureDto>;
}

export async function setStructureActive(input: {
  id: string;
  is_active: boolean;
}): Promise<Result<FeeStructureDto>> {
  return (await window.ipc.invoke(
    "finance-mgmt:structures-set-active",
    input
  )) as Result<FeeStructureDto>;
}

export async function deleteStructure(
  id: string
): Promise<Result<{ id: string }>> {
  return (await window.ipc.invoke("finance-mgmt:structures-delete", {
    id,
  })) as Result<{ id: string }>;
}

export async function fetchDiscounts(): Promise<Result<FeeDiscountDto[]>> {
  return (await window.ipc.invoke(
    "finance-mgmt:discounts-list"
  )) as Result<FeeDiscountDto[]>;
}

export async function createDiscount(input: {
  name: string;
  discount_mode: DiscountMode;
  discount_value: number;
  academic_year_id?: string | null;
  notes?: string | null;
}): Promise<Result<FeeDiscountDto>> {
  return (await window.ipc.invoke(
    "finance-mgmt:discounts-create",
    input
  )) as Result<FeeDiscountDto>;
}

export async function fetchInvoices(filters?: {
  status?: InvoiceStatus | "all";
  studentId?: string | null;
  search?: string | null;
}): Promise<Result<InvoiceDto[]>> {
  return (await window.ipc.invoke(
    "finance-mgmt:invoices-list",
    filters ?? {}
  )) as Result<InvoiceDto[]>;
}

export async function fetchInvoice(
  id: string
): Promise<Result<InvoiceDetailDto>> {
  return (await window.ipc.invoke("finance-mgmt:invoices-get", {
    id,
  })) as Result<InvoiceDetailDto>;
}

export async function generateInvoice(input: {
  student_id: string;
  fee_structure_id: string;
  due_date?: string | null;
  billing_period?: string | null;
  notes?: string | null;
  carry_arrears?: boolean;
  discount_mode?: DiscountMode | null;
  discount_value?: number;
  extra_lines?: Array<{ description: string; amount: number }>;
}): Promise<Result<InvoiceDetailDto>> {
  return (await window.ipc.invoke(
    "finance-mgmt:invoices-generate",
    input
  )) as Result<InvoiceDetailDto>;
}

export async function bulkGenerateInvoices(input: {
  fee_structure_id: string;
  class_id?: string | null;
  due_date?: string | null;
  carry_arrears?: boolean;
}): Promise<Result<{ created: number; skipped: number }>> {
  return (await window.ipc.invoke(
    "finance-mgmt:invoices-bulk-generate",
    input
  )) as Result<{ created: number; skipped: number }>;
}

export async function adjustInvoice(input: {
  id: string;
  lines: Array<{ description: string; amount: number }>;
}): Promise<Result<InvoiceDetailDto>> {
  return (await window.ipc.invoke(
    "finance-mgmt:invoices-adjust",
    input
  )) as Result<InvoiceDetailDto>;
}

export async function fetchPayments(filters?: {
  studentId?: string | null;
}): Promise<Result<PaymentDto[]>> {
  return (await window.ipc.invoke(
    "finance-mgmt:payments-list",
    filters ?? {}
  )) as Result<PaymentDto[]>;
}

export async function recordPayment(input: {
  invoice_id: string;
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  paid_at?: string | null;
  notes?: string | null;
  use_credit?: boolean;
}): Promise<Result<{ payment: PaymentDto; receipt: ReceiptDto }>> {
  return (await window.ipc.invoke(
    "finance-mgmt:payments-record",
    input
  )) as Result<{ payment: PaymentDto; receipt: ReceiptDto }>;
}

export async function fetchReceipts(): Promise<Result<ReceiptDto[]>> {
  return (await window.ipc.invoke(
    "finance-mgmt:receipts-list"
  )) as Result<ReceiptDto[]>;
}

export async function fetchReceipt(
  id: string
): Promise<Result<ReceiptDetailDto>> {
  return (await window.ipc.invoke("finance-mgmt:receipts-get", {
    id,
  })) as Result<ReceiptDetailDto>;
}

export async function reprintReceipt(
  id: string
): Promise<Result<ReceiptDto>> {
  return (await window.ipc.invoke("finance-mgmt:receipts-reprint", {
    id,
  })) as Result<ReceiptDto>;
}

export async function fetchOutstanding(input?: {
  classId?: string | null;
  groupBy?: "student" | "class";
}): Promise<
  Result<
    | { mode: "student"; rows: OutstandingStudentRow[] }
    | { mode: "class"; rows: OutstandingClassRow[] }
  >
> {
  return (await window.ipc.invoke(
    "finance-mgmt:outstanding",
    input ?? {}
  )) as Result<
    | { mode: "student"; rows: OutstandingStudentRow[] }
    | { mode: "class"; rows: OutstandingClassRow[] }
  >;
}

export async function sendReminders(input: {
  student_ids: string[];
  message?: string | null;
}): Promise<Result<{ sent: number }>> {
  return (await window.ipc.invoke(
    "finance-mgmt:reminders-send",
    input
  )) as Result<{ sent: number }>;
}

export async function fetchExpenses(filters?: {
  from?: string | null;
  to?: string | null;
}): Promise<Result<ExpenseDto[]>> {
  return (await window.ipc.invoke(
    "finance-mgmt:expenses-list",
    filters ?? {}
  )) as Result<ExpenseDto[]>;
}

export async function createExpense(input: {
  category: ExpenseCategory;
  amount: number;
  expense_date: string;
  description?: string | null;
  vendor?: string | null;
  payment_method?: string | null;
  is_recurring?: boolean;
  recurring_interval?: string | null;
}): Promise<Result<ExpenseDto>> {
  return (await window.ipc.invoke(
    "finance-mgmt:expenses-create",
    input
  )) as Result<ExpenseDto>;
}

export async function fetchReports(filters?: {
  from?: string | null;
  to?: string | null;
}): Promise<Result<FinanceReportDto>> {
  return (await window.ipc.invoke(
    "finance-mgmt:reports",
    filters ?? {}
  )) as Result<FinanceReportDto>;
}

export async function fetchStudentFinanceSummary(
  student_id: string
): Promise<Result<StudentFinanceSummary>> {
  return (await window.ipc.invoke("finance-mgmt:student-summary", {
    student_id,
  })) as Result<StudentFinanceSummary>;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
