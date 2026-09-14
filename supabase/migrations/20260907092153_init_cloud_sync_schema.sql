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
