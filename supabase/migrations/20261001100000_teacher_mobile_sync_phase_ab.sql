-- ============================================================================
-- Expand process_synced_entity allow-list: school_day_breaks (Teacher mobile day schedule)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_synced_entity(
  p_id UUID,
  p_school_id UUID,
  p_device_id UUID,
  p_table_name TEXT,
  p_record_id TEXT,
  p_operation TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op_status TEXT;
  v_change_id BIGINT;
  v_safe_device_id UUID;
  v_incoming_version BIGINT;
  v_curr public.synced_entities%ROWTYPE;
  v_resulting public.synced_entities%ROWTYPE;
  v_err TEXT;
  v_allowed TEXT[] := ARRAY[
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
    'permissions',
    'roles',
    'role_permissions',
    'users',
    'staff',
    'staff_subjects',
    'staff_classes',
    'school_day_breaks',
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
    'result_calculation_profiles',
    'result_calculation_profile_versions',
    'result_calculation_class_assignments',
    'result_subject_coefficients',
    'result_runs',
    'result_subject_rows',
    'result_student_summaries',
    'report_cards',
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
    'communication_settings',
    'notification_templates',
    'announcements',
    'internal_notices',
    'communication_deliveries',
    'parent_message_threads',
    'parent_messages'
  ];
BEGIN
  -- Idempotency
  SELECT status INTO v_op_status FROM public.sync_operations WHERE id = p_id;
  IF FOUND AND v_op_status = 'applied' THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'status', 'applied');
  END IF;

  -- Tenant must exist — except when we are upserting the school row itself
  IF p_table_name <> 'schools' AND NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'School not found: ' || p_school_id);
  END IF;

  IF p_table_name IS NULL OR NOT (p_table_name = ANY (v_allowed)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unsupported table for generic sync: ' || COALESCE(p_table_name, 'null')
    );
  END IF;

  IF p_operation IS NULL OR p_operation NOT IN ('INSERT', 'UPDATE', 'DELETE') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported operation: ' || COALESCE(p_operation, 'null'));
  END IF;

  -- Optional device FK
  v_safe_device_id := NULL;
  IF p_device_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.devices WHERE id = p_device_id) THEN
    v_safe_device_id := p_device_id;
  END IF;

  -- Upsert operation row as pending
  INSERT INTO public.sync_operations (
    id, school_id, device_id, table_name, record_id, operation, payload, status, created_at
  ) VALUES (
    p_id, p_school_id, v_safe_device_id, p_table_name, p_record_id, p_operation, p_payload, 'pending', now()
  )
  ON CONFLICT (id) DO UPDATE SET
    table_name = EXCLUDED.table_name,
    record_id = EXCLUDED.record_id,
    operation = EXCLUDED.operation,
    payload = EXCLUDED.payload,
    status = 'pending',
    error_message = NULL,
    device_id = COALESCE(EXCLUDED.device_id, public.sync_operations.device_id);

  BEGIN
    v_incoming_version := COALESCE((p_payload->>'version')::bigint, 1);

    -- Ensure payload carries identity + school
    p_payload := COALESCE(p_payload, '{}'::jsonb)
      || jsonb_build_object(
        'id', COALESCE(p_payload->>'id', p_record_id),
        'school_id', COALESCE(p_payload->>'school_id', p_school_id::text)
      );

    IF p_operation = 'DELETE' THEN
      p_payload := p_payload || jsonb_build_object(
        'deleted_at', COALESCE(p_payload->>'deleted_at', now()::text)
      );
    END IF;

    -- Mirror school tenant row so FK + device registration can succeed
    IF p_table_name = 'schools' THEN
      INSERT INTO public.schools (
        id, name, short_code, school_code, address, phone, email,
        created_at, updated_at, deleted_at, version
      ) VALUES (
        p_school_id,
        COALESCE(p_payload->>'name', 'School'),
        NULLIF(p_payload->>'short_code', ''),
        NULLIF(COALESCE(p_payload->>'school_code', p_payload->>'short_code'), ''),
        NULLIF(p_payload->>'address', ''),
        NULLIF(p_payload->>'phone', ''),
        NULLIF(p_payload->>'email', ''),
        COALESCE((p_payload->>'created_at')::timestamptz, now()),
        COALESCE((p_payload->>'updated_at')::timestamptz, now()),
        (p_payload->>'deleted_at')::timestamptz,
        v_incoming_version
      )
      ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, public.schools.name),
        short_code = COALESCE(EXCLUDED.short_code, public.schools.short_code),
        school_code = COALESCE(EXCLUDED.school_code, public.schools.school_code),
        address = COALESCE(EXCLUDED.address, public.schools.address),
        phone = COALESCE(EXCLUDED.phone, public.schools.phone),
        email = COALESCE(EXCLUDED.email, public.schools.email),
        updated_at = EXCLUDED.updated_at,
        deleted_at = EXCLUDED.deleted_at,
        version = GREATEST(public.schools.version, EXCLUDED.version);
    END IF;

    SELECT * INTO v_curr
    FROM public.synced_entities
    WHERE school_id = p_school_id
      AND table_name = p_table_name
      AND record_id = p_record_id;

    IF FOUND THEN
      IF v_incoming_version < v_curr.version THEN
        UPDATE public.sync_operations
        SET status = 'failed',
            error_message = 'Version conflict: incoming ' || v_incoming_version || ' < cloud ' || v_curr.version
        WHERE id = p_id;

        RETURN jsonb_build_object(
          'success', false,
          'conflict', true,
          'cloud_version', v_curr.version,
          'incoming_version', v_incoming_version
        );
      END IF;

      -- Identical version + identical payload => idempotent
      IF v_incoming_version = v_curr.version AND v_curr.payload = p_payload THEN
        UPDATE public.sync_operations SET status = 'applied', applied_at = now() WHERE id = p_id;
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'status', 'applied');
      END IF;

      UPDATE public.synced_entities SET
        payload = p_payload,
        version = v_incoming_version,
        deleted_at = CASE
          WHEN p_operation = 'DELETE' THEN COALESCE((p_payload->>'deleted_at')::timestamptz, now())
          ELSE (p_payload->>'deleted_at')::timestamptz
        END,
        updated_at = COALESCE((p_payload->>'updated_at')::timestamptz, now())
      WHERE school_id = p_school_id
        AND table_name = p_table_name
        AND record_id = p_record_id
      RETURNING * INTO v_resulting;
    ELSE
      INSERT INTO public.synced_entities (
        school_id, table_name, record_id, payload, version, deleted_at, updated_at
      ) VALUES (
        p_school_id,
        p_table_name,
        p_record_id,
        p_payload,
        v_incoming_version,
        CASE
          WHEN p_operation = 'DELETE' THEN COALESCE((p_payload->>'deleted_at')::timestamptz, now())
          ELSE (p_payload->>'deleted_at')::timestamptz
        END,
        COALESCE((p_payload->>'updated_at')::timestamptz, now())
      )
      RETURNING * INTO v_resulting;
    END IF;

    INSERT INTO public.sync_changes (
      school_id, table_name, record_id, operation, payload, version, created_at
    ) VALUES (
      p_school_id,
      p_table_name,
      p_record_id,
      p_operation,
      v_resulting.payload,
      v_resulting.version,
      now()
    )
    RETURNING id INTO v_change_id;

    UPDATE public.sync_operations
    SET status = 'applied', applied_at = now()
    WHERE id = p_id;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', false,
      'status', 'applied',
      'change_id', v_change_id
    );

  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    UPDATE public.sync_operations
    SET status = 'failed', error_message = v_err
    WHERE id = p_id;
    RETURN jsonb_build_object('success', false, 'error', v_err);
  END;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.process_synced_entity TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.process_synced_entity TO authenticated;
  END IF;
END $$;

-- ============================================================================
-- Teacher mobile Phase A/B — read + authorized write RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION public._teacher_assigned_class_ids(p_school_id uuid, p_staff_id text)
RETURNS TABLE (class_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT NULLIF(a.payload ->> 'class_id', '')::text
  FROM public.synced_entities a
  WHERE a.school_id = p_school_id
    AND a.table_name = 'staff_subjects'
    AND a.deleted_at IS NULL
    AND (a.payload ->> 'staff_id') = p_staff_id
    AND NULLIF(a.payload ->> 'class_id', '') IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public._teacher_owns_class_subject(
  p_school_id uuid, p_staff_id text, p_class_id text, p_subject_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.synced_entities a
    WHERE a.school_id = p_school_id
      AND a.table_name = 'staff_subjects'
      AND a.deleted_at IS NULL
      AND (a.payload ->> 'staff_id') = p_staff_id
      AND (a.payload ->> 'class_id') = p_class_id
      AND (a.payload ->> 'subject_id') = p_subject_id
  );
$$;

REVOKE ALL ON FUNCTION public._teacher_assigned_class_ids(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._teacher_owns_class_subject(uuid, text, text, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- get_teacher_classes()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_classes()
RETURNS TABLE (
  class_id text,
  school_id uuid,
  name text,
  academic_level_id text,
  section_id text,
  specialization_id text,
  class_teacher_id text,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  RETURN QUERY
  SELECT DISTINCT ON (c.record_id)
    c.record_id::text,
    v_claims.school_id,
    COALESCE(c.payload ->> 'name', '')::text,
    NULLIF(c.payload ->> 'academic_level_id', '')::text,
    NULLIF(c.payload ->> 'section_id', '')::text,
    NULLIF(c.payload ->> 'specialization_id', '')::text,
    NULLIF(c.payload ->> 'class_teacher_id', '')::text,
    COALESCE((c.payload ->> 'is_active')::boolean, true)
  FROM public._teacher_assigned_class_ids(v_claims.school_id, v_claims.staff_id) ac
  JOIN public.synced_entities c
    ON c.school_id = v_claims.school_id
   AND c.table_name = 'classes'
   AND c.record_id = ac.class_id
   AND c.deleted_at IS NULL
  ORDER BY c.record_id, COALESCE(c.payload ->> 'name', '');
END;
$$;

-- ---------------------------------------------------------------------------
-- get_teacher_students(p_class_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_students(
  p_class_id text DEFAULT NULL
)
RETURNS TABLE (
  student_id uuid,
  school_id uuid,
  student_code text,
  full_name text,
  gender text,
  date_of_birth date,
  class_id text,
  status text,
  photo_path text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  IF p_class_id IS NOT NULL AND p_class_id <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public._teacher_assigned_class_ids(v_claims.school_id, v_claims.staff_id) x
      WHERE x.class_id = p_class_id
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN_ASSIGNMENT: class not assigned to teacher';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.school_id,
    s.student_code,
    s.name::text AS full_name,
    s.gender,
    s.date_of_birth,
    s.class_id::text,
    s.status,
    s.photo_path
  FROM public.students s
  WHERE s.school_id = v_claims.school_id
    AND s.deleted_at IS NULL
    AND s.class_id IN (
      SELECT ac.class_id FROM public._teacher_assigned_class_ids(v_claims.school_id, v_claims.staff_id) ac
    )
    AND (p_class_id IS NULL OR p_class_id = '' OR s.class_id = p_class_id)
  ORDER BY s.name ASC;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_teacher_attendance_sessions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_attendance_sessions(
  p_class_id text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  session_id text,
  school_id uuid,
  class_id text,
  session_date text,
  notes text,
  version bigint,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  IF p_class_id IS NOT NULL AND p_class_id <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public._teacher_assigned_class_ids(v_claims.school_id, v_claims.staff_id) x
      WHERE x.class_id = p_class_id
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN_ASSIGNMENT: class not assigned to teacher';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(sess.payload ->> 'id', sess.record_id)::text,
    v_claims.school_id,
    (sess.payload ->> 'class_id')::text,
    (sess.payload ->> 'session_date')::text,
    NULLIF(sess.payload ->> 'notes', '')::text,
    sess.version,
    sess.updated_at
  FROM public.synced_entities sess
  WHERE sess.school_id = v_claims.school_id
    AND sess.table_name = 'attendance_sessions'
    AND sess.deleted_at IS NULL
    AND (sess.payload ->> 'class_id') IN (
      SELECT ac.class_id FROM public._teacher_assigned_class_ids(v_claims.school_id, v_claims.staff_id) ac
    )
    AND (p_class_id IS NULL OR p_class_id = '' OR (sess.payload ->> 'class_id') = p_class_id)
    AND (
      p_from IS NULL
      OR NULLIF(sess.payload ->> 'session_date', '')::date >= p_from
    )
    AND (
      p_to IS NULL
      OR NULLIF(sess.payload ->> 'session_date', '')::date <= p_to
    )
  ORDER BY (sess.payload ->> 'session_date') DESC NULLS LAST;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_teacher_attendance_records
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_attendance_records(
  p_session_id text DEFAULT NULL,
  p_class_id text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  record_id text,
  session_id text,
  student_id text,
  status text,
  version bigint,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  RETURN QUERY
  SELECT
    COALESCE(r.payload ->> 'id', r.record_id)::text,
    (r.payload ->> 'session_id')::text,
    (r.payload ->> 'student_id')::text,
    COALESCE(r.payload ->> 'status', 'present')::text,
    r.version,
    r.updated_at
  FROM public.synced_entities r
  JOIN public.synced_entities sess
    ON sess.school_id = r.school_id
   AND sess.table_name = 'attendance_sessions'
   AND sess.record_id = (r.payload ->> 'session_id')
   AND sess.deleted_at IS NULL
  WHERE r.school_id = v_claims.school_id
    AND r.table_name = 'attendance_records'
    AND r.deleted_at IS NULL
    AND (sess.payload ->> 'class_id') IN (
      SELECT ac.class_id FROM public._teacher_assigned_class_ids(v_claims.school_id, v_claims.staff_id) ac
    )
    AND (p_session_id IS NULL OR p_session_id = '' OR (r.payload ->> 'session_id') = p_session_id)
    AND (p_class_id IS NULL OR p_class_id = '' OR (sess.payload ->> 'class_id') = p_class_id)
    AND (
      p_from IS NULL
      OR NULLIF(sess.payload ->> 'session_date', '')::date >= p_from
    )
    AND (
      p_to IS NULL
      OR NULLIF(sess.payload ->> 'session_date', '')::date <= p_to
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- get_teacher_assessments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_assessments(
  p_class_id text DEFAULT NULL,
  p_subject_id text DEFAULT NULL
)
RETURNS TABLE (
  assessment_id text,
  school_id uuid,
  name text,
  class_id text,
  subject_id text,
  term_id text,
  academic_year_id text,
  max_score numeric,
  weight_percent numeric,
  assessment_date text,
  version bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  RETURN QUERY
  SELECT
    COALESCE(a.payload ->> 'id', a.record_id)::text,
    v_claims.school_id,
    COALESCE(a.payload ->> 'name', '')::text,
    (a.payload ->> 'class_id')::text,
    (a.payload ->> 'subject_id')::text,
    NULLIF(a.payload ->> 'term_id', '')::text,
    NULLIF(a.payload ->> 'academic_year_id', '')::text,
    NULLIF(a.payload ->> 'max_score', '')::numeric,
    NULLIF(a.payload ->> 'weight_percent', '')::numeric,
    NULLIF(a.payload ->> 'assessment_date', '')::text,
    a.version
  FROM public.synced_entities a
  WHERE a.school_id = v_claims.school_id
    AND a.table_name = 'ca_assessments'
    AND a.deleted_at IS NULL
    AND public._teacher_owns_class_subject(
      v_claims.school_id,
      v_claims.staff_id,
      a.payload ->> 'class_id',
      a.payload ->> 'subject_id'
    )
    AND (p_class_id IS NULL OR p_class_id = '' OR (a.payload ->> 'class_id') = p_class_id)
    AND (p_subject_id IS NULL OR p_subject_id = '' OR (a.payload ->> 'subject_id') = p_subject_id)
  ORDER BY COALESCE(a.payload ->> 'assessment_date', '') DESC NULLS LAST,
           COALESCE(a.payload ->> 'name', '');
END;
$$;

-- ---------------------------------------------------------------------------
-- get_teacher_scores
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_scores(
  p_assessment_id text DEFAULT NULL
)
RETURNS TABLE (
  score_id text,
  assessment_id text,
  student_id text,
  score numeric,
  score_status text,
  version bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  RETURN QUERY
  SELECT
    COALESCE(sc.payload ->> 'id', sc.record_id)::text,
    (sc.payload ->> 'assessment_id')::text,
    (sc.payload ->> 'student_id')::text,
    NULLIF(sc.payload ->> 'score', '')::numeric,
    COALESCE(sc.payload ->> 'score_status', 'recorded')::text,
    sc.version
  FROM public.synced_entities sc
  JOIN public.synced_entities a
    ON a.school_id = sc.school_id
   AND a.table_name = 'ca_assessments'
   AND a.record_id = (sc.payload ->> 'assessment_id')
   AND a.deleted_at IS NULL
  WHERE sc.school_id = v_claims.school_id
    AND sc.table_name = 'ca_scores'
    AND sc.deleted_at IS NULL
    AND public._teacher_owns_class_subject(
      v_claims.school_id,
      v_claims.staff_id,
      a.payload ->> 'class_id',
      a.payload ->> 'subject_id'
    )
    AND (
      p_assessment_id IS NULL OR p_assessment_id = ''
      OR (sc.payload ->> 'assessment_id') = p_assessment_id
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- get_teacher_announcements
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_announcements()
RETURNS TABLE (
  announcement_id text,
  school_id uuid,
  title text,
  body text,
  audience_type text,
  class_id text,
  academic_level_id text,
  status text,
  sent_at text,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  RETURN QUERY
  SELECT
    COALESCE(n.payload ->> 'id', n.record_id)::text,
    v_claims.school_id,
    COALESCE(n.payload ->> 'title', '')::text,
    COALESCE(n.payload ->> 'body', '')::text,
    COALESCE(n.payload ->> 'audience_type', 'all')::text,
    NULLIF(n.payload ->> 'class_id', '')::text,
    NULLIF(n.payload ->> 'academic_level_id', '')::text,
    COALESCE(n.payload ->> 'status', '')::text,
    NULLIF(n.payload ->> 'sent_at', '')::text,
    n.updated_at
  FROM public.synced_entities n
  WHERE n.school_id = v_claims.school_id
    AND n.table_name = 'announcements'
    AND n.deleted_at IS NULL
    AND COALESCE(n.payload ->> 'status', '') IN ('sent', 'published')
    AND (
      COALESCE(n.payload ->> 'audience_type', 'all') = 'all'
      OR (
        (n.payload ->> 'audience_type') = 'class'
        AND (n.payload ->> 'class_id') IN (
          SELECT ac.class_id FROM public._teacher_assigned_class_ids(v_claims.school_id, v_claims.staff_id) ac
        )
      )
      OR (n.payload ->> 'audience_type') = 'level'
    )
  ORDER BY COALESCE(n.payload ->> 'sent_at', n.updated_at::text) DESC NULLS LAST;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_teacher_config()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_config()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
  v_school jsonb;
  v_year jsonb;
  v_terms jsonb;
  v_grading jsonb;
  v_types jsonb;
  v_bands jsonb;
  v_breaks jsonb;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  SELECT to_jsonb(s) INTO v_school
  FROM (
    SELECT
      se.record_id AS school_id,
      se.payload ->> 'name' AS school_name,
      se.payload ->> 'school_code' AS school_code,
      se.payload ->> 'short_code' AS short_code,
      se.payload ->> 'logo_path' AS logo_path,
      se.payload ->> 'day_start_time' AS day_start_time,
      se.payload ->> 'day_end_time' AS day_end_time,
      NULLIF(se.payload ->> 'period_duration_minutes', '')::int AS period_duration_minutes,
      NULLIF(se.payload ->> 'periods_per_day', '')::int AS periods_per_day
    FROM public.synced_entities se
    WHERE se.school_id = v_claims.school_id
      AND se.table_name = 'schools'
      AND se.record_id = v_claims.school_id::text
      AND se.deleted_at IS NULL
    LIMIT 1
  ) s;

  SELECT to_jsonb(y) INTO v_year
  FROM (
    SELECT
      se.record_id AS academic_year_id,
      se.payload ->> 'name' AS name,
      se.payload ->> 'start_date' AS start_date,
      se.payload ->> 'end_date' AS end_date,
      COALESCE((se.payload ->> 'is_current')::boolean, false) AS is_current
    FROM public.synced_entities se
    WHERE se.school_id = v_claims.school_id
      AND se.table_name = 'academic_years'
      AND se.deleted_at IS NULL
      AND COALESCE((se.payload ->> 'is_current')::int, 0) = 1
    ORDER BY se.updated_at DESC
    LIMIT 1
  ) y;

  IF v_year IS NULL THEN
    SELECT to_jsonb(y) INTO v_year
    FROM (
      SELECT
        se.record_id AS academic_year_id,
        se.payload ->> 'name' AS name,
        se.payload ->> 'start_date' AS start_date,
        se.payload ->> 'end_date' AS end_date,
        COALESCE((se.payload ->> 'is_current')::boolean, false) AS is_current
      FROM public.synced_entities se
      WHERE se.school_id = v_claims.school_id
        AND se.table_name = 'academic_years'
        AND se.deleted_at IS NULL
      ORDER BY se.updated_at DESC
      LIMIT 1
    ) y;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.term_number), '[]'::jsonb) INTO v_terms
  FROM (
    SELECT
      se.record_id AS term_id,
      se.payload ->> 'academic_year_id' AS academic_year_id,
      se.payload ->> 'name' AS name,
      NULLIF(se.payload ->> 'term_number', '')::int AS term_number,
      se.payload ->> 'start_date' AS start_date,
      se.payload ->> 'end_date' AS end_date
    FROM public.synced_entities se
    WHERE se.school_id = v_claims.school_id
      AND se.table_name = 'academic_terms'
      AND se.deleted_at IS NULL
      AND (
        v_year IS NULL
        OR (se.payload ->> 'academic_year_id') = (v_year ->> 'academic_year_id')
      )
  ) t;

  SELECT to_jsonb(g) INTO v_grading
  FROM (
    SELECT
      se.record_id AS grading_system_id,
      COALESCE((se.payload ->> 'enable_ranking')::boolean, false) AS enable_ranking,
      COALESCE((se.payload ->> 'show_class_average')::boolean, false) AS show_class_average
    FROM public.synced_entities se
    WHERE se.school_id = v_claims.school_id
      AND se.table_name = 'grading_systems'
      AND se.deleted_at IS NULL
    ORDER BY se.updated_at DESC
    LIMIT 1
  ) g;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.sort_order), '[]'::jsonb) INTO v_types
  FROM (
    SELECT
      se.record_id AS assessment_type_id,
      se.payload ->> 'grading_system_id' AS grading_system_id,
      se.payload ->> 'name' AS name,
      NULLIF(se.payload ->> 'weight_percent', '')::numeric AS weight_percent,
      COALESCE(NULLIF(se.payload ->> 'sort_order', '')::int, 0) AS sort_order
    FROM public.synced_entities se
    WHERE se.school_id = v_claims.school_id
      AND se.table_name = 'assessment_types'
      AND se.deleted_at IS NULL
      AND (
        v_grading IS NULL
        OR (se.payload ->> 'grading_system_id') = (v_grading ->> 'grading_system_id')
      )
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.sort_order), '[]'::jsonb) INTO v_bands
  FROM (
    SELECT
      se.record_id AS grade_band_id,
      se.payload ->> 'grading_system_id' AS grading_system_id,
      se.payload ->> 'grade' AS grade,
      NULLIF(se.payload ->> 'min_score', '')::numeric AS min_score,
      NULLIF(se.payload ->> 'max_score', '')::numeric AS max_score,
      COALESCE(NULLIF(se.payload ->> 'sort_order', '')::int, 0) AS sort_order
    FROM public.synced_entities se
    WHERE se.school_id = v_claims.school_id
      AND se.table_name = 'grade_bands'
      AND se.deleted_at IS NULL
      AND (
        v_grading IS NULL
        OR (se.payload ->> 'grading_system_id') = (v_grading ->> 'grading_system_id')
      )
  ) b;

  SELECT COALESCE(jsonb_agg(to_jsonb(br) ORDER BY br.sort_order), '[]'::jsonb) INTO v_breaks
  FROM (
    SELECT
      se.record_id AS break_id,
      se.payload ->> 'name' AS name,
      NULLIF(se.payload ->> 'after_period', '')::int AS after_period,
      NULLIF(se.payload ->> 'duration_minutes', '')::int AS duration_minutes,
      COALESCE(NULLIF(se.payload ->> 'sort_order', '')::int, 0) AS sort_order
    FROM public.synced_entities se
    WHERE se.school_id = v_claims.school_id
      AND se.table_name = 'school_day_breaks'
      AND se.deleted_at IS NULL
  ) br;

  RETURN jsonb_build_object(
    'school', COALESCE(v_school, '{}'::jsonb),
    'academic_year', COALESCE(v_year, 'null'::jsonb),
    'terms', COALESCE(v_terms, '[]'::jsonb),
    'grading_system', COALESCE(v_grading, 'null'::jsonb),
    'assessment_types', COALESCE(v_types, '[]'::jsonb),
    'grade_bands', COALESCE(v_bands, '[]'::jsonb),
    'day_schedule', jsonb_build_object(
      'day_start_time', v_school ->> 'day_start_time',
      'day_end_time', v_school ->> 'day_end_time',
      'period_duration_minutes', v_school -> 'period_duration_minutes',
      'periods_per_day', v_school -> 'periods_per_day',
      'breaks', COALESCE(v_breaks, '[]'::jsonb)
    ),
    'server_time', now()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- get_teacher_bootstrap()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  RETURN jsonb_build_object(
    'teacher', COALESCE((SELECT to_jsonb(t) FROM public.get_teacher_me() t LIMIT 1), '{}'::jsonb),
    'assignments', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.get_teacher_assignments() a), '[]'::jsonb),
    'classes', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.get_teacher_classes() c), '[]'::jsonb),
    'students', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.get_teacher_students(NULL) s), '[]'::jsonb),
    'timetable', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.get_teacher_timetable(NULL) t), '[]'::jsonb),
    'assessments', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.get_teacher_assessments(NULL, NULL) a), '[]'::jsonb),
    'scores', COALESCE((SELECT jsonb_agg(to_jsonb(sc)) FROM public.get_teacher_scores(NULL) sc), '[]'::jsonb),
    'attendance_sessions', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.get_teacher_attendance_sessions(NULL, NULL, NULL) x), '[]'::jsonb),
    'attendance_records', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.get_teacher_attendance_records(NULL, NULL, NULL, NULL) x), '[]'::jsonb),
    'announcements', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.get_teacher_announcements() n), '[]'::jsonb),
    'config', public.get_teacher_config(),
    'server_time', now(),
    'sync_token', NULL
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- teacher_push_entity — authorized write path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.teacher_push_entity(
  p_id uuid,
  p_table_name text,
  p_record_id text,
  p_operation text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
  v_payload jsonb;
  v_class_id text;
  v_subject_id text;
  v_session_id text;
  v_student_id text;
  v_assessment_id text;
  v_score numeric;
  v_max numeric;
  v_sess_class text;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  IF p_table_name IS NULL OR p_table_name NOT IN (
    'attendance_sessions', 'attendance_records', 'ca_scores'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'UNSUPPORTED_TABLE',
      'error', 'Teacher cannot write table: ' || COALESCE(p_table_name, 'null')
    );
  END IF;

  IF p_operation IS NULL OR p_operation NOT IN ('INSERT', 'UPDATE', 'DELETE') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Unsupported operation'
    );
  END IF;

  v_payload := COALESCE(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'id', COALESCE(p_payload->>'id', p_record_id),
      'school_id', v_claims.school_id::text
    );

  IF p_table_name = 'attendance_sessions' THEN
    v_class_id := NULLIF(v_payload ->> 'class_id', '');
    IF v_class_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public._teacher_assigned_class_ids(v_claims.school_id, v_claims.staff_id) x
      WHERE x.class_id = v_class_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'FORBIDDEN_ASSIGNMENT',
        'error', 'Class not assigned to teacher'
      );
    END IF;
  ELSIF p_table_name = 'attendance_records' THEN
    v_session_id := NULLIF(v_payload ->> 'session_id', '');
    v_student_id := NULLIF(v_payload ->> 'student_id', '');
    SELECT NULLIF(sess.payload ->> 'class_id', '') INTO v_sess_class
    FROM public.synced_entities sess
    WHERE sess.school_id = v_claims.school_id
      AND sess.table_name = 'attendance_sessions'
      AND sess.record_id = v_session_id
      AND sess.deleted_at IS NULL;
    IF v_sess_class IS NULL OR NOT EXISTS (
      SELECT 1 FROM public._teacher_assigned_class_ids(v_claims.school_id, v_claims.staff_id) x
      WHERE x.class_id = v_sess_class
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'FORBIDDEN_ASSIGNMENT',
        'error', 'Attendance session class not assigned to teacher'
      );
    END IF;
    IF v_student_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.students st
      WHERE st.id::text = v_student_id
        AND st.school_id = v_claims.school_id
        AND st.deleted_at IS NULL
        AND st.class_id = v_sess_class
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'FORBIDDEN_ASSIGNMENT',
        'error', 'Student not in assigned class roster'
      );
    END IF;
  ELSIF p_table_name = 'ca_scores' THEN
    v_assessment_id := NULLIF(v_payload ->> 'assessment_id', '');
    v_student_id := NULLIF(v_payload ->> 'student_id', '');
    SELECT
      NULLIF(a.payload ->> 'class_id', ''),
      NULLIF(a.payload ->> 'subject_id', ''),
      NULLIF(a.payload ->> 'max_score', '')::numeric
    INTO v_class_id, v_subject_id, v_max
    FROM public.synced_entities a
    WHERE a.school_id = v_claims.school_id
      AND a.table_name = 'ca_assessments'
      AND a.record_id = v_assessment_id
      AND a.deleted_at IS NULL;
    IF v_class_id IS NULL OR NOT public._teacher_owns_class_subject(
      v_claims.school_id, v_claims.staff_id, v_class_id, v_subject_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'FORBIDDEN_ASSIGNMENT',
        'error', 'Assessment not assigned to teacher'
      );
    END IF;
    IF v_student_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.students st
      WHERE st.id::text = v_student_id
        AND st.school_id = v_claims.school_id
        AND st.deleted_at IS NULL
        AND st.class_id = v_class_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'FORBIDDEN_ASSIGNMENT',
        'error', 'Student not in assessment class'
      );
    END IF;
    IF p_operation <> 'DELETE' AND v_payload ? 'score' THEN
      v_score := NULLIF(v_payload ->> 'score', '')::numeric;
      IF v_score IS NULL OR v_score < 0 OR (v_max IS NOT NULL AND v_score > v_max) THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'MARK_OUT_OF_RANGE',
          'error', 'Score out of allowed range',
          'max_score', v_max
        );
      END IF;
    END IF;
  END IF;

  RETURN public.process_synced_entity(
    p_id,
    v_claims.school_id,
    NULL,
    p_table_name,
    p_record_id,
    p_operation,
    v_payload
  );
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.get_teacher_classes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_teacher_students(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_teacher_attendance_sessions(text, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_teacher_attendance_records(text, text, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_teacher_assessments(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_teacher_scores(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_teacher_announcements() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_teacher_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_teacher_bootstrap() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_push_entity(uuid, text, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_teacher_classes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_students(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_attendance_sessions(text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_attendance_records(text, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_assessments(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_scores(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_announcements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_bootstrap() TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_push_entity(uuid, text, text, text, jsonb) TO authenticated;
