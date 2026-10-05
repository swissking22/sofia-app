-- Improve teacher assignment/class display names for mobile bootstrap.
-- Fall back to the subject's class when staff_subjects.class_id join misses,
-- and prefer non-empty trimmed names from classes / academic levels / sections.

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
    COALESCE(
      NULLIF(a.payload ->> 'class_id', ''),
      NULLIF(s.payload ->> 'class_id', '')
    )::text AS class_id,
    COALESCE(
      NULLIF(TRIM(c.payload ->> 'name'), ''),
      NULLIF(TRIM(c2.payload ->> 'name'), ''),
      NULLIF(TRIM(al.payload ->> 'name'), ''),
      NULLIF(
        TRIM(
          CONCAT_WS(
            ' ',
            NULLIF(TRIM(al.payload ->> 'name'), ''),
            NULLIF(TRIM(sec.payload ->> 'name'), '')
          )
        ),
        ''
      ),
      ''
    )::text AS class_name,
    (a.payload ->> 'subject_id')::text AS subject_id,
    COALESCE(NULLIF(TRIM(s.payload ->> 'name'), ''), '')::text AS subject_name
  FROM public.synced_entities a
  LEFT JOIN public.synced_entities s
    ON s.school_id = a.school_id
   AND s.table_name = 'subjects'
   AND s.record_id = (a.payload ->> 'subject_id')
   AND s.deleted_at IS NULL
  LEFT JOIN public.synced_entities c
    ON c.school_id = a.school_id
   AND c.table_name = 'classes'
   AND c.record_id = (a.payload ->> 'class_id')
   AND c.deleted_at IS NULL
  LEFT JOIN public.synced_entities c2
    ON c2.school_id = a.school_id
   AND c2.table_name = 'classes'
   AND c2.record_id = COALESCE(NULLIF(a.payload ->> 'class_id', ''), NULLIF(s.payload ->> 'class_id', ''))
   AND c2.deleted_at IS NULL
  LEFT JOIN public.synced_entities al
    ON al.school_id = a.school_id
   AND al.table_name = 'academic_levels'
   AND al.record_id = COALESCE(c.payload ->> 'academic_level_id', c2.payload ->> 'academic_level_id')
   AND al.deleted_at IS NULL
  LEFT JOIN public.synced_entities sec
    ON sec.school_id = a.school_id
   AND sec.table_name = 'sections'
   AND sec.record_id = COALESCE(c.payload ->> 'section_id', c2.payload ->> 'section_id')
   AND sec.deleted_at IS NULL
  WHERE a.school_id = v_claims.school_id
    AND a.table_name = 'staff_subjects'
    AND a.deleted_at IS NULL
    AND (a.payload ->> 'staff_id') = v_claims.staff_id
    AND COALESCE(NULLIF(a.payload ->> 'class_id', ''), NULLIF(s.payload ->> 'class_id', '')) IS NOT NULL
    AND NULLIF(a.payload ->> 'subject_id', '') IS NOT NULL
  ORDER BY class_name ASC, subject_name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_classes()
RETURNS TABLE (
  class_id text,
  school_id uuid,
  name text,
  academic_level_id text,
  section_id text,
  specialization_id text,
  class_teacher_id text,
  is_active boolean
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
  SELECT DISTINCT ON (c.record_id)
    c.record_id::text,
    v_claims.school_id,
    COALESCE(
      NULLIF(TRIM(c.payload ->> 'name'), ''),
      NULLIF(
        TRIM(
          CONCAT_WS(
            ' ',
            NULLIF(TRIM(al.payload ->> 'name'), ''),
            NULLIF(TRIM(sec.payload ->> 'name'), '')
          )
        ),
        ''
      ),
      ''
    )::text,
    NULLIF(c.payload ->> 'academic_level_id', '')::text,
    NULLIF(c.payload ->> 'section_id', '')::text,
    NULLIF(c.payload ->> 'specialization_id', '')::text,
    NULLIF(c.payload ->> 'class_teacher_id', '')::text,
    COALESCE((c.payload ->> 'is_active')::boolean, true)
  FROM public._teacher_assigned_class_ids(v_claims.school_id, v_claims.staff_id) ac
  JOIN public.synced_entities c
    ON c.school_id = v_claims.school_id
   AND c.table_name = 'classes'
   AND c.record_id = ac.class_id
   AND c.deleted_at IS NULL
  LEFT JOIN public.synced_entities al
    ON al.school_id = v_claims.school_id
   AND al.table_name = 'academic_levels'
   AND al.record_id = (c.payload ->> 'academic_level_id')
   AND al.deleted_at IS NULL
  LEFT JOIN public.synced_entities sec
    ON sec.school_id = v_claims.school_id
   AND sec.table_name = 'sections'
   AND sec.record_id = (c.payload ->> 'section_id')
   AND sec.deleted_at IS NULL
  ORDER BY c.record_id, COALESCE(c.payload ->> 'name', '');
END;
$$;
