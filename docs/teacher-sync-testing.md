# Sofia Teacher Sync Testing

## Prerequisites

1. Seed desktop school with teachers, classes, subjects, students, timetable, CA assessments (`npm run seed:dev` or Light World seed).
2. Provision Supabase Auth for a teacher (`staff_id` + `school_id` in `app_metadata`).
3. Apply cloud migrations through `20261001100000_teacher_mobile_sync_phase_ab.sql`.
4. Desktop **Sync Now** so `synced_entities` / `public.students` are populated.

---

## Automated tests (repo)

| Suite | Focus |
|-------|-------|
| `tests/system-admin/…` | User/auth policy (not mobile) |
| `tests/sync/…` | Desk push/pull, allowlist, conflicts |
| `tests/teacher-sync/teacher-sync.domain.test.ts` | Assignment ownership, mark range, sync manifest |

RPC SQL is validated in Supabase (manual or CI with a linked project). Jest covers **shared domain rules** that mobile and desktop must agree on.

---

## Authorization scenarios

| # | Scenario | Expected |
|---|----------|----------|
| A1 | Teacher A JWT calls students for Teacher B’s class id | Empty or forbidden (no rows) |
| A2 | Teacher JWT with School A `school_id` cannot read School B | Exception / empty |
| A3 | Missing `staff_id` | Exception: re-provision |
| A4 | Non-teacher role | Exception: Teacher role required |
| A5 | `teacher_push_entity` for unassigned class | `{ success:false, code: FORBIDDEN_ASSIGNMENT }` |

---

## Sync scenarios

| # | Scenario | Expected |
|---|----------|----------|
| S1 | Bootstrap after Sync Now | Profile, assignments, classes, students, timetable present |
| S2 | Desktop adds assignment → Sync Now → mobile re-fetch | New assignment appears |
| S3 | Desktop soft-deletes assignment → Sync Now | Assignment absent / `deleted_at` |
| S4 | Day schedule + breaks synced | `get_teacher_config` returns periods/breaks |

---

## Attendance scenarios

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Create session + records offline; push twice same `p_id` | Second = `duplicate: true`, one mirror row |
| T2 | Push record for student not in class | Forbidden |
| T3 | Pull history for assigned class | Sessions/records returned |

---

## Marks scenarios

| # | Scenario | Expected |
|---|----------|----------|
| M1 | Score `max_score + 1` | `MARK_OUT_OF_RANGE` |
| M2 | Score `-1` | Rejected |
| M3 | Score within range, version match | Applied |
| M4 | Admin bumps version; teacher pushes stale version | `conflict: true` |
| M5 | Duplicate op UUID | Idempotent success |

---

## Academic year

| # | Scenario | Expected |
|---|----------|----------|
| Y1 | Config shows `is_current` year | Matches desktop |
| Y2 | Students still filtered by assigned classes only | No cross-year leak via client ids |

---

## End-to-end integrity checklist

```
Desktop: create teacher → assign class×subject → enroll students →
         timetable → CA assessment → Sync Now
Mobile:  login → bootstrap → verify data
Mobile:  take attendance offline → reconnect → teacher_push_entity
Mobile:  enter marks → push
Desktop: Sync Now / pull → verify attendance + scores
Conflict: edit mark on desktop → stale mobile push → conflict → refetch
```

---

## Security checks

- Finance tables never returned by teacher RPCs.
- Changing `class_id` in RPC args cannot escalate beyond assignments.
- Anon key alone cannot execute teacher RPCs without a teacher JWT.

---

## Remaining gaps (intentionally deferred)

- Lesson log sync (`teaching_*`)
- Exam score teacher writes
- Full mobile delta cursor / push notifications
- Photo binary sync (paths only)
