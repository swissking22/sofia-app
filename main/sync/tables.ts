/**
 * Multi-desk sync table registry.
 * Students / student_id_settings keep specialized push/pull handlers.
 */

export const LEGACY_SYNC_TABLES = ['students', 'student_id_settings'] as const

/** Tables handled via generic synced_entities cloud path + generic SQLite apply. */
export const GENERIC_SYNC_TABLES = [
  // Step 1 — school foundation
  'schools',
  'academic_years',
  'academic_terms',
  'academic_levels',
  'sections',
  'specializations',
  'departments',
  'classes',
  'subjects',
  'subject_classes',
  'grading_systems',
  'assessment_types',
  'grade_bands',
  // Step 2 — users & RBAC
  'permissions',
  'roles',
  'role_permissions',
  'users',
  // Step 3 light — staff
  'staff',
  'staff_subjects',
  'staff_classes',
  // Step 5 — finance
  'finance_settings',
  'fee_categories',
  'fee_amounts',
  'fee_structures',
  'fee_structure_lines',
  'fee_discounts',
  'student_fee_discounts',
  'invoices',
  'invoice_lines',
  'payments',
  'receipts',
  'student_credits',
  'expenses',
  'ledger_entries',
  'finance_audit_log',
  'finance_reminders',
  'budget_categories',
  'budgets',
  'budget_alerts',
  'online_payment_transactions',
  'bank_deposits',
  'bank_deposit_allocations',
] as const

export type GenericSyncTable = (typeof GENERIC_SYNC_TABLES)[number]

/** Full allowlist used by the local outbox push filter. */
export const SUPPORTED_SYNC_TABLES = [
  ...LEGACY_SYNC_TABLES,
  ...GENERIC_SYNC_TABLES,
] as const

export type SupportedSyncTable = (typeof SUPPORTED_SYNC_TABLES)[number]

export function isSupportedSyncTable(table: string): table is SupportedSyncTable {
  return (SUPPORTED_SYNC_TABLES as readonly string[]).includes(table)
}

export function isGenericSyncTable(table: string): table is GenericSyncTable {
  return (GENERIC_SYNC_TABLES as readonly string[]).includes(table)
}

/** Finance numbering counters — always take MAX(local, remote) on pull. */
export const FINANCE_SEQUENCE_COLUMNS = [
  'invoice_next_number',
  'payment_next_number',
  'receipt_next_number',
  'expense_next_number',
] as const

/**
 * Columns written on generic pull upsert (must exist on local SQLite).
 * Order does not matter; `id` is always required.
 */
export const GENERIC_TABLE_COLUMNS: Record<GenericSyncTable, readonly string[]> = {
  schools: [
    'id', 'name', 'email', 'phone', 'country', 'address', 'logo_path',
    'school_code', 'short_code', 'school_type', 'education_system', 'school_category',
    'region', 'division', 'subdivision', 'website', 'stamp_path',
    'principal_signature_path', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  academic_years: [
    'id', 'school_id', 'name', 'start_date', 'end_date', 'is_current',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  academic_terms: [
    'id', 'academic_year_id', 'name', 'term_number', 'start_date', 'end_date',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  academic_levels: [
    'id', 'school_id', 'name', 'short_name', 'category', 'is_active', 'sort_order',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  sections: [
    'id', 'school_id', 'name', 'description', 'is_active',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  specializations: [
    'id', 'school_id', 'section_id', 'name', 'abbreviation', 'description', 'is_active',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  departments: [
    'id', 'school_id', 'name', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  classes: [
    'id', 'name', 'school_id', 'level', 'form_key', 'stream', 'academic_level_id',
    'section_id', 'specialization_id', 'capacity', 'is_active',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  subjects: [
    'id', 'name', 'class_id', 'school_id', 'department_id', 'coefficient',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  subject_classes: [
    'id', 'subject_id', 'class_id', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  grading_systems: [
    'id', 'school_id', 'enable_ranking', 'show_class_average', 'show_teacher_remarks',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  assessment_types: [
    'id', 'grading_system_id', 'name', 'weight_percent', 'sort_order',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  grade_bands: [
    'id', 'grading_system_id', 'grade', 'min_score', 'max_score', 'sort_order',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  permissions: [
    'id', 'name', 'label', 'module_key', 'module_label',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  roles: [
    'id', 'school_id', 'name', 'description', 'is_system',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  role_permissions: [
    'id', 'role_id', 'permission_id', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  users: [
    'id', 'school_id', 'email', 'password_hash', 'role', 'role_id', 'first_name',
    'last_name', 'phone', 'status', 'last_login_at', 'staff_id', 'failed_login_count',
    'locked_until', 'must_change_password', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  staff: [
    'id', 'school_id', 'full_name', 'gender', 'phone', 'email', 'staff_type',
    'admin_role', 'department_id', 'status', 'user_id', 'employee_code', 'joining_date',
    'address', 'job_role', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  staff_subjects: [
    'id', 'staff_id', 'subject_id', 'class_id', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  staff_classes: [
    'id', 'staff_id', 'class_id', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  finance_settings: [
    'id', 'school_id', 'currency', 'payment_methods', 'receipt_prefix', 'receipt_next_number',
    'invoice_prefix', 'invoice_next_number', 'payment_prefix', 'payment_next_number',
    'expense_prefix', 'expense_next_number', 'allow_credit', 'budget_alert_pct',
    'budget_warning_pct', 'budget_critical_pct', 'require_full_deposit_reconciliation',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  fee_categories: [
    'id', 'school_id', 'name', 'category_key', 'is_system', 'is_active', 'sort_order',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  fee_amounts: [
    'id', 'school_id', 'academic_level_id', 'fee_category_id', 'amount',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  fee_structures: [
    'id', 'school_id', 'name', 'academic_year_id', 'academic_term_id', 'academic_level_id',
    'class_id', 'is_active', 'notes', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  fee_structure_lines: [
    'id', 'school_id', 'fee_structure_id', 'fee_category_id', 'name', 'amount', 'frequency',
    'is_mandatory', 'late_fee_mode', 'late_fee_value', 'sort_order',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  fee_discounts: [
    'id', 'school_id', 'name', 'discount_mode', 'discount_value', 'academic_year_id',
    'is_active', 'notes', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  student_fee_discounts: [
    'id', 'school_id', 'student_id', 'fee_discount_id', 'discount_mode', 'discount_value',
    'reason', 'is_active', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  invoices: [
    'id', 'school_id', 'student_id', 'invoice_number', 'academic_year_id', 'academic_term_id',
    'fee_structure_id', 'billing_period', 'issue_date', 'due_date', 'status', 'subtotal',
    'discount_total', 'net_payable', 'amount_paid', 'balance', 'carried_from_invoice_id',
    'notes', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  invoice_lines: [
    'id', 'school_id', 'invoice_id', 'fee_category_id', 'description', 'amount',
    'is_adjustment', 'sort_order', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  payments: [
    'id', 'school_id', 'student_id', 'invoice_id', 'payment_number', 'amount', 'method',
    'reference', 'paid_at', 'recorded_by', 'notes', 'credit_applied',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  receipts: [
    'id', 'school_id', 'payment_id', 'student_id', 'receipt_number', 'amount',
    'balance_remaining', 'issued_at', 'reprint_count',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  student_credits: [
    'id', 'school_id', 'student_id', 'source_payment_id', 'amount', 'remaining', 'notes',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  expenses: [
    'id', 'school_id', 'expense_number', 'category', 'amount', 'expense_date', 'description',
    'vendor', 'payment_method', 'receipt_path', 'is_recurring', 'recurring_interval',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  ledger_entries: [
    'id', 'school_id', 'entry_date', 'account', 'debit', 'credit', 'ref_type', 'ref_id',
    'description', 'created_by', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  finance_audit_log: [
    'id', 'school_id', 'action', 'entity_type', 'entity_id', 'payload_json', 'user_id',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  finance_reminders: [
    'id', 'school_id', 'student_id', 'invoice_id', 'channel', 'message', 'sent_at',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  budget_categories: [
    'id', 'school_id', 'name', 'category_key', 'is_system', 'is_active', 'sort_order',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  budgets: [
    'id', 'school_id', 'academic_year_id', 'budget_category_id', 'period_type',
    'period_start', 'period_end', 'allocated_amount', 'description', 'status',
    'alert_pct', 'warning_pct', 'critical_pct', 'created_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  budget_alerts: [
    'id', 'school_id', 'budget_id', 'level', 'utilization', 'spent', 'allocated', 'message',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  online_payment_transactions: [
    'id', 'school_id', 'student_id', 'invoice_id', 'payment_id', 'amount', 'currency',
    'status', 'provider_key', 'provider_reference', 'idempotency_key', 'failure_reason',
    'initiated_by', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  bank_deposits: [
    'id', 'school_id', 'deposit_number', 'amount', 'collection_source', 'collection_date',
    'deposit_date', 'bank_name', 'bank_account', 'deposit_reference', 'deposited_by',
    'notes', 'document_path', 'status', 'verified_by', 'verified_at', 'posted_at', 'created_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  bank_deposit_allocations: [
    'id', 'school_id', 'bank_deposit_id', 'payment_id', 'amount',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
}

/** SQL array literal for Postgres migrations / docs. */
export function genericSyncTablesSqlArray(): string {
  return `ARRAY[${GENERIC_SYNC_TABLES.map((t) => `'${t}'`).join(', ')}]::text[]`
}
