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
