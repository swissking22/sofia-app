import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'

/**
 * Creates all SOFIA tables.
 * Every domain table includes sync metadata fields.
 */
export function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      country TEXT,
      address TEXT,
      logo_path TEXT,
      school_code TEXT NOT NULL DEFAULT '',
      short_code TEXT NOT NULL DEFAULT '',
      school_type TEXT,
      education_system TEXT,
      school_category TEXT,
      region TEXT,
      division TEXT,
      subdivision TEXT,
      website TEXT,
      stamp_path TEXT,
      principal_signature_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      module_key TEXT NOT NULL,
      module_label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      role_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      school_id TEXT,
      level TEXT,
      form_key TEXT,
      stream TEXT,
      academic_level_id TEXT,
      section_id TEXT,
      specialization_id TEXT,
      capacity INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      class_id TEXT NOT NULL,
      school_id TEXT,
      student_code TEXT,
      admission_year INTEGER,
      academic_level_id TEXT,
      sequence_number INTEGER,
      gender TEXT,
      date_of_birth TEXT,
      place_of_birth TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      admission_type TEXT,
      guardian_name TEXT,
      guardian_phone TEXT,
      guardian_email TEXT,
      guardian_relationship TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (academic_level_id) REFERENCES academic_levels(id)
    );

    CREATE TABLE IF NOT EXISTS student_id_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL UNIQUE,
      pattern TEXT NOT NULL DEFAULT '{SCHOOL}-{SEQ}',
      sequence_scope TEXT NOT NULL DEFAULT 'school',
      next_sequence_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS student_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id_format TEXT NOT NULL DEFAULT 'SOF-{SEQ}',
      field_full_name INTEGER NOT NULL DEFAULT 1,
      field_gender INTEGER NOT NULL DEFAULT 1,
      field_date_of_birth INTEGER NOT NULL DEFAULT 1,
      field_place_of_birth INTEGER NOT NULL DEFAULT 1,
      field_parent_information INTEGER NOT NULL DEFAULT 1,
      field_emergency_contact INTEGER NOT NULL DEFAULT 1,
      admit_new INTEGER NOT NULL DEFAULT 1,
      admit_returning INTEGER NOT NULL DEFAULT 1,
      admit_transfer INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS academic_levels (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS specializations (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      name TEXT NOT NULL,
      abbreviation TEXT NOT NULL DEFAULT '',
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (section_id) REFERENCES sections(id)
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      class_id TEXT NOT NULL,
      school_id TEXT,
      department_id TEXT,
      coefficient REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS subject_classes (
      id TEXT PRIMARY KEY NOT NULL,
      subject_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (subject_id) REFERENCES subjects(id),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      gender TEXT,
      phone TEXT,
      email TEXT,
      staff_type TEXT NOT NULL,
      admin_role TEXT,
      department_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS staff_subjects (
      id TEXT PRIMARY KEY NOT NULL,
      staff_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      class_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (staff_id) REFERENCES staff(id),
      FOREIGN KEY (subject_id) REFERENCES subjects(id),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS staff_classes (
      id TEXT PRIMARY KEY NOT NULL,
      staff_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (staff_id) REFERENCES staff(id),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      id TEXT PRIMARY KEY NOT NULL,
      role_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (role_id) REFERENCES roles(id),
      FOREIGN KEY (permission_id) REFERENCES permissions(id)
    );

    CREATE TABLE IF NOT EXISTS fee_categories (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category_key TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS fee_amounts (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      academic_level_id TEXT NOT NULL,
      fee_category_id TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (academic_level_id) REFERENCES academic_levels(id),
      FOREIGN KEY (fee_category_id) REFERENCES fee_categories(id)
    );

    CREATE TABLE IF NOT EXISTS finance_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL UNIQUE,
      currency TEXT NOT NULL DEFAULT 'XAF',
      payment_methods TEXT NOT NULL DEFAULT '["cash","mobile_money","bank_transfer"]',
      receipt_prefix TEXT NOT NULL DEFAULT 'RCP',
      receipt_next_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS document_templates (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      template_key TEXT NOT NULL,
      title TEXT NOT NULL,
      header_text TEXT NOT NULL DEFAULT '',
      footer_text TEXT NOT NULL DEFAULT '',
      logo_path TEXT,
      show_logo INTEGER NOT NULL DEFAULT 1,
      show_stamp INTEGER NOT NULL DEFAULT 1,
      show_signature INTEGER NOT NULL DEFAULT 1,
      signature_label TEXT NOT NULL DEFAULT 'Principal',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      body_text TEXT NOT NULL DEFAULT '',
      document_family TEXT NOT NULL DEFAULT 'official',
      type_code TEXT NOT NULL DEFAULT 'DOC',
      category TEXT NOT NULL DEFAULT 'administrative',
      description TEXT NOT NULL DEFAULT '',
      required_fields TEXT NOT NULL DEFAULT '[]',
      number_pattern TEXT NOT NULL DEFAULT '{SCHOOL_CODE}/{TYPE}/{YEAR}/{SEQUENCE}',
      signatory_role TEXT NOT NULL DEFAULT 'principal',
      is_default INTEGER NOT NULL DEFAULT 0,
      requires_approval INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS communication_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL UNIQUE,
      sms_provider TEXT NOT NULL DEFAULT '',
      sms_api_key TEXT NOT NULL DEFAULT '',
      sms_sender_name TEXT NOT NULL DEFAULT '',
      channel_sms INTEGER NOT NULL DEFAULT 0,
      channel_email INTEGER NOT NULL DEFAULT 1,
      channel_internal INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS notification_templates (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      template_key TEXT NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS backup_sync_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL UNIQUE,
      last_sync_at TEXT,
      last_sync_status TEXT NOT NULL DEFAULT 'never',
      cloud_connected INTEGER NOT NULL DEFAULT 0,
      last_connection_test_at TEXT,
      automatic_backup INTEGER NOT NULL DEFAULT 1,
      backup_frequency TEXT NOT NULL DEFAULT 'daily',
      backup_location TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY NOT NULL,
      student_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      test_score REAL NOT NULL DEFAULT 0,
      exam_score REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    );

    CREATE TABLE IF NOT EXISTS setup_steps (
      id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      draft_data TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS academic_years (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS academic_terms (
      id TEXT PRIMARY KEY NOT NULL,
      academic_year_id TEXT NOT NULL,
      name TEXT NOT NULL,
      term_number INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY NOT NULL,
      academic_year_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
    );

    CREATE TABLE IF NOT EXISTS grading_systems (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      enable_ranking INTEGER NOT NULL DEFAULT 1,
      show_class_average INTEGER NOT NULL DEFAULT 1,
      show_teacher_remarks INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS assessment_types (
      id TEXT PRIMARY KEY NOT NULL,
      grading_system_id TEXT NOT NULL,
      name TEXT NOT NULL,
      weight_percent REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (grading_system_id) REFERENCES grading_systems(id)
    );

    CREATE TABLE IF NOT EXISTS grade_bands (
      id TEXT PRIMARY KEY NOT NULL,
      grading_system_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      min_score REAL NOT NULL,
      max_score REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (grading_system_id) REFERENCES grading_systems(id)
    );

    -- Critical: tracks every change for future cloud sync
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY NOT NULL,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_cursors (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      last_synced_change_id INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE (school_id, device_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sync_cursors_school_device ON sync_cursors(school_id, device_id);

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
    CREATE INDEX IF NOT EXISTS idx_student_settings_school ON student_settings(school_id);
    CREATE INDEX IF NOT EXISTS idx_subjects_class ON subjects(class_id);
    CREATE INDEX IF NOT EXISTS idx_scores_student ON scores(student_id);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
    CREATE INDEX IF NOT EXISTS idx_academic_years_school ON academic_years(school_id);
    CREATE INDEX IF NOT EXISTS idx_academic_terms_year ON academic_terms(academic_year_id);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_year ON calendar_events(academic_year_id);
    CREATE INDEX IF NOT EXISTS idx_grading_systems_school ON grading_systems(school_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_types_system ON assessment_types(grading_system_id);
    CREATE INDEX IF NOT EXISTS idx_grade_bands_system ON grade_bands(grading_system_id);
    CREATE INDEX IF NOT EXISTS idx_staff_school ON staff(school_id);
    CREATE INDEX IF NOT EXISTS idx_staff_subjects_staff ON staff_subjects(staff_id);
    CREATE INDEX IF NOT EXISTS idx_staff_classes_staff ON staff_classes(staff_id);
    CREATE INDEX IF NOT EXISTS idx_roles_school ON roles(school_id);
    CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module_key);
    CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
    CREATE INDEX IF NOT EXISTS idx_students_school_code ON students(school_id, student_code);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_students_school_code_unique
      ON students(school_id, student_code)
      WHERE deleted_at IS NULL AND student_code IS NOT NULL;
  `)

  // Migrate existing DBs that were created before extra school columns
  migrateSchoolsColumns(db)
  migrateAcademicStructureColumns(db)
  migrateGradingSystemTables(db)
  migrateStaffTables(db)
  migrateRbacTables(db)
  migrateStudentSettingsTable(db)
  migrateStudentIdSystem(db)
  migrateFinanceTables(db)
  migrateDocumentTemplates(db)
  migrateCommunicationTables(db)
  migrateBackupSyncSettings(db)
  migrateSyncCursorTables(db)
  migrateStudentManagementTables(db)
  migrateAcademicManagementTables(db)
  migrateStaffManagementTables(db)
  migrateTeachingAssignments(db)
  migrateFinanceManagementTables(db)
  migrateCommunicationManagementTables(db)
  migrateMvpFeatureTables(db)
  migrateReportsTables(db)
  migrateOfficialDocumentsTables(db)
  migrateSystemAdministrationTables(db)
  migrateResultsCalculationTables(db)
  migrateIdCardDesignerTables(db)
  migrateGateAttendanceTables(db)
}

/** Add missing columns to schools without wiping existing data. */
function migrateSchoolsColumns(db: Database.Database): void {
  const columns = (
    db.prepare(`PRAGMA table_info(schools)`).all() as Array<{ name: string }>
  ).map((c) => c.name)

  const additions: Array<{ name: string; sql: string }> = [
    { name: 'phone', sql: `ALTER TABLE schools ADD COLUMN phone TEXT` },
    { name: 'country', sql: `ALTER TABLE schools ADD COLUMN country TEXT` },
    { name: 'address', sql: `ALTER TABLE schools ADD COLUMN address TEXT` },
    { name: 'logo_path', sql: `ALTER TABLE schools ADD COLUMN logo_path TEXT` },
    {
      name: 'school_code',
      sql: `ALTER TABLE schools ADD COLUMN school_code TEXT NOT NULL DEFAULT ''`,
    },
    {
      name: 'short_code',
      sql: `ALTER TABLE schools ADD COLUMN short_code TEXT NOT NULL DEFAULT ''`,
    },
    {
      name: 'school_type',
      sql: `ALTER TABLE schools ADD COLUMN school_type TEXT`,
    },
    {
      name: 'education_system',
      sql: `ALTER TABLE schools ADD COLUMN education_system TEXT`,
    },
    {
      name: 'school_category',
      sql: `ALTER TABLE schools ADD COLUMN school_category TEXT`,
    },
    { name: 'region', sql: `ALTER TABLE schools ADD COLUMN region TEXT` },
    { name: 'division', sql: `ALTER TABLE schools ADD COLUMN division TEXT` },
    {
      name: 'subdivision',
      sql: `ALTER TABLE schools ADD COLUMN subdivision TEXT`,
    },
    { name: 'website', sql: `ALTER TABLE schools ADD COLUMN website TEXT` },
    { name: 'stamp_path', sql: `ALTER TABLE schools ADD COLUMN stamp_path TEXT` },
    {
      name: 'principal_signature_path',
      sql: `ALTER TABLE schools ADD COLUMN principal_signature_path TEXT`,
    },
    {
      name: 'max_teacher_periods',
      sql: `ALTER TABLE schools ADD COLUMN max_teacher_periods INTEGER`,
    },
    {
      name: 'day_start_time',
      sql: `ALTER TABLE schools ADD COLUMN day_start_time TEXT`,
    },
    {
      name: 'day_end_time',
      sql: `ALTER TABLE schools ADD COLUMN day_end_time TEXT`,
    },
    {
      name: 'period_duration_minutes',
      sql: `ALTER TABLE schools ADD COLUMN period_duration_minutes INTEGER`,
    },
    {
      name: 'periods_per_day',
      sql: `ALTER TABLE schools ADD COLUMN periods_per_day INTEGER`,
    },
  ]

  for (const col of additions) {
    if (!columns.includes(col.name)) {
      db.exec(col.sql)
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS school_day_breaks (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      after_period INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE INDEX IF NOT EXISTS idx_school_day_breaks_school
      ON school_day_breaks(school_id);
  `)
}

/** Migrate classes + ensure structure hierarchy tables. */
function migrateAcademicStructureColumns(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS academic_levels (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS specializations (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      name TEXT NOT NULL,
      abbreviation TEXT NOT NULL DEFAULT '',
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (section_id) REFERENCES sections(id)
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS subject_classes (
      id TEXT PRIMARY KEY NOT NULL,
      subject_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (subject_id) REFERENCES subjects(id),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );
  `)

  const classCols = (
    db.prepare(`PRAGMA table_info(classes)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  const classAdditions = [
    { name: 'school_id', sql: `ALTER TABLE classes ADD COLUMN school_id TEXT` },
    { name: 'level', sql: `ALTER TABLE classes ADD COLUMN level TEXT` },
    { name: 'form_key', sql: `ALTER TABLE classes ADD COLUMN form_key TEXT` },
    { name: 'stream', sql: `ALTER TABLE classes ADD COLUMN stream TEXT` },
    {
      name: 'academic_level_id',
      sql: `ALTER TABLE classes ADD COLUMN academic_level_id TEXT`,
    },
    {
      name: 'section_id',
      sql: `ALTER TABLE classes ADD COLUMN section_id TEXT`,
    },
    {
      name: 'specialization_id',
      sql: `ALTER TABLE classes ADD COLUMN specialization_id TEXT`,
    },
    {
      name: 'capacity',
      sql: `ALTER TABLE classes ADD COLUMN capacity INTEGER`,
    },
    {
      name: 'is_active',
      sql: `ALTER TABLE classes ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`,
    },
  ]
  for (const col of classAdditions) {
    if (!classCols.includes(col.name)) db.exec(col.sql)
  }

  const specializationCols = (
    db
      .prepare(`PRAGMA table_info(specializations)`)
      .all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!specializationCols.includes('abbreviation')) {
    db.exec(
      `ALTER TABLE specializations ADD COLUMN abbreviation TEXT NOT NULL DEFAULT ''`
    )
  }

  const levelCols = (
    db
      .prepare(`PRAGMA table_info(academic_levels)`)
      .all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!levelCols.includes('short_name')) {
    db.exec(
      `ALTER TABLE academic_levels ADD COLUMN short_name TEXT NOT NULL DEFAULT ''`
    )
  }

  const subjectCols = (
    db.prepare(`PRAGMA table_info(subjects)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  const subjectAdditions = [
    { name: 'school_id', sql: `ALTER TABLE subjects ADD COLUMN school_id TEXT` },
    {
      name: 'department_id',
      sql: `ALTER TABLE subjects ADD COLUMN department_id TEXT`,
    },
    {
      name: 'coefficient',
      sql: `ALTER TABLE subjects ADD COLUMN coefficient REAL NOT NULL DEFAULT 1`,
    },
  ]
  for (const col of subjectAdditions) {
    if (!subjectCols.includes(col.name)) db.exec(col.sql)
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);
    CREATE INDEX IF NOT EXISTS idx_classes_level ON classes(academic_level_id);
    CREATE INDEX IF NOT EXISTS idx_classes_section ON classes(section_id);
    CREATE INDEX IF NOT EXISTS idx_departments_school ON departments(school_id);
    CREATE INDEX IF NOT EXISTS idx_subjects_department ON subjects(department_id);
    CREATE INDEX IF NOT EXISTS idx_subject_classes_subject ON subject_classes(subject_id);
    CREATE INDEX IF NOT EXISTS idx_academic_levels_school ON academic_levels(school_id);
    CREATE INDEX IF NOT EXISTS idx_sections_school ON sections(school_id);
    CREATE INDEX IF NOT EXISTS idx_specializations_section ON specializations(section_id);
  `)
}

/** Ensure grading system tables exist on older databases. */
function migrateGradingSystemTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS grading_systems (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      enable_ranking INTEGER NOT NULL DEFAULT 1,
      show_class_average INTEGER NOT NULL DEFAULT 1,
      show_teacher_remarks INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS assessment_types (
      id TEXT PRIMARY KEY NOT NULL,
      grading_system_id TEXT NOT NULL,
      name TEXT NOT NULL,
      weight_percent REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (grading_system_id) REFERENCES grading_systems(id)
    );

    CREATE TABLE IF NOT EXISTS grade_bands (
      id TEXT PRIMARY KEY NOT NULL,
      grading_system_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      min_score REAL NOT NULL,
      max_score REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (grading_system_id) REFERENCES grading_systems(id)
    );

    CREATE INDEX IF NOT EXISTS idx_grading_systems_school ON grading_systems(school_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_types_system ON assessment_types(grading_system_id);
    CREATE INDEX IF NOT EXISTS idx_grade_bands_system ON grade_bands(grading_system_id);
  `)
}

/** Ensure staff tables exist on older databases. */
function migrateStaffTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      gender TEXT,
      phone TEXT,
      email TEXT,
      staff_type TEXT NOT NULL,
      admin_role TEXT,
      department_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS staff_subjects (
      id TEXT PRIMARY KEY NOT NULL,
      staff_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      class_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (staff_id) REFERENCES staff(id),
      FOREIGN KEY (subject_id) REFERENCES subjects(id),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS staff_classes (
      id TEXT PRIMARY KEY NOT NULL,
      staff_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (staff_id) REFERENCES staff(id),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    CREATE INDEX IF NOT EXISTS idx_staff_school ON staff(school_id);
    CREATE INDEX IF NOT EXISTS idx_staff_subjects_staff ON staff_subjects(staff_id);
    CREATE INDEX IF NOT EXISTS idx_staff_classes_staff ON staff_classes(staff_id);
  `)
}

/** Class+subject teaching assignments (a teacher teaches a subject in a specific class). */
function migrateTeachingAssignments(db: Database.Database): void {
  const cols = (
    db.prepare(`PRAGMA table_info(staff_subjects)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!cols.includes('class_id')) {
    db.exec(`ALTER TABLE staff_subjects ADD COLUMN class_id TEXT`)
  }

  const legacy = db
    .prepare(
      `SELECT * FROM staff_subjects
       WHERE deleted_at IS NULL AND (class_id IS NULL OR class_id = '')`
    )
    .all() as Array<{
    id: string
    staff_id: string
    subject_id: string
    created_at: string
    updated_at: string
    deleted_at: string | null
    sync_status: string
    version: number
  }>

  const staffClassesStmt = db.prepare(
    `SELECT class_id FROM staff_classes WHERE staff_id = ? AND deleted_at IS NULL`
  )
  const subjectClassesStmt = db.prepare(
    `SELECT class_id FROM subject_classes WHERE subject_id = ? AND deleted_at IS NULL`
  )
  const updateClass = db.prepare(
    `UPDATE staff_subjects SET class_id = ?, updated_at = ? WHERE id = ?`
  )
  const insertRow = db.prepare(
    `INSERT INTO staff_subjects (
       id, staff_id, subject_id, class_id,
       created_at, updated_at, deleted_at, sync_status, version
     ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', 1)`
  )
  const seen = new Set<string>()
  const existingKeyed = db
    .prepare(
      `SELECT staff_id, class_id, subject_id FROM staff_subjects
       WHERE deleted_at IS NULL AND class_id IS NOT NULL AND class_id != ''`
    )
    .all() as Array<{ staff_id: string; class_id: string; subject_id: string }>
  for (const row of existingKeyed) {
    seen.add(`${row.staff_id}::${row.class_id}::${row.subject_id}`)
  }

  const now = new Date().toISOString()
  for (const row of legacy) {
    const fromStaff = (
      staffClassesStmt.all(row.staff_id) as Array<{ class_id: string }>
    ).map((r) => r.class_id)
    const fromSubject = (
      subjectClassesStmt.all(row.subject_id) as Array<{ class_id: string }>
    ).map((r) => r.class_id)
    const targets =
      fromStaff.length && fromSubject.length
        ? fromStaff.filter((id) => fromSubject.includes(id))
        : fromStaff.length
          ? fromStaff
          : fromSubject
    if (!targets.length) continue
    let first = true
    for (const class_id of targets) {
      const key = `${row.staff_id}::${class_id}::${row.subject_id}`
      if (seen.has(key)) continue
      seen.add(key)
      if (first) {
        updateClass.run(class_id, now, row.id)
        first = false
      } else {
        insertRow.run(
          randomUUID(),
          row.staff_id,
          row.subject_id,
          class_id,
          now,
          now
        )
      }
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_staff_subjects_class ON staff_subjects(class_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_subjects_assignment
      ON staff_subjects(staff_id, class_id, subject_id)
      WHERE deleted_at IS NULL AND class_id IS NOT NULL;
  `)
}

/** Ensure RBAC tables exist; migrate legacy module-matrix role_permissions. */
function migrateRbacTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      module_key TEXT NOT NULL,
      module_label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1
    );
  `)

  const rolePermExists = (
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'role_permissions'`
      )
      .get() as { name: string } | undefined
  )

  if (rolePermExists) {
    const cols = (
      db.prepare(`PRAGMA table_info(role_permissions)`).all() as Array<{
        name: string
      }>
    ).map((c) => c.name)
    if (cols.includes('module_key')) {
      db.exec(
        `ALTER TABLE role_permissions RENAME TO role_permissions_legacy_module`
      )
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id TEXT PRIMARY KEY NOT NULL,
      role_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (role_id) REFERENCES roles(id),
      FOREIGN KEY (permission_id) REFERENCES permissions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_roles_school ON roles(school_id);
    CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module_key);
    CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
  `)

  const userCols = (
    db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!userCols.includes('role_id')) {
    db.exec(`ALTER TABLE users ADD COLUMN role_id TEXT`)
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id)`)
}

/** Ensure student_settings exists on older databases. */
function migrateStudentSettingsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id_format TEXT NOT NULL DEFAULT 'SOF-{SEQ}',
      field_full_name INTEGER NOT NULL DEFAULT 1,
      field_gender INTEGER NOT NULL DEFAULT 1,
      field_date_of_birth INTEGER NOT NULL DEFAULT 1,
      field_place_of_birth INTEGER NOT NULL DEFAULT 1,
      field_parent_information INTEGER NOT NULL DEFAULT 1,
      field_emergency_contact INTEGER NOT NULL DEFAULT 1,
      admit_new INTEGER NOT NULL DEFAULT 1,
      admit_returning INTEGER NOT NULL DEFAULT 1,
      admit_transfer INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE INDEX IF NOT EXISTS idx_student_settings_school ON student_settings(school_id);

    UPDATE student_settings
    SET student_id_format = 'SOF-{SEQ}',
        updated_at = datetime('now'),
        version = version + 1,
        sync_status = 'pending'
    WHERE student_id_format = 'SOF-{YEAR}-{SEQ}';
  `)
}

/** Student ID settings + students identity columns. */
function migrateStudentIdSystem(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_id_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL UNIQUE,
      pattern TEXT NOT NULL DEFAULT '{SCHOOL}-{SEQ}',
      sequence_scope TEXT NOT NULL DEFAULT 'school',
      next_sequence_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE INDEX IF NOT EXISTS idx_student_id_settings_school ON student_id_settings(school_id);
  `)

  const studentCols = (
    db.prepare(`PRAGMA table_info(students)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  const additions = [
    { name: 'school_id', sql: `ALTER TABLE students ADD COLUMN school_id TEXT` },
    {
      name: 'student_code',
      sql: `ALTER TABLE students ADD COLUMN student_code TEXT`,
    },
    {
      name: 'admission_year',
      sql: `ALTER TABLE students ADD COLUMN admission_year INTEGER`,
    },
    {
      name: 'academic_level_id',
      sql: `ALTER TABLE students ADD COLUMN academic_level_id TEXT`,
    },
    {
      name: 'sequence_number',
      sql: `ALTER TABLE students ADD COLUMN sequence_number INTEGER`,
    },
  ]
  for (const col of additions) {
    if (!studentCols.includes(col.name)) db.exec(col.sql)
  }

  // Safe migration for existing student_id_settings:
  // 1. Migrate default pattern from {SCHOOL}-{YEAR}-{SEQ} to {SCHOOL}-{SEQ}
  // 2. Migrate sequence_scope from 'year' to 'school'
  // 3. Preserve all existing student records, IDs, and student codes unchanged
  db.exec(`
    UPDATE student_id_settings
    SET pattern = '{SCHOOL}-{SEQ}',
        updated_at = datetime('now'),
        version = version + 1,
        sync_status = 'pending'
    WHERE pattern = '{SCHOOL}-{YEAR}-{SEQ}';

    UPDATE student_id_settings
    SET sequence_scope = 'school',
        updated_at = datetime('now'),
        version = version + 1,
        sync_status = 'pending'
    WHERE sequence_scope = 'year';
  `)

  // Report existing students with missing student_code (do not silently regenerate)
  try {
    const missingCodes = db
      .prepare(
        `SELECT count(*) as count FROM students WHERE (student_code IS NULL OR TRIM(student_code) = '') AND deleted_at IS NULL`
      )
      .get() as { count: number } | undefined
    if (missingCodes && missingCodes.count > 0) {
      console.warn(
        `[sofia] Note: Found ${missingCodes.count} student(s) with missing student_code. Leaving existing records unchanged.`
      )
    }
  } catch {
    /* ignore */
  }

  // Advance next_sequence_number if existing students have higher sequence numbers
  try {
    const settingsList = db
      .prepare(
        `SELECT id, school_id, next_sequence_number FROM student_id_settings WHERE deleted_at IS NULL`
      )
      .all() as Array<{ id: string; school_id: string; next_sequence_number: number }>

    for (const setting of settingsList) {
      const maxRow = db
        .prepare(
          `SELECT MAX(sequence_number) as max_seq FROM students WHERE school_id = ? AND deleted_at IS NULL`
        )
        .get(setting.school_id) as { max_seq: number | null } | undefined

      if (maxRow?.max_seq != null && maxRow.max_seq >= setting.next_sequence_number) {
        db.prepare(
          `UPDATE student_id_settings
           SET next_sequence_number = ?,
               updated_at = datetime('now'),
               version = version + 1,
               sync_status = 'pending'
           WHERE id = ?`
        ).run(maxRow.max_seq + 1, setting.id)
      }
    }
  } catch {
    /* ignore */
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_students_school_code ON students(school_id, student_code);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_students_school_code_unique
      ON students(school_id, student_code)
      WHERE deleted_at IS NULL AND student_code IS NOT NULL;
  `)
}

/** Fee categories, amounts, and finance settings. */
function migrateFinanceTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fee_categories (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category_key TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS fee_amounts (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      academic_level_id TEXT NOT NULL,
      fee_category_id TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (academic_level_id) REFERENCES academic_levels(id),
      FOREIGN KEY (fee_category_id) REFERENCES fee_categories(id)
    );

    CREATE TABLE IF NOT EXISTS finance_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL UNIQUE,
      currency TEXT NOT NULL DEFAULT 'XAF',
      payment_methods TEXT NOT NULL DEFAULT '["cash","mobile_money","bank_transfer"]',
      receipt_prefix TEXT NOT NULL DEFAULT 'RCP',
      receipt_next_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE INDEX IF NOT EXISTS idx_fee_categories_school ON fee_categories(school_id);
    CREATE INDEX IF NOT EXISTS idx_fee_amounts_school ON fee_amounts(school_id);
    CREATE INDEX IF NOT EXISTS idx_fee_amounts_level ON fee_amounts(academic_level_id);
    CREATE INDEX IF NOT EXISTS idx_finance_settings_school ON finance_settings(school_id);
  `)
}

/** Official document template settings. */
function migrateDocumentTemplates(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_templates (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      template_key TEXT NOT NULL,
      title TEXT NOT NULL,
      header_text TEXT NOT NULL DEFAULT '',
      footer_text TEXT NOT NULL DEFAULT '',
      logo_path TEXT,
      show_logo INTEGER NOT NULL DEFAULT 1,
      show_stamp INTEGER NOT NULL DEFAULT 1,
      show_signature INTEGER NOT NULL DEFAULT 1,
      signature_label TEXT NOT NULL DEFAULT 'Principal',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE INDEX IF NOT EXISTS idx_document_templates_school ON document_templates(school_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_templates_school_key
      ON document_templates(school_id, template_key)
      WHERE deleted_at IS NULL;
  `)
}

/** SMS provider, channels, and notification message templates. */
function migrateCommunicationTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS communication_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL UNIQUE,
      sms_provider TEXT NOT NULL DEFAULT '',
      sms_api_key TEXT NOT NULL DEFAULT '',
      sms_sender_name TEXT NOT NULL DEFAULT '',
      channel_sms INTEGER NOT NULL DEFAULT 0,
      channel_email INTEGER NOT NULL DEFAULT 1,
      channel_internal INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS notification_templates (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      template_key TEXT NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE INDEX IF NOT EXISTS idx_communication_settings_school
      ON communication_settings(school_id);
    CREATE INDEX IF NOT EXISTS idx_notification_templates_school
      ON notification_templates(school_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_school_key
      ON notification_templates(school_id, template_key)
      WHERE deleted_at IS NULL;
  `)
}

/** Backup preferences and sync status for a school. */
function migrateBackupSyncSettings(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS backup_sync_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL UNIQUE,
      last_sync_at TEXT,
      last_sync_status TEXT NOT NULL DEFAULT 'never',
      cloud_connected INTEGER NOT NULL DEFAULT 0,
      last_connection_test_at TEXT,
      automatic_backup INTEGER NOT NULL DEFAULT 1,
      backup_frequency TEXT NOT NULL DEFAULT 'daily',
      backup_location TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE INDEX IF NOT EXISTS idx_backup_sync_settings_school
      ON backup_sync_settings(school_id);
  `)
}

/** Sync cursor tracking per device and school tenant. */
function migrateSyncCursorTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_cursors (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      last_synced_change_id INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE (school_id, device_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sync_cursors_school_device
      ON sync_cursors(school_id, device_id);
  `)
}

/** Extended student profile fields + transfers, documents, admissions, promotions. */
function migrateStudentManagementTables(db: Database.Database): void {
  const studentCols = (
    db.prepare(`PRAGMA table_info(students)`).all() as Array<{ name: string }>
  ).map((c) => c.name)

  const studentAdditions: Array<{ name: string; sql: string }> = [
    { name: 'gender', sql: `ALTER TABLE students ADD COLUMN gender TEXT` },
    {
      name: 'date_of_birth',
      sql: `ALTER TABLE students ADD COLUMN date_of_birth TEXT`,
    },
    {
      name: 'place_of_birth',
      sql: `ALTER TABLE students ADD COLUMN place_of_birth TEXT`,
    },
    { name: 'phone', sql: `ALTER TABLE students ADD COLUMN phone TEXT` },
    { name: 'email', sql: `ALTER TABLE students ADD COLUMN email TEXT` },
    { name: 'address', sql: `ALTER TABLE students ADD COLUMN address TEXT` },
    {
      name: 'admission_type',
      sql: `ALTER TABLE students ADD COLUMN admission_type TEXT`,
    },
    {
      name: 'guardian_name',
      sql: `ALTER TABLE students ADD COLUMN guardian_name TEXT`,
    },
    {
      name: 'guardian_phone',
      sql: `ALTER TABLE students ADD COLUMN guardian_phone TEXT`,
    },
    {
      name: 'guardian_email',
      sql: `ALTER TABLE students ADD COLUMN guardian_email TEXT`,
    },
    {
      name: 'guardian_relationship',
      sql: `ALTER TABLE students ADD COLUMN guardian_relationship TEXT`,
    },
    {
      name: 'status',
      sql: `ALTER TABLE students ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
    },
    {
      name: 'photo_path',
      sql: `ALTER TABLE students ADD COLUMN photo_path TEXT`,
    },
  ]

  for (const col of studentAdditions) {
    if (!studentCols.includes(col.name)) db.exec(col.sql)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS admissions (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      gender TEXT,
      date_of_birth TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      academic_level_id TEXT,
      preferred_class_id TEXT,
      admission_year INTEGER,
      guardian_name TEXT,
      guardian_phone TEXT,
      guardian_email TEXT,
      guardian_relationship TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      student_id TEXT,
      photo_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS student_transfers (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      from_class_id TEXT,
      to_school_name TEXT NOT NULL,
      transfer_date TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS student_documents (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      document_type TEXT NOT NULL DEFAULT 'other',
      title TEXT NOT NULL,
      file_path TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS promotion_runs (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      from_year INTEGER NOT NULL,
      to_year INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS promotion_mappings (
      id TEXT PRIMARY KEY NOT NULL,
      promotion_run_id TEXT NOT NULL,
      from_class_id TEXT NOT NULL,
      to_class_id TEXT,
      student_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (promotion_run_id) REFERENCES promotion_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_students_school_status ON students(school_id, status);
    CREATE INDEX IF NOT EXISTS idx_admissions_school ON admissions(school_id);
    CREATE INDEX IF NOT EXISTS idx_student_transfers_school ON student_transfers(school_id);
    CREATE INDEX IF NOT EXISTS idx_student_documents_student ON student_documents(student_id);
    CREATE INDEX IF NOT EXISTS idx_promotion_runs_school ON promotion_runs(school_id);
    CREATE INDEX IF NOT EXISTS idx_promotion_mappings_run ON promotion_mappings(promotion_run_id);
  `)

  const admissionCols = (
    db.prepare(`PRAGMA table_info(admissions)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!admissionCols.includes('photo_path')) {
    db.exec(`ALTER TABLE admissions ADD COLUMN photo_path TEXT`)
  }
}

/** Timetable, attendance, CA, exams, results, and report cards. */
function migrateAcademicManagementTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS timetable_slots (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      subject_id TEXT,
      staff_id TEXT,
      day_of_week INTEGER NOT NULL,
      period_number INTEGER NOT NULL,
      room TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      session_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'present',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (session_id) REFERENCES attendance_sessions(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS ca_assessments (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      term_id TEXT,
      academic_year_id TEXT,
      weight_percent REAL NOT NULL DEFAULT 0,
      max_score REAL NOT NULL DEFAULT 100,
      assessment_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS ca_scores (
      id TEXT PRIMARY KEY NOT NULL,
      assessment_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      score REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (assessment_id) REFERENCES ca_assessments(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS exam_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      term_id TEXT,
      academic_year_id TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS exam_papers (
      id TEXT PRIMARY KEY NOT NULL,
      exam_session_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      max_score REAL NOT NULL DEFAULT 100,
      exam_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (exam_session_id) REFERENCES exam_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS exam_scores (
      id TEXT PRIMARY KEY NOT NULL,
      paper_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      score REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (paper_id) REFERENCES exam_papers(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS result_runs (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      term_id TEXT,
      academic_year_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      computed_at TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS result_subject_rows (
      id TEXT PRIMARY KEY NOT NULL,
      result_run_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      ca_score REAL NOT NULL DEFAULT 0,
      exam_score REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      grade TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (result_run_id) REFERENCES result_runs(id)
    );

    CREATE TABLE IF NOT EXISTS result_student_summaries (
      id TEXT PRIMARY KEY NOT NULL,
      result_run_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      average REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      grade TEXT,
      position INTEGER,
      remark TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (result_run_id) REFERENCES result_runs(id)
    );

    CREATE TABLE IF NOT EXISTS report_cards (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      term_id TEXT,
      academic_year_id TEXT,
      result_run_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      generated_at TEXT,
      payload TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE INDEX IF NOT EXISTS idx_timetable_slots_class
      ON timetable_slots(class_id, day_of_week, period_number);
    CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class_date
      ON attendance_sessions(class_id, session_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_records_session
      ON attendance_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_ca_assessments_school
      ON ca_assessments(school_id);
    CREATE INDEX IF NOT EXISTS idx_ca_scores_assessment
      ON ca_scores(assessment_id);
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_school
      ON exam_sessions(school_id);
    CREATE INDEX IF NOT EXISTS idx_exam_papers_session
      ON exam_papers(exam_session_id);
    CREATE INDEX IF NOT EXISTS idx_exam_scores_paper
      ON exam_scores(paper_id);
    CREATE INDEX IF NOT EXISTS idx_result_runs_class
      ON result_runs(class_id, term_id);
    CREATE INDEX IF NOT EXISTS idx_result_subject_rows_run
      ON result_subject_rows(result_run_id);
    CREATE INDEX IF NOT EXISTS idx_result_student_summaries_run
      ON result_student_summaries(result_run_id);
    CREATE INDEX IF NOT EXISTS idx_report_cards_class
      ON report_cards(class_id, term_id);
  `)
}

/** Staff Management: extended staff profile, homeroom, attendance, leave. */
function migrateStaffManagementTables(db: Database.Database): void {
  const staffCols = (
    db.prepare(`PRAGMA table_info(staff)`).all() as Array<{ name: string }>
  ).map((c) => c.name)

  const staffAdditions: Array<{ name: string; sql: string }> = [
    {
      name: 'employee_code',
      sql: `ALTER TABLE staff ADD COLUMN employee_code TEXT`,
    },
    {
      name: 'joining_date',
      sql: `ALTER TABLE staff ADD COLUMN joining_date TEXT`,
    },
    { name: 'address', sql: `ALTER TABLE staff ADD COLUMN address TEXT` },
    { name: 'job_role', sql: `ALTER TABLE staff ADD COLUMN job_role TEXT` },
  ]
  for (const col of staffAdditions) {
    if (!staffCols.includes(col.name)) db.exec(col.sql)
  }

  const classCols = (
    db.prepare(`PRAGMA table_info(classes)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!classCols.includes('class_teacher_id')) {
    db.exec(`ALTER TABLE classes ADD COLUMN class_teacher_id TEXT`)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_attendance (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      marked_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (staff_id) REFERENCES staff(id)
    );

    CREATE TABLE IF NOT EXISTS leave_balances (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      leave_type TEXT NOT NULL,
      year INTEGER NOT NULL,
      entitled INTEGER,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (staff_id) REFERENCES staff(id)
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      leave_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days REAL NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (staff_id) REFERENCES staff(id)
    );

    CREATE TABLE IF NOT EXISTS staff_notifications (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_staff_attendance_school_date
      ON staff_attendance(school_id, date);
    CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff
      ON staff_attendance(staff_id, date);
    CREATE INDEX IF NOT EXISTS idx_leave_balances_staff
      ON leave_balances(staff_id, year);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_school
      ON leave_requests(school_id, status);
    CREATE INDEX IF NOT EXISTS idx_staff_notifications_user
      ON staff_notifications(user_id, read_at);
  `)
}

/** Operational Finance & Fees: structures, invoices, payments, receipts, expenses, ledger. */
function migrateFinanceManagementTables(db: Database.Database): void {
  const settingsCols = (
    db.prepare(`PRAGMA table_info(finance_settings)`).all() as Array<{
      name: string
    }>
  ).map((c) => c.name)
  const settingsAdditions: Array<{ name: string; sql: string }> = [
    {
      name: 'invoice_prefix',
      sql: `ALTER TABLE finance_settings ADD COLUMN invoice_prefix TEXT NOT NULL DEFAULT 'INV'`,
    },
    {
      name: 'invoice_next_number',
      sql: `ALTER TABLE finance_settings ADD COLUMN invoice_next_number INTEGER NOT NULL DEFAULT 1`,
    },
    {
      name: 'payment_prefix',
      sql: `ALTER TABLE finance_settings ADD COLUMN payment_prefix TEXT NOT NULL DEFAULT 'PAY'`,
    },
    {
      name: 'payment_next_number',
      sql: `ALTER TABLE finance_settings ADD COLUMN payment_next_number INTEGER NOT NULL DEFAULT 1`,
    },
    {
      name: 'expense_prefix',
      sql: `ALTER TABLE finance_settings ADD COLUMN expense_prefix TEXT NOT NULL DEFAULT 'EXP'`,
    },
    {
      name: 'expense_next_number',
      sql: `ALTER TABLE finance_settings ADD COLUMN expense_next_number INTEGER NOT NULL DEFAULT 1`,
    },
    {
      name: 'allow_credit',
      sql: `ALTER TABLE finance_settings ADD COLUMN allow_credit INTEGER NOT NULL DEFAULT 1`,
    },
  ]
  for (const col of settingsAdditions) {
    if (!settingsCols.includes(col.name)) db.exec(col.sql)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS fee_structures (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      academic_year_id TEXT NOT NULL,
      academic_term_id TEXT,
      academic_level_id TEXT,
      section_id TEXT,
      class_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
    );

    CREATE TABLE IF NOT EXISTS fee_structure_lines (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      fee_structure_id TEXT NOT NULL,
      fee_category_id TEXT,
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      frequency TEXT NOT NULL DEFAULT 'termly',
      is_mandatory INTEGER NOT NULL DEFAULT 1,
      late_fee_mode TEXT NOT NULL DEFAULT 'none',
      late_fee_value REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (fee_structure_id) REFERENCES fee_structures(id)
    );

    CREATE TABLE IF NOT EXISTS fee_discounts (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      discount_mode TEXT NOT NULL,
      discount_value REAL NOT NULL DEFAULT 0,
      academic_year_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS student_fee_discounts (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      fee_discount_id TEXT,
      discount_mode TEXT NOT NULL,
      discount_value REAL NOT NULL DEFAULT 0,
      reason TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      academic_year_id TEXT,
      academic_term_id TEXT,
      fee_structure_id TEXT,
      billing_period TEXT,
      issue_date TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_total REAL NOT NULL DEFAULT 0,
      net_payable REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      carried_from_invoice_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      fee_category_id TEXT,
      description TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      is_adjustment INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      payment_number TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      reference TEXT,
      paid_at TEXT NOT NULL,
      recorded_by TEXT,
      notes TEXT,
      credit_applied REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      payment_id TEXT NOT NULL UNIQUE,
      student_id TEXT NOT NULL,
      receipt_number TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_remaining REAL NOT NULL DEFAULT 0,
      issued_at TEXT NOT NULL,
      reprint_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS student_credits (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      source_payment_id TEXT,
      amount REAL NOT NULL,
      remaining REAL NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      expense_number TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      description TEXT,
      vendor TEXT,
      payment_method TEXT,
      receipt_path TEXT,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurring_interval TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      account TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      ref_type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      description TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS finance_audit_log (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS finance_reminders (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      invoice_id TEXT,
      channel TEXT NOT NULL DEFAULT 'in_app',
      message TEXT,
      sent_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE INDEX IF NOT EXISTS idx_fee_structures_school ON fee_structures(school_id);
    CREATE INDEX IF NOT EXISTS idx_fee_structure_lines_structure ON fee_structure_lines(fee_structure_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_school ON invoices(school_id, status);
    CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
    CREATE INDEX IF NOT EXISTS idx_receipts_school ON receipts(school_id);
    CREATE INDEX IF NOT EXISTS idx_student_credits_student ON student_credits(student_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_school ON expenses(school_id, expense_date);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_school ON ledger_entries(school_id, entry_date);
    CREATE INDEX IF NOT EXISTS idx_finance_audit_school ON finance_audit_log(school_id, created_at);
  `)
}

/** Operational Communication: announcements, deliveries, parent threads, internal notices. */
function migrateCommunicationManagementTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience_type TEXT NOT NULL DEFAULT 'all',
      class_id TEXT,
      academic_level_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      channels_json TEXT NOT NULL DEFAULT '[]',
      recipient_count INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS communication_deliveries (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      announcement_id TEXT,
      student_id TEXT,
      thread_id TEXT,
      channel TEXT NOT NULL,
      recipient_name TEXT,
      recipient_contact TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      sent_at TEXT,
      error_message TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS parent_message_threads (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      guardian_name TEXT,
      guardian_phone TEXT,
      guardian_email TEXT,
      last_message_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS parent_messages (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'outbound',
      channel TEXT NOT NULL DEFAULT 'internal',
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      sent_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (thread_id) REFERENCES parent_message_threads(id)
    );

    CREATE TABLE IF NOT EXISTS internal_notices (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'all',
      priority TEXT NOT NULL DEFAULT 'normal',
      expires_at TEXT,
      sent_at TEXT,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE INDEX IF NOT EXISTS idx_announcements_school
      ON announcements(school_id, status);
    CREATE INDEX IF NOT EXISTS idx_communication_deliveries_school
      ON communication_deliveries(school_id, channel, created_at);
    CREATE INDEX IF NOT EXISTS idx_parent_message_threads_school
      ON parent_message_threads(school_id, last_message_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_message_threads_student
      ON parent_message_threads(school_id, student_id)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_parent_messages_thread
      ON parent_messages(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_internal_notices_school
      ON internal_notices(school_id, sent_at);
  `)
}

/**
 * MVP extensions: budgeting, online payments, bank deposits, boarding
 * residence, student ID cards, teaching progress. Additive only.
 */
function migrateMvpFeatureTables(db: Database.Database): void {
  const studentCols = (
    db.prepare(`PRAGMA table_info(students)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!studentCols.includes('residence_type')) {
    db.exec(
      `ALTER TABLE students ADD COLUMN residence_type TEXT NOT NULL DEFAULT 'day'`
    )
  }

  const structCols = (
    db.prepare(`PRAGMA table_info(fee_structures)`).all() as Array<{
      name: string
    }>
  ).map((c) => c.name)
  if (!structCols.includes('applies_to_residence')) {
    db.exec(
      `ALTER TABLE fee_structures ADD COLUMN applies_to_residence TEXT NOT NULL DEFAULT 'all'`
    )
  }
  if (!structCols.includes('section_id')) {
    db.exec(`ALTER TABLE fee_structures ADD COLUMN section_id TEXT`)
  }

  const settingsCols = (
    db.prepare(`PRAGMA table_info(finance_settings)`).all() as Array<{
      name: string
    }>
  ).map((c) => c.name)
  const settingsAdditions: Array<{ name: string; sql: string }> = [
    {
      name: 'budget_alert_pct',
      sql: `ALTER TABLE finance_settings ADD COLUMN budget_alert_pct REAL NOT NULL DEFAULT 70`,
    },
    {
      name: 'budget_warning_pct',
      sql: `ALTER TABLE finance_settings ADD COLUMN budget_warning_pct REAL NOT NULL DEFAULT 85`,
    },
    {
      name: 'budget_critical_pct',
      sql: `ALTER TABLE finance_settings ADD COLUMN budget_critical_pct REAL NOT NULL DEFAULT 100`,
    },
    {
      name: 'require_full_deposit_reconciliation',
      sql: `ALTER TABLE finance_settings ADD COLUMN require_full_deposit_reconciliation INTEGER NOT NULL DEFAULT 1`,
    },
  ]
  for (const col of settingsAdditions) {
    if (!settingsCols.includes(col.name)) db.exec(col.sql)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS budget_categories (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category_key TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      academic_year_id TEXT NOT NULL,
      budget_category_id TEXT NOT NULL,
      period_type TEXT NOT NULL DEFAULT 'annual',
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      allocated_amount REAL NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      alert_pct REAL,
      warning_pct REAL,
      critical_pct REAL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
      FOREIGN KEY (budget_category_id) REFERENCES budget_categories(id)
    );

    CREATE TABLE IF NOT EXISTS budget_alerts (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      budget_id TEXT NOT NULL,
      level TEXT NOT NULL,
      utilization REAL NOT NULL,
      spent REAL NOT NULL,
      allocated REAL NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (budget_id) REFERENCES budgets(id)
    );

    CREATE TABLE IF NOT EXISTS online_payment_transactions (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      payment_id TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XAF',
      status TEXT NOT NULL DEFAULT 'pending',
      provider_key TEXT NOT NULL DEFAULT 'stub',
      provider_reference TEXT,
      idempotency_key TEXT,
      failure_reason TEXT,
      initiated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS bank_deposits (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      deposit_number TEXT NOT NULL,
      amount REAL NOT NULL,
      collection_source TEXT,
      collection_date TEXT,
      deposit_date TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      bank_account TEXT,
      deposit_reference TEXT,
      deposited_by TEXT,
      notes TEXT,
      document_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending_verification',
      verified_by TEXT,
      verified_at TEXT,
      posted_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS bank_deposit_allocations (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      bank_deposit_id TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (bank_deposit_id) REFERENCES bank_deposits(id),
      FOREIGN KEY (payment_id) REFERENCES payments(id)
    );

    CREATE TABLE IF NOT EXISTS student_id_card_templates (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      front_layout TEXT NOT NULL DEFAULT 'classic',
      back_layout TEXT NOT NULL DEFAULT 'info',
      show_photo INTEGER NOT NULL DEFAULT 1,
      validity_months INTEGER NOT NULL DEFAULT 12,
      is_system INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'Standard',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS student_id_cards (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_code TEXT NOT NULL,
      academic_year_id TEXT NOT NULL,
      template_id TEXT,
      class_id TEXT,
      class_name TEXT,
      student_name TEXT NOT NULL,
      valid_from TEXT NOT NULL,
      valid_to TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      generated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS teaching_syllabi (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      academic_year_id TEXT NOT NULL,
      academic_level_id TEXT,
      class_id TEXT,
      title TEXT NOT NULL,
      term_weeks INTEGER NOT NULL DEFAULT 12,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (subject_id) REFERENCES subjects(id),
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
    );

    CREATE TABLE IF NOT EXISTS syllabus_topics (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      syllabus_id TEXT NOT NULL,
      parent_id TEXT,
      title TEXT NOT NULL,
      sequence INTEGER NOT NULL DEFAULT 0,
      objectives TEXT,
      coverage_status TEXT NOT NULL DEFAULT 'not_started',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (syllabus_id) REFERENCES teaching_syllabi(id)
    );

    CREATE TABLE IF NOT EXISTS teaching_logs (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      syllabus_id TEXT,
      topic_id TEXT,
      staff_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      academic_year_id TEXT,
      academic_term_id TEXT,
      lesson_date TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'taught',
      progress_percent REAL,
      remarks TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE INDEX IF NOT EXISTS idx_budget_categories_school
      ON budget_categories(school_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_categories_key
      ON budget_categories(school_id, category_key)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_budgets_school
      ON budgets(school_id, status);
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_budget
      ON budget_alerts(budget_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_online_payments_school
      ON online_payment_transactions(school_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_online_payments_idempotency
      ON online_payment_transactions(school_id, idempotency_key)
      WHERE deleted_at IS NULL AND idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_bank_deposits_school
      ON bank_deposits(school_id, status);
    CREATE INDEX IF NOT EXISTS idx_bank_deposit_allocs
      ON bank_deposit_allocations(bank_deposit_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_student_id_cards_year
      ON student_id_cards(school_id, student_id, academic_year_id)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_teaching_syllabi_school
      ON teaching_syllabi(school_id, academic_year_id);
    CREATE INDEX IF NOT EXISTS idx_syllabus_topics_syllabus
      ON syllabus_topics(syllabus_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_teaching_logs_school
      ON teaching_logs(school_id, lesson_date);
  `)
}

/** Reporting settings only — analytics themselves are computed from operational tables. */
function migrateReportsTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS report_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      attendance_risk_pct REAL NOT NULL DEFAULT 75,
      pass_mark REAL NOT NULL DEFAULT 40,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_report_settings_school
      ON report_settings(school_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_result_runs_school_year
      ON result_runs(school_id, academic_year_id, term_id, status);
    CREATE INDEX IF NOT EXISTS idx_result_subject_rows_run
      ON result_subject_rows(result_run_id, subject_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_records_student
      ON attendance_records(student_id);
  `)
}

const SYNC_TAIL = `
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1`

/** Official generated documents, numbering, signatories — not a second student/result store. */
function migrateOfficialDocumentsTables(db: Database.Database): void {
  const tplCols = (
    db.prepare(`PRAGMA table_info(document_templates)`).all() as Array<{
      name: string
    }>
  ).map((c) => c.name)
  const additions: Array<{ name: string; sql: string }> = [
    { name: 'body_text', sql: `ALTER TABLE document_templates ADD COLUMN body_text TEXT NOT NULL DEFAULT ''` },
    {
      name: 'document_family',
      sql: `ALTER TABLE document_templates ADD COLUMN document_family TEXT NOT NULL DEFAULT 'official'`,
    },
    { name: 'type_code', sql: `ALTER TABLE document_templates ADD COLUMN type_code TEXT NOT NULL DEFAULT 'DOC'` },
    {
      name: 'category',
      sql: `ALTER TABLE document_templates ADD COLUMN category TEXT NOT NULL DEFAULT 'administrative'`,
    },
    {
      name: 'description',
      sql: `ALTER TABLE document_templates ADD COLUMN description TEXT NOT NULL DEFAULT ''`,
    },
    {
      name: 'required_fields',
      sql: `ALTER TABLE document_templates ADD COLUMN required_fields TEXT NOT NULL DEFAULT '[]'`,
    },
    {
      name: 'number_pattern',
      sql: `ALTER TABLE document_templates ADD COLUMN number_pattern TEXT NOT NULL DEFAULT '{SCHOOL_CODE}/{TYPE}/{YEAR}/{SEQUENCE}'`,
    },
    {
      name: 'signatory_role',
      sql: `ALTER TABLE document_templates ADD COLUMN signatory_role TEXT NOT NULL DEFAULT 'principal'`,
    },
    { name: 'is_default', sql: `ALTER TABLE document_templates ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0` },
    {
      name: 'requires_approval',
      sql: `ALTER TABLE document_templates ADD COLUMN requires_approval INTEGER NOT NULL DEFAULT 0`,
    },
    { name: 'created_by', sql: `ALTER TABLE document_templates ADD COLUMN created_by TEXT` },
  ]
  for (const col of additions) {
    if (!tplCols.includes(col.name)) db.exec(col.sql)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS document_number_sequences (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      type_code TEXT NOT NULL,
      year_key TEXT NOT NULL,
      next_number INTEGER NOT NULL DEFAULT 1,
      ${SYNC_TAIL},
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_sequences_scope
      ON document_number_sequences(school_id, type_code, year_key)
      WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS document_signatories (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      role_key TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      signature_path TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      ${SYNC_TAIL},
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_signatories_role
      ON document_signatories(school_id, role_key)
      WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS issued_documents (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      document_family TEXT NOT NULL,
      template_id TEXT NOT NULL,
      template_key TEXT NOT NULL DEFAULT '',
      document_number TEXT NOT NULL,
      verification_code TEXT NOT NULL,
      student_id TEXT,
      academic_year_id TEXT,
      term_id TEXT,
      status TEXT NOT NULL DEFAULT 'generated',
      version_number INTEGER NOT NULL DEFAULT 1,
      supersedes_id TEXT,
      generated_by TEXT,
      issued_at TEXT,
      issued_by TEXT,
      voided_at TEXT,
      rendered_html TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      ${SYNC_TAIL},
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE INDEX IF NOT EXISTS idx_issued_docs_school_family
      ON issued_documents(school_id, document_family, created_at);
    CREATE INDEX IF NOT EXISTS idx_issued_docs_student
      ON issued_documents(school_id, student_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_issued_docs_number
      ON issued_documents(school_id, document_number)
      WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_issued_docs_verify
      ON issued_documents(school_id, verification_code)
      WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS issued_document_versions (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      issued_document_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      rendered_html TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT,
      ${SYNC_TAIL},
      FOREIGN KEY (issued_document_id) REFERENCES issued_documents(id)
    );
    CREATE INDEX IF NOT EXISTS idx_issued_doc_versions
      ON issued_document_versions(issued_document_id, version_number);

    CREATE TABLE IF NOT EXISTS document_audit_log (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      user_id TEXT,
      payload_json TEXT,
      ${SYNC_TAIL},
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE INDEX IF NOT EXISTS idx_doc_audit_school
      ON document_audit_log(school_id, created_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_templates_default
      ON document_templates(school_id, document_family)
      WHERE is_default = 1 AND deleted_at IS NULL;
  `)
}

/** Users extras, central audit, backup history, sync runs/conflicts, system settings. */
function migrateSystemAdministrationTables(db: Database.Database): void {
  const userCols = (
    db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  const userAdds: Array<{ name: string; sql: string }> = [
    { name: 'first_name', sql: `ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''` },
    { name: 'last_name', sql: `ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''` },
    { name: 'phone', sql: `ALTER TABLE users ADD COLUMN phone TEXT` },
    { name: 'status', sql: `ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'` },
    { name: 'last_login_at', sql: `ALTER TABLE users ADD COLUMN last_login_at TEXT` },
    { name: 'staff_id', sql: `ALTER TABLE users ADD COLUMN staff_id TEXT` },
    { name: 'failed_login_count', sql: `ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0` },
    { name: 'locked_until', sql: `ALTER TABLE users ADD COLUMN locked_until TEXT` },
    { name: 'must_change_password', sql: `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0` },
  ]
  for (const col of userAdds) {
    if (!userCols.includes(col.name)) db.exec(col.sql)
  }

  const roleCols = (
    db.prepare(`PRAGMA table_info(roles)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!roleCols.includes('is_enabled')) {
    db.exec(`ALTER TABLE roles ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1`)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(school_id, user_id);

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      module_key TEXT NOT NULL DEFAULT 'system',
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL DEFAULT 'success',
      before_json TEXT,
      after_json TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE INDEX IF NOT EXISTS idx_audit_events_school_created
      ON audit_events(school_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_events_action
      ON audit_events(school_id, action);
    CREATE INDEX IF NOT EXISTS idx_audit_events_actor
      ON audit_events(school_id, actor_user_id);

    CREATE TABLE IF NOT EXISTS backup_records (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      backup_type TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'successful',
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      created_by TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE INDEX IF NOT EXISTS idx_backup_records_school
      ON backup_records(school_id, created_at);

    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'upload',
      processed INTEGER NOT NULL DEFAULT 0,
      successful INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      conflicts INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'successful',
      created_at TEXT NOT NULL,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE INDEX IF NOT EXISTS idx_sync_runs_school ON sync_runs(school_id, created_at);

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      local_json TEXT,
      remote_json TEXT,
      local_updated_at TEXT,
      remote_updated_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      resolution TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_school
      ON sync_conflicts(school_id, status);

    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL UNIQUE,
      timezone TEXT NOT NULL DEFAULT 'Africa/Douala',
      session_timeout_minutes INTEGER NOT NULL DEFAULT 480,
      password_min_length INTEGER NOT NULL DEFAULT 8,
      password_require_upper INTEGER NOT NULL DEFAULT 1,
      password_require_digit INTEGER NOT NULL DEFAULT 1,
      lockout_attempts INTEGER NOT NULL DEFAULT 5,
      lockout_minutes INTEGER NOT NULL DEFAULT 15,
      auto_sync INTEGER NOT NULL DEFAULT 0,
      sync_interval_minutes INTEGER NOT NULL DEFAULT 30,
      backup_retention_days INTEGER NOT NULL DEFAULT 30,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
  `)
}

function migrateResultsCalculationTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS result_calculation_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      academic_year_id TEXT,
      period_mode TEXT NOT NULL DEFAULT 'term',
      status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    CREATE TABLE IF NOT EXISTS result_calculation_profile_versions (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      config_json TEXT NOT NULL,
      config_hash TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (profile_id) REFERENCES result_calculation_profiles(id)
    );

    CREATE TABLE IF NOT EXISTS result_calculation_class_assignments (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      class_id TEXT,
      academic_level_id TEXT,
      department_id TEXT,
      allow_overlap INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (profile_id) REFERENCES result_calculation_profiles(id)
    );

    CREATE INDEX IF NOT EXISTS idx_rcp_school
      ON result_calculation_profiles(school_id, status);
    CREATE INDEX IF NOT EXISTS idx_rcp_versions_profile
      ON result_calculation_profile_versions(profile_id, version_number);
    CREATE INDEX IF NOT EXISTS idx_rcp_assign_school
      ON result_calculation_class_assignments(school_id, profile_id);

    CREATE TABLE IF NOT EXISTS result_subject_coefficients (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      class_id TEXT,
      academic_level_id TEXT,
      academic_year_id TEXT,
      coefficient REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    );

    CREATE INDEX IF NOT EXISTS idx_rsc_school_subj
      ON result_subject_coefficients(school_id, subject_id, class_id, academic_year_id);
  `)

  const runCols = (
    db.prepare(`PRAGMA table_info(result_runs)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  const runAdds: Array<{ name: string; sql: string }> = [
    {
      name: 'calculation_profile_id',
      sql: `ALTER TABLE result_runs ADD COLUMN calculation_profile_id TEXT`,
    },
    {
      name: 'calculation_version',
      sql: `ALTER TABLE result_runs ADD COLUMN calculation_version INTEGER`,
    },
    {
      name: 'calculation_hash',
      sql: `ALTER TABLE result_runs ADD COLUMN calculation_hash TEXT`,
    },
    {
      name: 'snapshot_json',
      sql: `ALTER TABLE result_runs ADD COLUMN snapshot_json TEXT`,
    },
    {
      name: 'calculated_by',
      sql: `ALTER TABLE result_runs ADD COLUMN calculated_by TEXT`,
    },
    {
      name: 'approved_at',
      sql: `ALTER TABLE result_runs ADD COLUMN approved_at TEXT`,
    },
    {
      name: 'approved_by',
      sql: `ALTER TABLE result_runs ADD COLUMN approved_by TEXT`,
    },
  ]
  for (const col of runAdds) {
    if (!runCols.includes(col.name)) db.exec(col.sql)
  }

  const sumCols = (
    db.prepare(`PRAGMA table_info(result_student_summaries)`).all() as Array<{
      name: string
    }>
  ).map((c) => c.name)
  const sumAdds: Array<{ name: string; sql: string }> = [
    {
      name: 'promotion_outcome',
      sql: `ALTER TABLE result_student_summaries ADD COLUMN promotion_outcome TEXT`,
    },
    {
      name: 'gpa',
      sql: `ALTER TABLE result_student_summaries ADD COLUMN gpa REAL`,
    },
    {
      name: 'failed_subjects',
      sql: `ALTER TABLE result_student_summaries ADD COLUMN failed_subjects INTEGER NOT NULL DEFAULT 0`,
    },
    {
      name: 'total_coefficients',
      sql: `ALTER TABLE result_student_summaries ADD COLUMN total_coefficients REAL`,
    },
    {
      name: 'total_weighted_marks',
      sql: `ALTER TABLE result_student_summaries ADD COLUMN total_weighted_marks REAL`,
    },
    {
      name: 'passed_subjects',
      sql: `ALTER TABLE result_student_summaries ADD COLUMN passed_subjects INTEGER`,
    },
    {
      name: 'status',
      sql: `ALTER TABLE result_student_summaries ADD COLUMN status TEXT`,
    },
  ]
  for (const col of sumAdds) {
    if (!sumCols.includes(col.name)) db.exec(col.sql)
  }

  const subjRowCols = (
    db.prepare(`PRAGMA table_info(result_subject_rows)`).all() as Array<{
      name: string
    }>
  ).map((c) => c.name)
  const subjRowAdds: Array<{ name: string; sql: string }> = [
    {
      name: 'sequence_scores_json',
      sql: `ALTER TABLE result_subject_rows ADD COLUMN sequence_scores_json TEXT`,
    },
    {
      name: 'ca_average',
      sql: `ALTER TABLE result_subject_rows ADD COLUMN ca_average REAL`,
    },
    {
      name: 'subject_mark',
      sql: `ALTER TABLE result_subject_rows ADD COLUMN subject_mark REAL`,
    },
    {
      name: 'coefficient',
      sql: `ALTER TABLE result_subject_rows ADD COLUMN coefficient REAL NOT NULL DEFAULT 1`,
    },
    {
      name: 'weighted_mark',
      sql: `ALTER TABLE result_subject_rows ADD COLUMN weighted_mark REAL NOT NULL DEFAULT 0`,
    },
    {
      name: 'remark',
      sql: `ALTER TABLE result_subject_rows ADD COLUMN remark TEXT`,
    },
  ]
  for (const col of subjRowAdds) {
    if (!subjRowCols.includes(col.name)) db.exec(col.sql)
  }

  const caCols = (
    db.prepare(`PRAGMA table_info(ca_scores)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!caCols.includes('score_status')) {
    db.exec(
      `ALTER TABLE ca_scores ADD COLUMN score_status TEXT NOT NULL DEFAULT 'recorded'`
    )
  }
  const examCols = (
    db.prepare(`PRAGMA table_info(exam_scores)`).all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!examCols.includes('score_status')) {
    db.exec(
      `ALTER TABLE exam_scores ADD COLUMN score_status TEXT NOT NULL DEFAULT 'recorded'`
    )
  }
}

function migrateIdCardDesignerTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS id_card_template_versions (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      design_json TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (template_id) REFERENCES student_id_card_templates(id)
    );
    CREATE TABLE IF NOT EXISTS id_card_settings (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL UNIQUE,
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE TABLE IF NOT EXISTS id_card_sequences (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      next_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE TABLE IF NOT EXISTS id_card_generation_jobs (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      job_number TEXT NOT NULL,
      template_id TEXT NOT NULL,
      template_version_id TEXT NOT NULL,
      academic_year_id TEXT,
      card_kind TEXT NOT NULL DEFAULT 'new',
      status TEXT NOT NULL DEFAULT 'queued',
      total INTEGER NOT NULL DEFAULT 0,
      processed INTEGER NOT NULL DEFAULT 0,
      successful INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      paper_size TEXT NOT NULL DEFAULT 'A4',
      cards_per_row INTEGER NOT NULL DEFAULT 2,
      margin_mm REAL NOT NULL DEFAULT 10,
      gap_x_mm REAL NOT NULL DEFAULT 4,
      gap_y_mm REAL NOT NULL DEFAULT 4,
      crop_marks INTEGER NOT NULL DEFAULT 0,
      missing_photo_policy TEXT NOT NULL DEFAULT 'generate_without',
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE TABLE IF NOT EXISTS id_card_generation_items (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      card_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      warning TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (job_id) REFERENCES id_card_generation_jobs(id)
    );
    CREATE TABLE IF NOT EXISTS id_card_print_history (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      job_id TEXT,
      card_ids_json TEXT NOT NULL DEFAULT '[]',
      paper_size TEXT NOT NULL DEFAULT 'A4',
      cards_per_row INTEGER NOT NULL DEFAULT 2,
      card_count INTEGER NOT NULL DEFAULT 0,
      printed_at TEXT NOT NULL,
      printed_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_id_card_versions_tpl
      ON id_card_template_versions(template_id, version_number);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_id_card_sequences_scope
      ON id_card_sequences(school_id, scope_key) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_id_card_jobs_school
      ON id_card_generation_jobs(school_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_id_card_items_job
      ON id_card_generation_items(job_id, status);
    CREATE INDEX IF NOT EXISTS idx_id_card_print_school
      ON id_card_print_history(school_id, printed_at);
  `)

  const tplCols = (
    db.prepare(`PRAGMA table_info(student_id_card_templates)`).all() as Array<{
      name: string
    }>
  ).map((c) => c.name)
  const tplAdds: Array<{ name: string; sql: string }> = [
    { name: 'description', sql: `ALTER TABLE student_id_card_templates ADD COLUMN description TEXT NOT NULL DEFAULT ''` },
    { name: 'card_type', sql: `ALTER TABLE student_id_card_templates ADD COLUMN card_type TEXT NOT NULL DEFAULT 'student'` },
    { name: 'status', sql: `ALTER TABLE student_id_card_templates ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'` },
    { name: 'orientation', sql: `ALTER TABLE student_id_card_templates ADD COLUMN orientation TEXT NOT NULL DEFAULT 'landscape'` },
    { name: 'width_mm', sql: `ALTER TABLE student_id_card_templates ADD COLUMN width_mm REAL NOT NULL DEFAULT 85.6` },
    { name: 'height_mm', sql: `ALTER TABLE student_id_card_templates ADD COLUMN height_mm REAL NOT NULL DEFAULT 53.98` },
    { name: 'unit', sql: `ALTER TABLE student_id_card_templates ADD COLUMN unit TEXT NOT NULL DEFAULT 'mm'` },
    { name: 'sample_key', sql: `ALTER TABLE student_id_card_templates ADD COLUMN sample_key TEXT` },
    { name: 'current_version_id', sql: `ALTER TABLE student_id_card_templates ADD COLUMN current_version_id TEXT` },
    { name: 'current_version_number', sql: `ALTER TABLE student_id_card_templates ADD COLUMN current_version_number INTEGER NOT NULL DEFAULT 1` },
    { name: 'updated_by', sql: `ALTER TABLE student_id_card_templates ADD COLUMN updated_by TEXT` },
    { name: 'is_system', sql: `ALTER TABLE student_id_card_templates ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0` },
    { name: 'category', sql: `ALTER TABLE student_id_card_templates ADD COLUMN category TEXT NOT NULL DEFAULT 'Standard'` },
  ]
  for (const col of tplAdds) {
    if (!tplCols.includes(col.name)) db.exec(col.sql)
  }

  const cardCols = (
    db.prepare(`PRAGMA table_info(student_id_cards)`).all() as Array<{
      name: string
    }>
  ).map((c) => c.name)
  const cardAdds: Array<{ name: string; sql: string }> = [
    { name: 'template_version_id', sql: `ALTER TABLE student_id_cards ADD COLUMN template_version_id TEXT` },
    { name: 'card_number', sql: `ALTER TABLE student_id_cards ADD COLUMN card_number TEXT` },
    { name: 'verification_code', sql: `ALTER TABLE student_id_cards ADD COLUMN verification_code TEXT` },
    { name: 'issue_date', sql: `ALTER TABLE student_id_cards ADD COLUMN issue_date TEXT` },
    { name: 'expiry_date', sql: `ALTER TABLE student_id_cards ADD COLUMN expiry_date TEXT` },
    { name: 'status', sql: `ALTER TABLE student_id_cards ADD COLUMN status TEXT NOT NULL DEFAULT 'generated'` },
    { name: 'card_kind', sql: `ALTER TABLE student_id_cards ADD COLUMN card_kind TEXT NOT NULL DEFAULT 'new'` },
    { name: 'replaced_card_id', sql: `ALTER TABLE student_id_cards ADD COLUMN replaced_card_id TEXT` },
    { name: 'replacement_reason', sql: `ALTER TABLE student_id_cards ADD COLUMN replacement_reason TEXT` },
    { name: 'printed_at', sql: `ALTER TABLE student_id_cards ADD COLUMN printed_at TEXT` },
    { name: 'issued_at', sql: `ALTER TABLE student_id_cards ADD COLUMN issued_at TEXT` },
    { name: 'issued_by', sql: `ALTER TABLE student_id_cards ADD COLUMN issued_by TEXT` },
    { name: 'job_id', sql: `ALTER TABLE student_id_cards ADD COLUMN job_id TEXT` },
    { name: 'snapshot_json', sql: `ALTER TABLE student_id_cards ADD COLUMN snapshot_json TEXT` },
    { name: 'revoked_at', sql: `ALTER TABLE student_id_cards ADD COLUMN revoked_at TEXT` },
    { name: 'revoked_by', sql: `ALTER TABLE student_id_cards ADD COLUMN revoked_by TEXT` },
  ]
  for (const col of cardAdds) {
    if (!cardCols.includes(col.name)) db.exec(col.sql)
  }

  db.exec(`DROP INDEX IF EXISTS idx_student_id_cards_year`)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_id_cards_number
      ON student_id_cards(school_id, card_number)
      WHERE deleted_at IS NULL AND card_number IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_id_cards_verify
      ON student_id_cards(school_id, verification_code)
      WHERE deleted_at IS NULL AND verification_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_id_cards_student
      ON student_id_cards(school_id, student_id, status);
  `)
}

/** Gate / entrance QR scanner attendance (school-day check-in, not class roster). */
function migrateGateAttendanceTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gate_attendance (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_code TEXT NOT NULL,
      attendance_date TEXT NOT NULL,
      scanned_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'present',
      attendance_type TEXT NOT NULL DEFAULT 'gate',
      device_id TEXT,
      scanned_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_gate_attendance_unique_day
      ON gate_attendance(school_id, student_id, attendance_date, attendance_type)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_gate_attendance_school_date
      ON gate_attendance(school_id, attendance_date)
      WHERE deleted_at IS NULL;
  `)
}


