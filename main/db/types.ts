/** Shared sync status for all domain tables */
export type SyncStatus = 'pending' | 'synced'

/** Sync queue operation types */
export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE'

/** Sync queue entry status */
export type SyncQueueStatus = 'pending' | 'synced' | 'failed'

/** User roles */
export type UserRole = 'admin' | 'secretary' | 'teacher'

/** Base fields required on every domain table */
export interface BaseRecord {
  id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  sync_status: SyncStatus
  version: number
}

export interface School extends BaseRecord {
  name: string
  email: string
  phone: string | null
  country: string | null
  address: string | null
  logo_path: string | null
  /** Internal/system school code (legacy SOF-… style) */
  school_code: string
  /** Human-readable short code used in student IDs (e.g. GBHSB) */
  short_code: string
  school_type: string | null
  education_system: string | null
  school_category: string | null
  region: string | null
  division: string | null
  subdivision: string | null
  website: string | null
  stamp_path: string | null
  principal_signature_path: string | null
  /** Max weekly teaching periods before workload warning (default 30). */
  max_teacher_periods: number | null
  /** First bell / first period start (HH:MM). */
  day_start_time: string | null
  /** Target school-day end (HH:MM). */
  day_end_time: string | null
  period_duration_minutes: number | null
  periods_per_day: number | null
}

export interface SchoolDayBreak extends BaseRecord {
  school_id: string
  name: string
  after_period: number
  duration_minutes: number
  sort_order: number
}

export interface User extends BaseRecord {
  school_id: string
  email: string
  password_hash: string
  /** Legacy coarse role string — kept for auth compatibility */
  role: UserRole
  /** RBAC role FK */
  role_id: string | null
  first_name: string
  last_name: string
  phone: string | null
  status: 'active' | 'inactive' | 'suspended' | string
  last_login_at: string | null
  staff_id: string | null
  failed_login_count: number
  locked_until: string | null
  must_change_password: number
}

export type StaffType = 'administrative' | 'teaching'
export type StaffAdminRole =
  | 'principal'
  | 'vice_principal'
  | 'bursar'
  | 'secretary'
export type StaffStatus = 'active' | 'inactive'
export type StaffGender = 'male' | 'female' | 'other'
/** Day-to-day job role shown in Staff Management (not payroll). */
export type StaffJobRole =
  | 'teacher'
  | 'head_of_department'
  | 'admin'
  | 'support'

export type StaffAttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'half_day'

export type LeaveType = 'sick' | 'casual' | 'paid' | 'unpaid'
export type LeaveRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'

export interface Staff extends BaseRecord {
  school_id: string
  full_name: string
  gender: StaffGender | null
  phone: string | null
  email: string | null
  staff_type: StaffType
  admin_role: StaffAdminRole | null
  department_id: string | null
  status: StaffStatus
  user_id: string | null
  employee_code: string | null
  joining_date: string | null
  address: string | null
  job_role: StaffJobRole | null
}

export interface StaffSubject extends BaseRecord {
  staff_id: string
  subject_id: string
  /** Class this subject is taught in. Null only on unmigrated legacy rows. */
  class_id: string | null
}

export interface StaffClass extends BaseRecord {
  staff_id: string
  class_id: string
}

export interface Class extends BaseRecord {
  name: string
  school_id: string | null
  /** Legacy fields — kept for older rows */
  level: string | null
  form_key: string | null
  stream: string | null
  /** New hierarchy FKs */
  academic_level_id: string | null
  section_id: string | null
  specialization_id: string | null
  capacity: number | null
  is_active: number
  /** Homeroom / class teacher */
  class_teacher_id: string | null
}

export interface StaffAttendance extends BaseRecord {
  school_id: string
  staff_id: string
  date: string
  status: StaffAttendanceStatus
  notes: string | null
  marked_by: string | null
}

export interface LeaveBalance extends BaseRecord {
  school_id: string
  staff_id: string
  leave_type: LeaveType
  year: number
  /** null = unlimited (used for unpaid) */
  entitled: number | null
  used: number
}

export interface LeaveRequest extends BaseRecord {
  school_id: string
  staff_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  days: number
  reason: string | null
  status: LeaveRequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
}

export interface StaffNotification extends BaseRecord {
  school_id: string
  user_id: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
}

export interface AcademicLevel extends BaseRecord {
  school_id: string
  name: string
  /** Short label for IDs (e.g. F1) */
  short_name: string
  category: 'lower_secondary' | 'upper_secondary'
  is_active: number
  sort_order: number
}

export interface Section extends BaseRecord {
  school_id: string
  name: string
  description: string | null
  is_active: number
}

export interface Specialization extends BaseRecord {
  school_id: string
  section_id: string
  name: string
  /** Short code used in class names (e.g. EL for Electrical) */
  abbreviation: string
  description: string | null
  is_active: number
}

export interface Student extends BaseRecord {
  name: string
  class_id: string
  school_id: string | null
  /** Immutable human-readable ID once assigned */
  student_code: string | null
  admission_year: number | null
  academic_level_id: string | null
  sequence_number: number | null
  gender: string | null
  date_of_birth: string | null
  phone: string | null
  email: string | null
  address: string | null
  admission_type: string | null
  guardian_name: string | null
  guardian_phone: string | null
  guardian_email: string | null
  guardian_relationship: string | null
  /** Passport / 4×4 photo stored under userData */
  photo_path: string | null
  /** day | boarding — boarding/dormitory fee targeting, not a boarding module */
  residence_type: ResidenceType
  /** active | alumni | transferred */
  status: string
}

export type ResidenceType = 'day' | 'boarding'

export type AdmissionStatus = 'pending' | 'accepted' | 'rejected'

/** Applicant record (admissions pipeline). */
export interface Admission extends BaseRecord {
  school_id: string
  full_name: string
  gender: string | null
  date_of_birth: string | null
  phone: string | null
  email: string | null
  address: string | null
  academic_level_id: string | null
  preferred_class_id: string | null
  admission_year: number | null
  guardian_name: string | null
  guardian_phone: string | null
  guardian_email: string | null
  guardian_relationship: string | null
  status: AdmissionStatus
  notes: string | null
  student_id: string | null
  /** Passport / 4×4 applicant photo */
  photo_path: string | null
}

export type TransferStatus = 'pending' | 'completed' | 'cancelled'

export interface StudentTransfer extends BaseRecord {
  school_id: string
  student_id: string
  from_class_id: string | null
  to_school_name: string
  transfer_date: string
  reason: string | null
  status: TransferStatus
}

export type DocumentType =
  | 'birth_certificate'
  | 'report_card'
  | 'id_card'
  | 'medical'
  | 'other'

export interface StudentDocument extends BaseRecord {
  school_id: string
  student_id: string
  document_type: DocumentType
  title: string
  file_path: string | null
  notes: string | null
}

export interface PromotionRun extends BaseRecord {
  school_id: string
  from_year: number
  to_year: number
  status: 'draft' | 'completed'
  notes: string | null
}

export interface PromotionMapping extends BaseRecord {
  promotion_run_id: string
  from_class_id: string
  to_class_id: string | null
  student_count: number
}

export type SequenceScope = 'school' | 'year' | 'year_level'

/** Per-school student ID generation settings. */
export interface StudentIdSettings extends BaseRecord {
  school_id: string
  pattern: string
  sequence_scope: SequenceScope
  next_sequence_number: number
}

/** Per-school student management configuration (setup). */
export interface StudentSettings extends BaseRecord {
  school_id: string
  /** Pattern e.g. SOF-{YEAR}-{SEQ} → SOF-2026-0001 */
  student_id_format: string
  field_full_name: number
  field_gender: number
  field_date_of_birth: number
  field_place_of_birth: number
  field_parent_information: number
  field_emergency_contact: number
  admit_new: number
  admit_returning: number
  admit_transfer: number
}

/** Fee category (Tuition, PTA, …). */
export interface FeeCategory extends BaseRecord {
  school_id: string
  name: string
  category_key: string
  is_system: number
  is_active: number
  sort_order: number
}

/** Amount for a fee category at an academic level. */
export interface FeeAmount extends BaseRecord {
  school_id: string
  academic_level_id: string
  fee_category_id: string
  amount: number
}

/** School-wide billing / payment configuration. */
export interface FinanceSettings extends BaseRecord {
  school_id: string
  currency: string
  /** JSON array of enabled method keys */
  payment_methods: string
  receipt_prefix: string
  receipt_next_number: number
  invoice_prefix: string
  invoice_next_number: number
  payment_prefix: string
  payment_next_number: number
  expense_prefix: string
  expense_next_number: number
  /** 1 = overpayments create student credit */
  allow_credit: number
  budget_alert_pct?: number
  budget_warning_pct?: number
  budget_critical_pct?: number
  require_full_deposit_reconciliation?: number
}

export type FeeFrequency = 'one_time' | 'monthly' | 'termly' | 'yearly'
export type LateFeeMode = 'none' | 'fixed' | 'percent'
export type DiscountMode = 'percent' | 'fixed'
export type InvoiceStatus =
  | 'pending'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'
export type PaymentMethod =
  | 'cash'
  | 'mobile_money'
  | 'bank_transfer'
  | 'card'
  | 'cheque'
  | 'online'

export type ResidenceApplies = 'all' | 'day' | 'boarding'
export type ExpenseCategory =
  | 'salaries'
  | 'utilities'
  | 'maintenance'
  | 'supplies'
  | 'transport'
  | 'miscellaneous'

export interface FeeStructure extends BaseRecord {
  school_id: string
  name: string
  academic_year_id: string
  academic_term_id: string | null
  academic_level_id: string | null
  /** Department / stream (sections.id). Null = all departments. */
  section_id: string | null
  class_id: string | null
  is_active: number
  notes: string | null
  applies_to_residence: ResidenceApplies
}

export interface FeeStructureLine extends BaseRecord {
  school_id: string
  fee_structure_id: string
  fee_category_id: string | null
  name: string
  amount: number
  frequency: FeeFrequency
  is_mandatory: number
  late_fee_mode: LateFeeMode
  late_fee_value: number
  sort_order: number
}

export interface FeeDiscount extends BaseRecord {
  school_id: string
  name: string
  discount_mode: DiscountMode
  discount_value: number
  academic_year_id: string | null
  is_active: number
  notes: string | null
}

export interface StudentFeeDiscount extends BaseRecord {
  school_id: string
  student_id: string
  fee_discount_id: string | null
  discount_mode: DiscountMode
  discount_value: number
  reason: string | null
  is_active: number
}

export interface Invoice extends BaseRecord {
  school_id: string
  student_id: string
  invoice_number: string
  academic_year_id: string | null
  academic_term_id: string | null
  fee_structure_id: string | null
  billing_period: string | null
  issue_date: string
  due_date: string | null
  status: InvoiceStatus
  subtotal: number
  discount_total: number
  net_payable: number
  amount_paid: number
  balance: number
  carried_from_invoice_id: string | null
  notes: string | null
}

export interface InvoiceLine extends BaseRecord {
  school_id: string
  invoice_id: string
  fee_category_id: string | null
  description: string
  amount: number
  is_adjustment: number
  sort_order: number
}

export interface Payment extends BaseRecord {
  school_id: string
  student_id: string
  invoice_id: string
  payment_number: string
  amount: number
  method: PaymentMethod
  reference: string | null
  paid_at: string
  recorded_by: string | null
  notes: string | null
  credit_applied: number
}

export interface Receipt extends BaseRecord {
  school_id: string
  payment_id: string
  student_id: string
  receipt_number: string
  amount: number
  balance_remaining: number
  issued_at: string
  reprint_count: number
}

export interface StudentCredit extends BaseRecord {
  school_id: string
  student_id: string
  source_payment_id: string | null
  amount: number
  remaining: number
  notes: string | null
}

export interface Expense extends BaseRecord {
  school_id: string
  expense_number: string
  category: ExpenseCategory
  amount: number
  expense_date: string
  description: string | null
  vendor: string | null
  payment_method: string | null
  receipt_path: string | null
  is_recurring: number
  recurring_interval: string | null
}

export interface LedgerEntry extends BaseRecord {
  school_id: string
  entry_date: string
  account: string
  debit: number
  credit: number
  ref_type: string
  ref_id: string
  description: string | null
  created_by: string | null
}

export interface FinanceAuditLog extends BaseRecord {
  school_id: string
  action: string
  entity_type: string
  entity_id: string
  payload_json: string | null
  user_id: string | null
}

export interface FinanceReminder extends BaseRecord {
  school_id: string
  student_id: string
  invoice_id: string | null
  channel: string
  message: string | null
  sent_at: string
}

/** Setup wizard keys. Custom templates use other slugs (e.g. certificate.conduct). */
export type DocumentSetupKey =
  | 'report_card'
  | 'admission_letter'
  | 'receipt'
  | 'certificate'

export type DocumentTemplateKey = string

export type DocumentFamily =
  | 'admission_letter'
  | 'certificate'
  | 'transcript'
  | 'receipt'
  | 'official'
  | 'report_card'

export type IssuedDocumentStatus =
  | 'draft'
  | 'generated'
  | 'issued'
  | 'voided'
  | 'superseded'

export type DocumentCategory =
  | 'academic'
  | 'administrative'
  | 'student'
  | 'finance'
  | 'other'

/** Per-template document branding / layout settings. */
export interface DocumentTemplate extends BaseRecord {
  school_id: string
  template_key: DocumentTemplateKey
  title: string
  header_text: string
  footer_text: string
  logo_path: string | null
  show_logo: number
  show_stamp: number
  show_signature: number
  signature_label: string
  is_enabled: number
  body_text: string
  document_family: DocumentFamily | string
  type_code: string
  category: DocumentCategory | string
  description: string
  required_fields: string
  number_pattern: string
  signatory_role: string
  is_default: number
  requires_approval: number
  created_by: string | null
}

export interface DocumentNumberSequence extends BaseRecord {
  school_id: string
  type_code: string
  year_key: string
  next_number: number
}

export interface DocumentSignatory extends BaseRecord {
  school_id: string
  role_key: string
  display_name: string
  title: string
  signature_path: string | null
  is_active: number
}

export interface IssuedDocument extends BaseRecord {
  school_id: string
  document_family: string
  template_id: string
  template_key: string
  document_number: string
  verification_code: string
  student_id: string | null
  academic_year_id: string | null
  term_id: string | null
  status: IssuedDocumentStatus | string
  version_number: number
  supersedes_id: string | null
  generated_by: string | null
  issued_at: string | null
  issued_by: string | null
  voided_at: string | null
  rendered_html: string
  metadata_json: string
}

export interface IssuedDocumentVersion extends BaseRecord {
  school_id: string
  issued_document_id: string
  version_number: number
  rendered_html: string
  metadata_json: string
  created_by: string | null
}

export interface DocumentAuditLog extends BaseRecord {
  school_id: string
  action: string
  entity_type: string
  entity_id: string
  user_id: string | null
  payload_json: string | null
}

/** School-wide SMS + notification channel configuration. */
export interface CommunicationSettings extends BaseRecord {
  school_id: string
  sms_provider: string
  sms_api_key: string
  sms_sender_name: string
  channel_sms: number
  channel_email: number
  channel_internal: number
}

export type NotificationTemplateKey =
  | 'fee_reminder'
  | 'admission_confirmation'
  | 'results_notification'
  | 'announcement'

/** Editable message templates for parent/staff notifications. */
export interface NotificationTemplate extends BaseRecord {
  school_id: string
  template_key: NotificationTemplateKey
  title: string
  subject: string
  body: string
  is_enabled: number
}

export type AnnouncementAudience = 'all' | 'class' | 'level'
export type AnnouncementStatus = 'draft' | 'sent'
export type CommunicationChannel = 'sms' | 'email' | 'internal'
export type DeliveryStatus = 'queued' | 'sent' | 'failed'
export type MessageDirection = 'outbound' | 'inbound'
export type NoticeAudience = 'all' | 'teachers' | 'admin'
export type NoticePriority = 'normal' | 'high'

/** School-wide announcement to parents (draft or sent). */
export interface Announcement extends BaseRecord {
  school_id: string
  title: string
  body: string
  audience_type: AnnouncementAudience
  class_id: string | null
  academic_level_id: string | null
  status: AnnouncementStatus
  /** JSON array of CommunicationChannel */
  channels_json: string
  recipient_count: number
  sent_at: string | null
  created_by: string | null
}

/** Outbound delivery log (SMS, email, or internal parent inbox). */
export interface CommunicationDelivery extends BaseRecord {
  school_id: string
  announcement_id: string | null
  student_id: string | null
  thread_id: string | null
  channel: CommunicationChannel
  recipient_name: string | null
  recipient_contact: string | null
  subject: string | null
  body: string
  status: DeliveryStatus
  sent_at: string | null
  error_message: string | null
  created_by: string | null
}

/** Parent messaging thread (one per student). */
export interface ParentMessageThread extends BaseRecord {
  school_id: string
  student_id: string
  guardian_name: string | null
  guardian_phone: string | null
  guardian_email: string | null
  last_message_at: string
}

/** Message within a parent thread. */
export interface ParentMessage extends BaseRecord {
  school_id: string
  thread_id: string
  direction: MessageDirection
  channel: CommunicationChannel
  body: string
  status: DeliveryStatus
  sent_at: string | null
  created_by: string | null
}

/** Internal notice broadcast to staff. */
export interface InternalNotice extends BaseRecord {
  school_id: string
  title: string
  body: string
  audience: NoticeAudience
  priority: NoticePriority
  expires_at: string | null
  sent_at: string | null
  recipient_count: number
  created_by: string | null
}

export type BackupFrequency = 'daily' | 'weekly' | 'monthly'

/** Local backup + cloud sync preferences for a school. */
export interface BackupSyncSettings extends BaseRecord {
  school_id: string
  last_sync_at: string | null
  /** idle | pending | synced | error | never */
  last_sync_status: string
  cloud_connected: number
  last_connection_test_at: string | null
  automatic_backup: number
  backup_frequency: BackupFrequency
  backup_location: string
}

export interface Department extends BaseRecord {
  school_id: string
  name: string
}

export interface Subject extends BaseRecord {
  name: string
  class_id: string
  school_id: string | null
  department_id: string | null
  coefficient: number
}

export interface SubjectClass extends BaseRecord {
  subject_id: string
  class_id: string
}

export interface Score extends BaseRecord {
  student_id: string
  subject_id: string
  test_score: number
  exam_score: number
}

/** Wizard step completion status */
export type SetupStepStatus = 'pending' | 'draft' | 'skipped' | 'completed'

export interface SetupStepRecord extends BaseRecord {
  /** Same as id — step slug e.g. school-profile */
  status: SetupStepStatus
  draft_data: string | null
  completed_at: string | null
}

export interface AcademicYear extends BaseRecord {
  school_id: string
  name: string
  start_date: string
  end_date: string
  is_current: number
}

export interface AcademicTerm extends BaseRecord {
  academic_year_id: string
  name: string
  term_number: number
  start_date: string
  end_date: string
}

export type CalendarEventType = 'holiday' | 'vacation'

export interface CalendarEvent extends BaseRecord {
  academic_year_id: string
  type: CalendarEventType
  title: string
  start_date: string
  end_date: string
}

/** School grading configuration (one active config per school). */
export interface GradingSystem extends BaseRecord {
  school_id: string
  enable_ranking: number
  show_class_average: number
  show_teacher_remarks: number
}

export interface AssessmentType extends BaseRecord {
  grading_system_id: string
  name: string
  weight_percent: number
  sort_order: number
}

export interface GradeBand extends BaseRecord {
  grading_system_id: string
  grade: string
  min_score: number
  max_score: number
  sort_order: number
}

/** School RBAC role (Principal, Teacher, custom, …). */
export interface Role extends BaseRecord {
  school_id: string
  name: string
  description: string | null
  is_system: number
  is_enabled?: number
}

/** Global permission catalog entry (MODULE.ACTION). */
export interface Permission extends BaseRecord {
  name: string
  label: string
  module_key: string
  module_label: string
}

/** Role ↔ permission assignment. */
export interface RolePermission extends BaseRecord {
  role_id: string
  permission_id: string
}

export interface SyncQueueItem {
  id: string
  table_name: string
  record_id: string
  operation: SyncOperation
  payload: string
  status: SyncQueueStatus
  retry_count: number
  last_attempt_at: string | null
  created_at: string
}

/** Weekly timetable cell (Mon–Fri, period-based). */
export interface TimetableSlot extends BaseRecord {
  school_id: string
  class_id: string
  subject_id: string | null
  staff_id: string | null
  day_of_week: number
  period_number: number
  room: string | null
}

export type AttendanceMark = 'present' | 'absent' | 'late' | 'excused'

export interface AttendanceSession extends BaseRecord {
  school_id: string
  class_id: string
  session_date: string
  notes: string | null
}

export interface AttendanceRecord extends BaseRecord {
  session_id: string
  student_id: string
  status: AttendanceMark
}

/** Entrance / gate scanner check-in (distinct from class roster sessions). */
export type GateAttendanceType = 'gate' | 'departure'
export type GateAttendanceStatus = 'present'

export interface GateAttendance extends BaseRecord {
  school_id: string
  student_id: string
  student_code: string
  attendance_date: string
  scanned_at: string
  status: GateAttendanceStatus
  attendance_type: GateAttendanceType
  device_id: string | null
  scanned_by: string | null
}

export interface CaAssessment extends BaseRecord {
  school_id: string
  name: string
  subject_id: string
  class_id: string
  term_id: string | null
  academic_year_id: string | null
  weight_percent: number
  max_score: number
  assessment_date: string | null
}

export interface CaScore extends BaseRecord {
  assessment_id: string
  student_id: string
  score: number | null
  score_status?: string
}

export type ExamSessionStatus = 'draft' | 'active' | 'closed'

export interface ExamSession extends BaseRecord {
  school_id: string
  name: string
  term_id: string | null
  academic_year_id: string | null
  start_date: string | null
  end_date: string | null
  status: ExamSessionStatus
}

export interface ExamPaper extends BaseRecord {
  exam_session_id: string
  subject_id: string
  class_id: string
  max_score: number
  exam_date: string | null
}

export interface ExamScore extends BaseRecord {
  paper_id: string
  student_id: string
  score: number | null
  score_status?: string
}

export type ResultRunStatus =
  | 'draft'
  | 'computed'
  | 'approved'
  | 'published'
  | 'locked'

export interface ResultRun extends BaseRecord {
  school_id: string
  class_id: string
  term_id: string | null
  academic_year_id: string | null
  status: ResultRunStatus
  computed_at: string | null
  published_at: string | null
  calculation_profile_id?: string | null
  calculation_version?: number | null
  calculation_hash?: string | null
  snapshot_json?: string | null
  calculated_by?: string | null
  approved_at?: string | null
  approved_by?: string | null
}

export interface ResultSubjectRow extends BaseRecord {
  result_run_id: string
  student_id: string
  subject_id: string
  ca_score: number
  exam_score: number
  total: number
  grade: string | null
  sequence_scores_json?: string | null
  ca_average?: number | null
  subject_mark?: number | null
  coefficient?: number
  weighted_mark?: number
  remark?: string | null
}

export interface ResultStudentSummary extends BaseRecord {
  result_run_id: string
  student_id: string
  average: number
  total: number
  grade: string | null
  position: number | null
  remark: string | null
  promotion_outcome?: string | null
  gpa?: number | null
  failed_subjects?: number
  total_coefficients?: number | null
  total_weighted_marks?: number | null
  passed_subjects?: number | null
  status?: string | null
}

export interface ResultSubjectCoefficient extends BaseRecord {
  school_id: string
  subject_id: string
  class_id?: string | null
  academic_level_id?: string | null
  academic_year_id?: string | null
  coefficient: number
}

export type ReportCardStatus = 'draft' | 'generated'

export interface ReportCard extends BaseRecord {
  school_id: string
  student_id: string
  class_id: string
  term_id: string | null
  academic_year_id: string | null
  result_run_id: string | null
  status: ReportCardStatus
  generated_at: string | null
  payload: string | null
}

export type BudgetPeriodType = 'monthly' | 'termly' | 'annual' | 'custom'
export type BudgetStatus = 'draft' | 'active' | 'closed'
export type BudgetAlertLevel = 'alert' | 'warning' | 'critical'

export interface BudgetCategory extends BaseRecord {
  school_id: string
  name: string
  category_key: string
  is_system: number
  is_active: number
  sort_order: number
}

export interface Budget extends BaseRecord {
  school_id: string
  academic_year_id: string
  budget_category_id: string
  period_type: BudgetPeriodType
  period_start: string
  period_end: string
  allocated_amount: number
  description: string | null
  status: BudgetStatus
  alert_pct: number | null
  warning_pct: number | null
  critical_pct: number | null
  created_by: string | null
}

export interface BudgetAlert extends BaseRecord {
  school_id: string
  budget_id: string
  level: BudgetAlertLevel
  utilization: number
  spent: number
  allocated: number
  message: string
}

export type OnlinePaymentStatus =
  | 'pending'
  | 'processing'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'refunded'

export interface OnlinePaymentTransaction extends BaseRecord {
  school_id: string
  student_id: string
  invoice_id: string
  payment_id: string | null
  amount: number
  currency: string
  status: OnlinePaymentStatus
  provider_key: string
  provider_reference: string | null
  idempotency_key: string | null
  failure_reason: string | null
  initiated_by: string | null
  completed_at: string | null
}

export type BankDepositStatus =
  | 'pending_verification'
  | 'verified'
  | 'posted'

export interface BankDeposit extends BaseRecord {
  school_id: string
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
  status: BankDepositStatus
  verified_by: string | null
  verified_at: string | null
  posted_at: string | null
  created_by: string | null
}

export interface BankDepositAllocation extends BaseRecord {
  school_id: string
  bank_deposit_id: string
  payment_id: string
  amount: number
}

export interface StudentIdCardTemplate extends BaseRecord {
  school_id: string
  name: string
  is_default: number
  front_layout: string
  back_layout: string
  show_photo: number
  validity_months: number
  description: string
  card_type: 'student' | 'staff'
  status: 'draft' | 'active' | 'archived'
  orientation: 'landscape' | 'portrait'
  width_mm: number
  height_mm: number
  unit: string
  sample_key: string | null
  current_version_id: string | null
  current_version_number: number
  updated_by: string | null
  is_system?: number
  category?: string
}

export interface IdCardTemplateVersion {
  id: string
  school_id: string
  template_id: string
  version_number: number
  design_json: string
  created_by: string | null
  created_at: string
}

export interface StudentIdCard extends BaseRecord {
  school_id: string
  student_id: string
  student_code: string
  academic_year_id: string
  template_id: string | null
  template_version_id: string | null
  class_id: string | null
  class_name: string | null
  student_name: string
  valid_from: string
  valid_to: string
  generated_at: string
  generated_by: string | null
  card_number: string | null
  verification_code: string | null
  issue_date: string | null
  expiry_date: string | null
  status: string
  card_kind: string
  replaced_card_id: string | null
  replacement_reason: string | null
  printed_at: string | null
  issued_at: string | null
  issued_by: string | null
  job_id: string | null
  snapshot_json: string | null
  revoked_at: string | null
  revoked_by: string | null
}

export type TopicCoverageStatus = 'not_started' | 'in_progress' | 'completed'
export type TeachingLogStatus =
  | 'planned'
  | 'taught'
  | 'partially_covered'
  | 'completed'

export interface TeachingSyllabus extends BaseRecord {
  school_id: string
  subject_id: string
  academic_year_id: string
  academic_level_id: string | null
  class_id: string | null
  title: string
  term_weeks: number
  created_by: string | null
}

export interface SyllabusTopic extends BaseRecord {
  school_id: string
  syllabus_id: string
  parent_id: string | null
  title: string
  sequence: number
  objectives: string | null
  coverage_status: TopicCoverageStatus
}

export interface TeachingLog extends BaseRecord {
  school_id: string
  syllabus_id: string | null
  topic_id: string | null
  staff_id: string
  class_id: string
  subject_id: string
  academic_year_id: string | null
  academic_term_id: string | null
  lesson_date: string
  description: string | null
  status: TeachingLogStatus
  progress_percent: number | null
  remarks: string | null
  created_by: string | null
}
