-- ============================================================================
-- Sofia Teacher (Expo) mobile API — read RPCs over synced_entities
-- ============================================================================
-- Desktop sync stores staff_subjects / timetable_slots / classes / subjects as
-- JSON rows in public.synced_entities. Mobile Auth users have app_metadata:
--   role, school_id, staff_id (set by Edge Function provision-staff-auth).
-- These SECURITY DEFINER RPCs unpack that mirror for the signed-in teacher.
-- day_of_week: 1 = Monday … 7 = Sunday (matches desktop timetable_slots).
-- ============================================================================

CREATE OR REPLACE FUNCTION public._teacher_jwt_claims()
RETURNS TABLE (
  role text,
  school_id uuid,
  staff_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_school text;
  v_staff text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_role := lower(trim(COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '')));
  v_school := trim(COALESCE(auth.jwt() -> 'app_metadata' ->> 'school_id', ''));
  v_staff := trim(COALESCE(auth.jwt() -> 'app_metadata' ->> 'staff_id', ''));

  IF v_role <> 'teacher' THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;
  IF v_school = '' OR v_school !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Missing or invalid app_metadata.school_id';
  END IF;
  IF v_staff = '' THEN
    RAISE EXCEPTION 'Missing app_metadata.staff_id — re-provision teacher Auth from Sofia desktop';
  END IF;

  role := v_role;
  school_id := v_school::uuid;
  staff_id := v_staff;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public._teacher_jwt_claims() FROM PUBLIC;
-- Internal helper; not granted to anon/authenticated.

-- ---------------------------------------------------------------------------
-- get_teacher_me()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_me()
RETURNS TABLE (
  staff_id text,
  school_id uuid,
  full_name text,
  school_name text,
  email text,
  employee_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  RETURN QUERY
  SELECT
    v_claims.staff_id,
    v_claims.school_id,
    COALESCE(staff_row.payload ->> 'full_name', '')::text,
    COALESCE(
      (SELECT s.name FROM public.schools s
       WHERE s.id = v_claims.school_id AND s.deleted_at IS NULL
       LIMIT 1),
      (SELECT se.payload ->> 'name'
       FROM public.synced_entities se
       WHERE se.school_id = v_claims.school_id
         AND se.table_name = 'schools'
         AND se.record_id = v_claims.school_id::text
         AND se.deleted_at IS NULL
       LIMIT 1),
      ''
    )::text,
    NULLIF(staff_row.payload ->> 'email', '')::text,
    NULLIF(staff_row.payload ->> 'employee_code', '')::text
  FROM (SELECT 1) AS _
  LEFT JOIN public.synced_entities staff_row
    ON staff_row.school_id = v_claims.school_id
   AND staff_row.table_name = 'staff'
   AND staff_row.record_id = v_claims.staff_id
   AND staff_row.deleted_at IS NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_teacher_assignments()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_assignments()
RETURNS TABLE (
  assignment_id text,
  staff_id text,
  class_id text,
  class_name text,
  subject_id text,
  subject_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  RETURN QUERY
  SELECT
    COALESCE(a.payload ->> 'id', a.record_id)::text AS assignment_id,
    v_claims.staff_id,
    (a.payload ->> 'class_id')::text AS class_id,
    COALESCE(c.payload ->> 'name', '')::text AS class_name,
    (a.payload ->> 'subject_id')::text AS subject_id,
    COALESCE(s.payload ->> 'name', '')::text AS subject_name
  FROM public.synced_entities a
  LEFT JOIN public.synced_entities c
    ON c.school_id = a.school_id
   AND c.table_name = 'classes'
   AND c.record_id = (a.payload ->> 'class_id')
   AND c.deleted_at IS NULL
  LEFT JOIN public.synced_entities s
    ON s.school_id = a.school_id
   AND s.table_name = 'subjects'
   AND s.record_id = (a.payload ->> 'subject_id')
   AND s.deleted_at IS NULL
  WHERE a.school_id = v_claims.school_id
    AND a.table_name = 'staff_subjects'
    AND a.deleted_at IS NULL
    AND (a.payload ->> 'staff_id') = v_claims.staff_id
    AND NULLIF(a.payload ->> 'class_id', '') IS NOT NULL
    AND NULLIF(a.payload ->> 'subject_id', '') IS NOT NULL
  ORDER BY class_name ASC, subject_name ASC;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_teacher_timetable(p_day_of_week)
-- day_of_week: 1=Mon … 7=Sun (desktop convention). NULL = all days.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_timetable(
  p_day_of_week integer DEFAULT NULL
)
RETURNS TABLE (
  slot_id text,
  class_id text,
  class_name text,
  subject_id text,
  subject_name text,
  day_of_week integer,
  period_number integer,
  room text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims record;
BEGIN
  SELECT * INTO v_claims FROM public._teacher_jwt_claims();

  IF p_day_of_week IS NOT NULL AND (p_day_of_week < 1 OR p_day_of_week > 7) THEN
    RAISE EXCEPTION 'p_day_of_week must be NULL or 1–7 (Mon–Sun)';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(t.payload ->> 'id', t.record_id)::text AS slot_id,
    (t.payload ->> 'class_id')::text AS class_id,
    COALESCE(c.payload ->> 'name', '')::text AS class_name,
    NULLIF(t.payload ->> 'subject_id', '')::text AS subject_id,
    COALESCE(s.payload ->> 'name', '')::text AS subject_name,
    NULLIF(t.payload ->> 'day_of_week', '')::integer AS day_of_week,
    NULLIF(t.payload ->> 'period_number', '')::integer AS period_number,
    NULLIF(t.payload ->> 'room', '')::text AS room
  FROM public.synced_entities t
  LEFT JOIN public.synced_entities c
    ON c.school_id = t.school_id
   AND c.table_name = 'classes'
   AND c.record_id = (t.payload ->> 'class_id')
   AND c.deleted_at IS NULL
  LEFT JOIN public.synced_entities s
    ON s.school_id = t.school_id
   AND s.table_name = 'subjects'
   AND s.record_id = (t.payload ->> 'subject_id')
   AND s.deleted_at IS NULL
  WHERE t.school_id = v_claims.school_id
    AND t.table_name = 'timetable_slots'
    AND t.deleted_at IS NULL
    AND (t.payload ->> 'staff_id') = v_claims.staff_id
    AND NULLIF(t.payload ->> 'class_id', '') IS NOT NULL
    AND (
      p_day_of_week IS NULL
      OR NULLIF(t.payload ->> 'day_of_week', '')::integer = p_day_of_week
    )
  ORDER BY
    NULLIF(t.payload ->> 'day_of_week', '')::integer ASC NULLS LAST,
    NULLIF(t.payload ->> 'period_number', '')::integer ASC NULLS LAST,
    class_name ASC;
END;
$$;

-- Grants: authenticated teachers only (not anon)
REVOKE ALL ON FUNCTION public.get_teacher_me() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_teacher_assignments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_teacher_timetable(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_teacher_me() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_assignments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_timetable(integer) TO authenticated;
