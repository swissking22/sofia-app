# SOFIA — Product Documentation

Offline-first school management desktop app (Nextron: Electron + Next.js + SQLite).

**How to use this file:** Start with [Getting started](#getting-started), then open the module you need. Each section lists screens, what they do, and the usual workflow.

**Maintaining this file:** Whenever a module or feature is added or meaningfully changed, update this document in the same change (routes, how to use it, and status). See [Changelog](#changelog).

---

## Getting started

1. Launch the app (`npm run dev` in development).
2. Complete registration / first login if prompted — **or** use [seed demo logins](#seed-demo-logins) after running the seeder.
3. Run the **Setup wizard** (`/setup/...`) so core school data exists before day-to-day use (skip if you loaded seed data).
4. Use the sidebar for day-to-day modules (School, Students, Academic, …).

Items marked **Coming soon** in the sidebar are placeholders and are not documented as usable yet.

### Seed demo logins

For local testing with realistic data, seed the development database then sign in:

```bash
npm run seed:dev    # resets & seeds Electron development sofia.db
# or
npm run seed        # writes data/sofia.seed.db
```

| Email | Password | School |
|-------|----------|--------|
| `admin@greenfield.demo` | `Sofia@Demo1` | Greenfield Secondary School |
| `admin@sunrise.demo` | `Sofia@Demo1` | Sunrise Academy |

Restart the app after `seed:dev` so Electron picks up the new database. Seed data includes academics, staff, ~300 students, finance (paid / partial / unpaid invoices), expenses, and attendance.

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

Consistent UI across all student routes: filters at top, clean tables, status badges, drawers/modals for quick actions (`renderer/components/students/ui.tsx`).

### Students list — `/students`

- **Filters:** admission year, level, department (section), search (name / student ID).
- **Actions:** Add student, Import (opens setup students importer), bulk actions (mark alumni / delete).
- Click a name to open the student profile.

### Add student — `/students/create`

Sections: **Personal**, **Admission** (level → department → specialization if any → class, plus year + type), **Guardian** (name and phone required).  
Student ID is **auto-generated on save** from the Student ID pattern.

### Student profile — `/students/:id`

Tabs:

| Tab | Content |
|-----|---------|
| Overview | Personal, guardian, placement |
| Academic History | Current placement (expands as promotions/transfers accumulate) |
| Documents | Files for this student; link to upload |
| Finance | Outstanding, invoices, and payments from Finance & Fees |

Use the status drawer to set **Active / Alumni / Transferred**.

### Admissions

| Screen | Path | How to use |
|--------|------|------------|
| List | `/students/admissions` | Filter by status / year / search. **Review** pending apps in a drawer. |
| New application | `/students/admissions/create` | Capture applicant details + optional **4×4 / passport photo** (crop to square on upload; starts as **pending**) |

**Approve** assigns a class (preferred class pre-filled when set), generates a student ID, creates an active student (photo carries over when uploaded), and marks the application **accepted**.  
**Reject** marks the application **rejected** (optional note).

Review drawer shows the applicant photo when present.

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

## Staff Management

Shared list/filter UI mirrors Student Management (`renderer/components/staff/ui.tsx` → student UI primitives). Create/delete/approve actions respect `meta.can_manage`. No photos or salary fields.

### Teachers

| Screen | Path | How to use |
|--------|------|------------|
| List | `/staff/teachers` | Filter by search, status, department, job role. Actions drawer: view/edit or delete (managers). |
| Add | `/staff/teachers/create` | Personal + role fields; multi-select subjects/classes/homeroom. Employee ID auto-generated if blank. |
| Profile / edit | `/staff/teachers/:id` | Edit the same fields; assignments shown as checkboxes. |

### Staff directory

| Screen | Path | How to use |
|--------|------|------------|
| List | `/staff/directory` | All staff; filter by status, staff type, job role. **Add Staff** opens a drawer for administrative roles (support/admin). |
| Detail | `/staff/directory/:id` | Text-only profile: personal, role, department, contact, assignments. |

### Teacher workload — `/staff/workload`

Summary table of periods / subjects / classes from the timetable, with **Over max** and **Conflict** badges. Click a row for a drawer with weekly timetable slots.

### Teacher attendance — `/staff/attendance`

Tabs:

| Tab | How to use |
|-----|------------|
| Daily | Pick date → mark status per teacher (or Mark all Present) → Save |
| Monthly | Year/month summary → Export CSV / Print |
| History | Pick a teacher → attendance history |

### Leave management — `/staff/leave`

Notifications strip at top (mark read). Tabs:

| Tab | How to use |
|-----|------------|
| Requests | List; managers approve/reject pending; staff can cancel own pending |
| Balances | Entitled / used / remaining by leave type |
| Calendar | Approved leave for the selected month |
| Apply | Leave type, dates, reason (managers may apply on behalf of a staff member) |

---

## Finance & Fees

Shared list/filter UI mirrors Student Management (`renderer/components/finance/ui.tsx` → student UI primitives). Create/adjust/record actions respect `meta.can_manage` (admin/secretary); teachers can view lists and reports. No payroll module — expense category **Salaries** is a label only. Print via browser print; export summaries as CSV (no PDF library).

Fee categories and currency come from Setup → Finance. Receipt header/footer use the document template with key `receipt` when present.

| Screen | Path | How to use |
|--------|------|------------|
| Fee structure | `/finance/fee-structure` | List packages with total, year, level/class, active badge. Managers create structures with fee lines (category or custom name, amount, frequency, mandatory, late fee). Activate/deactivate or soft-delete. |
| Student billing | `/finance/billing` | Filter invoices by status/search. Generate for one student (structure, due date, carry arrears, discount) or bulk by class/structure. Drawer shows lines and allows adjustments. |
| Payments | `/finance/payments` | Payment history. Record against an outstanding invoice (amount, method, reference, optional use of credit). Success shows receipt number with link. |
| Receipts | `/finance/receipts` | List + search. View/print drawer or full page `/finance/receipts/:id`. Managers can log a reprint. |
| Outstanding | `/finance/outstanding` | Toggle student vs class grouping; aging columns (current / 1–30 / 60+). Select students and send in-app fee reminders. |
| Expenses | `/finance/expenses` | List with date filters. Create: category, amount, date, vendor, description, method, optional recurring. |
| Financial reports | `/finance/reports` | Date range → cards for revenue, collected, outstanding, expenses, P&L; tables by payment method and expense category; Export CSV. |

Student profile **Finance** tab shows outstanding, credit, invoices, and payments for that student.

---

## Other modules (not built yet)

Sidebar placeholders only:

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
- Staff: `renderer/lib/staff-mgmt.ts` → `main/ipc/staff-mgmt.ts`
- Finance: `renderer/lib/finance-mgmt.ts` → `main/ipc/finance-mgmt.ts`
- Academic: `renderer/lib/academic-mgmt.ts` → `main/ipc/academic-mgmt.ts`
- School structure: `renderer/lib/academic-structure.ts`, `subjects.ts`, `departments.ts`, `academic-year.ts`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-06 | Seed system (`npm run seed` / `seed:dev`): Faker-based SQLite demo data (2 schools, academics, staff, 300 students, finance 40/40/20 pay mix, attendance). Login `admin@greenfield.demo` / `Sofia@Demo1`. |
| 2026-08-06 | Unit tests (Jest): finance & staff service-layer coverage (billing, payments, expenses, outstanding, attendance, leave) + demo scenarios; shared domain helpers in `main/domain/`. Run with `npm test`. |
| 2026-08-06 | App branding: official SOFIA logo/icon from `renderer/assets/images` used in auth, sidebar, setup, 404, and Electron window/dock icons (`resources/icon.*`). |
| 2026-08-06 | Finance & Fees module: fee structures, invoices (partial pay + arrears), payments/receipts, student credits, expenses, ledger + audit log, outstanding aging, reports; IPC `finance-mgmt:*`; sidebar unlocked. |
| 2026-08-06 | Finance & Fees UI: fee structures, billing, payments, receipts (print), outstanding + reminders, expenses, reports (CSV); sidebar unlocked; student Finance tab wired to `finance-mgmt:student-summary`. |
| 2026-08-06 | Staff Management module: schema (employee code, leave, teacher attendance, notifications), IPC `staff-mgmt:*`, pages under `/staff/*`, sidebar unlocked. No payroll or staff photos. |
| 2026-08-06 | Staff Management UI: teachers, directory, workload, attendance (daily/monthly/history), and leave (requests/balances/calendar/apply) with shared staff UI patterns. |
| 2026-08-06 | Admissions: optional 4×4 / passport photo upload on new applications; photo shown in review drawer and carried to student profile on approve. |
| 2026-08-06 | Student Management UI redo: shared FilterBar/table/drawer/badge patterns across all student routes; debounced search; row quick actions; admissions approve confirm; document open links; profile transfers history. |
| 2026-08-06 | Admissions list: pending/accepted/rejected filters; approve creates student; reject with optional note. Add student: guardian name/phone required; admission class picker split into level → department → specialization → class. |
| 2026-08-05 | Initial documentation: Setup, School Management, Student Management, Academic Management (timetable through reports). Admissions list and Assignments still coming soon. |

When you add a module: update the relevant section, remove it from “Coming soon” if applicable, and add a Changelog row.
