-- ============================================================================
-- Sofia Cloud Synchronization Schema: Schools, Students, ID Settings & Sync
-- ============================================================================
-- Migration: 20260907092153_init_cloud_sync_schema.sql
-- Description: Establishes Supabase PostgreSQL tables mirroring the local SQLite
--              schema for students and student ID settings, alongside prerequisite
--              tenant (schools), device, and sync foundation tables.
-- Safety: Non-destructive, idempotent, preserves all existing tables and columns.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tenant: public.schools
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  short_code TEXT,
  school_code TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  academic_year TEXT,
  term TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1
);

-- Idempotent column additions if public.schools previously existed with fewer columns
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS short_code TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS school_code TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS academic_year TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS term TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_schools_short_code ON public.schools(short_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_school_code_unique
  ON public.schools(school_code)
  WHERE deleted_at IS NULL AND school_code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Client Devices: public.devices
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  device_fingerprint TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1
);

ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS device_name TEXT;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_devices_school_id ON public.devices(school_id);

-- ----------------------------------------------------------------------------
-- 3. Cloud Students: public.students
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_code TEXT,
  name TEXT NOT NULL,
  class_id TEXT NOT NULL,
  admission_year INTEGER,
  academic_level_id TEXT,
  sequence_number INTEGER,
  gender TEXT,
  date_of_birth DATE,
  phone TEXT,
  email TEXT,
  address TEXT,
  admission_type TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  guardian_relationship TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  photo_path TEXT,
  residence_type TEXT NOT NULL DEFAULT 'day',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1
);

-- Idempotent column additions if public.students already existed with fewer columns
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS student_code TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_id TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS admission_year INTEGER;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS academic_level_id TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS sequence_number INTEGER;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS admission_type TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS guardian_name TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS guardian_phone TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS guardian_email TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS guardian_relationship TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS photo_path TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS residence_type TEXT DEFAULT 'day';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 1;

-- Foreign key & query performance indexes
CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_school_status ON public.students(school_id, status);

-- Task 3: Student ID Partial Unique Index (mirrors local SQLite constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_school_student_code_unique
  ON public.students(school_id, student_code)
  WHERE deleted_at IS NULL AND student_code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Cloud Student ID Settings: public.student_id_settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_id_settings (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL DEFAULT '{SCHOOL}-{SEQ}',
  sequence_scope TEXT NOT NULL DEFAULT 'school',
  next_sequence_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1
);

-- Idempotent column additions if public.student_id_settings already existed
ALTER TABLE public.student_id_settings ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.student_id_settings ADD COLUMN IF NOT EXISTS pattern TEXT DEFAULT '{SCHOOL}-{SEQ}';
ALTER TABLE public.student_id_settings ADD COLUMN IF NOT EXISTS sequence_scope TEXT DEFAULT 'school';
ALTER TABLE public.student_id_settings ADD COLUMN IF NOT EXISTS next_sequence_number INTEGER DEFAULT 1;
ALTER TABLE public.student_id_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.student_id_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.student_id_settings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.student_id_settings ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_student_id_settings_school_id ON public.student_id_settings(school_id);

-- ----------------------------------------------------------------------------
-- 5. Sync Architecture: public.sync_operations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_operations (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS id UUID;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS operation TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.sync_operations DROP CONSTRAINT IF EXISTS sync_operations_operation_check;

CREATE INDEX IF NOT EXISTS idx_sync_operations_school_status ON public.sync_operations(school_id, status);
CREATE INDEX IF NOT EXISTS idx_sync_operations_created_at ON public.sync_operations(created_at);

-- ----------------------------------------------------------------------------
-- 6. Sync Architecture: public.sync_changes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_changes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS operation TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 1;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.sync_changes DROP CONSTRAINT IF EXISTS sync_changes_operation_check;

CREATE INDEX IF NOT EXISTS idx_sync_changes_school_id_id ON public.sync_changes(school_id, id);
CREATE INDEX IF NOT EXISTS idx_sync_changes_table_record ON public.sync_changes(table_name, record_id);

-- ----------------------------------------------------------------------------
-- 7. Sync Architecture: public.sync_cursors
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  last_synced_change_id BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sync_cursors_device_school UNIQUE (device_id, school_id)
);

ALTER TABLE public.sync_cursors ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE;
ALTER TABLE public.sync_cursors ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.sync_cursors ADD COLUMN IF NOT EXISTS last_synced_change_id BIGINT DEFAULT 0;
ALTER TABLE public.sync_cursors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sync_cursors_device ON public.sync_cursors(device_id);
CREATE INDEX IF NOT EXISTS idx_sync_cursors_school ON public.sync_cursors(school_id);



-- ============================================================================
-- Sofia Cloud Synchronization: process_sync_operation & register_device
-- ============================================================================
-- Migration: 20260907094133_add_process_sync_operation.sql
-- Description: Creates the core RPC functions for Phase 1 push synchronization:
--              - register_device(): registers or updates desktop client identity
--              - process_sync_operation(): atomic, idempotent ingestion of student
--                and student_id_settings records with immutable field protection,
--                optimistic version checking, and sync_changes generation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Device Registration Helper
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_device;

CREATE OR REPLACE FUNCTION public.register_device(
  p_id UUID,
  p_school_id UUID,
  p_device_name TEXT,
  p_device_fingerprint TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'School tenant does not exist: ' || p_school_id::text);
  END IF;

  INSERT INTO public.devices (
    id, school_id, device_name, device_fingerprint, last_seen_at, updated_at
  ) VALUES (
    p_id, p_school_id, COALESCE(NULLIF(trim(p_device_name), ''), 'Sofia Desktop'), p_device_fingerprint, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    school_id = EXCLUDED.school_id,
    device_name = EXCLUDED.device_name,
    device_fingerprint = COALESCE(EXCLUDED.device_fingerprint, public.devices.device_fingerprint),
    last_seen_at = now(),
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'device_id', p_id);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.register_device TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.register_device TO authenticated;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Push Sync Processing RPC: process_sync_operation
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.process_sync_operation(uuid, uuid, uuid, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.process_sync_operation;

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

  -- 1. Idempotency check: check if this operation ID has already been applied
  SELECT status INTO v_op_status
  FROM public.sync_operations
  WHERE id = p_id;

  IF v_op_status = 'applied' THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'status', 'applied'
    );
  END IF;

  -- 2. Tenant validation: p_school_id must exist in public.schools
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    INSERT INTO public.sync_operations (
      id, school_id, device_id, table_name, record_id, operation, payload, status, error_message, created_at
    ) VALUES (
      p_id, p_school_id, v_safe_device_id, p_table_name, p_record_id, p_operation, p_payload, 'failed',
      'School tenant does not exist: ' || p_school_id::text, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = 'failed',
      error_message = EXCLUDED.error_message;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'School tenant does not exist: ' || p_school_id::text
    );
  END IF;

  -- 3. Check table support (Phase 1 supports only students and student_id_settings)
  IF p_table_name NOT IN ('students', 'student_id_settings') THEN
    INSERT INTO public.sync_operations (
      id, school_id, device_id, table_name, record_id, operation, payload, status, error_message, created_at
    ) VALUES (
      p_id, p_school_id, v_safe_device_id, p_table_name, p_record_id, p_operation, p_payload, 'failed',
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
      id, school_id, device_id, table_name, record_id, operation, payload, status, error_message, created_at
    ) VALUES (
      p_id, p_school_id, v_safe_device_id, p_table_name, p_record_id, p_operation, p_payload, 'failed',
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
      id, school_id, device_id, table_name, record_id, operation, payload, status, error_message, created_at
    ) VALUES (
      p_id, p_school_id, v_safe_device_id, p_table_name, p_record_id, p_operation, p_payload, 'failed',
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
      id, school_id, device_id, table_name, record_id, operation, payload, status, error_message, created_at
    ) VALUES (
      p_id, p_school_id, v_safe_device_id, p_table_name, p_record_id, p_operation, p_payload, 'failed',
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
    id, school_id, device_id, table_name, record_id, operation, payload, status, created_at
  ) VALUES (
    p_id, p_school_id, v_safe_device_id, p_table_name, p_record_id, p_operation, p_payload, 'pending', now()
  )
  ON CONFLICT (id) DO UPDATE SET
    school_id = EXCLUDED.school_id,
    device_id = EXCLUDED.device_id,
    table_name = EXCLUDED.table_name,
    record_id = EXCLUDED.record_id,
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
          sequence_number, gender, date_of_birth, phone, email, address, admission_type,
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.process_sync_operation TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.process_sync_operation TO authenticated;
  END IF;
END $$;



-- ============================================================================
-- Sofia Cloud Synchronization: Phase 2 Pull Sync RPCs
-- ============================================================================
-- Migration: 20260907100737_add_pull_sync_rpcs.sql
-- Description: Creates server-side RPC functions for Phase 2 pull sync:
--              - pull_sync_changes(): reads changes from public.sync_changes
--                ordered by id ASC where id > p_cursor, scoped strictly by school_id
--              - update_sync_cursor(): updates the client device's cloud cursor in
--                public.sync_cursors with the latest pulled change_id
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Pull Sync Changes RPC
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pull_sync_changes;

CREATE OR REPLACE FUNCTION public.pull_sync_changes(
  p_school_id UUID,
  p_device_id UUID,
  p_cursor BIGINT DEFAULT 0,
  p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes JSONB;
  v_count INTEGER;
  v_max_id BIGINT := COALESCE(p_cursor, 0);
  v_safe_limit INTEGER;
BEGIN
  -- 1. Tenant validation: school must exist
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'School tenant does not exist: ' || p_school_id::text
    );
  END IF;

  -- 2. Clamp limit between 1 and 500
  v_safe_limit := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));

  -- 3. Touch device last_seen_at if device exists
  IF p_device_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.devices WHERE id = p_device_id) THEN
    UPDATE public.devices SET last_seen_at = now() WHERE id = p_device_id;
  END IF;

  -- 4. Select changes strictly for this school where id > cursor
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'school_id', c.school_id,
          'table_name', c.table_name,
          'record_id', c.record_id,
          'operation', c.operation,
          'payload', c.payload,
          'version', c.version,
          'created_at', c.created_at
        ) ORDER BY c.id ASC
      ),
      '[]'::jsonb
    ),
    COUNT(*),
    COALESCE(MAX(c.id), COALESCE(p_cursor, 0))
  INTO v_changes, v_count, v_max_id
  FROM (
    SELECT id, school_id, table_name, record_id, operation, payload, version, created_at
    FROM public.sync_changes
    WHERE school_id = p_school_id
      AND id > COALESCE(p_cursor, 0)
    ORDER BY id ASC
    LIMIT v_safe_limit
  ) c;

  RETURN jsonb_build_object(
    'success', true,
    'changes', v_changes,
    'count', v_count,
    'current_cursor', COALESCE(p_cursor, 0),
    'new_cursor', v_max_id,
    'has_more', (v_count >= v_safe_limit)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Update Sync Cursor RPC
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_sync_cursor;

CREATE OR REPLACE FUNCTION public.update_sync_cursor(
  p_school_id UUID,
  p_device_id UUID,
  p_cursor BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate school
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'School tenant does not exist: ' || p_school_id::text);
  END IF;

  -- If device is registered, upsert cursor
  IF p_device_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.devices WHERE id = p_device_id) THEN
    INSERT INTO public.sync_cursors (
      device_id, school_id, last_synced_change_id, updated_at
    ) VALUES (
      p_device_id, p_school_id, GREATEST(0, COALESCE(p_cursor, 0)), now()
    )
    ON CONFLICT (device_id, school_id) DO UPDATE SET
      last_synced_change_id = GREATEST(public.sync_cursors.last_synced_change_id, EXCLUDED.last_synced_change_id),
      updated_at = now();

    RETURN jsonb_build_object('success', true, 'cursor', p_cursor);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Device not registered: ' || COALESCE(p_device_id::text, 'null'));
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Grants for exposed schemas
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.pull_sync_changes TO anon;
    GRANT EXECUTE ON FUNCTION public.update_sync_cursor TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.pull_sync_changes TO authenticated;
    GRANT EXECUTE ON FUNCTION public.update_sync_cursor TO authenticated;
  END IF;
END $$;
