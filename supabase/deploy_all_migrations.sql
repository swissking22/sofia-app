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


-- ============================================================================
-- Appended: 20260914093000_fix_sync_operations_id_and_process_rpc.sql
-- ============================================================================

-- ============================================================================
-- Fix sync_operations.id drift + harden process_sync_operation
-- ============================================================================
-- Migration: 20260914093000_fix_sync_operations_id_and_process_rpc.sql
-- Root cause: hosted public.sync_operations lacked an `id` column (or used a
-- legacy name), so process_sync_operation failed with:
--   ERROR 42703: column "id" does not exist
-- Also: missing-school path attempted INSERT into sync_operations with a
-- school_id FK that cannot succeed when the tenant row is absent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Repair public.sync_operations identity column
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  has_id boolean;
  has_operation_id boolean;
  has_pk_on_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_operations' AND column_name = 'id'
  ) INTO has_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_operations' AND column_name = 'operation_id'
  ) INTO has_operation_id;

  IF has_operation_id AND NOT has_id THEN
    EXECUTE 'ALTER TABLE public.sync_operations RENAME COLUMN operation_id TO id';
    has_id := true;
  END IF;

  IF NOT has_id THEN
    EXECUTE 'ALTER TABLE public.sync_operations ADD COLUMN id UUID';
  END IF;

  -- Backfill any NULL ids before enforcing constraints
  EXECUTE 'UPDATE public.sync_operations SET id = gen_random_uuid() WHERE id IS NULL';
  EXECUTE 'ALTER TABLE public.sync_operations ALTER COLUMN id SET NOT NULL';

  -- Ensure uniqueness for ON CONFLICT (id)
  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'sync_operations'
      AND i.indisunique
      AND pg_get_indexdef(i.indexrelid) ILIKE '%(id)%'
  ) INTO has_pk_on_id;

  IF NOT has_pk_on_id THEN
    BEGIN
      -- Prefer primary key when the table has none
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.sync_operations'::regclass AND contype = 'p'
      ) THEN
        EXECUTE 'ALTER TABLE public.sync_operations ADD CONSTRAINT sync_operations_pkey PRIMARY KEY (id)';
      ELSE
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS sync_operations_id_uidx ON public.sync_operations(id)';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS sync_operations_id_uidx ON public.sync_operations(id)';
    END;
  END IF;
END $$;

-- Ensure companion columns used by the RPC exist
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

-- Ensure sync_changes.id exists for RETURNING id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_changes' AND column_name = 'id'
  ) THEN
    EXECUTE 'ALTER TABLE public.sync_changes ADD COLUMN id BIGINT GENERATED ALWAYS AS IDENTITY';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Replace process_sync_operation with hardened definition
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
-- Appended: 20260914104500_provision_lwm_dev_school_tenant.sql
-- ============================================================================

-- ============================================================================
-- Provision LWM development school tenant (exact local UUID)
-- ============================================================================
-- Migration: 20260914104500_provision_lwm_dev_school_tenant.sql
-- Local Sofia (development) school:
--   id: 0dd470f4-4505-4aa5-a8ea-0b4c340daa5d
--   name: Light World Mission Anglo-Saxon Boarding and Day College
--   short_code / school_code: LWM
--
-- NOTE: The UUID in some log pastes may appear as ...4aa8... — that is a typo.
--       The real local / session school id ends in ...4aa5...
-- ============================================================================

INSERT INTO public.schools (
  id,
  name,
  short_code,
  school_code,
  address,
  phone,
  email,
  created_at,
  updated_at,
  version
)
VALUES (
  '0dd470f4-4505-4aa5-a8ea-0b4c340daa5d'::uuid,
  'Light World Mission Anglo-Saxon Boarding and Day College',
  'LWM',
  'LWM',
  'Simbock, Yaoundé',
  '+237 6 77 21 40 18',
  'admin@lightworld.demo',
  now(),
  now(),
  1
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_code = COALESCE(public.schools.short_code, EXCLUDED.short_code),
  school_code = COALESCE(public.schools.school_code, EXCLUDED.school_code),
  address = COALESCE(public.schools.address, EXCLUDED.address),
  phone = COALESCE(public.schools.phone, EXCLUDED.phone),
  email = COALESCE(public.schools.email, EXCLUDED.email),
  updated_at = now();

-- Optional: tightly allow-listed helper for re-running tenant ensure from SQL/RPC
-- without granting table INSERT to anon. Only the known LWM development UUID
-- may be upserted; arbitrary tenant creation is rejected.
DROP FUNCTION IF EXISTS public.ensure_school_tenant(uuid, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.ensure_school_tenant(
  p_id UUID,
  p_name TEXT,
  p_short_code TEXT DEFAULT NULL,
  p_school_code TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed UUID := '0dd470f4-4505-4aa5-a8ea-0b4c340daa5d'::uuid;
BEGIN
  IF p_id IS DISTINCT FROM v_allowed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'School tenant not in development allow-list: ' || p_id::text
    );
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'School name is required');
  END IF;

  INSERT INTO public.schools (
    id, name, short_code, school_code, address, phone, email, created_at, updated_at, version
  ) VALUES (
    p_id,
    trim(p_name),
    NULLIF(trim(COALESCE(p_short_code, '')), ''),
    NULLIF(trim(COALESCE(p_school_code, '')), ''),
    NULLIF(trim(COALESCE(p_address, '')), ''),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    NULLIF(trim(COALESCE(p_email, '')), ''),
    now(),
    now(),
    1
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    short_code = COALESCE(EXCLUDED.short_code, public.schools.short_code),
    school_code = COALESCE(EXCLUDED.school_code, public.schools.school_code),
    address = COALESCE(EXCLUDED.address, public.schools.address),
    phone = COALESCE(EXCLUDED.phone, public.schools.phone),
    email = COALESCE(EXCLUDED.email, public.schools.email),
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'school_id', p_id);
END;
$$;

DO $$
BEGIN
  -- Intentionally NOT granted to anon/authenticated.
  -- Call from SQL Editor / service role only. Desktop app keeps using anon RPCs
  -- (register_device / process_sync_operation) after the tenant row exists.
  REVOKE ALL ON FUNCTION public.ensure_school_tenant(uuid, text, text, text, text, text, text) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.ensure_school_tenant(uuid, text, text, text, text, text, text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.ensure_school_tenant(uuid, text, text, text, text, text, text) FROM authenticated;
  END IF;
END $$;


-- ============================================================================
-- Appended: 20260914111000_fix_sync_operations_legacy_entity_type.sql
-- ============================================================================

-- ============================================================================
-- Fix legacy sync_operations.entity_type NOT NULL blocking process_sync_operation
-- ============================================================================
-- Migration: 20260914111000_fix_sync_operations_legacy_entity_type.sql
-- After LWM tenant + id-column repair, INSERT into sync_operations still failed:
--   ERROR 23502: null value in column "entity_type" violates not-null constraint
-- Hosted sync_operations is a legacy shape that still requires entity_type.
-- ============================================================================

-- 1. Ensure companion Sofia columns exist
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- 2. Backfill + soften NOT NULL so RPC inserts cannot fail on legacy columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sync_operations'
      AND column_name = 'entity_type'
  ) THEN
    EXECUTE $sql$
      UPDATE public.sync_operations
      SET entity_type = COALESCE(NULLIF(entity_type, ''), table_name, 'unknown')
      WHERE entity_type IS NULL OR entity_type = ''
    $sql$;
    BEGIN
      EXECUTE 'ALTER TABLE public.sync_operations ALTER COLUMN entity_type SET DEFAULT ''unknown''';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      EXECUTE 'ALTER TABLE public.sync_operations ALTER COLUMN entity_type DROP NOT NULL';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sync_operations'
      AND column_name = 'entity_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.sync_operations
      SET entity_id = COALESCE(NULLIF(entity_id, ''), record_id)
      WHERE entity_id IS NULL OR entity_id = ''
    $sql$;
    BEGIN
      EXECUTE 'ALTER TABLE public.sync_operations ALTER COLUMN entity_id DROP NOT NULL';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- 3. BEFORE INSERT/UPDATE trigger keeps legacy columns populated from Sofia fields
CREATE OR REPLACE FUNCTION public.sync_operations_fill_legacy_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.entity_type IS NULL OR NEW.entity_type = '' THEN
    NEW.entity_type := COALESCE(NEW.table_name, 'unknown');
  END IF;
  IF NEW.entity_id IS NULL OR NEW.entity_id = '' THEN
    NEW.entity_id := NEW.record_id;
  END IF;
  IF (NEW.table_name IS NULL OR NEW.table_name = '') AND NEW.entity_type IS NOT NULL THEN
    NEW.table_name := NEW.entity_type;
  END IF;
  IF (NEW.record_id IS NULL OR NEW.record_id = '') AND NEW.entity_id IS NOT NULL THEN
    NEW.record_id := NEW.entity_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_operations_fill_legacy ON public.sync_operations;
CREATE TRIGGER trg_sync_operations_fill_legacy
BEFORE INSERT OR UPDATE ON public.sync_operations
FOR EACH ROW
EXECUTE FUNCTION public.sync_operations_fill_legacy_columns();


-- ============================================================================
-- Appended: 20260914121500_fix_entity_type_and_sync_cursors.sql
-- ============================================================================

-- ============================================================================
-- Fix remaining hosted sync blockers
-- ============================================================================
-- Migration: 20260914121500_fix_entity_type_and_sync_cursors.sql
-- 1) sync_operations.entity_type NOT NULL (legacy) breaks process_sync_operation
-- 2) sync_cursors missing UNIQUE(device_id, school_id) breaks update_sync_cursor ON CONFLICT
-- Safe to re-run. Does not delete data. Does not grant table access to anon.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Legacy sync_operations.entity_type / entity_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS entity_id TEXT;

UPDATE public.sync_operations
SET entity_type = COALESCE(NULLIF(btrim(entity_type), ''), table_name, 'unknown')
WHERE entity_type IS NULL OR btrim(entity_type) = '';

UPDATE public.sync_operations
SET entity_id = COALESCE(NULLIF(btrim(entity_id), ''), record_id)
WHERE entity_id IS NULL OR btrim(entity_id) = '';

ALTER TABLE public.sync_operations ALTER COLUMN entity_type SET DEFAULT 'unknown';

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.sync_operations ALTER COLUMN entity_type DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'entity_type DROP NOT NULL skipped: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE public.sync_operations ALTER COLUMN entity_id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'entity_id DROP NOT NULL skipped: %', SQLERRM;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.sync_operations_fill_legacy_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.entity_type IS NULL OR btrim(COALESCE(NEW.entity_type, '')) = '' THEN
    NEW.entity_type := COALESCE(NEW.table_name, 'unknown');
  END IF;
  IF NEW.entity_id IS NULL OR btrim(COALESCE(NEW.entity_id, '')) = '' THEN
    NEW.entity_id := NEW.record_id;
  END IF;
  IF (NEW.table_name IS NULL OR btrim(COALESCE(NEW.table_name, '')) = '')
     AND NEW.entity_type IS NOT NULL THEN
    NEW.table_name := NEW.entity_type;
  END IF;
  IF (NEW.record_id IS NULL OR btrim(COALESCE(NEW.record_id, '')) = '')
     AND NEW.entity_id IS NOT NULL THEN
    NEW.record_id := NEW.entity_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_operations_fill_legacy ON public.sync_operations;
CREATE TRIGGER trg_sync_operations_fill_legacy
BEFORE INSERT OR UPDATE ON public.sync_operations
FOR EACH ROW
EXECUTE PROCEDURE public.sync_operations_fill_legacy_columns();

-- ---------------------------------------------------------------------------
-- B. Ensure sync_cursors unique (device_id, school_id) for upsert semantics
-- ---------------------------------------------------------------------------
ALTER TABLE public.sync_cursors ADD COLUMN IF NOT EXISTS device_id UUID;
ALTER TABLE public.sync_cursors ADD COLUMN IF NOT EXISTS school_id UUID;
ALTER TABLE public.sync_cursors ADD COLUMN IF NOT EXISTS last_synced_change_id BIGINT DEFAULT 0;
ALTER TABLE public.sync_cursors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Deduplicate before unique index (keep newest updated_at / highest cursor)
DELETE FROM public.sync_cursors a
USING public.sync_cursors b
WHERE a.ctid < b.ctid
  AND a.device_id IS NOT NULL
  AND a.school_id IS NOT NULL
  AND a.device_id = b.device_id
  AND a.school_id = b.school_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_cursors_device_school
  ON public.sync_cursors(device_id, school_id);

-- ---------------------------------------------------------------------------
-- C. Hardened update_sync_cursor (UPDATE-then-INSERT; ON CONFLICT as fallback)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_sync_cursor(uuid, uuid, bigint);
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
DECLARE
  v_cursor BIGINT := GREATEST(0, COALESCE(p_cursor, 0));
  v_updated INT := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'School tenant does not exist: ' || p_school_id::text
    );
  END IF;

  IF p_device_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.devices WHERE id = p_device_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Device not registered: ' || COALESCE(p_device_id::text, 'null')
    );
  END IF;

  UPDATE public.sync_cursors
  SET
    last_synced_change_id = GREATEST(last_synced_change_id, v_cursor),
    updated_at = now()
  WHERE device_id = p_device_id
    AND school_id = p_school_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    BEGIN
      INSERT INTO public.sync_cursors (
        device_id, school_id, last_synced_change_id, updated_at
      ) VALUES (
        p_device_id, p_school_id, v_cursor, now()
      );
    EXCEPTION WHEN unique_violation THEN
      UPDATE public.sync_cursors
      SET
        last_synced_change_id = GREATEST(last_synced_change_id, v_cursor),
        updated_at = now()
      WHERE device_id = p_device_id
        AND school_id = p_school_id;
    END;
  END IF;

  RETURN jsonb_build_object('success', true, 'cursor', v_cursor);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.update_sync_cursor TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.update_sync_cursor TO authenticated;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- D. process_sync_operation writes entity_type / entity_id explicitly
-- ---------------------------------------------------------------------------
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
-- Appended: 20260914123000_fix_students_legacy_name_columns.sql
-- ============================================================================

-- ============================================================================
-- Fix legacy public.students.first_name / last_name blocking process_sync_operation
-- ============================================================================
-- Migration: 20260914123000_fix_students_legacy_name_columns.sql
-- Hosted students table still has NOT NULL first_name/last_name from a pre-Sofia
-- schema, while Sofia sync writes a single `name` column.
-- ============================================================================

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Backfill name from legacy parts when needed
UPDATE public.students
SET name = NULLIF(btrim(CONCAT_WS(' ', first_name, last_name)), '')
WHERE (name IS NULL OR btrim(name) = '')
  AND (first_name IS NOT NULL OR last_name IS NOT NULL);

-- Backfill legacy parts from name when needed
UPDATE public.students
SET
  first_name = COALESCE(
    NULLIF(btrim(first_name), ''),
    NULLIF(split_part(btrim(name), ' ', 1), ''),
    'Unknown'
  ),
  last_name = COALESCE(
    NULLIF(btrim(last_name), ''),
    NULLIF(btrim(substr(btrim(name), length(split_part(btrim(name), ' ', 1)) + 1)), ''),
    ''
  )
WHERE name IS NOT NULL AND btrim(name) <> '';

ALTER TABLE public.students ALTER COLUMN first_name SET DEFAULT 'Unknown';
ALTER TABLE public.students ALTER COLUMN last_name SET DEFAULT '';

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.students ALTER COLUMN first_name DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'first_name DROP NOT NULL skipped: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE public.students ALTER COLUMN last_name DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'last_name DROP NOT NULL skipped: %', SQLERRM;
  END;
  BEGIN
    -- Ensure Sofia `name` is usable
    UPDATE public.students SET name = COALESCE(NULLIF(btrim(name), ''), 'Unknown') WHERE name IS NULL OR btrim(name) = '';
    ALTER TABLE public.students ALTER COLUMN name SET DEFAULT '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'name default skipped: %', SQLERRM;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.students_fill_legacy_name_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_full TEXT;
  v_first TEXT;
  v_rest TEXT;
BEGIN
  v_full := NULLIF(btrim(COALESCE(NEW.name, '')), '');

  IF v_full IS NULL THEN
    v_full := NULLIF(btrim(CONCAT_WS(' ', NEW.first_name, NEW.last_name)), '');
    IF v_full IS NOT NULL THEN
      NEW.name := v_full;
    ELSE
      NEW.name := 'Unknown';
      v_full := 'Unknown';
    END IF;
  END IF;

  IF NEW.first_name IS NULL OR btrim(NEW.first_name) = '' THEN
    v_first := split_part(v_full, ' ', 1);
    v_rest := NULLIF(btrim(substr(v_full, length(v_first) + 1)), '');
    NEW.first_name := COALESCE(NULLIF(v_first, ''), 'Unknown');
    IF NEW.last_name IS NULL OR btrim(NEW.last_name) = '' THEN
      NEW.last_name := COALESCE(v_rest, '');
    END IF;
  ELSIF NEW.last_name IS NULL THEN
    NEW.last_name := '';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_fill_legacy_name ON public.students;
CREATE TRIGGER trg_students_fill_legacy_name
BEFORE INSERT OR UPDATE ON public.students
FOR EACH ROW
EXECUTE PROCEDURE public.students_fill_legacy_name_columns();

-- Smoke checks
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'students'
  AND column_name IN ('name', 'first_name', 'last_name')
ORDER BY column_name;


-- ============================================================================
-- Appended: 20260914124500_fix_sync_changes_legacy_entity_type.sql
-- ============================================================================

-- ============================================================================
-- Fix legacy public.sync_changes.entity_type NOT NULL
-- ============================================================================
-- Symptom after students name fix:
--   null value in column "entity_type" of relation "sync_changes"
-- Sofia process_sync_operation inserts table_name/record_id, not entity_type.
-- ============================================================================

ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS operation TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 1;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS school_id UUID;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE public.sync_changes
SET entity_type = COALESCE(NULLIF(btrim(entity_type), ''), table_name, 'unknown')
WHERE entity_type IS NULL OR btrim(entity_type) = '';

UPDATE public.sync_changes
SET entity_id = COALESCE(NULLIF(btrim(entity_id), ''), record_id)
WHERE entity_id IS NULL OR btrim(entity_id) = '';

ALTER TABLE public.sync_changes ALTER COLUMN entity_type SET DEFAULT 'unknown';

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.sync_changes ALTER COLUMN entity_type DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'sync_changes.entity_type DROP NOT NULL skipped: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE public.sync_changes ALTER COLUMN entity_id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'sync_changes.entity_id DROP NOT NULL skipped: %', SQLERRM;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.sync_changes_fill_legacy_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.entity_type IS NULL OR btrim(COALESCE(NEW.entity_type, '')) = '' THEN
    NEW.entity_type := COALESCE(NEW.table_name, 'unknown');
  END IF;
  IF NEW.entity_id IS NULL OR btrim(COALESCE(NEW.entity_id, '')) = '' THEN
    NEW.entity_id := NEW.record_id;
  END IF;
  IF (NEW.table_name IS NULL OR btrim(COALESCE(NEW.table_name, '')) = '')
     AND NEW.entity_type IS NOT NULL THEN
    NEW.table_name := NEW.entity_type;
  END IF;
  IF (NEW.record_id IS NULL OR btrim(COALESCE(NEW.record_id, '')) = '')
     AND NEW.entity_id IS NOT NULL THEN
    NEW.record_id := NEW.entity_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_changes_fill_legacy ON public.sync_changes;
CREATE TRIGGER trg_sync_changes_fill_legacy
BEFORE INSERT OR UPDATE ON public.sync_changes
FOR EACH ROW
EXECUTE PROCEDURE public.sync_changes_fill_legacy_columns();

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sync_changes'
  AND column_name IN ('entity_type', 'entity_id', 'table_name', 'record_id')
ORDER BY column_name;


-- ============================================================================
-- Appended: 20260914130000_fix_sync_operations_status_check.sql
-- ============================================================================

-- ============================================================================
-- Fix sync_operations_status_check blocking process_sync_operation
-- ============================================================================
-- Symptom:
--   new row for relation "sync_operations" violates check constraint
--   "sync_operations_status_check"
-- Sofia RPC uses status values: pending | applied | failed
-- ============================================================================

ALTER TABLE public.sync_operations DROP CONSTRAINT IF EXISTS sync_operations_status_check;

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop any other CHECK constraints on status that conflict
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.sync_operations'::regclass
      AND c.contype = 'c'
      AND a.attname = 'status'
      AND a.attnum > 0
  LOOP
    EXECUTE format('ALTER TABLE public.sync_operations DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.sync_operations
  ADD CONSTRAINT sync_operations_status_check
  CHECK (status IS NULL OR status IN ('pending', 'applied', 'failed', 'processing', 'completed', 'error'));

-- Verify
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.sync_operations'::regclass
  AND contype = 'c'
  AND conname ILIKE '%status%';
