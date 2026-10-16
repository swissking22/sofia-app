-- ============================================================================
-- Fix bootstrap_school_tenant when short_code / school_code already exist
-- on a different school row (common after re-register or soft-delete).
-- Cloud may enforce NOT NULL + UNIQUE on short_code — never insert NULL.
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
DECLARE
  v_short TEXT;
  v_scode TEXT;
  v_conflict_id UUID;
  v_codes_cleared BOOLEAN := false;
  v_suffix TEXT;
BEGIN
  IF p_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'School id is required');
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'School name is required');
  END IF;

  v_short := NULLIF(btrim(COALESCE(p_short_code, '')), '');
  v_scode := NULLIF(btrim(COALESCE(p_school_code, p_short_code, '')), '');
  -- short_code may be NOT NULL on some deployments
  IF v_short IS NULL THEN
    v_short := upper(substr(replace(p_id::text, '-', ''), 1, 8));
  END IF;
  IF v_scode IS NULL THEN
    v_scode := v_short;
  END IF;

  -- Soft-deleted tenants often still hold unique short_code / school_code.
  UPDATE public.schools
  SET
    short_code = CASE
      WHEN upper(COALESCE(short_code, '')) = upper(v_short) THEN NULL
      ELSE short_code
    END,
    school_code = CASE
      WHEN upper(COALESCE(school_code, '')) = upper(v_scode) THEN NULL
      ELSE school_code
    END,
    updated_at = now()
  WHERE id IS DISTINCT FROM p_id
    AND deleted_at IS NOT NULL
    AND (
      upper(COALESCE(short_code, '')) = upper(v_short)
      OR upper(COALESCE(school_code, '')) = upper(v_scode)
    );

  -- Active conflict: mint a unique short code for this tenant id.
  IF EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id IS DISTINCT FROM p_id
      AND s.deleted_at IS NULL
      AND upper(COALESCE(s.short_code, '')) = upper(v_short)
  ) THEN
    v_suffix := upper(substr(replace(p_id::text, '-', ''), 1, 4));
    v_short := left(v_short, greatest(1, 6 - length(v_suffix))) || v_suffix;
    v_codes_cleared := true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id IS DISTINCT FROM p_id
      AND s.deleted_at IS NULL
      AND upper(COALESCE(s.school_code, '')) = upper(v_scode)
  ) THEN
    v_scode := v_short;
    v_codes_cleared := true;
  END IF;

  BEGIN
    INSERT INTO public.schools (
      id, name, short_code, school_code, address, phone, email,
      created_at, updated_at, deleted_at, version
    ) VALUES (
      p_id,
      btrim(p_name),
      v_short,
      v_scode,
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
  EXCEPTION
    WHEN unique_violation THEN
      -- Last resort: id-derived unique codes (never NULL).
      v_short := 'S' || upper(substr(replace(p_id::text, '-', ''), 1, 9));
      v_scode := v_short;
      INSERT INTO public.schools (
        id, name, short_code, school_code, address, phone, email,
        created_at, updated_at, deleted_at, version
      ) VALUES (
        p_id,
        btrim(p_name),
        v_short,
        v_scode,
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
        short_code = COALESCE(public.schools.short_code, EXCLUDED.short_code),
        school_code = COALESCE(public.schools.school_code, EXCLUDED.school_code),
        address = COALESCE(EXCLUDED.address, public.schools.address),
        phone = COALESCE(EXCLUDED.phone, public.schools.phone),
        email = COALESCE(EXCLUDED.email, public.schools.email),
        updated_at = now(),
        deleted_at = NULL,
        version = GREATEST(public.schools.version, EXCLUDED.version);
      v_codes_cleared := true;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', p_id,
    'created_or_updated', true,
    'codes_adjusted_for_conflict', v_codes_cleared,
    'short_code', v_short
  );
END;
$$;

COMMENT ON FUNCTION public.bootstrap_school_tenant IS
  'Upsert public.schools for first Sync. Frees soft-deleted code conflicts; mints unique non-null short_code on active collisions.';
