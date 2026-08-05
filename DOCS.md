# SOFIA — Product Documentation

Offline-first school management desktop app (Nextron: Electron + Next.js + SQLite).

**How to use this file:** Start with [Getting started](#getting-started), then open the module you need. Each section lists screens, what they do, and the usual workflow.

**Maintaining this file:** Whenever a module or feature is added or meaningfully changed, update this document in the same change (routes, how to use it, and status). See [Changelog](#changelog).

---

## Getting started

1. Launch the app (`npm run dev` in development).
2. Complete registration / first login if prompted.
3. Run the **Setup wizard** (`/setup/...`) so core school data exists before day-to-day use.
4. Use the sidebar for day-to-day modules (School, Students, Academic, …).

Items marked **Coming soon** in the sidebar are placeholders and are not documented as usable yet.

---

## Setup wizard

Initial configuration. Steps can be completed, skipped, or saved as draft.

| Step | Path | Purpose |
|------|------|---------|
| School Profile | `/setup/school-profile` | Name, codes, contact, logo/stamp/signature |
| Academic Year | `/setup/academic-year` | Current year dates + calendar events |
| Academic Structure | `/setup/academic-structure` | Levels → sections → specializations → classes |
| Grading System | `/setup/grading-system` | CA/exam weights + grade bands (A–F, etc.) |
| Staff | `/setup/staff` | Admin staff + teachers (subjects/classes) |
| Permissions | `/setup/permissions` | Roles & permissions |
| Student ID | `/setup/student-id` | ID pattern (school code, year, sequence, …) |
| Students | `/setup/students` | Bulk import / initial student load |
| Finance | `/setup/finance` | Fee-related setup |
| Documents | `/setup/documents` | Templates (report card, admission letter, receipt, certificate) |
| Communication | `/setup/communication` | SMS/channels + notification templates |
| Backup & Sync | `/setup/backup-sync` | Local backup location, sync status, test connection |

**Tip:** Finish **Academic Structure**, **Grading System**, and **Student ID** before heavy student or results work.

---

## Dashboard

| Path | Purpose |
|------|---------|
| `/home` | Overview KPIs and charts (e.g. enrollment by academic level) |

---

## School Management

Day-to-day school configuration (mirrors much of setup, editable anytime).

| Screen | Path | How to use |
|--------|------|------------|
| School Profile | `/school/profile` | Edit identity and branding assets |
| Academic Year | `/school/academic-year` | Edit year + calendar |
| Terms & Sessions | `/school/terms` | Term dates within the year |
| Classes | `/school/classes` | Manage levels, sections, specs, and classes |
| Departments | `/school/departments` | Add/edit/delete departments |
| Subjects | `/school/subjects` | Pick an **academic level**, then add subjects (classes in that level are selected by default) |

---

## Student Management

### Students list — `/students`

- **Filters:** admission year, level, department (section), search (name / student ID).
- **Actions:** Add student, Import (opens setup students importer), bulk actions (mark alumni / delete).
- Click a name to open the student profile.

### Add student — `/students/create`

Sections: **Personal**, **Admission** (class + year + type), **Guardian**.  
Student ID is **auto-generated on save** from the Student ID pattern.

### Student profile — `/students/:id`

Tabs:

| Tab | Content |
|-----|---------|
| Overview | Personal, guardian, placement |
| Academic History | Current placement (expands as promotions/transfers accumulate) |
| Documents | Files for this student; link to upload |
| Finance | Placeholder until Finance module is connected |

Use the status drawer to set **Active / Alumni / Transferred**.

### Admissions

| Screen | Path | Status |
|--------|------|--------|
| Admissions list | `/students/admissions` | **Coming soon** |
| New application | `/students/admissions/create` | Usable — submits as **pending** |

### Transfers

| Screen | Path | How to use |
|--------|------|------------|
| List | `/students/transfers` | Search outgoing transfers |
| New | `/students/transfers/create` | Pick student, destination school, date, reason → student marked **transferred** |

### Promotion

| Screen | Path | How to use |
|--------|------|------------|
| Mapping | `/students/promotion` | Choose from/to year → show class mapping (suggested next class) → adjust destinations |
| Confirm | `/students/promotion/run` | Preview counts → confirm promotion |

Classes left without a destination are skipped (e.g. graduating).

### Student documents

| Screen | Path | How to use |
|--------|------|------------|
| List | `/students/documents` | Filter by type / search |
| Upload | `/students/documents/upload` | Student + type + title + file |

Types include birth certificate, report card, ID card, medical, other.

### Alumni — `/students/alumni`

Students with status **alumni**. Filter by admission year / search. Open profile from the name.

---

## Academic Management

Typical term workflow:

1. Build **timetable** (optional for marking attendance/scores).
2. Take **attendance** as needed.
3. Create **CA** assessments and enter scores.
4. Create **exam** sessions/papers and enter scores.
5. **Process** results for class + term → **publish** (optionally lock).
6. **Generate** report cards → view/print.
7. Check **Academic Reports** for a summary dashboard.

### Timetable

| Screen | Path | How to use |
|--------|------|------------|
| Weekly grid | `/academic/timetable` | View by **Class** or **Teacher**; Mon–Fri × periods |
| Builder | `/academic/timetable/create` | Select class → drag subjects onto periods → drop saves; double-click cell to clear |

Teachers come from teaching staff set up in Staff setup.

### Attendance

| Screen | Path | How to use |
|--------|------|------------|
| Sessions | `/academic/attendance` | List past sessions; open Take or Report |
| Take | `/academic/attendance/take` | Class + date → mark Present / Absent / Late / Excused (mark-all-present available) |
| Report | `/academic/attendance/report` | Class + date range → per-student rates and totals |

### Continuous Assessment (CA)

| Screen | Path | How to use |
|--------|------|------------|
| Assessments | `/academic/ca` | List with weights; create assessment (class, subject, term, weight, max score) |
| Score entry | `/academic/ca/entry?assessment_id=` | Enter scores per student (capped at max score) |

### Examinations

| Screen | Path | How to use |
|--------|------|------------|
| Sessions | `/academic/exams` | List exam sessions and paper counts |
| Create | `/academic/exams/create` | Name, term, dates, status + one or more papers (subject, class, max score) |
| Scores | `/academic/exams/scores` | Pick a paper → enter scores |

### Results processing

Weights come from **Grading System** (e.g. CA 30% + Exam 70%). Grades use configured grade bands.

| Screen | Path | How to use |
|--------|------|------------|
| View | `/academic/results` | Select class + term → rankings / averages |
| Process | `/academic/results/process` | Run computation from CA + exam scores |
| Publish | `/academic/results/publish` | Publish, or publish & **lock** (locked runs cannot be recomputed) |

### Report cards

Requires results that are computed / published / locked for that class + term.

| Screen | Path | How to use |
|--------|------|------------|
| List | `/academic/report-cards` | Filter by class + term |
| Generate | `/academic/report-cards/generate` | Build cards for the class/term |
| View | `/academic/report-cards/view/:id` | Printable layout (header/footer from document template) |

### Academic reports — `/academic/reports`

Dashboard: counts (attendance sessions, CA, exams, published results, report cards) and class averages from recent result runs.

### Coming soon

- Assignments — `/academic/assignments`

---

## Other modules (not built yet)

Sidebar placeholders only:

- **Staff Management** (teachers directory, workload, attendance, leave)
- **Finance & Fees** (structure, billing, payments, receipts, outstanding, expenses, reports)
- **Communication** (announcements, SMS, parent messages, notices) — setup exists under Setup → Communication
- **Reports & Analytics** (cross-cutting analytics hub)
- **Documents** (admission letters, certificates, transcripts, …) — template setup exists under Setup → Documents
- **System Administration** (users/roles, audit, backup UI under admin — backup setup also under Setup)
- **Help & Support**

---

## Architecture notes (for developers)

| Layer | Location |
|-------|----------|
| UI pages | `renderer/pages/...` |
| IPC helpers | `renderer/lib/...` |
| Navigation | `renderer/lib/navigation.ts` (`comingSoon` until built) |
| IPC handlers | `main/ipc/` |
| Repositories | `main/db/repositories/` |
| Schema / migrations | `main/db/schema.ts` |
| Types | `main/db/types.ts` |
| System rules | `RULES.md` (offline-first, soft delete, sync queue, no shadcn) |

**Patterns:** Soft deletes (`deleted_at`), sync fields on every table, repositories enqueue sync, renderer talks to main via `window.ipc.invoke` only (no REST).

**After schema/IPC changes:** restart the Nextron process so migrations and handlers reload.

Key libs for built modules:

- Students: `renderer/lib/student-mgmt.ts` → `main/ipc/student-mgmt.ts`
- Academic: `renderer/lib/academic-mgmt.ts` → `main/ipc/academic-mgmt.ts`
- School structure: `renderer/lib/academic-structure.ts`, `subjects.ts`, `departments.ts`, `academic-year.ts`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-05 | Initial documentation: Setup, School Management, Student Management, Academic Management (timetable through reports). Admissions list and Assignments still coming soon. |

When you add a module: update the relevant section, remove it from “Coming soon” if applicable, and add a Changelog row.
