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
