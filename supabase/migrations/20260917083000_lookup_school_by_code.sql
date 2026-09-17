-- ============================================================================
-- Pre-login join: lookup school tenant by school_code / short_code
-- ============================================================================
-- Used by secondary desks ("Join existing school") before pull sync.
-- SECURITY DEFINER + anon execute: returns public identity fields only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lookup_school_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_row public.schools%ROWTYPE;
BEGIN
  v_code := upper(trim(COALESCE(p_code, '')));
  IF v_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'School code is required');
  END IF;

  SELECT * INTO v_row
  FROM public.schools
  WHERE deleted_at IS NULL
    AND (
      upper(trim(COALESCE(school_code, ''))) = v_code
      OR upper(trim(COALESCE(short_code, ''))) = v_code
    )
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No school found for code: ' || v_code
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'school', jsonb_build_object(
      'id', v_row.id,
      'name', v_row.name,
      'school_code', v_row.school_code,
      'short_code', v_row.short_code,
      'email', v_row.email,
      'phone', v_row.phone,
      'address', v_row.address,
      'version', v_row.version
    )
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.lookup_school_by_code(text) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.lookup_school_by_code(text) TO authenticated;
  END IF;
END $$;
