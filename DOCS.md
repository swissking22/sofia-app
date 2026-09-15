# SOFIA — Product Documentation

Offline-first school management desktop app (Nextron: Electron + Next.js + SQLite).

**How to use this file:** Start with [Getting started](#getting-started), then open the module you need. Each section lists screens, what they do, and the usual workflow.

**Maintaining this file:** Every code change (feature, fix, UX, IPC, schema) must update this document in the **same change**: revise the relevant section and add a Changelog row. See [Changelog](#changelog). Trivial formatting-only edits are the exception.

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
| `admin@lightworld.demo` | `Sofia@Demo1` | Light World Mission College |
| `admin@iae.demo` | `Sofia@Demo1` | International Academy of Excellence |

Restart the app after `seed:dev` so Electron picks up the new database. Seed data includes academics, staff, ~300 students, finance (paid / partial / unpaid invoices), expenses, and attendance. Light World Mission subjects are **level-scoped**: the same title (e.g. Mathematics) is one subject shared by General, Commercial, and Technical classes at that level. Re-running `npm run seed -- --dev --light-world-only` repairs LWM subjects without a full reset.

### Desktop packaging

Build installers with Nextron + electron-builder (`electron-builder.yml`). Artifacts land in `dist/`. App id / product name: `com.sofia.school` / `Sofia`. Publish target: GitHub `swissking22/sofia-app`.

```bash
npm run build:mac          # macOS DMG + ZIP (x64 and arm64); never publishes
npm run build:win          # Windows NSIS installer (x64); never publishes
npm run build:all          # macOS + Windows; never publishes
npm run build:win:publish  # Windows build + publish to GitHub Releases (CI / release tags)
```

Local SQLite always lives under Electron `userData` (`%APPDATA%\sofia\sofia.db` on Windows, `~/Library/Application Support/sofia/sofia.db` on macOS) — never inside the install directory — so app updates preserve school data. The folder name is fixed in `main/app-paths.ts` and does **not** follow electron-builder `appId` (`com.sofia.school`).

### Windows automatic updates

Packaged Windows builds check GitHub Releases once shortly after startup (`electron-updater`, only when `app.isPackaged`). Users get Sofia-styled dialogs to download and restart; `npm run dev` never contacts GitHub for updates. Version is shown under **System Administration → Settings** and on the admin overview health panel.

**Before install:** Sofia creates a SQLite-safe verified backup under `%APPDATA%\sofia\backups\pre-update\` (keeps the last 3), writes a recovery manifest + `update-state.json`, and **refuses to install** if backup creation or `PRAGMA integrity_check` fails. On the next launch, incomplete installs open `/recovery` so schools can restore the verified backup or continue safely. Recovery events append to `recovery-log.json` (no student/payment secrets).

### Application versioning

Sofia uses Semantic Versioning (`MAJOR.MINOR.PATCH`).

| Concern | Source of truth |
|---------|-----------------|
| **Application version** | `package.json` → `"version"` |
| Packaged Electron app | `app.getVersion()` (reads the packaged `package.json`) |
| Windows installer name | `electron-builder.yml` `artifactName: ${productName}-Setup-${version}.${ext}` |
| GitHub Release / updater | Tag `vMAJOR.MINOR.PATCH` (e.g. `v1.0.1`); `electron-updater` compares with **semver** against `app.getVersion()` |
| User-visible version | System Administration overview + Settings (`app.getVersion()`) |

**Do not** put a second application version in `electron-builder.yml`, the Windows workflow, or UI strings. Bump only `package.json` (and commit the matching `package-lock.json` version field), then tag `v…`.

Application version is **independent** of SQLite schema migrations and Supabase SQL migrations.

**First production release (`v1.0.0`):** `package.json` is already `1.0.0`. Commit the release candidate, then tag and push `v1.0.0` (do **not** bump beforehand). The Windows workflow publishes `Sofia-Setup-1.0.0.exe` plus `latest.yml`.

**Release a new Windows build:**

1. Bump `package.json` version only for releases after `1.0.0` (see Application versioning).
2. Tag/push `v*` so `.github/workflows/build-windows.yml` runs `npm run build:win:publish`.
3. CI sets `USE_HARD_LINKS=false`, then validates `dist/win-unpacked` with `scripts/verify-windows-packaging.ps1` — requiring `Sofia.exe`, Chromium `icudtl.dat` beside the exe (~10 MB), `resources/app.asar`, and `resources/cloud-config.json` — before trusting the NSIS installer.

Hosted sync:

- **Development:** local `.env` with `SUPABASE_URL` and `SUPABASE_ANON_KEY` (never commit `.env`). The main process loads these via `main/sync/supabase-client.ts`.
- **Packaged Windows/macOS:** public runtime config `resources/cloud-config.json` is copied into the app as `process.resourcesPath/cloud-config.json` (`electron-builder` `extraResources`). Only the project URL and anon/publishable key are bundled — never `service_role` or database passwords. The renderer never receives these values.

---

## Setup wizard

Initial configuration. Steps can be completed, skipped, or saved as draft.

| Step | Path | Purpose |
|------|------|---------|
| School Profile | `/setup/school-profile` | Name, codes, contact, logo/stamp/signature |
| Academic Year | `/setup/academic-year` | Current year dates + calendar events |
| Academic Structure | `/setup/academic-structure` | Levels → sections → specializations → classes; **school day schedule** (start/close times, period duration, breaks) for the timetable |
| Student ID Format | `/setup/student-id` | Pattern builder (default `{SCHOOL}-{SEQ}` e.g. `ABC-0001`), sequence scope (`school` continuous vs `year` / `year_level`), next sequence number counter. Student IDs are permanent school-wide identities and never change across academic years or class promotions. |
| Grading System | `/setup/grading-system` | CA/exam weights + grade bands (A–F, etc.) |
| Staff | `/setup/staff` | Admin staff + teachers (class × subject teaching assignments) |
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
| `/home` | Overview KPIs and charts (e.g. enrollment by academic level). Connectivity bar shows Online/Offline and a **Sync now** button when Phase‑1 pending changes exist (muted while offline or syncing). |

---

## School Management

Day-to-day school configuration (mirrors much of setup, editable anytime).

| Screen | Path | How to use |
|--------|------|------------|
| School Profile | `/school/profile` | Edit identity and branding assets |
| Academic Year | `/school/academic-year` | Edit year + calendar |
| Terms & Sessions | `/school/terms` | Term dates within the year |
| Classes | `/school/classes` | Manage levels, sections, specs, classes, and the school day schedule (period times + breaks). Class lists and dropdowns follow **level → section** order (Form 1 General, Commercial, Technical, then Form 2…). |
| Departments | `/school/departments` | Add/edit/delete departments |
| Subjects | `/school/subjects` | Pick an **academic level**, then add subjects (classes in that level are selected by default). One subject row per level + name is linked to every class that offers it (e.g. Form 1 Mathematics for General, Commercial, and Technical). |

---

## Student Management

Consistent UI across all student routes: filters at top, clean tables, status badges, drawers/modals for quick actions (`renderer/components/students/ui.tsx`). All data tables include a select-all checkbox header and a bottom `TableSelectionBar` allowing users to select all items at once for bulk actions (CSV export, bulk status updates, print jobs, etc.).

### Students list — `/students`

- **Filters:** admission year, level, department (section), **class**, search (name / student ID).
- **Actions:** Add student, Import (opens setup students importer), bulk actions (mark alumni / delete).
- **Class list:** **Export class list** (CSV) and **Print class list** are available for the current filter. With **All classes**, print opens `/students/class-lists?class_id=all` (one page per class).
- Click a name to open the student profile.

### Class lists — `/students/class-lists`

Printable **A4 class list** (browser Print → Save as PDF). Chrome (sidebar, search, page title) is hidden when printing.

1. Choose a **class**, or **All classes** (or open with `?class_id=` / `?class_id=all` / `?ids=` from the students list).
2. Preview the document: school logo and details, **Class list** title, class name, academic year. The letterhead and column headers repeat on every printed page.
3. Table columns: **Index**, **Name** (full width so names fit), **Sex** (M/F), plus an **empty** column for marks or signatures.
4. **All classes** prints each class on its own page (same header on every page). Export CSV is named `All classes class list.csv` and includes a Class column.
5. **Print / Save PDF** or **Export CSV**. Single-class files are named from the class (e.g. `Form 1 A class list.csv`; Save as PDF uses the same title).

IPC: `students:class-list`.

### Add student — `/students/create`

Sections: **Personal**, **Admission** (level → department → specialization if any → class, plus year + type + **Residence** day/boarding), **Guardian** (name and phone required).  
Student ID (`student_code`) is **permanently generated on save** (default `{SCHOOL}-{SEQ}` e.g. `ABC-0001`) inside a single atomic SQLite transaction with local UUID generation (`students.id`) and immediate offline outbox sync queue enqueue. The student code and internal UUID **never change** when academic years roll over, classes change, or students repeat/promote. Admission year is recorded separately in `students.admission_year`. Residence is used only to apply boarding/day fee structures.

### Student profile — `/students/:id`

Tabs:

| Tab | Content |
|-----|---------|
| Overview | Personal, guardian, placement, day/boarding residence |
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

### ID Cards — `/students/id-cards`

Data-driven student (and future staff) ID cards. Schools design a template once; Sofia fills it from existing student, school, class, and academic-year records. Generation and PDF/print work **offline**. Cloud sync only sends metadata (templates, jobs, issued-card rows) — not a requirement to print.

| Screen | Path | How to use |
|--------|------|------------|
| Dashboard | `/students/id-cards` | Active students, issued/pending/expiring counts, recent jobs. |
| Templates | `/students/id-cards/templates` | Template gallery featuring flagship institutional templates (THE HERITAGE, THE ACADEMIC, THE SIGNATURE) and school custom designs. Large side-by-side FRONT + BACK preview cards, category filters (All, Premium, Modern, Minimal, School Copies), high-resolution inspection modal, and one-click "Use Template" / "Customize" workflows (creates a school copy; system templates are protected and non-deletable). |
| Create template | `/students/id-cards/templates/new` | Wizard: type, orientation, starting layout, fields to include. |
| Designer | `/students/id-cards/designer/[id]` | Front/back canvas, drag fields, layers, school/student variables, QR/barcode, colours, millimetre sizes (default CR80). Preview with sample data or a real student. |
| Generate | `/students/id-cards/generate` | Template → year → students (person, class, or school) → new/replacement/renewal → check missing photos/IDs → generate job → print. |
| Issued cards | `/students/id-cards/issued` | Card number, verification code, status (active / replaced / revoked / expired). Replace or revoke; history is kept. |
| Print | `/students/id-cards/print?ids=` | Print-ready front+back at physical size; browser **Print → Save as PDF**. Layout uses the **template version** stored on each card. |
| Print history | `/students/id-cards/print-history` | Who printed what, when. |
| Settings | `/students/id-cards/settings` | Card number pattern (e.g. `SCH/ID/2026/00001`), expiry, motto/footer, paper defaults. |

#### Institutional Master Templates (CR80 · 85.60 × 53.98 mm Landscape)

Sofia includes three agency-grade, production-ready system templates designed to meet the highest visual standards of elite educational institutions:

1. **THE HERITAGE (Premium / Prestigious Classic Institution)**:
   - Deep navy institutional header (`#0A1E3F`), crisp white body, regal gold/champagne accent rules (`#C5A059`).
   - Heraldic academic crest with shield contour, open book of knowledge, star of excellence, and framing laurels (`DEFAULT_ACADEMIC_CREST`).
   - Vertical dividing rule between photo frame and student details; uppercase tracking typography for labels.
   - Comprehensive back design: school address, phone, email, website, return-if-found notice, official verification QR code (`{{card.verification_code}}`), Code 128 barcode (`{{student.student_id}}`), and authorized signature line (`DEFAULT_SAMPLE_SIGNATURE`).
2. **THE ACADEMIC (Modern / International School)**:
   - Contemporary geometric architecture with navy and vibrant electric blue (`#2563EB` / `#0284C7`) foundation.
   - Distinctive "STUDENT" section header, rounded photo frame, clean Swiss typography.
   - Front QR verification badge; structured back layout with clear card, student, and school contact sections, plus emergency return policy.
3. **THE SIGNATURE (Ultra-Minimal / Executive)**:
   - Ultra-premium minimalist aesthetic inspired by executive credentials.
   - Large low-opacity watermark crest centered on the back; champagne accent bar (`#C5A059`).
   - Precise micro-spacing, high-contrast dark institutional typography on light backgrounds, elegant layout with prominent student name and ID.

All templates are 100% data-driven using Sofia dynamic variables (`{{school.name}}`, `{{student.name}}`, `{{student.student_id}}`, `{{student.photo}}`, `{{academic.year}}`, `{{card.verification_code}}`, etc.). Offline vector assets are embedded as SVG data URIs, requiring no external network access. Selecting "Use Template" or "Customize" on a system template creates an independent school-scoped copy for editing while keeping system master templates locked and non-deletable.

Student photos and school logo/signature come from existing student and school profile files. QR codes carry a **verification code** (`sofia:v1:ID-…`), not extra personal data, unless you bind a field yourself.

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
| Weekly grid | `/academic/timetable` | View by **Class** or **Teacher**; Mon–Fri × periods from the school day schedule (clock times + break rows) |
| Builder | `/academic/timetable/create` | Select class → drag subjects onto periods. Period count and labels come from **Academic Structure → School day & periods**. **Common** subjects (linked to every class at the level, e.g. Mathematics for all Form 1) are written to the **same day/period for all classes at that level**. Clearing a common slot clears it across those classes when they still hold that subject. If the teacher already teaches a different subject in another class at that time, an alert blocks the save. |

A teacher is assigned to a **subject in a specific class** (not to subjects and classes independently). One teacher may teach many classes and many subjects. Timetable slots pick that assigned teacher automatically. Subjects offered to every class at an academic level are treated as shared/common so they cannot be scheduled at conflicting times for the shared teacher.

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
| Score entry | `/academic/ca/entry?assessment_id=` | Enter scores per student (capped at max score). Arrow Up/Down moves to the previous or next student. |

### Examinations

| Screen | Path | How to use |
|--------|------|------------|
| Sessions | `/academic/exams` | List exam sessions and paper counts |
| Create | `/academic/exams/create` | Name, term, dates, status + one or more papers (subject, class, max score) |
| Scores | `/academic/exams/scores` | Pick a paper → enter scores. Arrow Up/Down moves to the previous or next student. |

### Results processing

Sofia implements a school-configurable 7-step calculation pipeline for secondary education (Anglo-Saxon system in Cameroon):
1. **Sequence / CA Average**: Continuous assessment sequences (1, 2, 3, 4, or more) are averaged (simple average, weighted average, or best N) and normalized to target scale (20/20). Configurable absent/missing score policy (default: exclude absent scores from average).
2. **Subject Mark**: `(Average CA × CA Weight) + (Exam Mark × Exam Weight)`. Default is 40% CA + 60% Exam. Assessment weights must total 100%. Exam scores from different scales (e.g. 75/100) are normalized to 20/20 before weighting.
3. **Subject Coefficient**: `Weighted Subject Mark = Subject Mark × Subject Coefficient`. Every subject can have its own coefficient (e.g. Mathematics = 5, Physics = 4, English = 3).
4. **Total Weighted Marks**: `SUM(Subject Mark × Subject Coefficient)` across all applicable subjects.
5. **Total Coefficients**: `SUM(Subject Coefficients)` across all applicable subjects.
6. **Term Average**: `Total Weighted Marks / Total Coefficients`. Computed in full precision and formatted per school rounding rule (default: 2 decimal places).
7. **Pass / Fail Determination**: `Term Average >= Configured Pass Mark` (default: 10/20). Configurable per school (e.g. 8/20, 10/20, 11/20, 12/20).

| Screen | Path | How to use |
|--------|------|------------|
| Results Processing | `/academic/results` | View computed class results. Switch between **Class Results Overview** (ranked students with Total Weighted, Total Coeffs, Term Avg, Pass/Fail badge; click to view **Student Term Result Modal**) and **Subject Assessment Sheet** (all students with Seq 1..n, CA Avg, Exam, Subject Mark, Coeff, Weighted Mark; click to view step-by-step **Calculation Breakdown Modal**). Header displays class summary stats (Total Students, Processed, Incomplete, Passed, Failed, Class Average, Highest Average, Lowest Average) and compact calculation methodology card. Actions: `[Calculate Results]` (with pre-calculation validation modal and confirmation dialog showing calculation profile parameters), `[Approve Results]`, `[Publish Results]`, and `[Lock Results]`. |
| Calculation Settings | `/academic/results/calculation-settings` | Dual-mode settings: **Formula Settings** tab for quick configuration (CA Weight %, Exam Weight %, Live 100% total validator, Pass Mark out of 20, Rounding rule, Sequence combination method, Expected sequences, Absent score policy, direct link to coefficients) and **Profiles & Advanced Wizard** tab for multi-step profile lifecycle management. |
| Subject Coefficients | `/academic/results/coefficients` | Table of subjects with Code, Department, Scope, and Coefficient. Filter by class override and academic year. Click `[Edit Coefficients]` for bulk editing across all subjects and save in a transaction. Coefficients resolve hierarchically: Class + Year → Class Specific → Level → School Default → Base Subject. |
| Publish / Lock | `/academic/results/publish` | Publish, or publish & **lock** (locked runs cannot be recomputed or silently overwritten). |

**Historical Versioning & Snapshots:** When results are calculated, Sofia records the exact profile ID, profile version, configuration hash, and JSON snapshot onto the `result_runs` record. If a school later changes rules (e.g. CA 40% to 30%), previously finalized or locked results retain their original calculations.

### Report cards

Requires results that are computed / published / locked for that class + term. Report Cards consume finalized Results Processing data directly without a second calculation engine.

| Screen | Path | How to use |
|--------|------|------------|
| List | `/academic/report-cards` | Filter by class + term |
| Generate | `/academic/report-cards/generate` | Build cards for the class/term |
| View | `/academic/report-cards/view/:id` | Printable layout showing Subject, CA Avg, Exam, Subject Mark, Coefficient, Weighted Mark, Grade, and Remark, with summary cards for Total Weighted Marks, Total Coefficients, Term Average (/20), Rank, and Pass/Fail Status badge. |

### Academic reports — `/academic/reports`

Dashboard: counts (attendance sessions, CA, exams, published results, report cards) and class averages from recent result runs.

### Teaching progress — `/academic/teaching-progress`

Syllabus (subject / class / year, topics and subtopics) and a teaching logbook. Coverage percentages are calculated from topics marked covered by lesson status — teachers do not enter a percentage. Dashboard: completed / in progress / not started, expected vs actual vs calendar, ahead/on track/behind. Teachers see their own log; managers can filter by teacher, subject, and class.

### Coming soon

- Assignments — `/academic/assignments`

---

## Staff Management

Shared list/filter UI mirrors Student Management (`renderer/components/staff/ui.tsx` → student UI primitives). Create/delete/approve actions respect `meta.can_manage`. No photos or salary fields.

### Teachers

| Screen | Path | How to use |
|--------|------|------------|
| List | `/staff/teachers` | Filter by search, status, department, job role. Actions drawer: view/edit or delete (managers). |
| Add | `/staff/teachers/create` | Personal + role fields; per-class subject checkboxes (a teacher can teach many classes and many subjects); homeroom. Employee ID auto-generated if blank. |
| Profile / edit | `/staff/teachers/:id` | Same fields. Teaching assignments are class × subject, not separate subject and class lists. |

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
| Fee structure | `/finance/fee-structure` | List packages with total, year, level/class, active badge, and day/boarding applicability. Managers create structures with fee lines (tuition, boarding, dormitory, transport, …), amount, frequency, mandatory, late fee, and **Applies to** (all / day / boarding). Activate/deactivate or soft-delete. |
| Student billing | `/finance/billing` | Filter invoices by status/search. Generate for one student (structure, due date, carry arrears, discount) or bulk by class/structure. Drawer shows lines and allows adjustments. Generation is refused if the structure’s residence scope does not match the student. |
| Payments | `/finance/payments` | Payment history. Record against an outstanding invoice (amount, method, reference, optional use of credit). **Online payment** starts a request (`pending`/`processing`); Confirm/Fail/Cancel after the provider settles. A request is not a successful payment — student balance and receipt update only on verified success. |
| Receipts | `/finance/receipts` | List + search. View/print drawer or full page `/finance/receipts/:id`. Managers can log a reprint. |
| Outstanding | `/finance/outstanding` | Toggle student vs class grouping; aging columns (current / 1–30 / 60+). Select students and send in-app fee reminders. |
| Expenses | `/finance/expenses` | List with date filters. Create: category, amount, date, vendor, description, method, optional recurring. Recording an expense updates matching **budgets** and may raise spending alerts. |
| Budgeting | `/finance/budgeting` | Totals (allocated / spent / remaining / utilization) and per-category bars. Managers add configurable categories, allocate budgets by period (monthly / termly / annual / custom), and set alert / warning / critical thresholds. Spending is computed from existing Expenses. |
| Bank deposits | `/finance/bank-deposits` | Track school cash **already collected** when it is later deposited in the bank. Not a student payment method. Workflow: record (pending) → reconcile cash collections (many payments to one slip) → verify → post to ledger. Verified deposits cannot be silently edited. |
| Financial reports | `/finance/reports` | Date range → cards for revenue, collected, outstanding, expenses, P&L; tables by payment method and expense category; Export CSV. |

Boarding is a **fee component**, not a Boarding Management module. Students are Day or Boarding; there is no dormitory roster.

Student profile **Finance** tab shows outstanding, credit, invoices, and payments for that student.

---

## Communication

Channels and SMS provider are configured under **Setup → Communication**. Message templates support `{{parent_name}}`, `{{student_name}}`, `{{class_name}}`, and `{{school_name}}` placeholders. SMS and email deliveries are **queued locally** (offline-first outbox) and sync when the device is online; internal messages and parent inbox posts are available immediately in-app.

| Screen | Path | How to use |
|--------|------|------------|
| Announcements | `/communication/announcements` | Create draft broadcasts to all parents, a class, or a level. Choose SMS, email, and/or in-app parent inbox. Send when ready; sent announcements cannot be edited or deleted. |
| SMS Notifications | `/communication/sms` | Outbox of queued/sent/failed SMS and email rows. Managers compose one-off SMS (optionally linked to a student). |
| Parent Messages | `/communication/messages` | Thread list per student; managers reply via internal inbox, SMS, or email. Teachers can view threads. |
| Internal Notices | `/communication/notices` | Publish staff notices (all staff, teachers only, or admin/secretary). Fans out to staff in-app notifications. |

**Finance integration:** Outstanding fee reminders also queue SMS/email/internal parent messages when those channels are enabled (in addition to the finance reminder log).

Admin and secretary can manage all communication screens; teachers have read access to lists and threads.

---

## Reports & Analytics

Read-only analytics over live operational data (results, attendance, fees, staff). There is no second ledger or marks register. Filters always stay inside the signed-in school. Drill-down uses existing routes where they already exist. Export is CSV plus **Print / PDF** (browser print-to-PDF — Sofia does not bundle a PDF engine).

| Screen | Path | How to use |
|--------|------|------------|
| Academic performance | `/reports/academic-performance` | Filter year/term/department/class/subject/gender and official results vs CA vs exams. Cards: average, pass rate, students, subjects, best/lowest class. Tables: class, subject, ranking. Grade counts A–F. Click a class, subject, or student to narrow or open the student report. |
| Student reports | `/reports/students` | Search by name or Student ID (optional class). Generate a 360° report: profile, CA/exam subject rows, attendance, billed/paid/outstanding, previous terms, promotion runs. Print/CSV. |
| Financial reports | `/reports/financial` | Aggregates Finance & Fees: billed, collected, outstanding, expenses, net, collection rate; revenue by term/class/fee type/method; aging current / 30+ / 60+ / 90+; expenses; bank deposits vs cash collected; budget utilization. Teachers do not see this screen. Daily recording remains under Finance. |
| Attendance analytics | `/reports/attendance` | Overall rate, present/absent/late, class rates, daily/monthly trend, at-risk list (default 75%, configurable). Staff attendance summary from existing staff registers. |
| School insights | `/reports/school-insights` | Enrolment, academic, finance (if permitted), attendance, staff — plus generated insights only when calculations show decline, arrears growth, attendance risk, or budget pressure. |

Operational reports under Academic Management (`/academic/reports`) and Finance (`/finance/reports`) are unchanged.

---

## Documents

Official letter/certificate generation from existing Sofia records. There is **one** template engine (`document_templates` + `issued_documents`). Student, academic, and payment data are never copied into a parallel store.

Print / PDF uses the same browser print-to-PDF path as receipts and ID cards (A4 CSS). Restart the app after first load so numbering tables migrate.

| Screen | Path | How to use |
|--------|------|------------|
| Admission letters | `/documents/admission-letters` | Filter year/class/department/status/date. Generate or bulk-generate personalized letters from enrolled students. View / print / regenerate (previous copy is superseded, not deleted). |
| Certificates | `/documents/certificates` | Tabs: issued certificates and certificate types. Create types (leaving, completion, achievement, participation, conduct, or custom). Each issued certificate gets a unique number from the school pattern (default `{SCHOOL_CODE}/{TYPE}/{YEAR}/{SEQUENCE}`). |
| Transcripts | `/documents/transcripts` | Generate from **published or locked** result runs only. Draft terms show: “Results for {term} have not yet been finalized…”. Scope: current year, selected year/term, or full history. |
| Receipt templates | `/documents/receipt-templates` | Appearance of **Finance & Fees → Receipts**. Set one default per school. Variables such as `{{receipt.number}}` and `{{payment.amount}}`. Do not record payments here. |
| Official documents | `/documents/official` | Enrollment, recommendation, confirmation, transfer, withdrawal, plus custom types. |
| Print | `/documents/print/[id]` | Preview, print, or Save as PDF. Verification ID (`SOFIA-XXXXXX`) is on the footer. |

**Workflow:** Generate → (if the type requires approval) Issue → print. Void instead of deleting issued copies.

Templates support logo, stamp, signature (from school profile / signatories), and only registered `{{dot.keys}}`. Unknown tokens are left as-is; script tags are stripped.

---

## System Administration

School-scoped control centre. There is no platform super-admin. Session role `admin` (school owner) or named `system.*` permissions are required. Setup → Roles remains the wizard for first-time permission seeds.

| Screen | Path | How to use |
|--------|------|------------|
| Overview | `/administration` | Active users, audit volume today, last backup, sync health. |
| Users & Roles | `/administration/users` | Search/filter users. Create (temporary password, never stored in plaintext). View inherited permissions. Change role, deactivate/suspend (no delete), reset password, revoke sessions. |
| Roles | `/administration/roles` | Create/edit/duplicate custom roles. System roles cannot be deleted. Roles with assigned users cannot be deleted. Activate/deactivate. |
| Permissions | `/administration/permissions` | Live matrix of catalog permissions × school roles. |
| Audit logs | `/administration/audit-logs` | Paginated union of central `audit_events` plus finance and document audit tables. Append-only — no edit/delete API. |
| Backup & Sync | `/administration/backup-sync` | Backup now + history. Restore requires typing `RESTORE`, writes a safety backup, then queues a file replace on next launch. **Sync now** shows a spinner and stays muted while running; the button is only enabled when there are Phase‑1 pending queue changes. Retry failed / conflict keep-local or keep-remote. |
| Settings | `/administration/settings` | Timezone (default Africa/Douala), session timeout, password/lockout policy, backup retention. School identity, academics, finance numbering, and document branding stay on their existing screens. |

---

## Help & Support

| Screen | Path | How to use |
|--------|------|------------|
| Contact Sofia Support | `/help/support` | Pick a topic, describe the issue, then **Open email draft** to mail `support@sofia.school` with school/version diagnostics prefilled. **Copy email + diagnostics** if no mail client is configured. Quick links to Backup & Sync, Settings, and Dashboard. |

Documentation (`/help/docs`) remains a sidebar placeholder.

---

## Other modules (not built yet)

Sidebar placeholders only:

- **Documentation** (Help & Support)

---

## Cloud Synchronization Architecture (Supabase Mirror)

Sofia uses an offline-first architecture where the local SQLite database functions as the source of truth for offline clients, and Supabase PostgreSQL serves as the cloud synchronization backend.

- **Migrations**:
  - `supabase/migrations/20260907092153_init_cloud_sync_schema.sql` (schema foundation)
  - `supabase/migrations/20260907094133_add_process_sync_operation.sql` (Phase 1 Push Sync RPCs)
  - `supabase/migrations/20260907100737_add_pull_sync_rpcs.sql` (Phase 2 Pull Sync RPCs)
  - `supabase/migrations/20260914093000_fix_sync_operations_id_and_process_rpc.sql` (repair hosted `sync_operations.id` drift + harden RPC)
  - One-shot SQL Editor apply (schema fix + LWM tenant): `supabase/manual/APPLY_SYNC_FIX_AND_LWM_TENANT.sql`
  - LWM tenant only: `supabase/manual/provision_lwm_school.sql`
- **Cloud Tables**:
  - `public.schools`: Tenant root (`id UUID PRIMARY KEY`, `name TEXT`, `school_code TEXT`, partial unique index on `school_code`).
  - `public.devices`: Registered desktop clients (`id UUID PRIMARY KEY`, `school_id UUID REFERENCES public.schools(id)`).
  - `public.students`: Complete cloud mirror of local student records (`id UUID PRIMARY KEY`, `school_id UUID REFERENCES public.schools(id)`, `student_code TEXT`, `name TEXT NOT NULL`, `class_id TEXT NOT NULL`, `admission_year INTEGER`, `academic_level_id TEXT`, `sequence_number INTEGER`, `gender TEXT`, `date_of_birth DATE`, `phone TEXT`, `email TEXT`, `address TEXT`, `admission_type TEXT`, `guardian_*`, `status TEXT`, `photo_path TEXT`, `residence_type TEXT`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ`, `version BIGINT`). Local-only `sync_status` is excluded.
  - `public.student_id_settings`: Cloud mirror of settings (`id UUID PRIMARY KEY`, `school_id UUID UNIQUE REFERENCES public.schools(id)`, `pattern TEXT`, `sequence_scope TEXT`, `next_sequence_number INTEGER`, `version BIGINT`). Local `sync_status` is excluded.
  - `public.sync_operations`: Ingestion buffer for operations pushed from local `sync_queue` (`id UUID PRIMARY KEY`, `payload JSONB`, `operation TEXT`, `status TEXT`, `error_message TEXT`, `applied_at TIMESTAMPTZ`).
  - `public.sync_changes`: Append-only cloud change log with identity sequence (`id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`). Global change cursor for future pull sync.
  - `public.sync_cursors`: Per-device pull checkpoints (`uq_sync_cursors_device_school UNIQUE (device_id, school_id)`).
- **Identifier Rules**:
  - Direct UUID identity: local SQLite `students.id` UUID string maps 1:1 to Supabase `students.id` UUID type without translation or cloud regeneration.
  - Permanent student ID partial index: `UNIQUE INDEX idx_students_school_student_code_unique ON public.students(school_id, student_code) WHERE deleted_at IS NULL AND student_code IS NOT NULL`. Multiple `NULL` codes are allowed; soft-deleted codes do not block re-use.
  - Decoupled foreign keys: `class_id` and `academic_level_id` remain `TEXT` identifiers without cloud foreign key constraints until academic structures are synchronized.
  - Non-destructive & idempotent: `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ensure existing cloud data is never destroyed on migration re-runs.

### Phase 1: Push Synchronization Engine

Push synchronization mirrors local SQLite state to Supabase PostgreSQL without implementing remote-to-local pull sync, cursor advancement, or multi-device resolution (reserved for Phase 2).

1. **Local Outbox & Push Service (`main/sync/push.ts` - `pushPendingSync()`)**:
   - Phase 1 push tables only: `students`, `student_id_settings` (`PHASE1_SYNC_TABLES` in `main/sync/queue.ts`).
   - Before each push, `markUnsupportedPendingAsFailed()` drains other pending tables locally (no RPC) so Sync Now cannot storm on invoices/roles/cards/etc.
   - Queries Phase 1 pending rows: `SELECT * FROM sync_queue WHERE status = 'pending' AND table_name IN ('students','student_id_settings') ORDER BY created_at ASC LIMIT 50`.
   - Bulk “Retry failed” only requeues Phase 1 tables.
   - Resolves authorized school identity from the local database; rejects payload cross-tenant tampering.
   - Dispatches operations via `SupabaseSyncClient` (`@supabase/supabase-js` `.rpc()`) to `process_sync_operation` — same PostgreSQL RPC contract as before; transport only.
   - Upon successful acknowledgement, marks local `sync_queue` record as `status = 'synced'` and updates `last_attempt_at`. **Successful records are retained for auditability and debugging, never deleted.**
   - Error classification:
     - **Network error** (`ECONNREFUSED`, timeout, 5xx): retains `status = 'pending'`, increments `retry_count`, halts batch to prevent connection churn.
     - **Validation error** (unsupported table/operation, tenant mismatch, immutable field breach): marks `status = 'failed'` without endless retries.
     - **Conflict** (incoming version < cloud version): logs warning, records conflict snapshot into local SQLite `sync_conflicts` table for future resolution UI, marks `status = 'failed'`.
2. **Stable Client Device Identity (`main/sync/device.ts`)**:
   - Generates persistent UUID via `electron-store` on first installation; remains stable across application restarts and sync runs.
   - Registers device via `public.register_device(p_id, p_school_id, p_device_name, p_device_fingerprint)` RPC before pushing.
3. **Atomic Cloud Function (`public.process_sync_operation`)**:
   - Single atomic transaction with `SECURITY DEFINER` (allowing desktop app to use `anon` key without elevated `service_role` keys).
   - **Idempotency**: checks `public.sync_operations(id)`. If previously applied, immediately returns `{ success: true, duplicate: true }`. Retries permitted for failed records.
   - **Tenant Isolation**: checks `p_school_id` against `public.schools` and enforces `payload.school_id = p_school_id`. Missing-school errors return without inserting into `sync_operations` (FK-safe).
   - **Immutable Field Enforcement**: updates attempting to alter `id`, `student_code`, `sequence_number`, or `admission_year` are rejected with clear error messages.
   - **Optimistic Concurrency**: compares `incoming version` against `cloud version`. If `incoming < cloud`, returns `{ success: false, conflict: true, cloud_version: ... }`. If identical version and identical payload, treats as idempotent duplicate.
   - **Soft Delete**: `DELETE` operations set `deleted_at = now()`, increment version, and retain permanent identifier fields.
   - **Changelog Sequence**: each applied mutation inserts exactly one record into `public.sync_changes` with payload snapshot and generated identity cursor.

### Phase 2: Pull Synchronization Engine

Pull synchronization fetches remote mutations from Supabase `public.sync_changes` down to local SQLite clients, advancing checkpoints per device without causing echo loops or corrupting local data.

1. **Local Pull Service (`main/sync/pull.ts` - `pullRemoteChanges()`)**:
   - Resolves authorized school identity and persistent device ID (`main/sync/device.ts`).
   - Retrieves last pulled checkpoint from SQLite `sync_cursors` table (`main/sync/cursor.ts`). Defaults to `0` for fresh device installations to pull complete history.
   - Invokes `public.pull_sync_changes` via `SupabaseSyncClient` (`.rpc('pull_sync_changes')`) requesting ordered batches (`id > cursor ORDER BY id ASC LIMIT batchSize`).
   - Applies batch mutations to local SQLite inside an **atomic SQLite transaction** (`applyPulledChangesTransaction`):
     - **Tenant validation**: changes belonging to another school are skipped.
     - **Students table**:
       - If student does not exist locally: inserts record with exact UUID, permanent `student_code`, `sequence_number`, `admission_year`, and sets `sync_status = 'synced'`. Automatically provisions placeholder class/academic level if needed for referential integrity.
       - If student exists locally: compares versions. If `remoteVersion < localVersion`, ignores stale remote change. If `remoteVersion > localVersion`, applies remote updates preserving permanent identifiers. If local has pending outbox items in `sync_queue` for this record, logs a concurrent edit conflict into `sync_conflicts`.
       - Soft deletion: if `operation = 'DELETE'`, sets local `deleted_at = now()`, increments version, and marks `sync_status = 'synced'`.
     - **Student ID Settings table**: updates `pattern`, `sequence_scope`, and advances `next_sequence_number = MAX(local, remote)` to prevent sequence back-sliding.
     - **No echo loop**: pulled changes are applied directly to local SQLite tables with `sync_status = 'synced'` and **never enqueued into `sync_queue`**.
     - **Atomic cursor advancement**: advances local SQLite `sync_cursors.last_synced_change_id` in the **same transaction**. If any mutation fails, the entire batch rolls back and the cursor remains unchanged.
   - Upon successful local transaction commit, acknowledges cursor to Supabase via `public.update_sync_cursor` RPC.
   - Automatically paginates multi-batch backlogs until `hasMore` is false.
2. **Server-Side RPCs (`supabase/migrations/20260907100737_add_pull_sync_rpcs.sql`)**:
   - `public.pull_sync_changes(p_school_id, p_device_id, p_cursor, p_limit)`: `SECURITY DEFINER` function querying `public.sync_changes` strictly for the authorized `p_school_id` with `id > p_cursor`, returning aggregated changes JSON, counts, and `new_cursor`.
   - `public.update_sync_cursor(p_school_id, p_device_id, p_cursor)`: `SECURITY DEFINER` function upserting `public.sync_cursors` with `GREATEST(last_synced_change_id, p_cursor)`.
3. **Two-Way Sync Coordination (`main/sync/worker.ts` - `runSyncWorker()`)**:
   - Runs Push phase first (`pushPendingSync()`), followed by Pull phase (`pullRemoteChanges()`), returning aggregated counters (`processed`, `successful`, `failed`, `conflicts`). Allows granular options (`skipPush`, `skipPull`).
   - Wired seamlessly into existing IPC handlers (`backup-sync:sync-now`, `system-admin:sync-now`).

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
| Cloud sync migrations | `supabase/migrations/` |
| Types | `main/db/types.ts` |
| System rules | `RULES.md` (offline-first, soft delete, sync queue, no shadcn) |

**Patterns:** Soft deletes (`deleted_at`), sync fields on every table, repositories enqueue sync, renderer talks to main via `window.ipc.invoke` only (no REST).

**After schema/IPC changes:** restart the Nextron process so migrations and handlers reload.

Key libs for built modules:

- Students: `renderer/lib/student-mgmt.ts` → `main/ipc/student-mgmt.ts` (includes `students:class-list` for print/export rosters; helpers in `main/domain/class-list.ts` / `renderer/lib/class-list.ts`)
- Class order: `main/domain/class-order.ts` — level `sort_order`, then General → Commercial → Technical; applied in `ClassRepository.findStructureClasses` / `findBySchool` and section lists
- Staff: `renderer/lib/staff-mgmt.ts` → `main/ipc/staff-mgmt.ts`
- Finance: `renderer/lib/finance-mgmt.ts` → `main/ipc/finance-mgmt.ts`; extensions `renderer/lib/finance-ext.ts` → `main/ipc/finance-ext.ts`
- Communication: `renderer/lib/communication-mgmt.ts` → `main/ipc/communication-mgmt.ts` (setup: `communication.ts`)
- Academic: `renderer/lib/academic-mgmt.ts` → `main/ipc/academic-mgmt.ts`; teaching progress `renderer/lib/teaching-progress.ts` → `main/ipc/teaching-progress.ts`
- Results calculation: `renderer/lib/results-calc.ts` → `main/ipc/results-calculation.ts` (`results-calc:defaults`, `results-calc:coefficients-list`, `results-calc:coefficients-save`, `results-calc:validate`, `results-calc:breakdown`, `results-calc:student-summary`); core calculation service `main/services/results/result-calculation.service.ts`; repositories `main/db/repositories/results-calculation.repository.ts` and `subject-coefficients.repository.ts`; table `result_subject_coefficients`
- School day schedule: `renderer/lib/day-schedule.ts` → `main/ipc/day-schedule.ts` (`day-schedule:get` / `day-schedule:save`); domain `main/domain/day-schedule.ts`; stored on `schools` + `school_day_breaks`; feeds `academic:meta` period count/times for the timetable
- Student ID cards: `renderer/lib/student-id-cards.ts` → `main/ipc/student-id-cards.ts`
- Reports: `renderer/lib/reports.ts` → `main/ipc/reports.ts`
- Documents: `renderer/lib/documents-mgmt.ts` → `main/ipc/documents-mgmt.ts` (setup templates remain `renderer/lib/documents.ts`)
- System Administration: `renderer/lib/system-admin.ts` → `main/ipc/system-admin.ts`
- Cloud Synchronization: Push engine in `main/sync/push.ts` (`pushPendingSync`), Pull engine in `main/sync/pull.ts` (`pullRemoteChanges`), cursor manager in `main/sync/cursor.ts`, coordinated worker in `main/sync/worker.ts` (`runSyncWorker`); PostgreSQL RPCs `process_sync_operation`, `register_device`, `pull_sync_changes`, and `update_sync_cursor` invoked through `@supabase/supabase-js` in `main/sync/supabase-client.ts` (anon key only; no direct table access); device identity in `main/sync/device.ts`; outbox in `main/sync/queue.ts`; migrations in `supabase/migrations/`
- Windows auto-update: `main/updater.ts` (`initAutoUpdater`, verified pre-update backup before `quitAndInstall`) + IPC `main/ipc/updater.ts`; backup helpers `main/db/sqlite-backup.ts`; state `main/updater/update-state.ts`; recovery `main/updater/recovery.ts` + `/recovery`; log `main/updater/recovery-log.ts`; UI `UpdateNotifier` + Admin Backup & Sync pre-update list; GitHub provider in `electron-builder.yml`; CI publish via `build:win:publish`
- App data path: `main/app-paths.ts` pins `userData` to folder `sofia` under OS app-data (independent of `appId`)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-09-15 | Windows packaging: CI validates `dist/win-unpacked` contains Electron runtime `icudtl.dat` beside `Sofia.exe` (plus `app.asar` / `resources.pak`); sets `USE_HARD_LINKS=false` on Windows builds to avoid corrupt Electron trees; adds `scripts/verify-windows-packaging.ps1`. |
| 2026-09-15 | Windows CI: bumped GitHub Actions to `actions/checkout@v7`, `actions/setup-node@v7`, and `actions/upload-artifact@v7` (Node 24 action runtime) to clear the Node.js 20 deprecation warning; Sofia project Node remains 22. |
| 2026-09-14 | Application versioning: SemVer source of truth is `package.json` `version` (`1.0.0` for first production); overview/settings use `app.getVersion()` only; docs clarify first release tags `v1.0.0` without a prior bump. |
| 2026-09-14 | Packaged cloud config: production builds load hosted Supabase URL + anon/publishable key from `resources/cloud-config.json` via `process.resourcesPath` (electron-builder `extraResources`); development still uses `.env`; packaged builds never fall back to localhost. |
| 2026-09-14 | Contact Sofia Support: unlocked `/help/support` — email draft to `support@sofia.school` with topic, message, and diagnostics (school, version, user); copy helper and shortcuts to Backup & Sync / Settings / Dashboard. |
| 2026-09-14 | Dashboard connectivity: `/home` shows an Online/Offline indicator and a Sync now control when Phase‑1 pending changes exist (`DashboardConnectivityBar`); pending sync KPI uses `countPendingPhase1`. |
| 2026-09-14 | Sync UI: Admin and Setup Backup & Sync show a loading spinner while sync runs and mute Sync now until it finishes; Sync now is only enabled when Phase‑1 pending queue items exist (`countPendingPhase1`); dashboard pending/failed counts use Phase‑1 tables only. |
| 2026-09-14 | Hosted sync_operations status check: migration `20260914130000_fix_sync_operations_status_check.sql` replaces legacy `sync_operations_status_check` so RPC statuses `pending`/`applied`/`failed` are allowed.
| 2026-09-14 | Hosted sync_changes legacy columns: migration `20260914124500_fix_sync_changes_legacy_entity_type.sql` / `APPLY_SYNC_CHANGES_ENTITY_TYPE_FIX.sql` softens NOT NULL `entity_type`/`entity_id` and fills them from `table_name`/`record_id` so changelog inserts from `process_sync_operation` succeed.
| 2026-09-14 | Hosted students legacy name columns: migration `20260914123000_fix_students_legacy_name_columns.sql` / `supabase/manual/APPLY_STUDENTS_NAME_LEGACY_FIX.sql` softens NOT NULL `first_name`/`last_name`, backfills from Sofia `name`, and adds a BEFORE INSERT trigger so `process_sync_operation` can insert students that only send `name`. |
| 2026-09-14 | Remaining hosted sync fixes: migration `20260914121500_fix_entity_type_and_sync_cursors.sql` (and minimal SQL Editor script `supabase/manual/APPLY_REMAINING_SYNC_FIXES_MINIMAL.sql`) softens legacy `sync_operations.entity_type`, adds unique `(device_id, school_id)` on `sync_cursors`, hardens `update_sync_cursor` to UPDATE-then-INSERT, and makes `process_sync_operation` write `entity_type`/`entity_id`; communication-mgmt TypeScript uses `students.name`.
| 2026-09-14 | Sync transport: replaced custom PostgREST `fetch()` in `main/sync/supabase-client.ts` with official `@supabase/supabase-js` (v2) `.rpc()` calls for `register_device`, `process_sync_operation`, `pull_sync_changes`, and `update_sync_cursor`; preserved env loading/URL normalization (`/rest/v1` stripped), anon-only credentials, 15s request timeout via custom `fetch`, and domain error types; fixed cursor `Number(undefined) ?? fallback` NaN bug with `toFiniteNumber`. |
| 2026-09-14 | LWM cloud tenant provisioning: migration `20260914104500_provision_lwm_dev_school_tenant.sql` inserts development school `0dd470f4-4505-4aa5-a8ea-0b4c340daa5d` (Light World Mission / LWM) with matching local fields; admin-only `ensure_school_tenant` allow-list helper (not granted to anon); SQL Editor bundle `supabase/manual/APPLY_SYNC_FIX_AND_LWM_TENANT.sql` also repairs `sync_operations.id`; verify script `scripts/verify-lwm-tenant-sync.mjs`. |
| 2026-09-14 | Cloud sync production fix: migration `20260914093000_fix_sync_operations_id_and_process_rpc.sql` repairs hosted `sync_operations.id` drift (root of RPC `column "id" does not exist`), hardens missing-tenant handling, and is included in `deploy_all_migrations.sql`; desktop push skips unsupported queue tables locally (`markUnsupportedPendingAsFailed`), aborts on permanent RPC barriers, and applies network backoff so Sync Now cannot storm; SQL Editor bundle `supabase/manual/APPLY_SYNC_FIX_AND_LWM_TENANT.sql` provisions LWM school UUID `0dd470f4-4505-4aa5-a8ea-0b4c340daa5d`. |
| 2026-09-14 | App identity audit: confirmed `com.sofia.app` existed only in early config/docs and was never published as a GitHub Release or tagged Windows installer; production identity remains `com.sofia.school` / `Sofia`; userData pinned via `main/app-paths.ts` to `%APPDATA%\sofia\` independent of appId; README corrected. |
| 2026-09-14 | Update safety: verified SQLite pre-update backups (last 3), integrity checks, update-state/recovery log, failed-update detection, `/recovery` screen, and install blocked when backup verification fails; Admin Backup & Sync shows pre-update recovery points. |
| 2026-09-14 | Windows automatic updates: added `electron-updater` with production-only GitHub Releases checks, user-controlled download/restart dialogs, stable `%APPDATA%\sofia` database path, version display in Administration Settings, and CI publish of NSIS + `latest.yml` on `v*` tags. |
| 2026-09-14 | Desktop packaging: configured `electron-builder.yml` for macOS (DMG/ZIP, x64+arm64) and Windows (NSIS, x64); added `build:mac` / `build:win` / `build:all` scripts; replaced undersized `resources/icon.ico` with a multi-resolution icon so Windows packaging succeeds; documented packaging commands under Getting started. |
| 2026-09-07 | Cloud Migration Deployment & Constraint Fix: added explicit `DROP FUNCTION IF EXISTS` guards for `process_sync_operation`, `register_device`, `pull_sync_changes`, and `update_sync_cursor` in both individual migrations and consolidated `supabase/deploy_all_migrations.sql` to resolve PostgreSQL error `42P13` (input parameter name alterations); added idempotent constraint drops (`sync_operations_operation_check`, `sync_changes_operation_check`) to eliminate conflicting legacy check constraints on hosted Supabase PostgreSQL instances; verified full remote live deployment against hosted Supabase (all 7 core tables and 4 RPCs responding successfully); full sync test suite passing (28/28 unit and regression tests). |
| 2026-09-07 | Cloud Client Configuration & Connectivity: implemented automated `.env` loading and URL path sanitization in `main/sync/supabase-client.ts` to ensure Electron main process resolves hosted Supabase project credentials; validated live network connectivity and PostgREST endpoint reachability against hosted Supabase project. |
| 2026-09-07 | Cloud Pull Sync (Phase 2): implemented cursor-based remote change ingestion (`pullRemoteChanges()`) mirroring Supabase `public.sync_changes` into local SQLite; authored idempotent migration `20260907100737_add_pull_sync_rpcs.sql` providing atomic `public.pull_sync_changes()` and `public.update_sync_cursor()` RPCs; introduced local SQLite `sync_cursors` table and cursor manager (`main/sync/cursor.ts`); applied optimistic versioning (`remoteVersion > localVersion`), soft-delete application (`deleted_at`), and immutable identifier preservation (`id`, `student_code`, `sequence_number`, `admission_year`) inside an atomic SQLite transaction; guaranteed no echo loop (local pull never enqueues into `sync_queue`); added conflict detection logging into `sync_conflicts`; integrated two-way push/pull sync coordination in `runSyncWorker`; verified with 14 unit test scenarios and multi-device live PostgreSQL integration test (30/30 sync tests passing). |
| 2026-09-07 | Cloud Push Sync (Phase 1): implemented deterministic outbox push synchronization (`pushPendingSync()`) from local SQLite `sync_queue` to Supabase PostgreSQL; authored idempotent migration `20260907094133_add_process_sync_operation.sql` providing atomic `public.process_sync_operation()` and `public.register_device()` RPCs; enforced tenant isolation, operation idempotency keys, permanent student identifier immutability (`id`, `student_code`, `sequence_number`, `admission_year`), optimistic concurrency control, and soft deletion (`deleted_at = now()`); integrated changelog generator into `public.sync_changes`; added persistent client installation identity via `electron-store`; established granular error handling distinguishing network retries from validation failures and recording conflicts into `sync_conflicts`; preserved successful `sync_queue` rows for auditability; verified with 14 unit test scenarios and end-to-end integration test against live PostgreSQL. |
| 2026-09-07 | Cloud Synchronization Schema Preparation: initialized Supabase and created idempotent migration `20260907092153_init_cloud_sync_schema.sql` mirroring local SQLite student and student ID settings schemas (`public.students`, `public.student_id_settings`) along with prerequisite tenant (`public.schools`), client devices (`public.devices`), and sync foundation tables (`public.sync_operations`, `public.sync_changes`, `public.sync_cursors`); established partial unique index on `(school_id, student_code) WHERE deleted_at IS NULL AND student_code IS NOT NULL`; ensured direct 1:1 UUID compatibility between local SQLite and cloud Supabase; decoupled `class_id` and `academic_level_id` as TEXT identifiers; verified data preservation across repeated migration executions. |
| 2026-09-07 | Permanent Student IDs & Atomic Creation: implemented permanent human-facing `student_code` and internal local UUID (`students.id`) across all academic transitions (new academic years, class promotions, repeating classes, and student updates never regenerate or mutate identifiers); updated default pattern to `{SCHOOL}-{SEQ}` (e.g. `ABC-0001`) and sequence scope to `school` with separate `admission_year`; implemented atomic SQLite transactions combining sequence allocation, code generation, student insert, and outbox sync queue enqueue; added safe migration logic for existing databases preserving historical identifiers and safely advancing sequence counters; added comprehensive 11-test Jest suite covering all lifecycle and migration scenarios. |
| 2026-09-07 | Bulk selection & group actions across all tables: created reusable `TableSelectionBar` component with select-all checkbox, selection count badges, clear action, and contextual bulk operation buttons; added multi-row selection with indeterminate select-all header checkboxes and bottom selection action bars across Student tables, Finance tables, Staff tables, Document workspace tables, Academic management tables (results, coefficients, report cards, continuous assessments, exams, attendance sessions, teaching logs), and Administration tables (users, roles, audit logs); included bulk CSV export and batch status updates. |
| 2026-09-06 | Results Processing: implemented school-configurable 7-step result calculation formula (default 40% CA + 60% Exam, 10/20 pass mark); added continuous assessment sequence averaging (simple, weighted, best N) with configurable absent score policy; score normalization from any maximum to 20/20 scale; subject coefficient management with class and academic year overrides; versioned profile snapshots; class overview and subject sheet UI with calculation methodology card, stats header, pre-calculation validation modal, confirmation dialog, student term summary drawer, and step-by-step calculation breakdown drawer; report card payload and view integration; seed data for International Academy of Excellence Form 5A; comprehensive Jest test suite. |
| 2026-09-06 | Student ID Cards: created three flagship institutional master templates (THE HERITAGE, THE ACADEMIC, THE SIGNATURE) in CR80 landscape format; added offline resolution-independent SVG heraldic crest, student portrait, and principal signature assets; overhauled Template Gallery at `/students/id-cards/templates` with live front/back previews, category filtering, high-resolution inspection modal, and non-destructive "Use Template" / "Customize" duplication workflows with system template deletion protection. |
| 2026-09-03 | Renderer typecheck fixes for Electron build: meta state typing (`Extract`), ConfirmModal props, unused imports, class-list `residence_type` optional. |
| 2026-09-03 | Light World Mission seed: subjects are one per **level + name** (shared across General/Commercial/Technical); Sports aliases normalized. Existing LWM DBs are repaired via `npm run seed -- --dev --light-world-only`. |
| 2026-09-03 | Classes are listed school-wide by academic level (Form 1 → Form 2 → …), then section (General → Commercial → Technical), then class name — shared by dropdowns, class lists, reports, and finance. |
| 2026-09-03 | Class lists print as an A4 document: school letterhead (logo + school details + class name) and a table of Index, Name, Sex (M/F), plus an empty column. App chrome is hidden when printing. |
| 2026-09-03 | Academic Structure: **School day & periods** (start/close times, period duration, breaks) under setup `/setup/academic-structure` and School `/school/classes`. Timetable grids use this for period count, clock labels, and break rows. IPC `day-schedule:*`; domain `main/domain/day-schedule.ts`. |
| 2026-09-03 | Timetable: subjects linked to every class at a level are **common** — dropping one syncs the same day/period across those classes; teacher clashes with a different subject show a blocking alert. |
| 2026-09-03 | Teachers are assigned per class and subject (class × subject). One teacher can teach many classes and many subjects. Timetable builder uses the assigned teacher for that pair. |
| 2026-09-03 | Project rule: every code change must update `DOCS.md` (section + changelog) in the same change; Cursor always-apply rule `.cursor/rules/update-docs.mdc`. |
| 2026-09-03 | CA and exam score entry: Arrow Up/Down moves between student score fields instead of changing the number. |
| 2026-09-03 | Table row actions across modules use compact icon buttons (tooltip + `aria-label`); delete/void/revoke are red; deactivate/archive are orange. |
| 2026-09-03 | ID Cards: visual template designer (front/back, variables, QR/barcode), versioned templates, generation jobs, issued/replace/revoke, print sheets, school-scoped numbering; routes under `/students/id-cards`. |
| 2026-09-03 | Configurable result calculation: per-school profiles (weights, nested groups, grades, GPA, pass marks, ranking, promotion, rounding, missing-score policy), versioned snapshots on result runs, settings wizard at `/academic/results/calculation-settings`, IPC `results-calc:*`. |
| 2026-09-02 | System Administration: users, custom roles, permission matrix, central audit (union with finance/documents), backup history + confirmed restore, sync dashboard/retry/conflicts, settings; IPC `system-admin:*`; routes under `/administration`. |
| 2026-09-02 | Documents module: admission letters, certificates, transcripts, receipt templates (wired into Finance receipts), official documents; shared numbering/rendering; IPC `documents-mgmt:*`; sidebar unlocked. |
| 2026-08-17 | Reports & Analytics: academic performance, student 360° reports, financial analytics (deposits + budgets), attendance analytics, school insights engine; IPC `reports:*`; sidebar unlocked. Computed from existing tables only. |
| 2026-08-17 | Finance budgeting + spending alerts (wired to existing expenses), online payment lifecycle (stub provider), bank deposit tracking/reconciliation, boarding as a fee component + student residence, student ID cards, teaching progress/syllabus logbook; IPC `finance-ext:*`, `students:id-cards-*`, `academic:teaching-*` / `academic:syllabi-*`. |
| 2026-08-10 | Communication module: announcements, SMS/email outbox, parent message threads, internal staff notices; schema + IPC `communication-mgmt:*`; sidebar unlocked; fee reminders queue SMS/email when channels enabled. |
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

When you change the product: update the relevant section, remove the item from “Coming soon” if it is now usable, and add a Changelog row. See `.cursor/rules/update-docs.mdc`.
