-- ============================================================================
-- Batch push: one RPC for many synced_entities operations.
-- Reuses process_synced_entity / process_sync_operation per item so tenant
-- guards, allow-lists, and version conflict rules stay identical.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_synced_entities_batch(
  p_school_id UUID,
  p_device_id UUID,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_idx INT := 0;
  v_results JSONB := '[]'::jsonb;
  v_one JSONB;
  v_id UUID;
  v_table TEXT;
  v_record TEXT;
  v_op TEXT;
  v_payload JSONB;
  v_legacy TEXT[] := ARRAY['students', 'student_id_settings'];
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'p_items must be a JSON array'
    );
  END IF;

  IF jsonb_array_length(p_items) > 200 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'p_items exceeds max batch size of 200'
    );
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_idx := v_idx + 1;
    BEGIN
      v_id := NULLIF(v_item ->> 'id', '')::uuid;
      v_table := NULLIF(trim(COALESCE(v_item ->> 'table_name', '')), '');
      v_record := NULLIF(trim(COALESCE(v_item ->> 'record_id', '')), '');
      v_op := upper(NULLIF(trim(COALESCE(v_item ->> 'operation', 'INSERT')), ''));
      v_payload := COALESCE(v_item -> 'payload', '{}'::jsonb);

      IF v_id IS NULL OR v_table IS NULL OR v_record IS NULL THEN
        v_one := jsonb_build_object(
          'id', v_item ->> 'id',
          'success', false,
          'error', 'Missing id, table_name, or record_id'
        );
      ELSIF v_table = ANY (v_legacy) THEN
        v_one := public.process_sync_operation(
          v_id,
          p_school_id,
          p_device_id,
          v_table,
          v_record,
          v_op,
          v_payload
        );
      ELSE
        v_one := public.process_synced_entity(
          v_id,
          p_school_id,
          p_device_id,
          v_table,
          v_record,
          v_op,
          v_payload
        );
      END IF;

      -- Echo queue id so the desk can mark rows even when the inner RPC
      -- does not repeat p_id (some conflict payloads omit it).
      IF v_id IS NOT NULL AND (
        NOT (v_one ? 'id') OR NULLIF(v_one ->> 'id', '') IS NULL
      ) THEN
        v_one := v_one || jsonb_build_object('id', v_id::text);
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_one := jsonb_build_object(
          'id', v_item ->> 'id',
          'success', false,
          'error', SQLERRM
        );
    END;

    v_results := v_results || jsonb_build_array(v_one);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed', v_idx,
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_synced_entities_batch(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_synced_entities_batch(UUID, UUID, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.process_synced_entities_batch(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_synced_entities_batch(UUID, UUID, JSONB) TO service_role;

COMMENT ON FUNCTION public.process_synced_entities_batch IS
  'Push many sync_queue items in one round-trip; delegates to process_synced_entity / process_sync_operation.';
