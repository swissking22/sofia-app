-- ============================================================================
-- Tenant isolation: RLS policies + sync RPC guards
-- Ensures no school JWT / desk can read or write another school's rows.
-- Desktop sync (anon + device) must use a device registered to that school.
-- Authenticated users (mobile/admin) must match app_metadata.school_id.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Helpers
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.jwt_school_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text;
BEGIN
  v_raw := trim(COALESCE(auth.jwt() -> 'app_metadata' ->> 'school_id', ''));
  IF v_raw = '' OR v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN v_raw::uuid;
END;
$$;

COMMENT ON FUNCTION public.jwt_school_id() IS
  'School UUID from JWT app_metadata.school_id (null if missing/invalid).';

REVOKE ALL ON FUNCTION public.jwt_school_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jwt_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.jwt_school_id() TO anon;
GRANT EXECUTE ON FUNCTION public.jwt_school_id() TO service_role;

/**
 * Returns NULL when access is allowed, otherwise a JSON error payload.
 * Rules:
 *  - Authenticated: JWT school_id must equal p_school_id
 *  - Anon desk sync: device must exist and belong to p_school_id
 *    (p_allow_new_device=true skips device check for register_device)
 *  - Rejects payload school_id mismatch when p_payload provided
 */
CREATE OR REPLACE FUNCTION public.tenant_access_denied(
  p_school_id uuid,
  p_device_id uuid DEFAULT NULL,
  p_allow_new_device boolean DEFAULT false,
  p_payload jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt uuid;
  v_device_school uuid;
  v_payload_school text;
BEGIN
  IF p_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'School id is required');
  END IF;

  -- Authenticated callers (mobile / cloud login desks) are bound to JWT school
  IF auth.uid() IS NOT NULL THEN
    v_jwt := public.jwt_school_id();
    IF v_jwt IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Missing app_metadata.school_id — re-provision Auth'
      );
    END IF;
    IF v_jwt <> p_school_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Cross-school access is not allowed'
      );
    END IF;
  ELSIF NOT p_allow_new_device THEN
    -- Anonymous desktop sync: device must already be registered to this school
    IF p_device_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Device id is required for school sync'
      );
    END IF;
    SELECT school_id INTO v_device_school
    FROM public.devices
    WHERE id = p_device_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Device not registered for this school — register_device first'
      );
    END IF;
    IF v_device_school IS DISTINCT FROM p_school_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Device belongs to a different school'
      );
    END IF;
  END IF;

  -- Payload must not claim a different school_id
  IF p_payload IS NOT NULL THEN
    v_payload_school := trim(COALESCE(p_payload ->> 'school_id', ''));
    IF v_payload_school <> ''
       AND lower(v_payload_school) <> lower(p_school_id::text) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Payload school_id does not match sync tenant'
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.tenant_access_denied IS
  'NULL = allowed; otherwise JSON error for cross-tenant sync attempts.';

REVOKE ALL ON FUNCTION public.tenant_access_denied(uuid, uuid, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_access_denied(uuid, uuid, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_access_denied(uuid, uuid, boolean, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.tenant_access_denied(uuid, uuid, boolean, jsonb) TO service_role;

-- --------------------------------------------------------------------------
-- RLS policies (tables already have RLS enabled with zero policies)
-- --------------------------------------------------------------------------

-- schools: authenticated may only see their own tenant row
DROP POLICY IF EXISTS schools_tenant_select ON public.schools;
CREATE POLICY schools_tenant_select ON public.schools
  FOR SELECT TO authenticated
  USING (id = public.jwt_school_id());

DROP POLICY IF EXISTS schools_tenant_update ON public.schools;
CREATE POLICY schools_tenant_update ON public.schools
  FOR UPDATE TO authenticated
  USING (id = public.jwt_school_id())
  WITH CHECK (id = public.jwt_school_id());

-- Generic school_id tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'devices',
    'students',
    'student_id_settings',
    'sync_changes',
    'sync_cursors',
    'sync_operations',
    'synced_entities'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR ALL TO authenticated
         USING (school_id = public.jwt_school_id())
         WITH CHECK (school_id = public.jwt_school_id())',
      t || '_tenant_all',
      t
    );
  END LOOP;
END $$;

-- No direct table DML for anon (sync must use SECURITY DEFINER RPCs)
REVOKE ALL ON TABLE public.schools FROM anon, authenticated;
REVOKE ALL ON TABLE public.devices FROM anon, authenticated;
REVOKE ALL ON TABLE public.students FROM anon, authenticated;
REVOKE ALL ON TABLE public.student_id_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_changes FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_cursors FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_operations FROM anon, authenticated;
REVOKE ALL ON TABLE public.synced_entities FROM anon, authenticated;

-- Authenticated may SELECT own tenant via RLS (mobile diagnostics / future clients)
GRANT SELECT ON TABLE public.schools TO authenticated;
GRANT SELECT ON TABLE public.devices TO authenticated;
GRANT SELECT ON TABLE public.students TO authenticated;
GRANT SELECT ON TABLE public.student_id_settings TO authenticated;
GRANT SELECT ON TABLE public.sync_changes TO authenticated;
GRANT SELECT ON TABLE public.sync_cursors TO authenticated;
GRANT SELECT ON TABLE public.synced_entities TO authenticated;
-- sync_operations: no SELECT for authenticated (internal outbox)

-- service_role keeps bypass for ops; grant SELECT for admin tooling
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.schools TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.students TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_id_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sync_changes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sync_cursors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sync_operations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.synced_entities TO service_role;

-- --------------------------------------------------------------------------
-- Harden register_device (no school_id hijack on conflict)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_device(
  p_id uuid,
  p_school_id uuid,
  p_device_name text,
  p_device_fingerprint text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deny jsonb;
  v_existing_school uuid;
BEGIN
  v_deny := public.tenant_access_denied(
    p_school_id,
    p_id,
    true, -- allow first registration before device row exists
    NULL
  );
  IF v_deny IS NOT NULL THEN
    RETURN v_deny;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'School tenant does not exist: ' || p_school_id::text
    );
  END IF;

  SELECT school_id INTO v_existing_school FROM public.devices WHERE id = p_id;
  IF FOUND AND v_existing_school IS DISTINCT FROM p_school_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Device is already registered to a different school'
    );
  END IF;

  INSERT INTO public.devices (
    id, school_id, device_name, device_fingerprint, last_seen_at, updated_at
  ) VALUES (
    p_id,
    p_school_id,
    COALESCE(NULLIF(trim(p_device_name), ''), 'Sofia Desktop'),
    p_device_fingerprint,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    -- school_id intentionally NOT updated — prevents tenant hijack
    device_name = EXCLUDED.device_name,
    device_fingerprint = COALESCE(
      EXCLUDED.device_fingerprint,
      public.devices.device_fingerprint
    ),
    last_seen_at = now(),
    updated_at = now()
  WHERE public.devices.school_id = EXCLUDED.school_id;

  RETURN jsonb_build_object('success', true, 'device_id', p_id);
END;
$function$;

-- --------------------------------------------------------------------------
-- Patch pull / cursor / count with shared tenant guard + device binding
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pull_sync_changes(
  p_school_id uuid,
  p_device_id uuid,
  p_cursor bigint DEFAULT 0,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_changes JSONB;
  v_count INTEGER;
  v_max_id BIGINT := COALESCE(p_cursor, 0);
  v_safe_limit INTEGER;
  v_deny jsonb;
BEGIN
  v_deny := public.tenant_access_denied(p_school_id, p_device_id, false, NULL);
  IF v_deny IS NOT NULL THEN
    RETURN v_deny;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'School tenant does not exist: ' || p_school_id::text
    );
  END IF;

  v_safe_limit := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));

  IF p_device_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.devices WHERE id = p_device_id) THEN
    UPDATE public.devices SET last_seen_at = now() WHERE id = p_device_id;
  END IF;

  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'school_id', c.school_id,
        'table_name', c.table_name,
        'record_id', c.record_id,
        'operation', c.operation,
        'payload', c.safe_payload,
        'version', c.version,
        'created_at', c.created_at
      ) ORDER BY c.id ASC
    ), '[]'::jsonb),
    COUNT(*),
    COALESCE(MAX(c.id), COALESCE(p_cursor, 0))
  INTO v_changes, v_count, v_max_id
  FROM (
    SELECT
      id,
      school_id,
      table_name,
      record_id,
      operation,
      CASE
        WHEN auth.uid() IS NULL THEN payload
        WHEN table_name = ANY (ARRAY[
          'students', 'student_id_settings', 'classes', 'subjects', 'subject_classes',
          'staff', 'staff_subjects', 'staff_classes', 'attendance_sessions', 'attendance_records',
          'ca_assessments', 'ca_scores', 'announcements', 'internal_notices',
          'academic_years', 'academic_terms', 'timetable_slots', 'exam_sessions', 'exam_papers',
          'assessment_question_papers', 'assessment_question_paper_revisions'
        ]) THEN payload - 'password_hash'
        ELSE '{}'::jsonb
      END AS safe_payload,
      version,
      created_at
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
$function$;

CREATE OR REPLACE FUNCTION public.update_sync_cursor(
  p_school_id uuid,
  p_device_id uuid,
  p_cursor bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deny jsonb;
BEGIN
  v_deny := public.tenant_access_denied(p_school_id, p_device_id, false, NULL);
  IF v_deny IS NOT NULL THEN
    RETURN v_deny;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'School tenant does not exist: ' || p_school_id::text
    );
  END IF;

  IF p_device_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.devices WHERE id = p_device_id) THEN
    INSERT INTO public.sync_cursors (device_id, school_id, last_synced_change_id, updated_at)
    VALUES (p_device_id, p_school_id, GREATEST(0, COALESCE(p_cursor, 0)), now())
    ON CONFLICT (device_id, school_id) DO UPDATE SET
      last_synced_change_id = GREATEST(
        public.sync_cursors.last_synced_change_id,
        EXCLUDED.last_synced_change_id
      ),
      updated_at = now();
    RETURN jsonb_build_object('success', true, 'cursor', p_cursor);
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'error', 'Device not registered: ' || COALESCE(p_device_id::text, 'null')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.count_pending_sync_changes(
  p_school_id uuid,
  p_cursor bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count BIGINT;
  v_deny jsonb;
BEGIN
  -- count is often called before device loop; allow JWT school or existing school only.
  -- For anon without device, still require JWT or we only allow if school exists
  -- and caller is not authenticated as another school — use allow_new_device for count.
  IF auth.uid() IS NOT NULL THEN
    v_deny := public.tenant_access_denied(p_school_id, NULL, true, NULL);
    IF v_deny IS NOT NULL THEN
      RETURN v_deny;
    END IF;
  END IF;

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
$function$;

-- --------------------------------------------------------------------------
-- Inject tenant guard into process_synced_entity / process_sync_operation
-- --------------------------------------------------------------------------

DO $$
DECLARE
  def text;
  patched text;
  marker text;
  inject text;
BEGIN
  -- process_synced_entity
  def := pg_get_functiondef(
    'public.process_synced_entity(uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  );
  marker := 'BEGIN
  -- Idempotency';
  inject := $inj$BEGIN
  -- Tenant isolation (JWT school and/or registered device)
  DECLARE
    v_tenant_deny jsonb;
  BEGIN
    v_tenant_deny := public.tenant_access_denied(p_school_id, p_device_id, false, p_payload);
    IF v_tenant_deny IS NOT NULL THEN
      RETURN v_tenant_deny;
    END IF;
  END;

  -- Idempotency$inj$;
  IF position(marker in def) = 0 THEN
    RAISE EXCEPTION 'process_synced_entity: expected Idempotency marker not found';
  END IF;
  patched := replace(def, marker, inject);
  EXECUTE patched;

  -- process_sync_operation
  def := pg_get_functiondef(
    'public.process_sync_operation(uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  );
  marker := 'BEGIN
  -- Verify device existence to respect foreign key constraint safely';
  inject := $inj$BEGIN
  -- Tenant isolation (JWT school and/or registered device)
  DECLARE
    v_tenant_deny jsonb;
  BEGIN
    v_tenant_deny := public.tenant_access_denied(p_school_id, p_device_id, false, p_payload);
    IF v_tenant_deny IS NOT NULL THEN
      RETURN v_tenant_deny;
    END IF;
  END;

  -- Verify device existence to respect foreign key constraint safely$inj$;
  IF position(marker in def) = 0 THEN
    RAISE EXCEPTION 'process_sync_operation: expected device marker not found';
  END IF;
  patched := replace(def, marker, inject);
  EXECUTE patched;
END $$;
