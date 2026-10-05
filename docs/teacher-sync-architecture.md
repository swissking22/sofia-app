# Sofia Teacher Sync Architecture

**Status:** Design + Phase A/B foundation (desktop authoritative, cloud mirror, teacher RPCs).  
**Audience:** Desktop maintainers and future React Native Teacher app authors.  
**Golden rule:** Sofia desktop remains the school’s administrative source of truth. The Teacher app consumes a **controlled subset** via Supabase Auth + SECURITY DEFINER RPCs over the existing sync mirror — never raw SQLite or unrestricted PostgREST.

---

## 1. Existing architecture

| Layer | Technology | Location |
|-------|------------|----------|
| Desktop shell | Nextron (Electron + Next.js) | `main/`, `renderer/` |
| Local DB | SQLite (`better-sqlite3`), WAL, FKs on | `{userData}/sofia.db` via `main/db/index.ts` |
| Schema | Idempotent `CREATE TABLE` + `migrate*()` | `main/db/schema.ts` |
| Domain / IPC | Repositories → IPC → renderer helpers | `main/db/repositories/`, `main/ipc/`, `renderer/lib/` |
| Cloud | Supabase Postgres + Auth + Edge Functions | `supabase/migrations/`, `supabase/functions/` |
| Desk sync | Outbox → push → pull → assets | `main/sync/` |

**Auth (two systems):**

- **Desktop:** local `users.password_hash` + sessions.
- **Teacher mobile:** Supabase Auth. Edge Function `provision-staff-auth` sets JWT `app_metadata`: `role`, `school_id`, `staff_id` (required for RPCs).

**IDs:** UUID strings (`randomUUID()`). Soft delete via `deleted_at`. Optimistic concurrency via integer `version` + `sync_status`.

---

## 2. Existing database entities (teacher-relevant)

| Entity | SQLite table(s) | Cloud path |
|--------|-----------------|------------|
| School | `schools` (+ day schedule columns) | `synced_entities` + `public.schools` tenant row |
| Day breaks | `school_day_breaks` | Synced as of Step 9a (`school_day_breaks` allowlist) |
| Academic year / term | `academic_years`, `academic_terms` | `synced_entities` |
| Levels / sections / depts | `academic_levels`, `sections`, `specializations`, `departments` | `synced_entities` |
| Class | `classes` (`class_id` enrollment on students) | `synced_entities` |
| Subject | `subjects`, `subject_classes` | `synced_entities` |
| Teacher / staff | `staff` | `synced_entities` |
| Teaching assignment | `staff_subjects` `(staff_id, class_id, subject_id)` | `synced_entities` |
| Class list helper | `staff_classes` | `synced_entities` |
| Homeroom | `classes.class_teacher_id` | Must be in school/classes payload |
| User link | `users.staff_id` | `synced_entities` (passwords never for mobile) |
| Student | `students` (`class_id` = current enrollment) | **Dedicated** `public.students` |
| Timetable | `timetable_slots` (period grid, not wall clock) | `synced_entities` |
| Attendance | `attendance_sessions`, `attendance_records` | `synced_entities` |
| CA / marks | `ca_assessments`, `ca_scores` | `synced_entities` |
| Exams | `exam_sessions`, `exam_papers`, `exam_scores` | `synced_entities` |
| Grading config | `grading_systems`, `assessment_types`, `grade_bands` | `synced_entities` |
| Announcements | `announcements`, `internal_notices` | `synced_entities` |
| Lessons | `teaching_syllabi`, `syllabus_topics`, `teaching_logs` | **Not synced** (desktop-only for now) |

There is **no separate enrollments table**. Current class membership is `students.class_id` for the active year context on desktop.

---

## 3. Existing relationships

```
School
 ├─ AcademicYear ─ AcademicTerm
 ├─ AcademicLevel / Section / Specialization / Department
 ├─ Class ──┬─ Subject (via subjects / subject_classes)
 │          ├─ Student (students.class_id)
 │          └─ AttendanceSession ─ AttendanceRecord
 ├─ Staff (teacher)
 │    └─ StaffSubject (class_id + subject_id)  ← authoritative assignment
 ├─ TimetableSlot (staff_id, class_id, subject_id, day, period)
 ├─ CaAssessment (class_id, subject_id, term) ─ CaScore (student_id)
 └─ Announcement (audience: all | class | level)
```

**Do not infer assignments from timetable alone.** `staff_subjects` is authoritative.

---

## 4. Existing synchronization mechanisms

```
Desktop write → enqueueSync(sync_queue)
       ↓
runSyncWorker
  1. pushPendingSync  → process_synced_entity | process_sync_operation (students)
  2. pullRemoteChanges → sync_changes + cursor
  3. assets (school-assets bucket)
```

| Mechanism | Role |
|-----------|------|
| `sync_queue` | Local outbox (idempotent client op UUID) |
| `synced_entities` | Cloud JSONB mirror `PK (school_id, table_name, record_id)` |
| `sync_changes` | Append-only change log (desk delta cursor) |
| `sync_operations` | Cloud idempotency by operation `id` |
| Version check | Incoming `version` &lt; cloud → **conflict** (no silent overwrite) |
| Soft delete | `deleted_at` on payload + mirror row |

Registry: `main/sync/tables.ts`. Teacher mobile does **not** use desk device cursors; it uses snapshot/filter RPCs (and optional watermark fields). Full mobile delta-cursor is Phase D.

---

## 5. Missing information required by Teacher App (pre–Phase A/B)

| Need | Gap |
|------|-----|
| Students / roster | No teacher RPC (students live on `public.students`) |
| Attendance history + offline write | Mirror exists; no teacher read/write RPC |
| Assessments + marks write | Mirror exists; no teacher RPC + max-score validation at API |
| Announcements / config / day schedule | Mirror partial; breaks were enqueue-only (unsupported) |
| Lessons | Not in sync allowlist |
| Mobile delta token | Desk-only today |
| Push notifications | No FCM/APNs abstraction yet (stub service planned) |

---

## 6. Recommended changes (smallest safe)

**Reuse, don’t replace:** extend `synced_entities` + SECURITY DEFINER RPCs. No Prisma, no Postgres rewrite of domain tables, no unrestricted table grants to `authenticated`.

| Phase | Work |
|-------|------|
| **A — Read** | RPCs: students, classes, attendance, assessments, scores, announcements, config/day schedule, bootstrap JSON |
| **A — Mirror** | Allowlist `school_day_breaks`; include day-schedule + `class_teacher_id` columns in school/class sync column lists |
| **B — Write** | `teacher_push_entity` → ownership checks → `process_synced_entity` (attendance + CA scores); mark max-score validation |
| **C — Lessons** | Only if product requires: add `teaching_*` to allowlist + RPCs |
| **D — Delta** | Teacher-filtered pull or watermark RPCs; push notifications trigger sync, not carry data |

---

## 7. API / data-contract plan

See [`teacher-api-contract.md`](./teacher-api-contract.md).

Conceptual mapping:

| Mobile need | Mechanism |
|-------------|-----------|
| Login | Supabase Auth (email/password provisioned from desktop) |
| Bootstrap | `get_teacher_bootstrap()` + existing me/assignments/timetable |
| Pull changes | Snapshot RPCs now; later watermark / `sync_changes` filter |
| Push offline mutations | `teacher_push_entity` with stable op UUID |

School context is **always** taken from JWT `app_metadata.school_id` / `staff_id`, never trusted from the client body alone.

---

## 8. Sync strategy

1. **Desktop** remains primary writer for structure (years, classes, subjects, assignments, timetable, assessments).
2. **Sync Now** on desktop pushes mirrors; Teacher app cannot invent school structure.
3. **Bootstrap** after login: call read RPCs (or `get_teacher_bootstrap`) → local RN DB.
4. **Offline outbox (mobile):** queue attendance/marks with UUID `id` + `version`; flush via `teacher_push_entity`.
5. **Idempotency:** same `p_id` → `{ success, duplicate: true }`.
6. **Tombstones:** soft-deleted rows remain in mirror with `deleted_at` so clients can drop local copies.

---

## 9. Conflict strategy

| Case | Behavior |
|------|----------|
| Push with `version` &lt; cloud | Reject: `{ conflict: true, cloud_version, incoming_version }` |
| Duplicate op UUID | Success duplicate (no double apply) |
| Admin changed mark while teacher offline | Teacher must refetch; must not force overwrite without bumping from cloud version |
| Attendance same `(session_id, student_id)` | Client uses stable record UUID; upsert by id + version |

Desktop and mobile share the same version/idempotency semantics via `process_synced_entity`.

---

## Security summary

- Role must be `teacher`.
- Data scoped to JWT school + staff assignments.
- No finance / admin passwords / other schools.
- Mutations audited via `sync_operations` (+ future teacher_audit if needed).
- Photos: URL/path references only (`photo_path`), not base64 in sync payloads.

---

## Related docs

- [`teacher-api-contract.md`](./teacher-api-contract.md)
- [`teacher-data-model.md`](./teacher-data-model.md)
- [`teacher-sync-testing.md`](./teacher-sync-testing.md)
- Product overview: [`../DOCS.md`](../DOCS.md) (Sofia Teacher + Cloud Synchronization)
