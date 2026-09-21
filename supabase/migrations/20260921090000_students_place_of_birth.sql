-- Add place_of_birth to students and sync RPC.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS place_of_birth TEXT;

CREATE OR REPLACE FUNCTION public.process_sync_operation(
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
  v_record_uuid UUID;
  v_payload_school_id TEXT;
  v_incoming_version BIGINT;
  v_cloud_version BIGINT;
  v_safe_device_id UUID := NULL;
  
  v_curr_student RECORD;
  v_resulting_student RECORD;
  v_curr_settings RECORD;
  v_resulting_settings RECORD;
  
  v_err TEXT;
BEGIN
  -- Verify device existence to respect foreign key constraint safely
  IF p_device_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.devices WHERE id = p_device_id) THEN
    v_safe_device_id := p_device_id;
    UPDATE public.devices SET last_seen_at = now() WHERE id = p_device_id;
  END IF;

  -- 1. Tenant validation FIRST (no sync_operations write — FK to schools would fail)
  IF NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = p_school_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'School tenant does not exist: ' || p_school_id::text
    );
  END IF;

  -- 2. Idempotency check on sync_operations.id (requires repaired id column)
  SELECT status INTO v_op_status
  FROM public.sync_operations so
  WHERE so.id = p_id;

  IF v_op_status = 'applied' THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'status', 'applied'
    );
  END IF;

  -- 3. Check table support (Phase 1 supports only students and student_id_settings)
  IF p_table_name NOT IN ('students', 'student_id_settings') THEN
    INSERT INTO public.sync_operations (
      id, school_id, device_id, table_name, record_id, entity_type, entity_id, operation, payload, status, error_message, created_at
    ) VALUES (
      p_id, p_school_id, v_safe_device_id, p_table_name, p_record_id, p_table_name, p_record_id, p_operation, p_payload, 'failed',
      'Unsupported table: ' || p_table_name, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = 'failed',
      error_message = EXCLUDED.error_message;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unsupported table for synchronization: ' || p_table_name
    );
  END IF;

  -- 4. Check operation support
  IF p_operation NOT IN ('INSERT', 'UPDATE', 'DELETE') THEN
    INSERT INTO public.sync_operations (
      id, school_id, device_id, table_name, record_id, entity_type, entity_id, operation, payload, status, error_message, created_at
    ) VALUES (
      p_id, p_school_id, v_safe_device_id, p_table_name, p_record_id, p_table_name, p_record_id, p_operation, p_payload, 'failed',
      'Unsupported operation: ' || p_operation, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = 'failed',
      error_message = EXCLUDED.error_message;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unsupported operation: ' || p_operation
    );
  END IF;

  -- 5. Validate tenant isolation inside payload
  v_payload_school_id := p_payload->>'school_id';
  IF v_payload_school_id IS NOT NULL AND v_payload_school_id <> p_school_id::text THEN
    INSERT INTO public.sync_operations (
      id, school_id, device_id, table_name, record_id, entity_type, entity_id, operation, payload, status, error_message, created_at
    ) VALUES (
      p_id, p_school_id, v_safe_device_id, p_table_name, p_record_id, p_table_name, p_record_id, p_operation, p_payload, 'failed',
      'Tenant mismatch: payload school_id (' || v_payload_school_id || ') does not match operation school_id (' || p_school_id::text || ')',
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = 'failed',
      error_message = EXCLUDED.error_message;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Tenant mismatch: payload school_id does not match operation school_id'
    );
  END IF;

  -- 6. Validate record UUID
  BEGIN
    v_record_uuid := p_record_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sync_operations (
      id, school_id, device_id, table_name, record_id, entity_type, entity_id, operation, payload, status, error_message, created_at
    ) VALUES (
      p_id, p_school_id, v_safe_device_id, p_table_name, p_record_id, p_table_name, p_record_id, p_operation, p_payload, 'failed',
      'Invalid record_id: must be a valid UUID string: ' || p_record_id, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = 'failed',
      error_message = EXCLUDED.error_message;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid record_id: must be a valid UUID string: ' || p_record_id
    );
  END;

  -- 7. Upsert sync_operations record into pending state before applying
  INSERT INTO public.sync_operations (
    id, school_id, device_id, table_name, record_id, entity_type, entity_id, operation, payload, status, created_at
  ) VALUES (
    p_id, p_school_id, v_safe_device_id, p_table_name, p_record_id, p_table_name, p_record_id, p_operation, p_payload, 'pending', now()
  )
  ON CONFLICT (id) DO UPDATE SET
    school_id = EXCLUDED.school_id,
    device_id = EXCLUDED.device_id,
    table_name = EXCLUDED.table_name,
    record_id = EXCLUDED.record_id,
    entity_type = EXCLUDED.entity_type,
    entity_id = EXCLUDED.entity_id,
    operation = EXCLUDED.operation,
    payload = EXCLUDED.payload,
    status = 'pending',
    error_message = NULL;

  -- 8. Apply operation in a protected sub-block
  BEGIN
    -- =========================================================================
    -- BRANCH A: STUDENTS TABLE
    -- =========================================================================
    IF p_table_name = 'students' THEN
      v_incoming_version := COALESCE((p_payload->>'version')::bigint, 1);

      -- -----------------------------------------------------------------------
      -- Operation: INSERT
      -- -----------------------------------------------------------------------
      IF p_operation = 'INSERT' THEN
        SELECT * INTO v_curr_student
        FROM public.students
        WHERE id = v_record_uuid;

        IF FOUND THEN
          IF v_curr_student.school_id <> p_school_id THEN
            RAISE EXCEPTION 'Tenant violation: student % exists in school %', v_record_uuid, v_curr_student.school_id;
          END IF;

          -- Idempotent insert if existing cloud record is identical or newer
          IF v_curr_student.version >= v_incoming_version THEN
            UPDATE public.sync_operations
            SET status = 'applied', applied_at = now()
            WHERE id = p_id;

            RETURN jsonb_build_object(
              'success', true,
              'duplicate', true,
              'status', 'applied'
            );
          END IF;
        END IF;

        -- Insert the complete student record
        INSERT INTO public.students (
          id, school_id, student_code, name, class_id, admission_year, academic_level_id,
          sequence_number, gender, date_of_birth, place_of_birth, phone, email, address, admission_type,
          guardian_name, guardian_phone, guardian_email, guardian_relationship, status,
          photo_path, residence_type, created_at, updated_at, deleted_at, version
        ) VALUES (
          v_record_uuid,
          p_school_id,
          NULLIF(trim(p_payload->>'student_code'), ''),
          COALESCE(p_payload->>'name', ''),
          COALESCE(p_payload->>'class_id', ''),
          (p_payload->>'admission_year')::integer,
          p_payload->>'academic_level_id',
          (p_payload->>'sequence_number')::integer,
          p_payload->>'gender',
          NULLIF(trim(p_payload->>'date_of_birth'), '')::date,
          NULLIF(trim(p_payload->>'place_of_birth'), ''),
          p_payload->>'phone',
          p_payload->>'email',
          p_payload->>'address',
          p_payload->>'admission_type',
          p_payload->>'guardian_name',
          p_payload->>'guardian_phone',
          p_payload->>'guardian_email',
          p_payload->>'guardian_relationship',
          COALESCE(p_payload->>'status', 'active'),
          p_payload->>'photo_path',
          COALESCE(p_payload->>'residence_type', 'day'),
          COALESCE((p_payload->>'created_at')::timestamptz, now()),
          COALESCE((p_payload->>'updated_at')::timestamptz, now()),
          (p_payload->>'deleted_at')::timestamptz,
          v_incoming_version
        )
        RETURNING * INTO v_resulting_student;

        -- Create changelog entry
        INSERT INTO public.sync_changes (
          school_id, table_name, record_id, operation, payload, version, created_at
        ) VALUES (
          p_school_id, 'students', p_record_id, 'INSERT', to_jsonb(v_resulting_student), v_resulting_student.version, now()
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

      -- -----------------------------------------------------------------------
      -- Operation: UPDATE
      -- -----------------------------------------------------------------------
      ELSIF p_operation = 'UPDATE' THEN
        SELECT * INTO v_curr_student
        FROM public.students
        WHERE id = v_record_uuid;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Student not found for UPDATE: %', p_record_id;
        END IF;

        IF v_curr_student.school_id <> p_school_id THEN
          RAISE EXCEPTION 'Tenant violation: cannot update student of another school';
        END IF;

        -- Protect immutable fields:
        -- student_code must NEVER change during update
        IF (p_payload ? 'student_code')
           AND v_curr_student.student_code IS NOT NULL 
           AND v_curr_student.student_code IS DISTINCT FROM NULLIF(trim(p_payload->>'student_code'), '') THEN
          RAISE EXCEPTION 'Immutable field violation: student_code cannot be changed (existing: %, incoming: %)',
            v_curr_student.student_code, p_payload->>'student_code';
        END IF;

        -- sequence_number must NEVER change during update
        IF (p_payload ? 'sequence_number')
           AND (p_payload->>'sequence_number') IS NOT NULL
           AND v_curr_student.sequence_number IS NOT NULL
           AND v_curr_student.sequence_number IS DISTINCT FROM (p_payload->>'sequence_number')::integer THEN
          RAISE EXCEPTION 'Immutable field violation: sequence_number cannot be changed (existing: %, incoming: %)',
            v_curr_student.sequence_number, p_payload->>'sequence_number';
        END IF;

        -- admission_year must NEVER change during update
        IF (p_payload ? 'admission_year')
           AND (p_payload->>'admission_year') IS NOT NULL
           AND v_curr_student.admission_year IS NOT NULL
           AND v_curr_student.admission_year IS DISTINCT FROM (p_payload->>'admission_year')::integer THEN
          RAISE EXCEPTION 'Immutable field violation: admission_year cannot be changed (existing: %, incoming: %)',
            v_curr_student.admission_year, p_payload->>'admission_year';
        END IF;

        v_cloud_version := v_curr_student.version;

        -- Optimistic version check
        IF v_incoming_version < v_cloud_version THEN
          UPDATE public.sync_operations
          SET status = 'failed',
              error_message = 'Version conflict: incoming version ' || v_incoming_version || ' is older than cloud version ' || v_cloud_version
          WHERE id = p_id;

          RETURN jsonb_build_object(
            'success', false,
            'conflict', true,
            'cloud_version', v_cloud_version,
            'incoming_version', v_incoming_version
          );
        END IF;

        IF v_incoming_version = v_cloud_version THEN
          IF v_curr_student.name = COALESCE(p_payload->>'name', v_curr_student.name)
             AND v_curr_student.class_id = COALESCE(p_payload->>'class_id', v_curr_student.class_id)
             AND v_curr_student.status = COALESCE(p_payload->>'status', v_curr_student.status) THEN
            UPDATE public.sync_operations SET status = 'applied', applied_at = now() WHERE id = p_id;
            RETURN jsonb_build_object('success', true, 'duplicate', true, 'status', 'applied');
          ELSE
            UPDATE public.sync_operations
            SET status = 'failed',
                error_message = 'Version conflict: version ' || v_incoming_version || ' already exists with different data'
            WHERE id = p_id;

            RETURN jsonb_build_object(
              'success', false,
              'conflict', true,
              'cloud_version', v_cloud_version,
              'incoming_version', v_incoming_version
            );
          END IF;
        END IF;

        -- v_incoming_version > v_cloud_version: apply update
        UPDATE public.students SET
          name = COALESCE(p_payload->>'name', name),
          class_id = COALESCE(p_payload->>'class_id', class_id),
          academic_level_id = CASE WHEN p_payload ? 'academic_level_id' THEN p_payload->>'academic_level_id' ELSE academic_level_id END,
          gender = CASE WHEN p_payload ? 'gender' THEN p_payload->>'gender' ELSE gender END,
          date_of_birth = CASE WHEN p_payload ? 'date_of_birth' THEN NULLIF(trim(p_payload->>'date_of_birth'), '')::date ELSE date_of_birth END,
          place_of_birth = CASE WHEN p_payload ? 'place_of_birth' THEN NULLIF(trim(p_payload->>'place_of_birth'), '') ELSE place_of_birth END,
          phone = CASE WHEN p_payload ? 'phone' THEN p_payload->>'phone' ELSE phone END,
          email = CASE WHEN p_payload ? 'email' THEN p_payload->>'email' ELSE email END,
          address = CASE WHEN p_payload ? 'address' THEN p_payload->>'address' ELSE address END,
          admission_type = CASE WHEN p_payload ? 'admission_type' THEN p_payload->>'admission_type' ELSE admission_type END,
          guardian_name = CASE WHEN p_payload ? 'guardian_name' THEN p_payload->>'guardian_name' ELSE guardian_name END,
          guardian_phone = CASE WHEN p_payload ? 'guardian_phone' THEN p_payload->>'guardian_phone' ELSE guardian_phone END,
          guardian_email = CASE WHEN p_payload ? 'guardian_email' THEN p_payload->>'guardian_email' ELSE guardian_email END,
          guardian_relationship = CASE WHEN p_payload ? 'guardian_relationship' THEN p_payload->>'guardian_relationship' ELSE guardian_relationship END,
          status = COALESCE(p_payload->>'status', status),
          photo_path = CASE WHEN p_payload ? 'photo_path' THEN p_payload->>'photo_path' ELSE photo_path END,
          residence_type = COALESCE(p_payload->>'residence_type', residence_type),
          updated_at = COALESCE((p_payload->>'updated_at')::timestamptz, now()),
          deleted_at = CASE WHEN p_payload ? 'deleted_at' THEN (p_payload->>'deleted_at')::timestamptz ELSE deleted_at END,
          version = v_incoming_version
        WHERE id = v_record_uuid
        RETURNING * INTO v_resulting_student;

        INSERT INTO public.sync_changes (
          school_id, table_name, record_id, operation, payload, version, created_at
        ) VALUES (
          p_school_id, 'students', p_record_id, 'UPDATE', to_jsonb(v_resulting_student), v_resulting_student.version, now()
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

      -- -----------------------------------------------------------------------
      -- Operation: DELETE (Soft delete)
      -- -----------------------------------------------------------------------
      ELSIF p_operation = 'DELETE' THEN
        SELECT * INTO v_curr_student
        FROM public.students
        WHERE id = v_record_uuid;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Student not found for DELETE: %', p_record_id;
        END IF;

        IF v_curr_student.school_id <> p_school_id THEN
          RAISE EXCEPTION 'Tenant violation: cannot delete student belonging to another school';
        END IF;

        -- Idempotency if already deleted
        IF v_curr_student.deleted_at IS NOT NULL THEN
          UPDATE public.sync_operations SET status = 'applied', applied_at = now() WHERE id = p_id;
          RETURN jsonb_build_object('success', true, 'duplicate', true, 'status', 'applied');
        END IF;

        v_incoming_version := COALESCE((p_payload->>'version')::bigint, v_curr_student.version + 1);
        IF v_incoming_version <= v_curr_student.version THEN
          v_incoming_version := v_curr_student.version + 1;
        END IF;

        UPDATE public.students SET
          deleted_at = COALESCE((p_payload->>'deleted_at')::timestamptz, now()),
          updated_at = now(),
          version = v_incoming_version
        WHERE id = v_record_uuid
        RETURNING * INTO v_resulting_student;

        INSERT INTO public.sync_changes (
          school_id, table_name, record_id, operation, payload, version, created_at
        ) VALUES (
          p_school_id, 'students', p_record_id, 'DELETE', to_jsonb(v_resulting_student), v_resulting_student.version, now()
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
      END IF;

    -- =========================================================================
    -- BRANCH B: STUDENT_ID_SETTINGS TABLE
    -- =========================================================================
    ELSIF p_table_name = 'student_id_settings' THEN
      v_incoming_version := COALESCE((p_payload->>'version')::bigint, 1);

      SELECT * INTO v_curr_settings
      FROM public.student_id_settings
      WHERE school_id = p_school_id;

      IF NOT FOUND THEN
        -- Insert new settings
        INSERT INTO public.student_id_settings (
          id, school_id, pattern, sequence_scope, next_sequence_number, created_at, updated_at, deleted_at, version
        ) VALUES (
          v_record_uuid,
          p_school_id,
          COALESCE(p_payload->>'pattern', '{SCHOOL}-{SEQ}'),
          COALESCE(p_payload->>'sequence_scope', 'school'),
          COALESCE((p_payload->>'next_sequence_number')::integer, 1),
          COALESCE((p_payload->>'created_at')::timestamptz, now()),
          COALESCE((p_payload->>'updated_at')::timestamptz, now()),
          (p_payload->>'deleted_at')::timestamptz,
          v_incoming_version
        )
        RETURNING * INTO v_resulting_settings;
      ELSE
        -- Version checking
        IF v_incoming_version < v_curr_settings.version THEN
          UPDATE public.sync_operations
          SET status = 'failed',
              error_message = 'Version conflict on student_id_settings: incoming ' || v_incoming_version || ' < cloud ' || v_curr_settings.version
          WHERE id = p_id;

          RETURN jsonb_build_object(
            'success', false,
            'conflict', true,
            'cloud_version', v_curr_settings.version,
            'incoming_version', v_incoming_version
          );
        END IF;

        UPDATE public.student_id_settings SET
          pattern = COALESCE(p_payload->>'pattern', pattern),
          sequence_scope = COALESCE(p_payload->>'sequence_scope', sequence_scope),
          next_sequence_number = GREATEST(next_sequence_number, COALESCE((p_payload->>'next_sequence_number')::integer, next_sequence_number)),
          updated_at = COALESCE((p_payload->>'updated_at')::timestamptz, now()),
          deleted_at = (p_payload->>'deleted_at')::timestamptz,
          version = v_incoming_version
        WHERE id = v_curr_settings.id
        RETURNING * INTO v_resulting_settings;
      END IF;

      INSERT INTO public.sync_changes (
        school_id, table_name, record_id, operation, payload, version, created_at
      ) VALUES (
        p_school_id, 'student_id_settings', p_record_id, p_operation, to_jsonb(v_resulting_settings), v_resulting_settings.version, now()
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
    END IF;

  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    UPDATE public.sync_operations
    SET status = 'failed',
        error_message = v_err
    WHERE id = p_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', v_err
    );
  END;

  RETURN jsonb_build_object('success', false, 'error', 'Unhandled sync branch');
END;
$$;
