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
  // Teacher mobile — day schedule breaks (period clock times)
  'school_day_breaks',
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
  'payment_allocations',
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
  // Step 6 — academics & attendance
  'timetable_slots',
  'attendance_sessions',
  'attendance_records',
  'gate_attendance',
  'staff_attendance',
  'ca_assessments',
  'ca_scores',
  'exam_sessions',
  'exam_papers',
  'exam_scores',
  'assessment_question_papers',
  'assessment_question_paper_revisions',
  'assessment_question_paper_events',
  'result_calculation_profiles',
  'result_calculation_profile_versions',
  'result_calculation_class_assignments',
  'result_subject_coefficients',
  'result_runs',
  'result_subject_rows',
  'result_student_summaries',
  'report_cards',
  // Step 7 — documents & ID cards (paths/metadata only; binary assets stay local)
  'document_templates',
  'document_number_sequences',
  'document_signatories',
  'issued_documents',
  'issued_document_versions',
  'document_audit_log',
  'student_id_card_templates',
  'id_card_template_versions',
  'id_card_settings',
  'id_card_sequences',
  'student_id_cards',
  'id_card_generation_jobs',
  'id_card_generation_items',
  'id_card_print_history',
  // Step 8 — communication
  'communication_settings',
  'notification_templates',
  'announcements',
  'internal_notices',
  'communication_deliveries',
  'parent_message_threads',
  'parent_messages',
  // Step 10 — student ops / calendar / leave / teaching / reports
  // (needed so secretary, bursar, principal, and teacher desks share full school data)
  'student_settings',
  'admissions',
  'student_transfers',
  'student_documents',
  'promotion_runs',
  'promotion_mappings',
  'calendar_events',
  'leave_balances',
  'leave_requests',
  'staff_notifications',
  'teaching_syllabi',
  'syllabus_topics',
  'teaching_logs',
  'report_settings',
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
 * Per-table sequence columns that must never move backward across desks.
 * Keyed by generic sync table name.
 */
export const SEQUENCE_MAX_BY_TABLE: Partial<
  Record<string, readonly string[]>
> = {
  finance_settings: FINANCE_SEQUENCE_COLUMNS,
  document_number_sequences: ['next_number'],
  id_card_sequences: ['next_number'],
}

/**
 * Result-run lifecycle — never regress when desks sync
 * (draft → computed → published → locked).
 */
export const RESULT_RUN_STATUS_RANK: Record<string, number> = {
  draft: 0,
  computed: 1,
  published: 2,
  locked: 3,
}

export function preferResultRunStatus(
  local: unknown,
  remote: unknown
): string {
  const l = String(local || 'draft')
  const r = String(remote || 'draft')
  const lr = RESULT_RUN_STATUS_RANK[l] ?? 0
  const rr = RESULT_RUN_STATUS_RANK[r] ?? 0
  return rr >= lr ? r : l
}

/** Question-paper review — never regress approved → pending on multi-desk pull. */
export const ASSESSMENT_QUESTION_STATUS_RANK: Record<string, number> = {
  pending_review: 0,
  rejected: 1,
  approved: 2,
}

export function preferAssessmentQuestionStatus(
  local: unknown,
  remote: unknown
): string {
  const l = String(local || 'pending_review')
  const r = String(remote || 'pending_review')
  const lr = ASSESSMENT_QUESTION_STATUS_RANK[l] ?? 0
  const rr = ASSESSMENT_QUESTION_STATUS_RANK[r] ?? 0
  return rr >= lr ? r : l
}

/**
 * Columns written on generic pull upsert (must exist on local SQLite).
 * Order does not matter; `id` is always required.
 */
export const GENERIC_TABLE_COLUMNS: Record<GenericSyncTable, readonly string[]> = {
  schools: [
    'id', 'name', 'email', 'phone', 'country', 'address', 'logo_path',
    'school_code', 'short_code', 'school_type', 'education_system', 'school_category',
    'region', 'division', 'subdivision', 'website', 'stamp_path',
    'principal_signature_path',
    'day_start_time', 'day_end_time', 'period_duration_minutes', 'periods_per_day',
    'max_teacher_periods',
    'created_at', 'updated_at', 'deleted_at', 'version',
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
    'section_id', 'specialization_id', 'capacity', 'is_active', 'class_teacher_id',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  school_day_breaks: [
    'id', 'school_id', 'name', 'after_period', 'duration_minutes', 'sort_order',
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
    'section_id', 'class_id', 'is_active', 'notes', 'applies_to_residence',
    'created_at', 'updated_at', 'deleted_at', 'version',
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
  payment_allocations: [
    'id', 'school_id', 'payment_id', 'invoice_line_id', 'description', 'amount',
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
  timetable_slots: [
    'id', 'school_id', 'class_id', 'subject_id', 'staff_id', 'day_of_week',
    'period_number', 'room', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  attendance_sessions: [
    'id', 'school_id', 'class_id', 'session_date', 'notes',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  attendance_records: [
    'id', 'session_id', 'student_id', 'status',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  gate_attendance: [
    'id', 'school_id', 'student_id', 'student_code', 'attendance_date', 'scanned_at',
    'status', 'attendance_type', 'device_id', 'scanned_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  staff_attendance: [
    'id', 'school_id', 'staff_id', 'date', 'status', 'notes', 'marked_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  ca_assessments: [
    'id', 'school_id', 'name', 'subject_id', 'class_id', 'term_id', 'academic_year_id',
    'weight_percent', 'max_score', 'assessment_date',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  ca_scores: [
    'id', 'assessment_id', 'student_id', 'score', 'score_status',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  exam_sessions: [
    'id', 'school_id', 'name', 'term_id', 'academic_year_id', 'start_date', 'end_date',
    'status', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  exam_papers: [
    'id', 'exam_session_id', 'subject_id', 'class_id', 'max_score', 'exam_date',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  exam_scores: [
    'id', 'paper_id', 'student_id', 'score', 'score_status',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  assessment_question_papers: [
    'id', 'school_id', 'title', 'assessment_type', 'academic_year_id', 'term_id',
    'class_id', 'subject_id', 'teacher_staff_id', 'exam_session_id', 'exam_paper_id',
    'ca_assessment_id', 'current_revision_id', 'current_revision_number', 'current_status',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  assessment_question_paper_revisions: [
    'id', 'school_id', 'paper_id', 'revision_number', 'file_path', 'file_name',
    'mime_type', 'file_size', 'status', 'submitted_by_staff_id', 'submitted_at',
    'reviewed_by_user_id', 'reviewed_at', 'rejection_note',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  assessment_question_paper_events: [
    'id', 'school_id', 'paper_id', 'revision_id', 'action',
    'actor_user_id', 'actor_staff_id', 'notes',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  result_calculation_profiles: [
    'id', 'school_id', 'name', 'description', 'academic_year_id', 'period_mode', 'status',
    'created_by', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  result_calculation_profile_versions: [
    'id', 'school_id', 'profile_id', 'version_number', 'config_json', 'config_hash',
    'created_by', 'created_at',
  ],
  result_calculation_class_assignments: [
    'id', 'school_id', 'profile_id', 'class_id', 'academic_level_id', 'department_id',
    'allow_overlap', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  result_subject_coefficients: [
    'id', 'school_id', 'subject_id', 'class_id', 'academic_level_id', 'academic_year_id',
    'coefficient', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  result_runs: [
    'id', 'school_id', 'class_id', 'term_id', 'academic_year_id', 'status',
    'computed_at', 'published_at', 'calculation_profile_id', 'calculation_version',
    'calculation_hash', 'snapshot_json', 'calculated_by', 'approved_at', 'approved_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  result_subject_rows: [
    'id', 'result_run_id', 'student_id', 'subject_id', 'ca_score', 'exam_score', 'total',
    'grade', 'sequence_scores_json', 'ca_average', 'subject_mark', 'coefficient',
    'weighted_mark', 'remark', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  result_student_summaries: [
    'id', 'result_run_id', 'student_id', 'average', 'total', 'grade', 'position', 'remark',
    'promotion_outcome', 'gpa', 'failed_subjects', 'total_coefficients',
    'total_weighted_marks', 'passed_subjects', 'status',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  report_cards: [
    'id', 'school_id', 'student_id', 'class_id', 'term_id', 'academic_year_id',
    'result_run_id', 'status', 'generated_at', 'payload',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  document_templates: [
    'id', 'school_id', 'template_key', 'title', 'header_text', 'footer_text', 'logo_path',
    'show_logo', 'show_stamp', 'show_signature', 'signature_label', 'is_enabled',
    'body_text', 'document_family', 'type_code', 'category', 'description',
    'required_fields', 'number_pattern', 'signatory_role', 'is_default',
    'requires_approval', 'created_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  document_number_sequences: [
    'id', 'school_id', 'type_code', 'year_key', 'next_number',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  document_signatories: [
    'id', 'school_id', 'role_key', 'display_name', 'title', 'signature_path', 'is_active',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  issued_documents: [
    'id', 'school_id', 'document_family', 'template_id', 'template_key', 'document_number',
    'verification_code', 'student_id', 'academic_year_id', 'term_id', 'status',
    'version_number', 'supersedes_id', 'generated_by', 'issued_at', 'issued_by',
    'voided_at', 'rendered_html', 'metadata_json',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  issued_document_versions: [
    'id', 'school_id', 'issued_document_id', 'version_number', 'rendered_html',
    'metadata_json', 'created_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  document_audit_log: [
    'id', 'school_id', 'action', 'entity_type', 'entity_id', 'user_id', 'payload_json',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  student_id_card_templates: [
    'id', 'school_id', 'name', 'is_default', 'front_layout', 'back_layout', 'show_photo',
    'validity_months', 'is_system', 'category', 'description', 'card_type', 'status',
    'orientation', 'width_mm', 'height_mm', 'unit', 'sample_key', 'current_version_id',
    'current_version_number', 'updated_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  id_card_template_versions: [
    'id', 'school_id', 'template_id', 'version_number', 'design_json', 'created_by',
    'created_at',
  ],
  id_card_settings: [
    'id', 'school_id', 'settings_json',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  id_card_sequences: [
    'id', 'school_id', 'scope_key', 'next_number',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  student_id_cards: [
    'id', 'school_id', 'student_id', 'student_code', 'academic_year_id', 'template_id',
    'class_id', 'class_name', 'student_name', 'valid_from', 'valid_to', 'generated_at',
    'generated_by', 'template_version_id', 'card_number', 'verification_code',
    'issue_date', 'expiry_date', 'status', 'card_kind', 'replaced_card_id',
    'replacement_reason', 'printed_at', 'issued_at', 'issued_by', 'job_id',
    'snapshot_json', 'revoked_at', 'revoked_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  id_card_generation_jobs: [
    'id', 'school_id', 'job_number', 'template_id', 'template_version_id',
    'academic_year_id', 'card_kind', 'status', 'total', 'processed', 'successful',
    'failed', 'skipped', 'paper_size', 'cards_per_row', 'margin_mm', 'gap_x_mm',
    'gap_y_mm', 'crop_marks', 'missing_photo_policy', 'created_by', 'completed_at',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  id_card_generation_items: [
    'id', 'school_id', 'job_id', 'student_id', 'card_id', 'status', 'error', 'warning',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  id_card_print_history: [
    'id', 'school_id', 'job_id', 'card_ids_json', 'paper_size', 'cards_per_row',
    'card_count', 'printed_at', 'printed_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  communication_settings: [
    'id', 'school_id', 'sms_provider', 'sms_api_key', 'sms_sender_name',
    'channel_sms', 'channel_email', 'channel_internal',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  notification_templates: [
    'id', 'school_id', 'template_key', 'title', 'subject', 'body', 'is_enabled',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  announcements: [
    'id', 'school_id', 'title', 'body', 'audience_type', 'class_id',
    'academic_level_id', 'status', 'channels_json', 'recipient_count', 'sent_at',
    'created_by', 'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  internal_notices: [
    'id', 'school_id', 'title', 'body', 'audience', 'priority', 'expires_at',
    'sent_at', 'recipient_count', 'created_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  communication_deliveries: [
    'id', 'school_id', 'announcement_id', 'student_id', 'thread_id', 'channel',
    'recipient_name', 'recipient_contact', 'subject', 'body', 'status', 'sent_at',
    'error_message', 'created_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  parent_message_threads: [
    'id', 'school_id', 'student_id', 'guardian_name', 'guardian_phone',
    'guardian_email', 'last_message_at',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  parent_messages: [
    'id', 'school_id', 'thread_id', 'direction', 'channel', 'body', 'status',
    'sent_at', 'created_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  student_settings: [
    'id', 'school_id', 'student_id_format',
    'field_full_name', 'field_gender', 'field_date_of_birth', 'field_place_of_birth',
    'field_parent_information', 'field_emergency_contact',
    'admit_new', 'admit_returning', 'admit_transfer',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  admissions: [
    'id', 'school_id', 'full_name', 'gender', 'date_of_birth', 'phone', 'email',
    'address', 'academic_level_id', 'preferred_class_id', 'admission_year',
    'guardian_name', 'guardian_phone', 'guardian_email', 'guardian_relationship',
    'status', 'notes', 'student_id', 'photo_path',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  student_transfers: [
    'id', 'school_id', 'student_id', 'from_class_id', 'to_school_name',
    'transfer_date', 'reason', 'status',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  student_documents: [
    'id', 'school_id', 'student_id', 'document_type', 'title', 'file_path', 'notes',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  promotion_runs: [
    'id', 'school_id', 'from_year', 'to_year', 'status', 'notes',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  promotion_mappings: [
    'id', 'promotion_run_id', 'from_class_id', 'to_class_id', 'student_count',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  calendar_events: [
    'id', 'academic_year_id', 'type', 'title', 'start_date', 'end_date',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  leave_balances: [
    'id', 'school_id', 'staff_id', 'leave_type', 'year', 'entitled', 'used',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  leave_requests: [
    'id', 'school_id', 'staff_id', 'leave_type', 'start_date', 'end_date', 'days',
    'reason', 'status', 'reviewed_by', 'reviewed_at', 'review_notes',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  staff_notifications: [
    'id', 'school_id', 'user_id', 'title', 'body', 'link', 'read_at',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  teaching_syllabi: [
    'id', 'school_id', 'subject_id', 'academic_year_id', 'academic_level_id',
    'class_id', 'title', 'term_weeks', 'created_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  syllabus_topics: [
    'id', 'school_id', 'syllabus_id', 'parent_id', 'title', 'sequence',
    'objectives', 'coverage_status',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  teaching_logs: [
    'id', 'school_id', 'syllabus_id', 'topic_id', 'staff_id', 'class_id',
    'subject_id', 'academic_year_id', 'academic_term_id', 'lesson_date',
    'description', 'status', 'progress_percent', 'remarks', 'created_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
  report_settings: [
    'id', 'school_id', 'attendance_risk_pct', 'pass_mark',
    'created_at', 'updated_at', 'deleted_at', 'version',
  ],
}

/** SQL array literal for Postgres migrations / docs. */
export function genericSyncTablesSqlArray(): string {
  return `ARRAY[${GENERIC_SYNC_TABLES.map((t) => `'${t}'`).join(', ')}]::text[]`
}
