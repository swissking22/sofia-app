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
}

export interface User extends BaseRecord {
  school_id: string
  email: string
  password_hash: string
  /** Legacy coarse role string — kept for auth compatibility */
  role: UserRole
  /** RBAC role FK */
  role_id: string | null
}

export type StaffType = 'administrative' | 'teaching'
export type StaffAdminRole =
  | 'principal'
  | 'vice_principal'
  | 'bursar'
  | 'secretary'
export type StaffStatus = 'active' | 'inactive'
export type StaffGender = 'male' | 'female' | 'other'

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
}

export interface StaffSubject extends BaseRecord {
  staff_id: string
  subject_id: string
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
  /** active | alumni | transferred */
  status: string
}

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

/** Per-school student ID generation settings. */
export interface StudentIdSettings extends BaseRecord {
  school_id: string
  pattern: string
  sequence_scope: 'year' | 'year_level'
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
}

export type DocumentTemplateKey =
  | 'report_card'
  | 'admission_letter'
  | 'receipt'
  | 'certificate'

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
}

export type ResultRunStatus = 'draft' | 'computed' | 'published' | 'locked'

export interface ResultRun extends BaseRecord {
  school_id: string
  class_id: string
  term_id: string | null
  academic_year_id: string | null
  status: ResultRunStatus
  computed_at: string | null
  published_at: string | null
}

export interface ResultSubjectRow extends BaseRecord {
  result_run_id: string
  student_id: string
  subject_id: string
  ca_score: number
  exam_score: number
  total: number
  grade: string | null
}

export interface ResultStudentSummary extends BaseRecord {
  result_run_id: string
  student_id: string
  average: number
  total: number
  grade: string | null
  position: number | null
  remark: string | null
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
