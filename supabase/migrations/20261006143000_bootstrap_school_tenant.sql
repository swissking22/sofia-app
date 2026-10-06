-- ============================================================================
-- Bootstrap school tenant for first-time Sync on a primary desk
-- (USB restore / never-synced local school).
--
-- register_device and sync_operations.school_id FK require public.schools.
-- The desktop push path calls this when register_device reports
-- "School tenant does not exist".
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bootstrap_school_tenant(
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
BEGIN
  IF p_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'School id is required');
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'School name is required');
  END IF;

  INSERT INTO public.schools (
    id, name, short_code, school_code, address, phone, email,
    created_at, updated_at, deleted_at, version
  ) VALUES (
    p_id,
    btrim(p_name),
    NULLIF(btrim(COALESCE(p_short_code, '')), ''),
    NULLIF(btrim(COALESCE(p_school_code, p_short_code, '')), ''),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_email, '')), ''),
    now(),
    now(),
    NULL,
    1
  )
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, public.schools.name),
    short_code = COALESCE(EXCLUDED.short_code, public.schools.short_code),
    school_code = COALESCE(EXCLUDED.school_code, public.schools.school_code),
    address = COALESCE(EXCLUDED.address, public.schools.address),
    phone = COALESCE(EXCLUDED.phone, public.schools.phone),
    email = COALESCE(EXCLUDED.email, public.schools.email),
    updated_at = now(),
    deleted_at = NULL,
    version = GREATEST(public.schools.version, EXCLUDED.version);

  RETURN jsonb_build_object(
    'success', true,
    'school_id', p_id,
    'created_or_updated', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_school_tenant(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.bootstrap_school_tenant(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon;

GRANT EXECUTE ON FUNCTION public.bootstrap_school_tenant(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.bootstrap_school_tenant IS
  'Upsert public.schools so first Sync / USB-restored primary desks can register_device.';
