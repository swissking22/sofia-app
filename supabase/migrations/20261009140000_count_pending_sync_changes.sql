-- ============================================================================
-- Count remote sync_changes still ahead of a device cursor (for Sync Now %).
-- ============================================================================
-- Migration: 20261009140000_count_pending_sync_changes.sql
-- ============================================================================

DROP FUNCTION IF EXISTS public.count_pending_sync_changes;

CREATE OR REPLACE FUNCTION public.count_pending_sync_changes(
  p_school_id UUID,
  p_cursor BIGINT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'School tenant does not exist: ' || p_school_id::text
    );
  END IF;

  SELECT COUNT(*)::BIGINT
  INTO v_count
  FROM public.sync_changes
  WHERE school_id = p_school_id
    AND id > COALESCE(p_cursor, 0);

  RETURN jsonb_build_object(
    'success', true,
    'count', COALESCE(v_count, 0),
    'cursor', COALESCE(p_cursor, 0)
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.count_pending_sync_changes TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.count_pending_sync_changes TO authenticated;
  END IF;
END $$;
