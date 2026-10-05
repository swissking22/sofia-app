# Sofia Teacher API Contract

**Transport:** Supabase client (JWT) → Postgres RPCs (`SECURITY DEFINER`).  
**Version:** Conceptual **v1** (function names are the version surface; prefer additive RPCs over breaking column renames).  
**Auth:** Bearer access token. `app_metadata.role = 'teacher'`, `school_id` (UUID), `staff_id` (staff UUID text).

All errors from JWT helper raise SQL exceptions with stable messages. Prefer mapping them in the mobile client to codes below.

---

## Error codes (mobile mapping)

| Code | Typical cause |
|------|----------------|
| `NOT_AUTHENTICATED` | No JWT |
| `TEACHER_ROLE_REQUIRED` | Wrong / missing role |
| `MISSING_SCHOOL_ID` | Invalid `app_metadata.school_id` |
| `MISSING_STAFF_ID` | Re-provision Auth from desktop |
| `FORBIDDEN_ASSIGNMENT` | Class/subject not assigned to teacher |
| `MARK_OUT_OF_RANGE` | Score &lt; 0 or &gt; assessment `max_score` |
| `MARK_CONFLICT` / `VERSION_CONFLICT` | Incoming version &lt; cloud |
| `UNSUPPORTED_TABLE` | Write table not in teacher allowlist |
| `VALIDATION_ERROR` | Bad args (dates, day_of_week, etc.) |

RPC JSON write responses:

```json
{ "success": true, "duplicate": false }
{ "success": true, "duplicate": true, "status": "applied" }
{ "success": false, "conflict": true, "cloud_version": 3, "incoming_version": 2 }
{ "success": false, "error": "…", "code": "FORBIDDEN_ASSIGNMENT" }
```

---

## Read RPCs (v1)

### Existing (migration `20260923200000_teacher_mobile_rpcs.sql`)

| RPC | Returns |
|-----|---------|
| `get_teacher_me()` | `staff_id`, `school_id`, `full_name`, `school_name`, `email`, `employee_code` |
| `get_teacher_assignments()` | `assignment_id`, `staff_id`, `class_id`, `class_name`, `subject_id`, `subject_name` |
| `get_teacher_timetable(p_day_of_week int default null)` | Slots; `day_of_week` **1=Mon…7=Sun** |

### Extended (migration `20261001100000_teacher_mobile_sync_phase_ab.sql`)

| RPC | Purpose |
|-----|---------|
| `get_teacher_classes()` | Distinct classes from assignments + meta |
| `get_teacher_students(p_class_id text default null)` | Roster from `public.students` for assigned classes only |
| `get_teacher_attendance_sessions(p_class_id, p_from, p_to)` | Sessions for assigned classes |
| `get_teacher_attendance_records(p_session_id, p_class_id, p_from, p_to)` | Records for those sessions |
| `get_teacher_assessments(p_class_id text default null, p_subject_id text default null)` | CA assessments for assigned pairs |
| `get_teacher_scores(p_assessment_id text default null)` | CA scores for those assessments |
| `get_teacher_announcements()` | Sent announcements for school / class / level audience |
| `get_teacher_config()` | Current year/terms, grading bands, day schedule + breaks |
| `get_teacher_bootstrap()` | JSON bundle of the above for first login |

**Authorization:** every row is filtered by JWT `school_id` + `staff_id` → `staff_subjects`. Client-supplied `class_id` / `subject_id` / `assessment_id` are **intersected** with assignments (never trusted alone).

---

## Write RPC (v1)

### `teacher_push_entity(p_id uuid, p_table_name text, p_record_id text, p_operation text, p_payload jsonb)`

Allowed tables:

- `attendance_sessions`
- `attendance_records`
- `ca_scores`

Operations: `INSERT` | `UPDATE` | `DELETE` (soft via payload `deleted_at`).

Rules:

1. `p_id` = client operation UUID (idempotent).
2. School id forced from JWT (payload `school_id` overwritten).
3. Ownership:
   - Session: `class_id` ∈ teacher’s assigned classes.
   - Record: parent session’s class assigned; `student_id` must belong to that class (`public.students`).
   - Score: parent `ca_assessments` `(class_id, subject_id)` assigned; `score` within `[0, max_score]` when present.
4. Delegates to `process_synced_entity` (same version/conflict/idempotency as desk sync).
5. `p_device_id` is null for mobile (optional future teacher devices table).

---

## Bootstrap shape (`get_teacher_bootstrap`)

```json
{
  "teacher": { },
  "assignments": [ ],
  "classes": [ ],
  "students": [ ],
  "timetable": [ ],
  "assessments": [ ],
  "scores": [ ],
  "attendance": [ ],
  "announcements": [ ],
  "config": { },
  "server_time": "ISO-8601",
  "sync_token": null
}
```

`sync_token` is reserved for Phase D (cursor). Until then clients may store `server_time` / max `updated_at` / `version` per entity locally.

---

## Conceptual REST mapping (for RN docs only)

Sofia does **not** ship a separate HTTP API server. Equivalent:

| Concept | RPC |
|---------|-----|
| `POST /auth/login` | Supabase `signInWithPassword` |
| `GET /teacher/me` | `get_teacher_me` |
| `GET /sync/bootstrap` | `get_teacher_bootstrap` |
| `GET /sync/changes` | Phase D / watermark RPCs |
| `POST /sync/push` | `teacher_push_entity` |
| `GET /classes` | `get_teacher_classes` |
| `GET /students` | `get_teacher_students` |
| `GET /timetable` | `get_teacher_timetable` |
| `GET/POST /attendance` | read RPC + `teacher_push_entity` |
| `GET/POST /marks` | assessments/scores + `teacher_push_entity` |
| `GET /announcements` | `get_teacher_announcements` |

---

## What mobile must NOT call

- Direct PostgREST on `synced_entities`, `students`, finance tables
- Desk RPCs: `process_synced_entity`, `pull_sync_changes` (unless a future teacher-scoped variant is published)
- Service role keys in the app binary

---

## Provisioning

Desktop creates/updates Auth via `main/services/cloud-auth.ts` → Edge Function `provision-staff-auth`.  
Ops script: `npx tsx scripts/provision-teacher-auth.ts` (needs `SUPABASE_SERVICE_ROLE_KEY` for fallback).  
After metadata changes: **sign out / sign in** on mobile to refresh JWT.
