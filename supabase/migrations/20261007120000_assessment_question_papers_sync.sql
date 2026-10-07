-- ============================================================================
-- Assessment question papers: sync allow-list + PDF in school-assets
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

-- Allow PDF question papers in school-assets (raise size to 25MB)
UPDATE storage.buckets
SET file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'application/octet-stream'
    ]
WHERE id = 'school-assets';
