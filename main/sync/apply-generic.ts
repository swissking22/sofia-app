/**
 * Generic pull apply for multi-desk MVP tables.
 * Never re-enqueues into sync_queue (echo-loop prevention).
 */
import type { Database } from 'better-sqlite3'
import { CLOUD_AUTH_PENDING_HASH } from '../services/cloud-login'
import { recordSyncConflict } from './queue'
import {
  GENERIC_TABLE_COLUMNS,
  isGenericSyncTable,
  preferAssessmentQuestionStatus,
  preferResultRunStatus,
  SEQUENCE_MAX_BY_TABLE,
  type GenericSyncTable,
} from './tables'

export type GenericApplyResult = 'applied' | 'skipped' | 'conflict'

/** Schema-aligned defaults when a remote INSERT omits NOT NULL columns. */
function omittedColumnDefault(
  table: GenericSyncTable,
  column: string
): unknown {
  const byColumn: Record<string, unknown> = {
    show_logo: 1,
    show_stamp: 1,
    show_signature: 1,
    is_enabled: 1,
    is_default: 0,
    requires_approval: 0,
    show_photo: 1,
    validity_months: 12,
    is_system: 0,
    is_active: 1,
    is_mandatory: table === 'fee_structure_lines' ? 1 : 0,
    is_adjustment: 0,
    is_recurring: 0,
    sort_order: 0,
    // Finance packages / lines — older payloads may omit these NOT NULL cols
    applies_to_residence: 'all',
    frequency: 'termly',
    late_fee_mode: 'none',
    late_fee_value: 0,
    amount: 0,
    billing_period: '',
    issue_date: new Date().toISOString().slice(0, 10),
    subtotal: 0,
    discount_total: 0,
    net_payable: 0,
    amount_paid: 0,
    balance: 0,
    currency: 'XAF',
    payment_methods: '[]',
    receipt_prefix: 'RCP',
    invoice_prefix: 'INV',
    payment_prefix: 'PAY',
    expense_prefix: 'EXP',
    receipt_next_number: 1,
    invoice_next_number: 1,
    payment_next_number: 1,
    expense_next_number: 1,
    payslip_prefix: 'PSL',
    payslip_next_number: 1,
    header_text: '',
    footer_text: '',
    body_text: '',
    signature_label: 'Principal',
    document_family: 'official',
    type_code: 'DOC',
    category: table === 'student_id_card_templates' ? 'Standard' : 'administrative',
    description: '',
    required_fields: '[]',
    number_pattern: '{SCHOOL_CODE}/{TYPE}/{YEAR}/{SEQUENCE}',
    signatory_role: 'principal',
    card_kind: 'new',
    status:
      table === 'invoices'
        ? 'pending'
        : table === 'student_id_cards' || table === 'issued_documents'
          ? 'generated'
          : table === 'student_id_card_templates'
            ? 'draft'
            : undefined,
    front_layout: 'classic',
    back_layout: 'info',
    orientation: 'landscape',
    unit: 'mm',
    width_mm: 85.6,
    height_mm: 53.98,
    current_version_number: 1,
    paper_size: 'A4',
    cards_per_row: 2,
    margin_mm: 10,
    gap_x_mm: 4,
    gap_y_mm: 4,
    crop_marks: 0,
    missing_photo_policy: 'generate_without',
    card_ids_json: '[]',
    settings_json: '{}',
    metadata_json: '{}',
    rendered_html: '',
    display_name: '',
    title: table === 'document_signatories' ? '' : undefined,
    channel_sms: 0,
    channel_email: 1,
    channel_internal: 1,
    sms_provider: '',
    sms_api_key: '',
    sms_sender_name: '',
    subject: '',
    audience_type: 'all',
    audience: 'all',
    priority: 'normal',
    channels_json: '[]',
    recipient_count: 0,
    direction: 'outbound',
    channel: table === 'parent_messages' ? 'internal' : undefined,
  }
  return byColumn[column]
}

function existingColumns(db: Database, table: string): Set<string> {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string
    }>
    return new Set(rows.map((r) => r.name))
  } catch {
    return new Set()
  }
}

function coerceValue(column: string, value: unknown): unknown {
  if (value === undefined) return null
  if (
    [
      'is_current',
      'is_active',
      'is_system',
      'must_change_password',
      'enable_ranking',
      'show_class_average',
      'show_teacher_remarks',
      'term_number',
      'sort_order',
      'capacity',
      'failed_login_count',
      'version',
      'is_mandatory',
      'is_adjustment',
      'is_recurring',
      'allow_credit',
      'require_full_deposit_reconciliation',
      'reprint_count',
      'invoice_next_number',
      'payment_next_number',
      'receipt_next_number',
      'expense_next_number',
      'day_of_week',
      'period_number',
      'position',
      'failed_subjects',
      'passed_subjects',
      'version_number',
      'allow_overlap',
      'calculation_version',
      'show_logo',
      'show_stamp',
      'show_signature',
      'is_enabled',
      'is_default',
      'requires_approval',
      'show_photo',
      'validity_months',
      'next_number',
      'total',
      'processed',
      'successful',
      'failed',
      'skipped',
      'cards_per_row',
      'crop_marks',
      'card_count',
      'current_version_number',
      'channel_sms',
      'channel_email',
      'channel_internal',
      'recipient_count',
    ].includes(column)
  ) {
    if (value === null || value === undefined) return null
    if (typeof value === 'boolean') return value ? 1 : 0
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (
    [
      'weight_percent',
      'coefficient',
      'min_score',
      'max_score',
      'amount',
      'subtotal',
      'discount_total',
      'net_payable',
      'amount_paid',
      'balance',
      'credit_applied',
      'balance_remaining',
      'remaining',
      'late_fee_value',
      'discount_value',
      'debit',
      'credit',
      'allocated_amount',
      'alert_pct',
      'warning_pct',
      'critical_pct',
      'utilization',
      'spent',
      'allocated',
      'budget_alert_pct',
      'budget_warning_pct',
      'budget_critical_pct',
      'score',
      'total',
      'average',
      'ca_score',
      'exam_score',
      'ca_average',
      'subject_mark',
      'weighted_mark',
      'gpa',
      'total_coefficients',
      'total_weighted_marks',
      'width_mm',
      'height_mm',
      'margin_mm',
      'gap_x_mm',
      'gap_y_mm',
    ].includes(column)
  ) {
    if (value === null || value === undefined) return null
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return value
}

/**
 * If a permission name already exists under a different id (local seed),
 * drop local duplicate FKs, remove the local row, and return role_permission
 * rows to reattach after the remote permission is upserted.
 */
function remapPermissionIdentity(
  db: Database,
  remoteId: string,
  name: string
): Array<Record<string, unknown>> {
  const local = db
    .prepare(
      `SELECT id FROM permissions WHERE name = ? AND id <> ? AND deleted_at IS NULL`
    )
    .get(name, remoteId) as { id: string } | undefined
  if (!local) return []

  const rps = db
    .prepare(`SELECT * FROM role_permissions WHERE permission_id = ?`)
    .all(local.id) as Array<Record<string, unknown>>
  db.prepare(`DELETE FROM role_permissions WHERE permission_id = ?`).run(local.id)
  db.prepare(`DELETE FROM permissions WHERE id = ?`).run(local.id)
  return rps.map((r) => ({ ...r, permission_id: remoteId }))
}

function rowExists(db: Database, table: string, id: string): boolean {
  if (!id) return false
  try {
    return Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id))
  } catch {
    return false
  }
}

/**
 * Cloud sync_changes has no cross-table FKs. Local SQLite does — a fee structure
 * or invoice arriving before its academic year / student used to abort the whole
 * pull batch and freeze the cursor, so bursar desks never saw finance data.
 * Create minimal placeholder parents (same idea as student→class stubs).
 */
function ensureReferencedParents(
  db: Database,
  table: GenericSyncTable,
  payload: Record<string, unknown>,
  schoolId: string
): void {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  const ensureAcademicYear = (yearId: string | null | undefined) => {
    if (!yearId || rowExists(db, 'academic_years', yearId)) return
    try {
      db.prepare(
        `INSERT INTO academic_years (
           id, school_id, name, start_date, end_date, is_current,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'synced', 0)`
      ).run(
        yearId,
        schoolId,
        'Year ' + String(yearId).slice(0, 8),
        today,
        today,
        now,
        now
      )
    } catch {
      /* concurrent stub or missing table in tests */
    }
  }

  const ensureAcademicTerm = (termId: string | null | undefined, yearId: string | null | undefined) => {
    if (!termId || rowExists(db, 'academic_terms', termId)) return
    const parentYear = yearId || `year-for-${termId}`
    ensureAcademicYear(parentYear)
    try {
      db.prepare(
        `INSERT INTO academic_terms (
           id, academic_year_id, name, term_number, start_date, end_date,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, 'synced', 0)`
      ).run(termId, parentYear, 'Term ' + String(termId).slice(0, 8), today, today, now, now)
    } catch {
      /* ignore */
    }
  }

  const ensureAcademicLevel = (levelId: string | null | undefined) => {
    if (!levelId || rowExists(db, 'academic_levels', levelId)) return
    try {
      db.prepare(
        `INSERT INTO academic_levels (
           id, school_id, name, short_name, category, is_active, sort_order,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, 'L', 'lower_secondary', 1, 1, ?, ?, 'synced', 0)`
      ).run(levelId, schoolId, 'Level ' + String(levelId).slice(0, 8), now, now)
    } catch {
      /* ignore */
    }
  }

  const ensureClass = (classId: string | null | undefined) => {
    if (!classId || rowExists(db, 'classes', classId)) return
    try {
      db.prepare(
        `INSERT INTO classes (
           id, name, school_id, is_active, created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, 1, ?, ?, 'synced', 0)`
      ).run(classId, 'Class ' + String(classId).slice(0, 8), schoolId, now, now)
    } catch {
      /* ignore */
    }
  }

  const ensureFeeCategory = (categoryId: string | null | undefined) => {
    if (!categoryId || rowExists(db, 'fee_categories', categoryId)) return
    try {
      db.prepare(
        `INSERT INTO fee_categories (
           id, school_id, name, category_key, is_system, is_active, sort_order,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, 0, 1, 0, ?, ?, 'synced', 0)`
      ).run(
        categoryId,
        schoolId,
        'Category ' + String(categoryId).slice(0, 8),
        'cat_' + String(categoryId).slice(0, 8),
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureFeeStructure = (structureId: string | null | undefined) => {
    if (!structureId || rowExists(db, 'fee_structures', structureId)) return
    const yearId =
      (payload.academic_year_id != null && String(payload.academic_year_id)) ||
      `year-for-${structureId}`
    ensureAcademicYear(yearId)
    try {
      db.prepare(
        `INSERT INTO fee_structures (
           id, school_id, name, academic_year_id, is_active, applies_to_residence,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, 1, 'all', ?, ?, 'synced', 0)`
      ).run(
        structureId,
        schoolId,
        'Structure ' + String(structureId).slice(0, 8),
        yearId,
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureStudent = (studentId: string | null | undefined) => {
    if (!studentId || rowExists(db, 'students', studentId)) return
    const classId =
      (payload.class_id != null && String(payload.class_id)) ||
      `class-for-${studentId}`
    ensureClass(classId)
    try {
      db.prepare(
        `INSERT INTO students (
           id, name, class_id, school_id, status,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, 'active', ?, ?, 'synced', 0)`
      ).run(
        studentId,
        'Student ' + String(studentId).slice(0, 8),
        classId,
        schoolId,
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureInvoice = (invoiceId: string | null | undefined) => {
    if (!invoiceId || rowExists(db, 'invoices', invoiceId)) return
    const studentId =
      (payload.student_id != null && String(payload.student_id)) ||
      `student-for-${invoiceId}`
    ensureStudent(studentId)
    try {
      db.prepare(
        `INSERT INTO invoices (
           id, school_id, student_id, invoice_number, issue_date, status,
           subtotal, discount_total, net_payable, amount_paid, balance,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, ?, 'pending', 0, 0, 0, 0, 0, ?, ?, 'synced', 0)`
      ).run(
        invoiceId,
        schoolId,
        studentId,
        'INV-PENDING',
        today,
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensurePayment = (paymentId: string | null | undefined) => {
    if (!paymentId || rowExists(db, 'payments', paymentId)) return
    const studentId =
      (payload.student_id != null && String(payload.student_id)) ||
      `student-for-${paymentId}`
    const invoiceId =
      (payload.invoice_id != null && String(payload.invoice_id)) ||
      `invoice-for-${paymentId}`
    ensureStudent(studentId)
    ensureInvoice(invoiceId)
    try {
      db.prepare(
        `INSERT INTO payments (
           id, school_id, student_id, invoice_id, payment_number, amount, method, paid_at,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, ?, 0, 'cash', ?, ?, ?, 'synced', 0)`
      ).run(
        paymentId,
        schoolId,
        studentId,
        invoiceId,
        'PAY-PENDING',
        now,
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureStaff = (staffId: string | null | undefined) => {
    if (!staffId || rowExists(db, 'staff', staffId)) return
    try {
      db.prepare(
        `INSERT INTO staff (
           id, school_id, full_name, staff_type, status,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, 'teaching', 'active', ?, ?, 'synced', 0)`
      ).run(staffId, schoolId, 'Staff ' + String(staffId).slice(0, 8), now, now)
    } catch {
      /* ignore */
    }
  }

  const ensureSubject = (subjectId: string | null | undefined) => {
    if (!subjectId || rowExists(db, 'subjects', subjectId)) return
    const classId =
      (payload.class_id != null && String(payload.class_id)) ||
      `class-for-${subjectId}`
    ensureClass(classId)
    try {
      db.prepare(
        `INSERT INTO subjects (
           id, name, class_id, school_id, coefficient,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, 1, ?, ?, 'synced', 0)`
      ).run(
        subjectId,
        'Subject ' + String(subjectId).slice(0, 8),
        classId,
        schoolId,
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureRole = (roleId: string | null | undefined) => {
    if (!roleId || rowExists(db, 'roles', roleId)) return
    try {
      db.prepare(
        `INSERT INTO roles (
           id, school_id, name, is_system,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, 0, ?, ?, 'synced', 0)`
      ).run(roleId, schoolId, 'Role ' + String(roleId).slice(0, 8), now, now)
    } catch {
      /* ignore */
    }
  }

  const ensurePermission = (permissionId: string | null | undefined) => {
    if (!permissionId || rowExists(db, 'permissions', permissionId)) return
    try {
      db.prepare(
        `INSERT INTO permissions (
           id, name, label, module_key, module_label,
           created_at, updated_at
         ) VALUES (?, ?, ?, 'system', 'System', ?, ?)`
      ).run(
        permissionId,
        'perm.' + String(permissionId).slice(0, 8),
        'Permission ' + String(permissionId).slice(0, 8),
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureSection = (sectionId: string | null | undefined) => {
    if (!sectionId || rowExists(db, 'sections', sectionId)) return
    try {
      db.prepare(
        `INSERT INTO sections (
           id, school_id, name, is_active,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, 1, ?, ?, 'synced', 0)`
      ).run(
        sectionId,
        schoolId,
        'Section ' + String(sectionId).slice(0, 8),
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureDepartment = (departmentId: string | null | undefined) => {
    if (!departmentId || rowExists(db, 'departments', departmentId)) return
    try {
      db.prepare(
        `INSERT INTO departments (
           id, school_id, name, created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, ?, 'synced', 0)`
      ).run(
        departmentId,
        schoolId,
        'Dept ' + String(departmentId).slice(0, 8),
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureAttendanceSession = (sessionId: string | null | undefined) => {
    if (!sessionId || rowExists(db, 'attendance_sessions', sessionId)) return
    const classId =
      (payload.class_id != null && String(payload.class_id)) ||
      `class-for-${sessionId}`
    ensureClass(classId)
    try {
      db.prepare(
        `INSERT INTO attendance_sessions (
           id, school_id, class_id, session_date,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, ?, ?, 'synced', 0)`
      ).run(sessionId, schoolId, classId, today, now, now)
    } catch {
      /* ignore */
    }
  }

  const ensureCaAssessment = (assessmentId: string | null | undefined) => {
    if (!assessmentId || rowExists(db, 'ca_assessments', assessmentId)) return
    const classId =
      (payload.class_id != null && String(payload.class_id)) ||
      `class-for-${assessmentId}`
    const subjectId =
      (payload.subject_id != null && String(payload.subject_id)) ||
      `subject-for-${assessmentId}`
    ensureClass(classId)
    ensureSubject(subjectId)
    try {
      db.prepare(
        `INSERT INTO ca_assessments (
           id, school_id, class_id, subject_id, name, max_score,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, ?, 20, ?, ?, 'synced', 0)`
      ).run(
        assessmentId,
        schoolId,
        classId,
        subjectId,
        'CA ' + String(assessmentId).slice(0, 8),
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureExamSession = (sessionId: string | null | undefined) => {
    if (!sessionId || rowExists(db, 'exam_sessions', sessionId)) return
    try {
      db.prepare(
        `INSERT INTO exam_sessions (
           id, school_id, name, start_date, end_date, status,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, 'synced', 0)`
      ).run(
        sessionId,
        schoolId,
        'Exam ' + String(sessionId).slice(0, 8),
        today,
        today,
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureExamPaper = (paperId: string | null | undefined) => {
    if (!paperId || rowExists(db, 'exam_papers', paperId)) return
    const sessionId =
      (payload.exam_session_id != null && String(payload.exam_session_id)) ||
      `exam-session-for-${paperId}`
    const classId =
      (payload.class_id != null && String(payload.class_id)) ||
      `class-for-${paperId}`
    const subjectId =
      (payload.subject_id != null && String(payload.subject_id)) ||
      `subject-for-${paperId}`
    ensureExamSession(sessionId)
    ensureClass(classId)
    ensureSubject(subjectId)
    try {
      db.prepare(
        `INSERT INTO exam_papers (
           id, exam_session_id, subject_id, class_id, max_score,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, 100, ?, ?, 'synced', 0)`
      ).run(paperId, sessionId, subjectId, classId, now, now)
    } catch {
      /* ignore */
    }
  }

  const ensureResultRun = (runId: string | null | undefined) => {
    if (!runId || rowExists(db, 'result_runs', runId)) return
    const classId =
      (payload.class_id != null && String(payload.class_id)) ||
      `class-for-${runId}`
    ensureClass(classId)
    try {
      db.prepare(
        `INSERT INTO result_runs (
           id, school_id, class_id, status,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, 'draft', ?, ?, 'synced', 0)`
      ).run(runId, schoolId, classId, now, now)
    } catch {
      /* ignore */
    }
  }

  const ensureCalcProfile = (profileId: string | null | undefined) => {
    if (!profileId || rowExists(db, 'result_calculation_profiles', profileId))
      return
    try {
      db.prepare(
        `INSERT INTO result_calculation_profiles (
           id, school_id, name, description, period_mode, status,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, '', 'term', 'draft', ?, ?, 'synced', 0)`
      ).run(
        profileId,
        schoolId,
        'Profile ' + String(profileId).slice(0, 8),
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureThread = (threadId: string | null | undefined) => {
    if (!threadId || rowExists(db, 'parent_message_threads', threadId)) return
    const studentId =
      (payload.student_id != null && String(payload.student_id)) ||
      `student-for-${threadId}`
    ensureStudent(studentId)
    try {
      db.prepare(
        `INSERT INTO parent_message_threads (
           id, school_id, student_id, guardian_name,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, 'Guardian', ?, ?, 'synced', 0)`
      ).run(threadId, schoolId, studentId, now, now)
    } catch {
      /* ignore */
    }
  }

  const ensurePromotionRun = (runId: string | null | undefined) => {
    if (!runId || rowExists(db, 'promotion_runs', runId)) return
    try {
      db.prepare(
        `INSERT INTO promotion_runs (
           id, school_id, from_year, to_year, status,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, 2025, 2026, 'draft', ?, ?, 'synced', 0)`
      ).run(runId, schoolId, now, now)
    } catch {
      /* ignore */
    }
  }

  const ensureSyllabus = (syllabusId: string | null | undefined) => {
    if (!syllabusId || rowExists(db, 'teaching_syllabi', syllabusId)) return
    const subjectId =
      (payload.subject_id != null && String(payload.subject_id)) ||
      `subject-for-${syllabusId}`
    const yearId =
      (payload.academic_year_id != null && String(payload.academic_year_id)) ||
      `year-for-${syllabusId}`
    ensureSubject(subjectId)
    ensureAcademicYear(yearId)
    try {
      db.prepare(
        `INSERT INTO teaching_syllabi (
           id, school_id, subject_id, academic_year_id, title, term_weeks,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, ?, 12, ?, ?, 'synced', 0)`
      ).run(
        syllabusId,
        schoolId,
        subjectId,
        yearId,
        'Syllabus ' + String(syllabusId).slice(0, 8),
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureBankDeposit = (depositId: string | null | undefined) => {
    if (!depositId || rowExists(db, 'bank_deposits', depositId)) return
    try {
      db.prepare(
        `INSERT INTO bank_deposits (
           id, school_id, deposit_number, amount, deposit_date, bank_name, status,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, 0, ?, 'Bank', 'pending_verification', ?, ?, 'synced', 0)`
      ).run(
        depositId,
        schoolId,
        'DEP-PENDING',
        today,
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureBudgetCategory = (categoryId: string | null | undefined) => {
    if (!categoryId || rowExists(db, 'budget_categories', categoryId)) return
    try {
      db.prepare(
        `INSERT INTO budget_categories (
           id, school_id, name, category_key, is_system, is_active, sort_order,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, 0, 1, 0, ?, ?, 'synced', 0)`
      ).run(
        categoryId,
        schoolId,
        'Budget cat ' + String(categoryId).slice(0, 8),
        'cat_' + String(categoryId).slice(0, 8),
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureBudget = (budgetId: string | null | undefined) => {
    if (!budgetId || rowExists(db, 'budgets', budgetId)) return
    const yearId =
      (payload.academic_year_id != null && String(payload.academic_year_id)) ||
      `year-for-${budgetId}`
    const categoryId =
      (payload.budget_category_id != null &&
        String(payload.budget_category_id)) ||
      `budget-cat-for-${budgetId}`
    ensureAcademicYear(yearId)
    ensureBudgetCategory(categoryId)
    try {
      db.prepare(
        `INSERT INTO budgets (
           id, school_id, academic_year_id, budget_category_id,
           period_type, period_start, period_end, allocated_amount, status,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, 'annual', ?, ?, 0, 'active', ?, ?, 'synced', 0)`
      ).run(
        budgetId,
        schoolId,
        yearId,
        categoryId,
        today,
        today,
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensureUser = (userId: string | null | undefined) => {
    if (!userId || rowExists(db, 'users', userId)) return
    try {
      db.prepare(
        `INSERT INTO users (
           id, school_id, email, password_hash, role, status,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, '!sofia-cloud-auth-pending', 'secretary', 'active', ?, ?, 'synced', 0)`
      ).run(
        userId,
        schoolId,
        `user-${String(userId).slice(0, 8)}@pending.local`,
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  // Payload-driven stubs — cover any table that references shared parents so
  // second-desk pulls never abort on out-of-order sync_changes pages.
  const str = (key: string) =>
    payload[key] != null && String(payload[key]).length > 0
      ? String(payload[key])
      : null

  ensureAcademicYear(str('academic_year_id'))
  ensureAcademicTerm(str('academic_term_id') || str('term_id'), str('academic_year_id'))
  ensureAcademicLevel(str('academic_level_id'))
  ensureClass(str('class_id') || str('from_class_id') || str('to_class_id') || str('preferred_class_id'))
  ensureSection(str('section_id'))
  ensureDepartment(str('department_id'))
  ensureStudent(str('student_id'))
  ensureStaff(str('staff_id') || str('teacher_staff_id'))
  ensureSubject(str('subject_id'))
  ensureRole(str('role_id'))
  ensureFeeCategory(str('fee_category_id'))
  ensureFeeStructure(str('fee_structure_id'))
  ensureInvoice(str('invoice_id'))
  ensurePayment(str('payment_id'))
  ensureAttendanceSession(
    table === 'attendance_records' ? str('session_id') : null
  )
  ensureCaAssessment(str('assessment_id'))
  ensureExamSession(str('exam_session_id'))
  ensureExamPaper(str('paper_id') || str('exam_paper_id'))
  ensureResultRun(str('result_run_id') || (table.startsWith('result_') ? str('run_id') : null))
  ensureCalcProfile(str('profile_id'))
  ensureThread(str('thread_id'))
  ensurePromotionRun(str('promotion_run_id'))
  ensureSyllabus(str('syllabus_id'))
  ensureBankDeposit(str('bank_deposit_id'))
  ensureBudgetCategory(str('budget_category_id'))
  ensureBudget(str('budget_id'))
  ensureUser(str('user_id'))

  const ensureExpense = (expenseId: string | null | undefined) => {
    if (!expenseId || rowExists(db, 'expenses', expenseId)) return
    try {
      db.prepare(
        `INSERT INTO expenses (
           id, school_id, expense_number, category, amount, expense_date,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, 'salaries', 0, ?, ?, ?, 'synced', 0)`
      ).run(
        expenseId,
        schoolId,
        'EXP-STUB-' + String(expenseId).slice(0, 8),
        now.slice(0, 10),
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  const ensurePayslip = (payslipId: string | null | undefined) => {
    if (!payslipId || rowExists(db, 'payslips', payslipId)) return
    const staffId =
      (payload.staff_id != null && String(payload.staff_id)) ||
      `staff-for-${payslipId}`
    ensureStaff(staffId)
    try {
      db.prepare(
        `INSERT INTO payslips (
           id, school_id, staff_id, payslip_number, period_year, period_month,
           issue_date, status, currency, gross_amount, deduction_amount, net_amount,
           created_at, updated_at, sync_status, version
         ) VALUES (?, ?, ?, ?, 2099, 1, ?, 'draft', 'XAF', 0, 0, 0, ?, ?, 'synced', 0)`
      ).run(
        payslipId,
        schoolId,
        staffId,
        'PSL-STUB-' + String(payslipId).slice(0, 8),
        now.slice(0, 10),
        now,
        now
      )
    } catch {
      /* ignore */
    }
  }

  if (table === 'payslips') {
    ensureExpense(str('expense_id'))
  }
  if (table === 'payslip_lines') {
    ensurePayslip(str('payslip_id'))
  }
  if (table === 'staff_salary_terms') {
    ensureStaff(str('staff_id'))
  }

  if (table === 'role_permissions') {
    ensureRole(str('role_id'))
    ensurePermission(str('permission_id'))
  }
  if (table === 'subject_classes') {
    ensureSubject(str('subject_id'))
    ensureClass(str('class_id'))
  }
  if (table === 'users') {
    ensureRole(str('role_id'))
    ensureStaff(str('staff_id'))
  }
}

function upsertRow(
  db: Database,
  table: GenericSyncTable,
  payload: Record<string, unknown>,
  remoteVersion: number,
  operation: string
): void {
  const recordId = String(payload.id || '')
  if (!recordId) throw new Error(`Missing id for ${table}`)

  let reattachRolePermissions: Array<Record<string, unknown>> = []
  if (table === 'permissions' && typeof payload.name === 'string') {
    reattachRolePermissions = remapPermissionIdentity(db, recordId, payload.name)
  }

  const existingRow = db
    .prepare(`SELECT * FROM ${table} WHERE id = ?`)
    .get(recordId) as Record<string, unknown> | undefined

  const allowed = GENERIC_TABLE_COLUMNS[table]
  const present = existingColumns(db, table)
  const cols = allowed.filter((c) => present.has(c) && c !== 'sync_status')
  if (!cols.includes('id')) cols.unshift('id')

  const now = new Date().toISOString()
  const values: Record<string, unknown> = {}
  for (const col of cols) {
    if (col === 'id') {
      values.id = recordId
      continue
    }
    if (col === 'version') {
      values.version = remoteVersion
      continue
    }
    if (col === 'updated_at') {
      values.updated_at = payload.updated_at || now
      continue
    }
    if (col === 'created_at') {
      values.created_at =
        payload.created_at ||
        (existingRow?.created_at as string) ||
        now
      continue
    }
    if (col === 'deleted_at') {
      values.deleted_at =
        operation === 'DELETE'
          ? payload.deleted_at || now
          : payload.deleted_at !== undefined
            ? payload.deleted_at
            : (existingRow?.deleted_at ?? null)
      continue
    }
    if (col === 'class_id' && table === 'subjects') {
      values.class_id =
        payload.class_id !== undefined && payload.class_id !== null
          ? payload.class_id
          : existingRow?.class_id != null
            ? existingRow.class_id
            : ''
      continue
    }
    if (col === 'first_name' || col === 'last_name') {
      values[col] =
        payload[col] != null
          ? String(payload[col])
          : existingRow?.[col] != null
            ? String(existingRow[col])
            : ''
      continue
    }
    if (col === 'failed_login_count' || col === 'must_change_password') {
      values[col] = coerceValue(
        col,
        payload[col] ?? existingRow?.[col] ?? 0
      )
      continue
    }
    if (col === 'status' && table === 'users') {
      values.status =
        payload.status != null
          ? String(payload.status)
          : existingRow?.status != null
            ? String(existingRow.status)
            : 'active'
      continue
    }
    // Auth passwords are never synced. Keep a local hash if present; otherwise
    // mark the row as awaiting online bootstrap (see cloud-login).
    if (col === 'password_hash' && table === 'users') {
      values.password_hash =
        existingRow?.password_hash != null &&
        String(existingRow.password_hash).length > 0
          ? existingRow.password_hash
          : CLOUD_AUTH_PENDING_HASH
      continue
    }
    // Prevent sequence counter back-sliding across desks
    const seqCols = SEQUENCE_MAX_BY_TABLE[table]
    if (seqCols && (seqCols as readonly string[]).includes(col)) {
      const remote = Number(payload[col])
      const local = Number(existingRow?.[col] ?? 0)
      values[col] = Math.max(
        Number.isFinite(local) ? local : 0,
        Number.isFinite(remote) ? remote : 0,
        1
      )
      continue
    }
    // Never regress published/locked result runs to draft/computed
    if (table === 'result_runs' && col === 'status') {
      values.status = preferResultRunStatus(existingRow?.status, payload.status)
      continue
    }
    // Never regress approved question papers / revisions
    if (
      (table === 'assessment_question_papers' && col === 'current_status') ||
      (table === 'assessment_question_paper_revisions' && col === 'status')
    ) {
      values[col] = preferAssessmentQuestionStatus(
        existingRow?.[col],
        payload[col]
      )
      continue
    }
    // Preserve local NOT NULL / existing fields when remote payload omits them
    if (payload[col] === undefined && existingRow && existingRow[col] !== undefined) {
      values[col] = existingRow[col]
      continue
    }
    if (payload[col] === undefined) {
      const insertDefault = omittedColumnDefault(table, col)
      if (insertDefault !== undefined) {
        values[col] = insertDefault
        continue
      }
    }
    values[col] = coerceValue(col, payload[col])
  }

  if (present.has('sync_status')) {
    cols.push('sync_status')
    values.sync_status = 'synced'
  }

  const placeholders = cols.map((c) => `@${c}`).join(', ')
  const updates = cols
    .filter((c) => c !== 'id' && c !== 'created_at')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ')

  db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updates}`
  ).run(values)

  for (const rp of reattachRolePermissions) {
    const rpCols = existingColumns(db, 'role_permissions')
    const keys = [
      'id',
      'role_id',
      'permission_id',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_status',
      'version',
    ].filter((k) => rpCols.has(k))
    const row: Record<string, unknown> = {}
    for (const k of keys) {
      row[k] = rp[k] ?? (k === 'sync_status' ? 'synced' : null)
    }
    if (row.sync_status == null) row.sync_status = 'synced'
    if (row.version == null) row.version = 1
    db.prepare(
      `INSERT INTO role_permissions (${keys.join(', ')})
       VALUES (${keys.map((k) => `@${k}`).join(', ')})
       ON CONFLICT(id) DO UPDATE SET permission_id = excluded.permission_id`
    ).run(row)
  }
}

/**
 * Apply one generic sync_changes row into local SQLite.
 */
export function applyGenericPulledChange(
  db: Database,
  change: {
    table_name: string
    record_id: string
    operation: string
    version: number | string
    payload: Record<string, unknown>
  },
  schoolId: string
): GenericApplyResult {
  if (!isGenericSyncTable(change.table_name)) return 'skipped'

  const table = change.table_name
  const recordId = change.record_id
  const remoteVersion = Number(change.version) || 1
  const payload = { ...change.payload, id: change.payload.id || recordId }

  // Soft tenant guard when payload carries school_id
  if (
    payload.school_id != null &&
    String(payload.school_id) !== schoolId &&
    table !== 'permissions'
  ) {
    return 'skipped'
  }

  const existing = db
    .prepare(`SELECT * FROM ${table} WHERE id = ?`)
    .get(recordId) as Record<string, unknown> | undefined

  if (existing) {
    // Locked result runs are immutable on pull (no soft-delete / rewrite races)
    if (
      table === 'result_runs' &&
      String(existing.status) === 'locked' &&
      change.operation === 'DELETE'
    ) {
      return 'skipped'
    }

    // Preserve version 0 (pull FK stubs). `Number(0) || 1` would wrongly treat stubs as v1
    // and skip the real cloud row when it arrives with version 1.
    const parsedLocal = Number(existing.version)
    const localVersion = Number.isFinite(parsedLocal) ? parsedLocal : 1
    // Tables without a local version column (e.g. profile versions) always apply
    const hasLocalVersion = Object.prototype.hasOwnProperty.call(existing, 'version')
    if (hasLocalVersion && remoteVersion < localVersion) return 'skipped'
    if (hasLocalVersion && remoteVersion === localVersion) {
      if (change.operation === 'DELETE' && !existing.deleted_at) {
        ensureReferencedParents(db, table, payload, schoolId)
        upsertRow(db, table, payload, remoteVersion, 'DELETE')
        return 'applied'
      }
      return 'skipped'
    }

    const pendingOutbox = db
      .prepare(
        `SELECT id FROM sync_queue WHERE record_id = ? AND status = 'pending' LIMIT 1`
      )
      .get(recordId)
    if (pendingOutbox) {
      recordSyncConflict(db, {
        schoolId,
        tableName: table,
        recordId,
        localJson: JSON.stringify(existing),
        remoteJson: JSON.stringify(payload),
      })
      ensureReferencedParents(db, table, payload, schoolId)
      upsertRow(db, table, payload, remoteVersion, change.operation)
      return 'conflict'
    }

    ensureReferencedParents(db, table, payload, schoolId)
    upsertRow(db, table, payload, remoteVersion, change.operation)
    return 'applied'
  }

  ensureReferencedParents(db, table, payload, schoolId)
  upsertRow(db, table, payload, remoteVersion, change.operation)
  return 'applied'
}
