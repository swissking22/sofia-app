# Sofia Teacher Data Model

DTOs describe what the Teacher app should persist. Field names match RPC columns / JSON keys unless noted. Desktop internal columns may be richer; **do not** sync sensitive admin fields.

---

## Identity & tenancy

| Field | Source | Notes |
|-------|--------|-------|
| `staff_id` | JWT + `staff` mirror | Teacher primary key |
| `school_id` | JWT | Never trust client override |
| `user_id` | optional `staff.user_id` | Desktop login link |
| `academic_year_id` | `academic_years` where `is_current` | From config RPC |

---

## Teacher profile

| Field | Notes |
|-------|-------|
| `staff_id`, `school_id` | Required |
| `full_name`, `email`, `employee_code` | From `get_teacher_me` |
| `phone`, `department_id`, `job_role`, `status` | Optional extensions from `staff` payload later |
| Photo | Not in v1 RPC; use future signed URL if needed |

---

## TeacherAssignment

Authoritative: `staff_subjects`.

| Field | Notes |
|-------|-------|
| `assignment_id` | Row id |
| `staff_id`, `class_id`, `subject_id` | Required pair |
| `class_name`, `subject_name` | Denormalized for UI |
| `academic_year_id` | Implicit current year on desktop; multi-year later |

---

## Class

| Field | Notes |
|-------|-------|
| `class_id`, `school_id`, `name` | |
| `academic_level_id`, `section_id`, `specialization_id` | Structure |
| `class_teacher_id` | Homeroom (may be another teacher) |
| `is_active` | |

Levels/sections (Form 1…U6, General/Commercial/Technical) come from school-configured tables — **not hard-coded** in mobile.

---

## Student & enrollment

No separate enrollment entity in Sofia today.

| Field | Notes |
|-------|-------|
| `student_id` | UUID |
| `school_id`, `class_id` | Enrollment = current `class_id` |
| `student_code`, `name` / `fullName` | Cloud `public.students.name` |
| `gender`, `date_of_birth` | Optional |
| `status` | e.g. active |
| `photo_path` | Reference only |

Filter: student.class_id ∈ teacher’s assigned class ids.

---

## Subject

| Field | Notes |
|-------|-------|
| `subject_id`, `school_id`, `name` | |
| `class_id` / `department_id`, `coefficient` | As configured |

---

## Timetable entry

| Field | Notes |
|-------|-------|
| `slot_id` | |
| `staff_id`, `class_id`, `subject_id` | |
| `day_of_week` | **1=Mon … 7=Sun** |
| `period_number` | 1…N |
| `room` | Optional |
| Clock times | Derived from `get_teacher_config().day_schedule` + breaks — not stored on the slot |

---

## Attendance

### Session

| Field | Notes |
|-------|-------|
| `id` | Stable UUID (client-generated offline) |
| `school_id`, `class_id`, `session_date` | ISO date |
| `notes` | Optional |
| `version` | Required for push |

### Record

| Field | Notes |
|-------|-------|
| `id` | Stable UUID |
| `session_id`, `student_id` | |
| `status` | Desktop default `present`; use school conventions (`absent`, `late`, …) |
| `version` | |

---

## Assessment & mark (CA path v1)

### Assessment (`ca_assessments`)

| Field | Notes |
|-------|-------|
| `id`, `school_id`, `name` | |
| `class_id`, `subject_id`, `term_id`, `academic_year_id` | |
| `max_score`, `weight_percent`, `assessment_date` | |

### Mark (`ca_scores`)

| Field | Notes |
|-------|-------|
| `id`, `assessment_id`, `student_id` | |
| `score` | Validated ≤ `max_score`, ≥ 0 |
| `score_status` | e.g. `recorded` |
| `version` | Conflict detection |

Exam papers/scores are mirrored for future read-only; teacher write path v1 is CA-only.

---

## Announcement

| Field | Notes |
|-------|-------|
| `id`, `school_id`, `title`, `body` | |
| `audience_type` | `all` \| `class` \| `level` |
| `class_id` / `academic_level_id` | When scoped |
| `status`, `sent_at` | Prefer `sent` |

---

## School configuration (safe subset)

| Field | Notes |
|-------|-------|
| School name / code / logo path | |
| Current academic year + terms | |
| Grading system + grade bands + assessment types | |
| Day schedule: start/end, period length, periods/day, breaks | |

**Excluded:** finance, bank, admin passwords, other schools, full audit dumps.

---

## Lessons (future)

`teaching_logs` local columns: `staff_id`, `class_id`, `subject_id`, `lesson_date`, topic/progress fields. **Not in cloud allowlist yet** — do not depend on them in mobile v1.

---

## Sync metadata (every mutable row)

| Field | Role |
|-------|------|
| `id` | Stable UUID |
| `created_at`, `updated_at` | ISO timestamps |
| `deleted_at` | Tombstone |
| `version` | Optimistic concurrency |
| `sync_status` | Desktop local outbox (`pending`/`synced`) |

Cloud mirror also stores `synced_entities.updated_at` / `deleted_at` / `version`.
