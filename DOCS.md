# SOFIA — Product Documentation

Offline-first school management desktop app (Nextron: Electron + Next.js + SQLite).

**How to use this file:** Start with [Getting started](#getting-started), then open the module you need. Each section lists screens, what they do, and the usual workflow.

**Maintaining this file:** Every code change (feature, fix, UX, IPC, schema) must update this document in the **same change**: revise the relevant section and add a Changelog row. See [Changelog](#changelog). Trivial formatting-only edits are the exception.

---

## Getting started

1. Launch the app (`npm run dev` in development).
2. On a **new install**, the login screen offers:
   - **Create an account** (`/register`) — first computer for this school (full Setup wizard).
   - **Join existing school** (`/join`) — other office desks: enter the school short code, register this device, then **sign in** (first sign-in uses Supabase Auth online).
3. Or use [seed demo logins](#seed-demo-logins) after running the seeder.
4. Run the **Setup wizard** on the primary desk (`/setup/...`) so core school data exists before day-to-day use (skip if you loaded seed data / joined a desk).
5. Use the sidebar for day-to-day modules you are allowed to open (School, Students, Academic, …). Sidebar and Ctrl+K page hits follow your role permissions; school owners (`admin`) see everything.

**Join school requirements:** Secondary desk needs network + matching school short code (`lookup_school_by_code`). Join installs the school tenant and registers the device; it does **not** require user password rows to already be in sync. First login on that desk authenticates with **Supabase Auth**, verifies `app_metadata.school_id` matches the joined school, then creates/updates the local profile and caches a **local-only** password hash for offline login on that device. Passwords are never included in sync payloads. If an older primary-desk admin was never provisioned into Auth, reset that user’s password once under Administration → Users (provisions cloud Auth), then retry on the second computer.

Items marked **Coming soon** in the sidebar are placeholders and are not documented as usable yet. Help → Documentation and Contact Sofia Support are available to all signed-in users.

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
| `sofia.teacher.lwm@gmail.com` | `Sofia@Teacher1` | Light World Mission (teacher role — desktop) |

**Sofia Teacher (Expo) mobile app** uses Supabase Auth, not the local desktop password store. After creating/updating the desktop teacher, provision the matching Auth user with:

```bash
# Add SUPABASE_SERVICE_ROLE_KEY to sofia/.env (never commit; never put in Expo)
npx tsx scripts/provision-teacher-auth.ts
```

That sets `app_metadata.role = teacher` and `school_id` for LWM so the mobile app accepts the login.

Restart the app after `seed:dev` so Electron picks up the new database. Seed data includes academics, staff, ~300 students, finance (paid / partial / unpaid invoices), expenses, and attendance. Light World Mission subjects are **level-scoped**: the same title (e.g. Mathematics) is one subject shared by General, Commercial, and Technical classes at that level. Re-running `npm run seed -- --dev --light-world-only` repairs LWM subjects without a full reset.

### Desktop packaging (Windows)

Build installers with Nextron + electron-builder:

```bash
npm install          # required — production deps (e.g. @supabase/supabase-js) must be in node_modules
npm run icons        # regenerate resources/icon.png|.icns|.ico from renderer/assets/images/sofia-icon.png
npm run build:win    # Windows NSIS x64; never publishes
npm run build:mac    # macOS: SOFIA-1.0.0.dmg (Intel) + SOFIA-1.0.0-arm64.dmg (Apple Silicon)
npm run build:all    # both platforms
```

**App icons (source of truth):** `renderer/assets/images/sofia-icon.png` (UI + packaging). Run `npm run icons` after changing that file — it writes a 1024² white `resources/icon.png` with **macOS-style corner radius** (~22%) and safe padding, `resources/icon.icns` (rounded), and a **square** multi-size `resources/icon.ico` for Windows. `resources/logo.png` is synced from `sofia-logo.png`. electron-builder uses `mac.icon` / `win.icon`; packaged apps also ship `icon.png` as an extraResource for dock / window chrome (`main/main.ts`).

If packaging logs `cannot find path for dependency …@undefined`, `node_modules` is incomplete — run `npm install` and rebuild. A packaged app that was built that way crashes at launch with `ERR_MODULE_NOT_FOUND` for `@supabase/supabase-js` (pulled in via sync IPC → `main/sync/supabase-client.ts`).

On Intel Macs open `SOFIA-1.0.0.dmg` (not `*-arm64*`). On Apple Silicon open the arm64 DMG.

**Stable Windows checkpoint:** git tag `sofia-windows-stable` marks the known-good packaged Windows launch tip on `main` after the updater bisect (lazy `electron-updater` + official icons). Restore with `git checkout sofia-windows-stable`.

GitHub Actions workflow: `.github/workflows/build-windows.yml` (`workflow_dispatch` or tag `v*`).

**Release tags must match `package.json` version.** electron-builder publishes GitHub Releases as `v{version}` from `package.json` (e.g. `1.0.1` → tag/release `v1.0.1`). Pushing `v1.0.1` while `package.json` still says `1.0.0` fails with *Published releases must have a valid tag*.

#### Windows Authenticode code signing

electron-builder signs the `.exe` / NSIS installer when these **repository secrets** are set (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `WINDOWS_CSC_LINK` | Base64 of your `.pfx` / `.p12` code-signing certificate (no newlines preferred) |
| `WINDOWS_CSC_KEY_PASSWORD` | Password for that certificate |

Encode a certificate on macOS/Linux:

```bash
base64 -i Sofia-CodeSign.pfx | pbcopy   # macOS — paste into the secret
# or: base64 -w 0 Sofia-CodeSign.pfx > cert.b64
```

On Windows (PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("Sofia-CodeSign.pfx")) | Set-Clipboard
```

Behaviour:

- **Tag builds (`v*`) and manual `workflow_dispatch`:** if secrets are present, the installer is Authenticode-signed; if absent, the build continues **unsigned** (SmartScreen will warn users).
- Local `npm run build:win` without `WIN_CSC_LINK` / `CSC_LINK` also produces an unsigned installer.

Never commit `.pfx`, `.p12`, or passwords. Signing reduces SmartScreen friction over time; an EV certificate (or sustained reputation) is still typically needed for immediate SmartScreen trust.
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
| Staff | `/setup/staff` | Admin staff + teachers (class × subject teaching assignments). **Teachers are mobile staff** (not Administration desktop users): email provisions Supabase Auth with `app_metadata.staff_id` and auto-syncs when online (`Sofia@Staff1` temp password). Admins with email still get a desktop login. |
| Permissions | `/setup/permissions` | Roles & permissions |
| Student ID | `/setup/student-id` | ID pattern (school code, year, sequence, …) |
| Students | `/setup/students` | Required profile fields, admission types, and **CSV bulk import**. Template columns: Full Name, Date of Birth, Place of Birth, Level, Department, Specialization, Residence Type, Gender, Parent Name, Parent Contact, Parent Email, Relationship. Sofia matches an **existing** class from level + department + specialization (never creates classes); residence is stored for day/boarding fee structures. |
| Finance | `/setup/finance` | Fee-related setup |
| Documents | `/setup/documents` | Templates (report card, admission letter, receipt, certificate). **Report card** shows a live scaled preview of the official A4 bilingual layout in the aside as you edit header, footer, logo, stamp, and signature toggles. |
| Communication | `/setup/communication` | SMS/channels + notification templates |
| Backup & Sync | `/setup/backup-sync` | Local backup location, sync status, test connection |

**Tip:** Finish **Academic Structure**, **Grading System**, and **Student ID** before heavy student or results work.

---

## Dashboard

| Path | Purpose |
|------|---------|
| `/home` | School command center matching the overview layout: greeting + **Sync** (online) + year/term filters; **4 KPI cards** (students, teachers, today’s attendance, monthly revenue / fees); **Student Growth** (attendance trend) + **Financial Overview** charts; Admission requests, Recent Activity, Attendance gauge; right rail with **Sofia Setup Progress** (until complete), **Quick Actions**, and **Attention Alerts**. |

**Data:** Aggregated locally via `dashboard:summary` (`main/services/dashboard.service.ts` + `main/domain/dashboard.ts`). Charts use **recharts**. **Students enrolled** counts local active students for the school (not permission-filtered for bursars; teachers with class assignments see only their classes). Teachers KPI counts active teaching staff; pending admissions feed the Admission Request list (admin/secretary). Finance KPIs/trends are admin/secretary only. Empty states are used when attendance/results/fees are missing — never fake 0%. Online Sync calls `backup-sync:sync-now` via `renderer/lib/backup-sync.ts` + `useOnlineStatus` (`renderer/lib/online.ts`).

**Setup checklist:** Unfinished setup steps appear in the right rail until complete.

---

## School Management

Day-to-day school configuration (mirrors much of setup, editable anytime).

| Screen | Path | How to use |
|--------|------|------------|
| School Profile | `/school/profile` | Edit identity and branding assets |
| Academic Year | `/school/academic-year` | Edit year + calendar |
| Terms & Sessions | `/school/terms` | Term dates within the year |
| Classes | `/school/classes` | Manage levels, sections, specs, classes, and the school day schedule (period times + breaks). Class lists and dropdowns follow **level → section** order (Form 1 General, Commercial, Technical, then Form 2…). |
| Departments | `/school/departments` | Add/edit/delete departments; department list paginates **10 rows** per page |
| Subjects | `/school/subjects` | Pick an **academic level**, then use **Add new subject** (modal). Filter the subjects table by search and department. Duplicate names at the same level are blocked. |

---

## Student Management

Consistent UI across all student routes: filters at top, clean tables, status badges, drawers/modals for quick actions (`renderer/components/students/ui.tsx`). All data tables include a select-all checkbox header and a bottom `TableSelectionBar` allowing users to select all items at once for bulk actions (CSV export, bulk status updates, print jobs, etc.).

### Students list — `/students`

- **Filters:** admission year, level, department (section), **class**, and **Profile** (All / Incomplete only) on the first row; **name / student ID** search and **Add student** on the second. List is always ordered by class (level → department structure) then name A–Z. Incomplete means missing gender, date of birth, or guardian phone. Dashboard **Needs Attention** links to `/students?incomplete=1`.
- **Actions:** Add student, **Import** (opens Setup → Students CSV importer), bulk actions (mark alumni / delete). Row actions: **View** profile and **Edit** details (`/students/[id]?edit=1` opens the edit modal).
- **Class list:** **Export class list** (CSV) and **Print class list** are available for the current filter. With **All classes**, print opens `/students/class-lists?class_id=all` (one page per class).
- Click a name (or View) to open the student profile.
- **Duplicates:** creating a student rejects an active student with the same name in the same class.

### Bulk student import — `/setup/students`

CSV only (Excel files must be saved as CSV). Download the template, then upload.

| Column | Required | Notes |
|--------|----------|--------|
| Full Name | Yes | Extra spaces collapsed; each word title-cased (`ADA BIYA` → `Ada Biya`) |
| Date of Birth | No | `YYYY-MM-DD`, `DD/MM/YYYY`, or `DD-MM-YYYY` |
| Place of Birth | No | Free text (city / region / country) |
| Level | Yes* | Matches academic level name or short code (`Form 1` / `F1`) |
| Department | Yes* | Matches Academic Structure **section** (shown as Department) |
| Specialization | No | Matches name or abbreviation (`Electrical` / `EL`) |
| Residence Type | Yes | Normalized to `day` or `boarding` (`Day`, `externe`, `Boarder`, `internat`, …). Unknown values are skipped so boarders are not stored as day students |
| Gender | No | Normalized to Male/Female (`M` / `F` / `male` / `female`) |
| Parent Name | No | Guardian / parent full name (aliases: Guardian Name, Parent, Guardian) |
| Parent Contact | No | Guardian / parent phone in **Cameroon national format** (9 digits, no `+237`). Examples: `670000001`, `670 00 00 01`. Inputs with `+237` / `237` are stripped on import; invalid numbers skip the row. |
| Parent Email | No | Optional guardian email |
| Relationship | No | e.g. Mother / Father / Guardian |
| Class | No | Disambiguator when several classrooms share the same level + department + specialization (e.g. `Form 1 A` vs `Form 1 B`) |

\*Level and department can be omitted only when **Class** uniquely matches an existing classroom name.

Sofia **does not create classes**. It selects the existing classroom that fits the hierarchy. If none match, or more than one match, the row is skipped and the success message lists why (unknown level, ambiguous class, invalid residence, …). Imported students get a generated student ID; residence is used later when generating invoices against day vs boarding fee structures.

IPC: `students:import` (`renderer/lib/students.ts` → `main/ipc/students.ts`; matching/normalization in `main/domain/student-import.ts`).

### Class lists — `/students/class-lists`

Printable **A4 class list** (browser Print → Save as PDF). Chrome (sidebar, search, page title) is hidden when printing.

1. Choose a **class**, or **All classes** (or open with `?class_id=` / `?class_id=all` / `?ids=` from the students list).
2. Choose **columns** to show besides full name. **Index** and **Name** are always included. Optional: Sex, Student ID, DOB, Age, Guardian name/phone, Residence, and an empty marks/signature column. Choices are remembered on this device.
3. Preview the document: school logo and details, **Class list** title, class name, academic year. The letterhead and column headers repeat on every printed page. The **Name** column sizes to its content; the empty/notes column (when selected) takes the remaining table width.
4. **All classes** prints each class on its own page (same header on every page). Export CSV follows the same column selection (named `All classes class list.csv` and includes a Class column when multiple classes).
5. **Print / Save PDF** or **Export CSV**. Single-class files are named from the class (e.g. `Form 1 A class list.csv`; Save as PDF uses the same title).

IPC: `students:class-list`.

### Add student — `/students/create`

Sections: **Personal** (name, gender, date of birth, **place of birth**, contact — phones in Cameroon 9-digit format without `+237`), **Admission** (level → department → specialization if any → class, plus year + type + **Residence** day/boarding), **Guardian** (phone required; name optional).  
Student ID (`student_code`) is **permanently generated on save** (default `{SCHOOL}-{SEQ}` e.g. `ABC-0001`) inside a single atomic SQLite transaction with local UUID generation (`students.id`) and immediate offline outbox sync queue enqueue. The student code and internal UUID **never change** when academic years roll over, classes change, or students repeat/promote. Admission year is recorded separately in `students.admission_year`. Residence is used only to apply boarding/day fee structures.

### Student profile — `/students/:id`

Tabs:

| Tab | Content |
|-----|---------|
| Overview | Personal (including place of birth), guardian, placement, day/boarding residence |
| Academic History | Current placement (expands as promotions/transfers accumulate) |
| Documents | Files for this student; link to upload |
| Finance | Fee situation (billed / paid / remaining per fee line), invoices, and payments with **Paid for** |

Opening any student file shows a **Fee situation** strip (billed, paid, outstanding + top fee lines) above the tabs.

**Edit details** opens a form for personal (including place of birth), placement (level → department → specialization → class), residence, admission, and guardian fields. Student ID (`student_code`) is immutable. Use the status drawer to set **Active / Alumni / Transferred**.

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
| Templates | `/students/id-cards/templates` | Template gallery featuring flagship institutional templates (THE HERITAGE, THE ACADEMIC, THE SIGNATURE) and school custom designs. Large side-by-side FRONT + BACK preview cards, category filters (All, Premium, Modern, Minimal, School Copies), high-resolution inspection modal, and one-click "Use Template" / "Customize" workflows (creates a school **draft** copy; system templates are protected and non-deletable). **Draft** school copies can always be deleted (including any test cards generated from them). Active/archived templates with issued cards must be archived instead. |
| Create template | `/students/id-cards/templates/new` | Wizard: type, orientation, starting layout, fields to include. |
| Designer | `/students/id-cards/designer/[id]` | Front/back canvas, drag fields, layers, school/student variables, QR/barcode, colours, millimetre sizes (default CR80). Preview with sample data or a real student. Draft templates show **Delete draft**. |
| Generate | `/students/id-cards/generate` | Template → year → students (person, class, or school) → new/replacement/renewal → check missing photos/IDs → generate job → print. |
| Issued cards | `/students/id-cards/issued` | Card number, verification code, status (active / replaced / revoked / expired). Replace or revoke; history is kept. |
| Print | `/students/id-cards/print?ids=` | Print-ready front+back at physical size; browser **Print → Save as PDF**. Layout uses the **template version** stored on each card. |
| Print history | `/students/id-cards/print-history` | Who printed what, when. |
| Settings | `/students/id-cards/settings` | Card number pattern (e.g. `SCH/ID/2026/00001`), expiry, motto/footer, paper defaults. |

#### Institutional Master Templates (CR80)

Sofia includes three production system templates. Dimensions use physical millimetres (`unit: 'mm'`); preview scales visually but preserves CR80 aspect ratio.

1. **THE HERITAGE / CLASSIC (Template 1 — Premium, portrait CR80 53.98 × 85.60 mm)**:
   - Navy (`#0F1C2E`) + **Sofia Blue** (`#1580CF`) SVG wave curves; Inter typography; tokens in `id-card-classic-tokens.ts` / factory `id-card-classic.ts`.
   - Front: school logo/name/motto, **24×24 mm (1:1)** photo, student name, STUDENT type, ID / class / department / DOB / admission year / level. **No barcode.** Content stays ≥3.5 mm above footer waves.
   - Back: property notice, school contacts, **QR only** (`sofia:stu:{student_code}` — deterministic, no PII), “SCAN TO VERIFY”, signature area, blue/navy footer curves.
   - Offline lookup: Gate Scanner at `/academic/attendance/gate-scanner` uses `parseStudentQrPayload` → `students.student_code` in SQLite (keyboard-wedge / USB HID).
   - System template rows refresh when the design hash changes; school copies are not overwritten.
2. **THE ACADEMIC (Modern / International School) — landscape 85.60 × 53.98 mm**:
   - Contemporary geometric architecture with navy and vibrant electric blue (`#2563EB` / `#0284C7`) foundation.
   - Distinctive "STUDENT" section header, rounded photo frame, clean Swiss typography.
   - Front QR verification badge; structured back layout with clear card, student, and school contact sections, plus emergency return policy.
3. **THE SIGNATURE (Ultra-Minimal / Executive) — landscape 85.60 × 53.98 mm**:
   - Ultra-premium minimalist aesthetic inspired by executive credentials.
   - Large low-opacity watermark crest centered on the back; champagne accent bar (`#C5A059`).
   - Precise micro-spacing, high-contrast dark institutional typography on light backgrounds, elegant layout with prominent student name and ID.

All templates are data-driven using Sofia variables (`{{school.name}}`, `{{student.name}}`, `{{student.student_id}}`, `{{student.photo}}`, `{{academic.year}}`, `{{card.qr_code}}`, etc.). Offline vector assets are SVG data URIs. Selecting "Use Template" or "Customize" on a system template creates an independent school-scoped copy; system masters stay locked.

Student photos and school logo/signature come from existing profile files. **Template 1 QR** = `sofia:stu:{student_code}` (offline SQLite lookup). Templates 2–3 may still use verification tokens / barcodes per their designs. Print remains browser **Print → Save as PDF** (no PDF library).

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

List-style HTML tables on academic screens (exams, CA, attendance, report cards, reports class averages, results overview/subject sheet, coefficients), **Staff → Workload** detail slots, and **School → Departments / Subjects** lists use **client pagination** (10 rows per page) via `ClientPaginatedTable` / `useTablePagination` in `renderer/components/ui/table-pagination.tsx`. Timetable period×day grids are not paginated.

### Timetable

| Screen | Path | How to use |
|--------|------|------------|
| Weekly grid | `/academic/timetable` | View by **Class** or **Teacher**; Mon–Fri × periods from the school day schedule (clock times + break rows) |
| Builder | `/academic/timetable/create` | Select class → drag subjects onto periods. Period count and labels come from **Academic Structure → School day & periods**. **Common** subjects (linked to every class at the level, e.g. Mathematics for all Form 1) are written to the **same day/period for all classes at that level**. Clearing a common slot clears it across those classes when they still hold that subject. If the teacher already teaches a different subject in another class at that time, an alert blocks the save. |

A teacher is assigned to a **subject in a specific class** (not to subjects and classes independently). One teacher may teach many classes and many subjects. Timetable slots pick that assigned teacher automatically. Subjects offered to every class at an academic level are treated as shared/common so they cannot be scheduled at conflicting times for the shared teacher.

### Attendance

Class roster marking and entrance Gate Scanner (USB HID QR). Class sessions and gate check-ins are separate stores; both are offline-first.

| Screen | Path | How to use |
|--------|------|------------|
| Overview | `/academic/attendance` | Hub: Gate Scanner, Take attendance, Class report; list past class sessions |
| Gate Scanner | `/academic/attendance/gate-scanner` | Dedicated entrance terminal (standard AppShell sidebar). Focus the scanner field, scan student ID QR (`sofia:stu:{student_code}` or bare `student_code`). Records **gate** attendance once per school day; duplicates show arrival time. Optional **Entrance look** styling. Requires `attendance.mark`. |
| Take | `/academic/attendance/take` | Class + date → mark Present / Absent / Late / Excused (mark-all-present available) |
| Report | `/academic/attendance/report` | Class + date range → per-student rates and totals |

**Gate Scanner architecture:** Renderer `renderer/lib/gate-attendance.ts` → IPC `gate-attendance:scan` / `gate-attendance:today-summary` → `main/services/gate-attendance.ts` → `parseStudentQrPayload` + `students.findBySchoolAndCode` → `gate_attendance` table (unique per school + student + date + type). Sync via `enqueueSync` like other domain tables. Audio feedback: `renderer/lib/scanner-feedback.ts` (Web Audio).

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

### Assessment Questions (review & print)

Desktop administration for teacher-submitted question paper PDFs. Teachers create/attach/submit from the mobile app; desktop reviewers approve or reject with a note; authorized staff print only after approval.

| Screen | Path | How to use |
|--------|------|------------|
| List | `/academic/assessment-questions` | Summary cards (Pending / Approved / Rejected / Total). Default filter **Pending Review**. Filters: status, year, term, class, subject, teacher, assessment type; search by teacher/assessment/subject/class. Sync label: Pending Sync / Synced / Sync Failed. |
| Review | `/academic/assessment-questions/[id]` | Header + submission info + embedded PDF (or Open PDF). **Approve** (confirm) or **Reject** (required note ≥ 8 chars). Submission history (revisions) + Review history (audit events). |
| Print | `/academic/assessment-questions/[id]/print` | Print preview of the **approved** PDF only. Requires `assessment_questions.print`. |

**Permissions** (catalog `assessment_questions.*`, enforced in IPC): `view`, `review`, `approve`, `reject`, `print`. Principal has all; Vice Principal is seeded with review/approve/reject/print; Secretary with view + print. Assign others via Administration → Permissions.

**Data:** `assessment_question_papers` (thread) + `assessment_question_paper_revisions` (immutable PDFs) + `assessment_question_paper_events` (audit). Files under `userData/uploads/question-papers/`; path syncs via `synced_entities`, bytes via Supabase Storage (`school-assets`, PDF allowed — migration `20261007120000_assessment_question_papers_sync.sql`). Approved revisions cannot be silently edited; resubmit creates Revision N+1 after rejection.

**IPC:** `assessment-questions:*` → `main/ipc/assessment-questions.ts` → `AssessmentQuestionsRepository`.

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

Requires results that are computed / published / locked for that class + term. Report Cards **snapshot** finalized Results Processing data (no second calculation engine). Blank subject scores are omitted as “not offered” (blank ≠ zero), matching Sofia’s exclude policies.

| Screen | Path | How to use |
|--------|------|------------|
| List | `/academic/report-cards` | Filter by class + term |
| Generate | `/academic/report-cards/generate` | Build official payloads for the class/term (embeds template snapshot for historical reproducibility) |
| View / Print | `/academic/report-cards/view/:id` | Official A4 bilingual bulletin: ministry FR/EN header + centred logo, school identity, student details, academic grid (CA / Exam / Mark / Coeff / Weighted / Grade / GCE / Remark), performance summary, grading scale from the result-run profile, teacher/principal remarks, principal stamp & parent endorsement. **Print → Save as PDF**. |

**Data flow:** Results run (`snapshot_json.config.grading`) → `report-cards:generate` → `report_cards.payload` (schema v1) → `OfficialReportCard` → browser print.

**Template customization:** Setup document template key `report_card` supplies header/footer. Optional JSON in `body_text`: `{ "sofia_report_card": { "title_en": "...", "bilingual_header": { "fr_lines": [...], "en_lines": [...] }, "show_gce": true } }`. Presentation options are **snapshotted** into each card so later template edits do not rewrite history.

**Setup preview:** `/setup/documents` renders `OfficialReportCard` with sample student data via `buildReportCardSetupPreviewPayload` (`renderer/lib/report-card.ts`) and `ReportCardSetupPreview` (scaled to the aside width). Logo, stamp, signature, header, and footer changes update the preview immediately.

**Architecture:** Domain `main/domain/report-card.ts`; view `renderer/components/report-cards/OfficialReportCard.tsx`; helpers `renderer/lib/report-card.ts`; shared print styles `renderer/components/report-cards/ReportCardStyles.tsx`.

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
| Add | `/staff/teachers/create` | Personal + role fields; **Assignment Builder**; separate **Homeroom**. Employee ID auto-generated if blank. **Email** provisions Sofia Teacher Auth (`staff_id` in JWT) and **auto-syncs** staff + `staff_subjects` when online (temp password `Sofia@Staff1`). Teachers are **not** created as Administration → Users desktop accounts. |
| Profile / edit | `/staff/teachers/:id` | Same fields. Saving teaching assignments re-provisions Auth metadata (keeps password) and auto-syncs again. |

### Staff directory

| Screen | Path | How to use |
|--------|------|------------|
| List | `/staff/directory` | All staff; filter by status, staff type, job role. **Add Staff** opens a drawer for administrative roles (support/admin). |
| Detail | `/staff/directory/:id` | Text-only profile: personal, role, department, contact, assignments. |

### Teacher workload — `/staff/workload`

Summary table of periods / subjects / classes from the timetable, with **Over max** and **Conflict** badges. Click a row for a modal with weekly timetable slots (paginated **10 rows** per page via `ClientPaginatedTable`).

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
| Fee structure | `/finance/fee-structure` | List packages with **filters** (search, year, level, department, status). Columns: total, year, **level / department / class**, active badge, and **day/boarding** applicability. Managers can **create**, **edit**, **duplicate** (opens a pre-filled copy to adjust), activate/deactivate, and delete. Structures include fee lines, **Department**, and **Applies to** (all / day / boarding). Editing updates the package for future billing; existing invoices are unchanged. Billing refuses a structure whose department, level, class, or residence does not match the student. |
| Student billing | `/finance/billing` | Filter invoices by status/search. Generate for one student: type to search by name/ID, pick from suggestions; fee structures are filtered to the student’s **day/boarding** residence plus department/level/class, and the matching **class fee structure is pre-selected**. **Bulk generate** can target **one fee structure** (optional class filter) or **all classes** (each active student is billed with their class fee package; falls back to level/department packages when no class-specific package applies; day/boarding still respected). Generation is refused if scope does not match. Managers can **delete pending** invoices (row action, detail drawer, or bulk on selected pending rows); soft-delete only — paid/partial/overdue invoices and those with payments or carried arrears cannot be deleted. |
| Payments | `/finance/payments` | Payment history. **Record payment**: search a student with outstanding balance, pick their invoice, then **choose which fee lines** (from the fee structure on that invoice) this payment covers — checkboxes + amounts. Cash amount follows the selected lines (credit can reduce cash collected). Allocations are stored on `payment_allocations` and shown in the list/export **Paid for** column. If lines are omitted (e.g. online confirm), Sofia falls back to FIFO. **Online payment** starts a request (`pending`/`processing`); Confirm/Fail/Cancel after the provider settles. |
| Receipts | `/finance/receipts` | List + search. View/print drawer or full page `/finance/receipts/:id`. Receipts show **Paid for** fee components from stored payment allocations when present (else FIFO). Managers can log a reprint. |
| Outstanding | `/finance/outstanding` | Toggle student vs class grouping; aging columns (current / 1–30 / 60+). Select students and send in-app fee reminders. |
| Expenses | `/finance/expenses` | List with date filters. Create: category, amount, date, vendor, description, method, optional recurring. Recording an expense updates matching **budgets** and may raise spending alerts. |
| Budgeting | `/finance/budgeting` | Totals (allocated / spent / remaining / utilization) and per-category bars. Managers add configurable categories, allocate budgets by period (monthly / termly / annual / custom), and set alert / warning / critical thresholds. Spending is computed from existing Expenses. |
| Bank deposits | `/finance/bank-deposits` | Track school cash **already collected** when it is later deposited in the bank. Not a student payment method. Workflow: record (pending) → reconcile cash collections (many payments to one slip) → verify → post to ledger. Verified deposits cannot be silently edited. |
| Financial reports | `/finance/reports` | Date range → cards for revenue, collected, outstanding, expenses, P&L; tables by payment method and expense category; Export CSV. |

Boarding is a **fee component**, not a Boarding Management module. Students are Day or Boarding; there is no dormitory roster.

Student profile shows a **Fee situation** strip on open (billed / paid / outstanding + fee lines). The **Finance** tab expands that into charged/paid/remaining per fee line, invoices, and payments with **Paid for**.

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

Charts use **recharts** via shared helpers in `renderer/components/dashboard/ChartCard.tsx` and `renderer/components/reports/charts.tsx`. Each screen picks a chart type that matches the data (comparisons → bars, composition → donut, trends → line/area, rates → gauge).

| Screen | Path | How to use |
|--------|------|------------|
| Academic performance | `/reports/academic-performance` | Filter year/term/department/class/subject/gender and official results vs CA vs exams. Cards + charts: class/subject **horizontal bars**, term **line**, grade A–F **vertical bars**. Tables: class, subject, ranking. Click a class, subject, or student to narrow or open the student report. |
| Student reports | `/reports/students` | Search by name or Student ID (optional class). 360° report with **grouped bars** (CA vs exam), attendance **donut**, fee **donut**, history **line**, plus tables. Print/CSV. |
| Financial reports | `/reports/financial` | Aggregates Finance & Fees with **gauge** (collection/budget), **donuts** (cash position, fee types, methods, expense categories), **horizontal bars** (class revenue, **collections by fee line**, aging, banks), **vertical bars** (terms), **area** (monthly expenses/deposits), plus a fee-line collections table (from `payment_allocations`, FIFO fallback). CSV export includes fee-line rows. Teachers do not see this screen. Daily recording remains under Finance. |
| Attendance analytics | `/reports/attendance` | **Gauge** + **donut** for overall mix; class **horizontal bars**; monthly **area** and daily **line** trends; at-risk list (default 75%). Staff attendance summary from existing staff registers. |
| School insights | `/reports/school-insights` | Enrolment **donut**/class **bars**; academic/finance/attendance **gauges**; revenue vs expenses **grouped bars**; staff mix **donut** — plus generated insights when calculations show decline, arrears growth, attendance risk, or budget pressure. |

Operational reports under Academic Management (`/academic/reports`) and Finance (`/finance/reports`) are unchanged.

---

## Documents

Official letter/certificate generation from existing Sofia records. There is **one** template engine (`document_templates` + `issued_documents`). Student, academic, and payment data are never copied into a parallel store.

Print / PDF uses the same browser print-to-PDF path as receipts and ID cards (A4 CSS). Restart the app after first load so numbering tables migrate.

**Letterhead:** Admission letters, receipts, certificates, transcripts, and other official documents rendered via `wrapOfficialHtml` share the same Cameroon **bilingual ministry header** as the student report card (FR left · school logo centre · EN right), then school name / contact, then the document title. Defaults come from `DEFAULT_BILINGUAL_HEADER` in `main/domain/report-card.ts`.

| Screen | Path | How to use |
|--------|------|------------|
| Admission letters | `/documents/admission-letters` | Filter year/class/department/status/date. Generate or bulk-generate personalized letters from enrolled students. View / print / regenerate (previous copy is superseded, not deleted). Official bilingual letterhead is included automatically. |
| Certificates | `/documents/certificates` | Tabs: issued certificates and certificate types. Create types (leaving, completion, achievement, participation, conduct, or custom). Each issued certificate gets a unique number from the school pattern (default `{SCHOOL_CODE}/{TYPE}/{YEAR}/{SEQUENCE}`). |
| Transcripts | `/documents/transcripts` | Generate from **published or locked** result runs only. Draft terms show: “Results for {term} have not yet been finalized…”. Scope: current year, selected year/term, or full history. |
| Receipt templates | `/documents/receipt-templates` | Appearance of **Finance & Fees → Receipts**. Set one default per school. Printed receipts show **Amount paid**, **Balance remaining**, and **Paid for** fee lines (`{{receipt.lines}}` — from stored payment allocations when present, else FIFO). Variables such as `{{receipt.number}}` and `{{payment.amountWords}}`. Do not record payments here. |
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
| Users & Roles | `/administration/users` | Desktop accounts only (admin/secretary). Creating a **teacher** role without a linked staff member is rejected — use **Staff → Teachers** instead. Optional staff link for admins; Auth provision + sync when online. |
| Roles | `/administration/roles` | Create/edit/duplicate custom roles (must include ≥1 permission). System roles (Principal, Vice Principal, Teacher, Bursar, Secretary, Registrar, Read Only, …) cannot be deleted; Sofia re-applies their catalog permissions on login / role screens so older empty sets are repaired for every seeded role. Roles with assigned users cannot be deleted. Activate/deactivate. |
| Permissions | `/administration/permissions` | Live matrix of catalog permissions × school roles. |
| Audit logs | `/administration/audit-logs` | Paginated union of central `audit_events` plus finance and document audit tables. Append-only — no edit/delete API. |
| Backup & Sync | `/administration/backup-sync` | Backup now + history. Backup folder defaults to `%APPDATA%\\sofia\\backups`; if a stored path is unwritable (e.g. after restore onto another PC/user), Sofia falls back to that default. **Restore from file…** picks a `.db` / `.sqlite` backup (integrity-checked), or restore a listed backup. Both require typing `RESTORE`, write a safety backup, stage the source under userData, then replace the DB on next launch. Sync now / retry failed / conflict **Keep local** (bump version + requeue failed outbox) or **Keep remote** (abandon local outbox for that record). The Conflicts list shows **open** rows only; one click resolves all open duplicates for the same table/record and shows success or error feedback. |
| Settings | `/administration/settings` | Timezone (default Africa/Douala), session timeout, password/lockout policy, backup retention. School identity, academics, finance numbering, and document branding stay on their existing screens. |

---

## Help & Support

Available to every signed-in user (no special permission).

| Screen | Path | How to use |
|--------|------|------------|
| Documentation | `/help/docs` | Searchable in-app guides by category (Getting started, Students, Finance, Sync, …). Open an article; follow deep links into Sofia screens. Content lives in `renderer/lib/help-docs.ts`. |
| Contact Sofia Support | `/help/support` | Choose a category, write a subject and message, then **Open email to support** (`cherubtech7@gmail.com`) or **Copy message + diagnostics**. Diagnostics include app version, school, user, and platform. Sofia does not send mail itself — it opens the system mail client. |

---

## Cloud Synchronization Architecture (Supabase Mirror)

Sofia uses an offline-first architecture where the local SQLite database functions as the source of truth for offline clients, and Supabase PostgreSQL serves as the cloud synchronization backend.

### Multi-desk MVP (Steps 0–2 + light staff)

Multiple office PCs share one school tenant via push/pull. **Synced today:**

| Domain | Tables |
|--------|--------|
| Students (legacy typed) | `students`, `student_id_settings` |
| School foundation | `schools`, `academic_years`, `academic_terms`, `academic_levels`, `sections`, `specializations`, `departments`, `classes`, `subjects`, `subject_classes`, `grading_systems`, `assessment_types`, `grade_bands` |
| Users & RBAC | `permissions`, `roles`, `role_permissions`, `users` (**no passwords** — `password_hash` stripped from outbox/push; pull keeps local hash or a pending placeholder) |
| Staff (light) | `staff`, `staff_subjects`, `staff_classes` |
| Finance (Step 5) | `finance_settings` (counters use **MAX** local/remote), fee catalogs/structures/discounts, `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `receipts`, credits, expenses, ledger, audit, reminders, budgets, online payments, bank deposits |
| Academics & attendance (Step 6) | `timetable_slots`; class + gate + staff attendance; CA/exams/scores; calculation profiles/coefficients; `result_runs` (+ rows/summaries); `report_cards` |
| Documents & ID cards (Step 7) | `document_templates`, numbering sequences (MAX), signatories, `issued_documents` (+ versions/audit); ID card templates/versions/settings/sequences (MAX), issued cards, generation jobs/items, print history |
| Communication (Step 8) | `communication_settings`, `notification_templates`, `announcements`, `internal_notices`, `communication_deliveries`, `parent_message_threads`, `parent_messages` |
| Assets & ops (Step 9) | Supabase Storage bucket `school-assets` for school logo/stamp/signature + student photos; Admin Sync Now works with pending=0 (pull-only); queue health **by table** |
| Student ops / leave / teaching / reports (Step 10) | `student_settings`, `admissions`, `student_transfers`, `student_documents`, `promotion_runs`/`promotion_mappings`, `calendar_events`, `leave_balances`/`leave_requests`, `staff_notifications`, `teaching_syllabi`/`syllabus_topics`/`teaching_logs`, `report_settings` — so secretary, bursar, principal, and teacher desks share the same operational data after Join/Sync |

**Not yet synced as files:** expense receipts, bank deposit scans, ID-card template art embedded only as JSON, arbitrary student document attachments (path strings may sync; bytes not mirrored yet).

**Finance notes:** Invoice/receipt/payment/expense **numbers** travel with their rows (immutable after issue). Sequence counters on `finance_settings` never move backward when desks sync.

**Multi-desk pull safety:** Generic apply stubs missing FK parents from payload keys (years, classes, students, staff, subjects, roles, fee structures, invoices, attendance sessions, result runs, …) at version **0** so out-of-order `sync_changes` never aborts a batch. Real rows overwrite stubs. Sync Now also **backfills** local `sync_status='pending'` rows that never entered `sync_queue` (seed / missed enqueues) so primary desks push complete catalogs. Push priority: foundation → RBAC/users → students/admissions → attendance/exams/results → communication → finance → documents/ID cards. Cloud allow-list: migration `20261008150000_full_ops_synced_entities.sql`.

**Academics notes:** Result-run status never regresses (`draft` → `computed` → `published` → `locked`). Locked runs ignore remote DELETE. Child score/attendance rows without a local `school_id` column still sync (push attaches tenant id in the cloud payload).

**Documents notes:** Document and ID-card **numbers** travel with issued rows. Sequence counters (`document_number_sequences.next_number`, `id_card_sequences.next_number`) use **MAX**(local, remote). Template HTML/JSON and rendered HTML sync as text; signature/logo *files* use Storage when present.

**Communication notes:** Notices/announcements and parent threads sync as rows. Channel toggles and SMS provider settings travel with `communication_settings` (same-school desks share config).

**Multi-desk / first Sync:** Primary desks that were never synced (including USB-restored DBs) call `bootstrap_school_tenant` when `register_device` reports missing tenant, then register the device and drain the queue. Apply migration `20261006143000_bootstrap_school_tenant.sql` on Supabase before relying on this path.

### Sofia Teacher (Expo) mobile API

Teachers sign in with **Supabase Auth** (provisioned from desktop via Edge Function `provision-staff-auth`). JWT `app_metadata` must include:

| Key | Purpose |
|-----|---------|
| `role` | Must be `teacher` |
| `school_id` | Tenant UUID |
| `staff_id` | Local `staff.id` (linked when provisioning) |

Desktop Sync Now pushes teacher-relevant rows into **`public.synced_entities`** (and students into **`public.students`**). The mobile app must **not** query raw mirror tables via PostgREST — use SECURITY DEFINER RPCs only.

**Architecture docs:** [`docs/teacher-sync-architecture.md`](docs/teacher-sync-architecture.md), [`docs/teacher-api-contract.md`](docs/teacher-api-contract.md), [`docs/teacher-data-model.md`](docs/teacher-data-model.md), [`docs/teacher-sync-testing.md`](docs/teacher-sync-testing.md).

**Teacher RPCs** — scoped from JWT; `GRANT EXECUTE` to **`authenticated`** only:

| Migration | RPCs |
|-----------|------|
| `20260923200000_teacher_mobile_rpcs.sql` | `get_teacher_me`, `get_teacher_assignments`, `get_teacher_timetable` |
| `20261001100000_teacher_mobile_sync_phase_ab.sql` | `get_teacher_classes`, `get_teacher_students`, `get_teacher_attendance_sessions`, `get_teacher_attendance_records`, `get_teacher_assessments`, `get_teacher_scores`, `get_teacher_announcements`, `get_teacher_config`, `get_teacher_bootstrap`, **`teacher_push_entity`** (writes: `attendance_sessions`, `attendance_records`, `ca_scores`) |

Also expands `process_synced_entity` allow-list with **`school_day_breaks`** (desktop already enqueued them). Day-schedule columns and `class_teacher_id` are included in desk sync column maps (`main/sync/tables.ts`).

**Expo client (after migrations applied + Sync Now):**

```ts
const { data: boot } = await supabase.rpc('get_teacher_bootstrap')
// or granular:
const { data: me } = await supabase.rpc('get_teacher_me')
const { data: students } = await supabase.rpc('get_teacher_students')
const { data: slots } = await supabase.rpc('get_teacher_timetable') // day_of_week 1=Mon…7=Sun
// Offline outbox flush (stable UUID p_id = idempotency key):
await supabase.rpc('teacher_push_entity', {
  p_id: opUuid,
  p_table_name: 'ca_scores',
  p_record_id: scoreId,
  p_operation: 'INSERT',
  p_payload: { id: scoreId, assessment_id, student_id, score, version: 1 },
})
```

**Ops:** After changing assignments, timetable, attendance, or assessments on desktop, data auto-syncs when online after teacher save; otherwise run **Sync Now**. Empty RPC results usually mean sync not pushed yet, or Auth missing `staff_id` (re-save teacher with email). Apply cloud migration `20261001100000_teacher_mobile_sync_phase_ab.sql` before using Phase A/B RPCs.

**Verify in SQL Editor** (as a teacher JWT session, or check raw mirror first):

```sql
-- Mirror has data?
select table_name, count(*) from synced_entities
where school_id = '<school_uuid>'
  and table_name in ('staff_subjects','timetable_slots','classes','subjects','staff','school_day_breaks')
  and deleted_at is null
group by 1;

-- Assignments for one staff id in the mirror
select payload from synced_entities
where school_id = '<school_uuid>' and table_name = 'staff_subjects'
  and payload->>'staff_id' = '<staff_uuid>' and deleted_at is null;
```

**Deferred (intentionally not synced / not writable for Teacher v1):** lesson logs (`teaching_*`), exam score writes, mobile delta cursor, FCM/APNs (desktop emits `notifyTeachers` events only).

**Code paths:** domain `main/domain/teacher-sync.ts`; notification stub `main/services/teacher-notifications.ts`; registry `main/sync/tables.ts`.

**Deploy:** `npx supabase db push` (or apply the migration in the Supabase SQL editor / linked project).

### Multi-desk ops guide

| Topic | Guidance |
|-------|----------|
| Primary desk | One machine should own **finance numbering** day-to-day (bursar). Others may still issue invoices offline; counters merge with MAX on sync — sync soon after busy periods. |
| How often to Sync Now | At least morning / midday / end of day on every desk; immediately after Join school on a new PC; after bulk imports. |
| New PC | Install → open **Join existing school** → enter short code → **wait for the full download** (large schools may take several minutes) → log in with a shared account → Sync Now once more for any leftover pages + assets. Dashboard student counts and Finance lists are **local** — if a bursar desk is missing students, fee structures, or invoices, run Sync Now on the **primary** until finance queue is empty, then Sync Now on the bursar desk until lists match. |
| Wipe / reinstall | Join again (or restore a local backup). Full pull starts at cursor 0. Photos/logos appear after Storage migration is applied and a desk that has the files has pushed. |
| Health | Administration → Backup & Sync → **Queue by table** shows pending/failed per domain. Retry failed, then Sync Now. One Sync Now **auto-continues** with a **live % progress bar** until push+pull report caught up (safety caps ~10 000 push items / hundreds of thousands of pull changes; UI says if more remain). Apply cloud migration `20261009140000_count_pending_sync_changes.sql` for accurate download %. RBAC/users and students sync before finance and documents. Any desktop role (bursar, secretary, principal, …) uses the same pull stream — missing data means Sync Now on primary then bursar/secondary, not a role filter. |

**How to add a table:** (1) add to `GENERIC_SYNC_TABLES` + column list in `main/sync/tables.ts`, (2) add name to `process_synced_entity` allow-list migration, (3) unit-test pull apply, (4) document here.

**Code paths:** registry `main/sync/tables.ts`; generic pull `main/sync/apply-generic.ts`; outbox allowlist `main/sync/queue.ts` (`SUPPORTED_SYNC_TABLES`); client routes generic tables to RPC `process_synced_entity` (`main/sync/supabase-client.ts`); cloud migration `supabase/migrations/20260917080000_multi_desk_synced_entities.sql` (`public.synced_entities`).

**Ops:** Primary desk completes Setup → creates users/roles → **Sync Now** (students must be in the cloud before a second desk can download them). Secondary desks: open **Join existing school** (`/join`), enter school short code, wait for the full download, then **Log in** with shared accounts (including Bursar). Enrollment KPIs are a local `students` count (`status = 'active'`) — not role-filtered for bursars. Cloud RPC: `lookup_school_by_code`.

- **Migrations**:
  - `supabase/migrations/20260907092153_init_cloud_sync_schema.sql` (schema foundation)
  - `supabase/migrations/20260907094133_add_process_sync_operation.sql` (Phase 1 Push Sync RPCs)
  - `supabase/migrations/20260917080000_multi_desk_synced_entities.sql` (generic multi-desk entity RPC)
  - `supabase/migrations/20260917083000_lookup_school_by_code.sql` (Join school RPC)
  - `supabase/migrations/20260917090000_finance_synced_entities.sql` (finance allow-list)
  - `supabase/migrations/20260917100000_academics_synced_entities.sql` (academics/attendance allow-list)
  - `supabase/migrations/20260917110000_documents_id_cards_synced_entities.sql` (documents/ID cards allow-list)
  - `supabase/migrations/20260917120000_communication_synced_entities.sql` (communication allow-list)
  - `supabase/migrations/20260917130000_school_assets_storage.sql` (Storage bucket `school-assets`)
  - `supabase/migrations/20260923200000_teacher_mobile_rpcs.sql` (Sofia Teacher RPCs: `get_teacher_me`, `get_teacher_assignments`, `get_teacher_timetable`)
  - `supabase/migrations/20261001100000_teacher_mobile_sync_phase_ab.sql` (Teacher Phase A/B: students/attendance/assessments/config/bootstrap + `teacher_push_entity`; allowlist `school_day_breaks`)
  - Teacher sync docs: `docs/teacher-sync-architecture.md`, `docs/teacher-api-contract.md`, `docs/teacher-data-model.md`, `docs/teacher-sync-testing.md`
- **Cloud Tables**:
  - `public.schools`: Tenant root (`id UUID PRIMARY KEY`, `name TEXT`, `school_code TEXT`, partial unique index on `school_code`).
  - `public.devices`: Registered desktop clients (`id UUID PRIMARY KEY`, `school_id UUID REFERENCES public.schools(id)`).
  - `public.students`: Complete cloud mirror of local student records (`id UUID PRIMARY KEY`, `school_id UUID REFERENCES public.schools(id)`, `student_code TEXT`, `name TEXT NOT NULL`, `class_id TEXT NOT NULL`, `admission_year INTEGER`, `academic_level_id TEXT`, `sequence_number INTEGER`, `gender TEXT`, `date_of_birth DATE`, `place_of_birth TEXT`, `phone TEXT`, `email TEXT`, `address TEXT`, `admission_type TEXT`, `guardian_*`, `status TEXT`, `photo_path TEXT`, `residence_type TEXT`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ`, `version BIGINT`). Local-only `sync_status` is excluded.
  - `public.student_id_settings`: Cloud mirror of settings (`id UUID PRIMARY KEY`, `school_id UUID UNIQUE REFERENCES public.schools(id)`, `pattern TEXT`, `sequence_scope TEXT`, `next_sequence_number INTEGER`, `version BIGINT`). Local `sync_status` is excluded.
  - `public.synced_entities`: Generic JSONB mirror for multi-desk MVP tables (`PRIMARY KEY (school_id, table_name, record_id)`, `payload`, `version`).
  - `public.sync_operations`: Ingestion buffer for operations pushed from local `sync_queue` (`id UUID PRIMARY KEY`, `payload JSONB`, `operation TEXT`, `status TEXT`, `error_message TEXT`, `applied_at TIMESTAMPTZ`).
  - `public.sync_changes`: Append-only cloud change log with identity sequence (`id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`). Global change cursor for future pull sync.
  - `public.sync_cursors`: Per-device pull checkpoints (`uq_sync_cursors_device_school UNIQUE (device_id, school_id)`).
- **Identifier Rules**:
  - Direct UUID identity: local SQLite `students.id` UUID string maps 1:1 to Supabase `students.id` UUID type without translation or cloud regeneration.
  - Permanent student ID partial index: `UNIQUE INDEX idx_students_school_student_code_unique ON public.students(school_id, student_code) WHERE deleted_at IS NULL AND student_code IS NOT NULL`. Multiple `NULL` codes are allowed; soft-deleted codes do not block re-use.
  - Decoupled foreign keys: `class_id` and `academic_level_id` remain `TEXT` identifiers without cloud foreign key constraints until academic structures are synchronized.
  - Non-destructive & idempotent: `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ensure existing cloud data is never destroyed on migration re-runs.

### Phase 1: Push Synchronization Engine

Push synchronization mirrors local SQLite state to Supabase. **Students / student_id_settings** use `process_sync_operation`. **Multi-desk MVP tables** use `process_synced_entity` → `synced_entities` + `sync_changes`.

1. **Local Outbox & Push Service (`main/sync/push.ts` - `pushPendingSync()`)**:
   - Queries `sync_queue` in deterministic batch order: `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 50`.
   - Resolves authorized school identity from the local database; rejects payload cross-tenant tampering.
   - Dispatches operations via `SupabaseSyncClient` to `process_sync_operation` RPC with PostgREST `/rest/v1/rpc/process_sync_operation`.
   - Upon successful acknowledgement, marks local `sync_queue` record as `status = 'synced'` and updates `last_attempt_at`. **Successful records are retained for auditability and debugging, never deleted.**
   - Error classification:
     - **Network error** (`ECONNREFUSED`, timeout, 5xx): retains `status = 'pending'`, increments `retry_count`, halts batch to prevent connection churn.
     - **Idempotent DELETE not-found** (`… not found for DELETE`): cloud already lacks the row (never pushed or already gone) — marks `synced` so retries do not loop.
     - **Validation error** (tenant mismatch, immutable field breach): marks `status = 'failed'` without endless retries.
     - **Unsupported Phase-1 tables** (local-only settings etc.): discarded as `synced` locally without an RPC call (do not inflate Failed).
     - **Conflict** (incoming version < cloud version): logs warning, records conflict snapshot into local SQLite `sync_conflicts` table for future resolution UI, marks `status = 'failed'`.
2. **Stable Client Device Identity (`main/sync/device.ts`)**:
   - Generates persistent UUID via `electron-store` on first installation; remains stable across application restarts and sync runs.
   - Registers device via `public.register_device(p_id, p_school_id, p_device_name, p_device_fingerprint)` RPC before pushing.
3. **Atomic Cloud Function (`public.process_sync_operation`)**:
   - Single atomic transaction with `SECURITY DEFINER` (allowing desktop app to use `anon` key without elevated `service_role` keys).
   - **Idempotency**: checks `public.sync_operations(id)`. If previously applied, immediately returns `{ success: true, duplicate: true }`. Retries permitted for failed records.
   - **Tenant Isolation**: checks `p_school_id` against `public.schools` and enforces `payload.school_id = p_school_id`.
   - **Immutable Field Enforcement**: updates attempting to alter `id`, `student_code`, `sequence_number`, or `admission_year` are rejected with clear error messages.
   - **Optimistic Concurrency**: compares `incoming version` against `cloud version`. If `incoming < cloud`, returns `{ success: false, conflict: true, cloud_version: ... }`. If identical version and identical payload, treats as idempotent duplicate.
   - **Soft Delete**: `DELETE` operations set `deleted_at = now()`, increment version, and retain permanent identifier fields.
   - **Changelog Sequence**: each applied mutation inserts exactly one record into `public.sync_changes` with payload snapshot and generated identity cursor.

### Phase 2: Pull Synchronization Engine

Pull synchronization fetches remote mutations from Supabase `public.sync_changes` down to local SQLite clients, advancing checkpoints per device without causing echo loops or corrupting local data.

1. **Local Pull Service (`main/sync/pull.ts` - `pullRemoteChanges()`)**:
   - Resolves authorized school identity and persistent device ID (`main/sync/device.ts`).
   - Retrieves last pulled checkpoint from SQLite `sync_cursors` table (`main/sync/cursor.ts`). Defaults to `0` for fresh device installations to pull complete history.
   - Invokes `public.pull_sync_changes` via `SupabaseSyncClient` with PostgREST `/rest/v1/rpc/pull_sync_changes` requesting ordered batches (`id > cursor ORDER BY id ASC LIMIT batchSize`).
   - Applies batch mutations to local SQLite inside an **atomic SQLite transaction** (`applyPulledChangesTransaction`):
     - **Tenant validation**: changes belonging to another school are skipped.
     - **Students table**:
       - If student does not exist locally: inserts record with exact UUID, permanent `student_code`, `sequence_number`, `admission_year`, and sets `sync_status = 'synced'`. Automatically provisions placeholder class/academic level if needed for referential integrity.
       - If student exists locally: compares versions. If `remoteVersion < localVersion`, ignores stale remote change. If `remoteVersion > localVersion`, applies remote updates preserving permanent identifiers. If local has pending outbox items in `sync_queue` for this record, logs a concurrent edit conflict into `sync_conflicts`.
       - Soft deletion: if `operation = 'DELETE'`, sets local `deleted_at = now()`, increments version, and marks `sync_status = 'synced'`.
     - **Student ID Settings table**: updates `pattern`, `sequence_scope`, and advances `next_sequence_number = MAX(local, remote)` to prevent sequence back-sliding.
     - **No echo loop**: pulled changes are applied directly to local SQLite tables with `sync_status = 'synced'` and **never enqueued into `sync_queue`**.
     - **Atomic cursor advancement**: advances local SQLite `sync_cursors.last_synced_change_id` in the **same transaction**. If the whole-batch transaction throws, pull **retries each change individually** (`applyPulledChangesIndividually`) so one bad row cannot freeze the cursor and force Sync Now to crawl a handful of records at a time.
   - Upon successful local transaction commit, acknowledges cursor to Supabase via `public.update_sync_cursor` RPC.
   - Automatically paginates multi-batch backlogs inside one call (default **50** batches of up to **500** = cloud max). Cloud `update_sync_cursor` is acked every **5** applied pages (and at end of the call), while the local SQLite cursor still advances every page — fewer round-trips without changing correctness. When the per-call safety cap is hit, or a network/apply error pauses work, **`hasMore` stays `true`** so Join / Sync Now can continue draining.
2. **Server-Side RPCs (`supabase/migrations/20260907100737_add_pull_sync_rpcs.sql`)**:
   - `public.pull_sync_changes(p_school_id, p_device_id, p_cursor, p_limit)`: `SECURITY DEFINER` function querying `public.sync_changes` strictly for the authorized `p_school_id` with `id > p_cursor`, returning aggregated changes JSON, counts, and `new_cursor`.
   - `public.update_sync_cursor(p_school_id, p_device_id, p_cursor)`: `SECURITY DEFINER` function upserting `public.sync_cursors` with `GREATEST(last_synced_change_id, p_cursor)`.
3. **Two-Way Sync Coordination (`main/sync/worker.ts` - `runSyncWorker()` / `runSyncWorkerUntilCaughtUp()`)**:
   - Runs Push phase first (`pushPendingSync()`), followed by Pull phase (`pullRemoteChanges()`), returning aggregated counters plus top-level **`hasMore`** / **`message`** from either phase. Until-caught-up drains across safety-cap rounds.
   - Pull uses a dedicated page size (default **500**) and loops while `pull.hasMore` (default up to 100 outer pages). Hard pull errors stop the drain (no tight retry loop) but leave `hasMore=true` for the next Sync Now.
   - Join school (`main/services/join-school.ts`) drains the same way (up to 200 pages).
   - **Sync progress %:** main emits live `sync:progress` (phase, percent, upload/download counts). Push % = outbox drained; pull % uses cloud RPC `count_pending_sync_changes` (migration `20261009140000_count_pending_sync_changes.sql`). Home and Backup & Sync show a progress bar; without that migration, pull shows an indeterminate bar with applied counts. IPC: `backup-sync:sync-now`, `system-admin:sync-now`.

---

## Architecture notes (for developers)

| Layer | Location |
|-------|----------|
| UI pages | `renderer/pages/...` |
| IPC helpers | `renderer/lib/...` |
| Navigation | `renderer/lib/navigation.ts` (`comingSoon` until built; optional `permissions` per item) |
| IPC handlers | `main/ipc/` |
| Repositories | `main/db/repositories/` |
| Schema / migrations | `main/db/schema.ts` |
| Cloud sync migrations | `supabase/migrations/` |
| Types | `main/db/types.ts` |
| System rules | `RULES.md` (offline-first, soft delete, sync queue, no shadcn) |

**Patterns:** Soft deletes (`deleted_at`), sync fields on every table, repositories enqueue sync, renderer talks to main via `window.ipc.invoke` only (no REST).

**Main window:** `main/helpers/create-window.ts` always calls `maximize()` on create so Sofia launches full-screen on the display (window chrome kept; not exclusive kiosk fullscreen). Restored bounds still apply when the user un-maximizes.

**Nested Back:** `AppShell` shows a heading **Back** control on deep routes (detail, create/action, and module sub-pages). Parent href comes from `resolveNestedBackHref` (`renderer/lib/nested-back.ts`), or an explicit `backHref` / `backLabel` prop; pass `backHref={false}` to hide. Prefer this over ad-hoc page-level Back buttons.

**Permission-gated sidebar:** `AppShell` loads `auth:get-permissions`, then `filterNavSections` (`renderer/lib/navigation.ts`) so each user only sees modules they have at least one required permission for. Session role `admin` is unrestricted. Empty/`permissions` omitted = visible to all signed-in users (Dashboard, Help). Ctrl+K page hits use the same filtered tree. IPC handlers remain the real authorization gate; the sidebar is visibility only. `auth:get-permissions` and role screens call `RoleRepository.ensureDefaults`, which re-applies `SYSTEM_ROLE_SEEDS` permissions onto existing system roles (so an empty Bursar role is repaired instead of hiding Finance).

**Global search:** Header search / **Ctrl+K** (`renderer/components/layout/GlobalSearch.tsx`) searches sidebar pages and local SQLite records (students, teachers/staff, classes, subjects, departments, fee structures, invoices, users) via `search:global` (`main/ipc/global-search.ts`). Selecting a hit opens the matching profile or filtered list.

**Date display:** Human-facing dates use **Day → Month → Year** (`en-GB`) via `main/domain/date-format.ts` and `renderer/lib/date-format.ts` (`formatDisplayDate`, `formatDisplayDateTime`, etc.). Do not call `toLocaleDateString()` with the system locale in UI. HTML `<input type="date">` and DB storage remain ISO `YYYY-MM-DD`.

**Money display:** On the dashboard home and Reports & Analytics screens, amounts use compact **K** / **M** (`formatCompactMoney` / `formatCompactCurrency`). CSV export and Print / PDF use full figures with thousands separators (`formatMoney`, `MoneyText` print variant).

**After schema/IPC changes:** restart the Nextron process so migrations and handlers reload.

Key libs for built modules:

- Students: `renderer/lib/student-mgmt.ts` → `main/ipc/student-mgmt.ts` (includes `students:class-list` for print/export rosters; helpers in `main/domain/class-list.ts` / `renderer/lib/class-list.ts`)
- Student CSV import: `renderer/lib/students.ts` → `main/ipc/students.ts` (`students:import`); normalize + existing-class match in `main/domain/student-import.ts`
- Class order: `main/domain/class-order.ts` — level `sort_order`, then General → Commercial → Technical; applied in `ClassRepository.findStructureClasses` / `findBySchool` and section lists
- Staff: `renderer/lib/staff-mgmt.ts` → `main/ipc/staff-mgmt.ts`; teaching Assignment Builder `renderer/components/staff/TeachingAssignmentPicker.tsx` + helpers `main/domain/staff.ts` / `renderer/lib/teaching-assignments.ts` (class×subject pairs in `staff_subjects`)
- Finance: `renderer/lib/finance-mgmt.ts` → `main/ipc/finance-mgmt.ts`; extensions `renderer/lib/finance-ext.ts` → `main/ipc/finance-ext.ts`; fee package scope (residence / department / level / class) in `main/domain/fee-structure-scope.ts`; payment fee-line allocations `payment_allocations` + domain helpers in `main/domain/finance.ts` (`normalizePaymentLineAllocations`, `receiptPaidForLines`)
- Dashboard: `renderer/lib/dashboard.ts` → `dashboard:summary` (`main/ipc/dashboard.ts` → `main/services/dashboard.service.ts` + `main/domain/dashboard.ts`); charts via **recharts**
- Communication: `renderer/lib/communication-mgmt.ts` → `main/ipc/communication-mgmt.ts` (setup: `communication.ts`)
- Academic: `renderer/lib/academic-mgmt.ts` → `main/ipc/academic-mgmt.ts`; teaching progress `renderer/lib/teaching-progress.ts` → `main/ipc/teaching-progress.ts`
- Assessment Questions: `renderer/lib/assessment-questions.ts` → `main/ipc/assessment-questions.ts` → `main/db/repositories/assessment-questions.repository.ts`; PDFs `main/helpers/assessment-questions.ts` + `SYNCED_ASSET_FIELDS.assessment_question_paper_revisions`
- Help: `renderer/lib/help-docs.ts` + `renderer/lib/help-support.ts` → pages `/help/docs`, `/help/support` (no dedicated IPC; diagnostics via session + `updater:get-status`)
- Gate Scanner: `renderer/lib/gate-attendance.ts` → `main/ipc/gate-attendance.ts` (`gate-attendance:scan`, `gate-attendance:today-summary`); service `main/services/gate-attendance.ts`; table `gate_attendance`; feedback `renderer/lib/scanner-feedback.ts`
- Results calculation: `renderer/lib/results-calc.ts` → `main/ipc/results-calculation.ts` (`results-calc:defaults`, `results-calc:coefficients-list`, `results-calc:coefficients-save`, `results-calc:validate`, `results-calc:breakdown`, `results-calc:student-summary`); core calculation service `main/services/results/result-calculation.service.ts`; repositories `main/db/repositories/results-calculation.repository.ts` and `subject-coefficients.repository.ts`; table `result_subject_coefficients`
- School day schedule: `renderer/lib/day-schedule.ts` → `main/ipc/day-schedule.ts` (`day-schedule:get` / `day-schedule:save`); domain `main/domain/day-schedule.ts`; stored on `schools` + `school_day_breaks`; feeds `academic:meta` period count/times for the timetable
- Student ID cards: `renderer/lib/student-id-cards.ts` → `main/ipc/student-id-cards.ts`
- Reports: `renderer/lib/reports.ts` → `main/ipc/reports.ts`
- Documents: `renderer/lib/documents-mgmt.ts` → `main/ipc/documents-mgmt.ts` (setup templates remain `renderer/lib/documents.ts`)
- System Administration: `renderer/lib/system-admin.ts` → `main/ipc/system-admin.ts` (users soft-delete: `system-admin:users-delete` → `SystemAdminRepository.softDeleteUser` + `assertUserDeletable` in `main/domain/system-admin.ts`; RBAC `system.users.delete`; restore from file: `system-admin:backup-pick-restore-file` + `backup-restore-from-file` → `verifySqliteBackup` / `stageRestoreSource` in `main/db/sqlite-backup.ts` + `queueDatabaseRestore`)
- Teacher mobile sync: domain `main/domain/teacher-sync.ts`; notifications stub `main/services/teacher-notifications.ts`; readiness `main/services/prepare-teacher-mobile.ts` + `main/sync/auto-sync.ts`; cloud RPCs in `supabase/migrations/20260923200000_teacher_mobile_rpcs.sql` + `20261001100000_teacher_mobile_sync_phase_ab.sql`; docs in `docs/teacher-*.md`
- Auto-update (Windows): `main/updater.ts` + `main/ipc/updater.ts` (`updater:*`); UI `UpdateNotifier` in `AppShell`. Sidebar **Check for updates** (`AppSidebar` → `checkAppUpdate` / `updater:check` with `force: true`) re-prompts after “Later”. **`electron-updater` must stay a runtime dynamic import** (`loadAutoUpdater()` in `main/updater.ts`) — a static import is evaluated with the main chunk and breaks packaged Windows launch. Startup still pins `userData` first via `main/pin-user-data.ts`. Recovery evaluation does not load the updater module graph for native update checks until after the window is ready.
- Cloud Synchronization: Push engine in `main/sync/push.ts` (`pushPendingSync`), Pull engine in `main/sync/pull.ts` (`pullRemoteChanges`), cursor manager in `main/sync/cursor.ts`, coordinated worker in `main/sync/worker.ts` (`runSyncWorker`); table registry `main/sync/tables.ts`; generic apply `main/sync/apply-generic.ts`; conflict resolution in `main/sync/resolve-conflict.ts` (`applyConflictResolution`) via IPC `system-admin:sync-resolve` / `SystemAdminRepository.resolveConflict` (open-only list + keep-local/keep-remote side effects); PostgREST RPCs `process_sync_operation`, `process_synced_entity`, `register_device`, `pull_sync_changes`, and `update_sync_cursor`; client in `main/sync/supabase-client.ts`; device identity in `main/sync/device.ts`; outbox in `main/sync/queue.ts`; migrations in `supabase/migrations/`
- Secondary-desk join / Auth bootstrap: `main/services/join-school.ts` (`joinSchoolByCode` via `auth:join-school`) looks up school + registers device + pulls; `main/services/cloud-login.ts` (`signInWithSupabasePassword`) + `main/auth` `login` verify Supabase Auth membership against the joined `school_id`, upsert local profile, and prime offline hash. Wrong-school logins return a clear membership error (not “Invalid email or password”).
- Teacher / staff cloud Auth: `main/services/cloud-auth.ts` (`provisionStaffAuth`) calls Edge Function `supabase/functions/provision-staff-auth` (anon key); optional local fallback via `SUPABASE_SERVICE_ROLE_KEY`. Hooked from primary `registerAdmin`, `staff:upsert-teacher`, `staff:upsert-admin`, `staff:import-teachers`, `staff-mgmt:create`, and `system-admin:users-create` / `users-reset-password`. Deploy with `npx supabase functions deploy provision-staff-auth`.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-10-09 | **Release 1.0.6:** bumped `package.json` to **1.0.6** and tagged `v1.0.6` for Windows GitHub Release publish (faster pull: 500-change pages + batched cloud cursor acks). |
| 2026-10-09 | **Faster pull (safe):** default pull page size raised to cloud max **500**; cloud cursor ack batched every **5** pages (local cursor still advances each page). Fewer round-trips on second-desk hydrate without changing apply/FK rules. |
| 2026-10-09 | **Release 1.0.5:** bumped `package.json` to **1.0.5** and tagged `v1.0.5` for Windows GitHub Release publish (second-desk Sync Now drain + live sync progress %). Apply cloud migration `20261009140000_count_pending_sync_changes.sql` for accurate download percentages. |
| 2026-10-09 | **Sync progress %:** Sync Now shows a live percentage bar (upload + download). Push uses pending outbox count; pull uses new cloud RPC `count_pending_sync_changes` (`20261009140000_count_pending_sync_changes.sql`). IPC event `sync:progress`; UI on Home and Backup & Sync. |
| 2026-10-09 | **Second-desk Sync Now drain:** pull falls back to per-change apply when a batch aborts (so one bad row cannot freeze the cursor); worker uses larger pull pages, surfaces pull `hasMore`/`message`, and stops hard-error spin-loops; Home + Backup & Sync auto-continue Sync Now until the backlog clears — fixes desks that only advanced ~a dozen records per click. |
| 2026-10-09 | **Release 1.0.4:** bumped `package.json` to **1.0.4** and tagged `v1.0.4` for Windows GitHub Release publish (full multi-desk sync for all roles, finance pull FK stubs, payment fee-line allocations). Apply cloud migrations `20261008150000_full_ops_synced_entities.sql` and `20261009120000_payment_allocations_sync.sql`. |
| 2026-10-08 | **Full multi-desk sync for all roles:** added admissions/transfers/promotions/calendar/leave/teaching/`report_settings`/`student_settings` to sync allow-list (migration `20261008150000_full_ops_synced_entities.sql`); payload-driven FK stubs on pull; Sync Now backfills orphaned `sync_status=pending` rows into the outbox; result-calculation + subject-coefficient writes enqueue; push priority covers RBAC before finance. Any new bursar/secretary/principal desk can pull the school’s operational data. |
| 2026-10-08 | **Finance pull FK hardening:** second-desk pull no longer aborts when fee structures/invoices arrive before their academic year or student — generic apply creates version-0 parent stubs; fee catalogs push ahead of invoices. Fixes bursar desks that never received structures/invoices from the primary. |
| 2026-10-08 | **Release 1.0.3:** bumped `package.json` to **1.0.3** and tagged `v1.0.3` for Windows GitHub Release publish (includes second-desk pull drain fix so Join/Sync Now finish downloading large student/fee backlogs). |
| 2026-10-08 | **Second-desk student undercount:** `pullRemoteChanges` no longer always returns `hasMore: false` after its per-call batch cap — Sync Now and Join keep draining remaining cloud pages. Fixes bursar/second-desk dashboards that showed far fewer than the real active roster (e.g. dozens instead of 468). |
| 2026-10-08 | **Release 1.0.2:** bumped `package.json` to **1.0.2** and tagged `v1.0.2` for Windows GitHub Release publish (includes second-desk Auth bootstrap, sync conflict resolve, and role permission repair). |
| 2026-10-08 | **Role dashboard / RBAC:** every seeded system role (Principal, Vice Principal, Teacher, Bursar, Secretary, Registrar, Read Only, …) re-syncs catalog permissions on `ensureDefaults`; empty custom roles that match a seed name are repaired; custom roles cannot be saved with zero permissions; dashboard no longer crashes with “Finance settings not found”; creating a user on a zero-permission role is rejected. |
| 2026-10-09 | **Fee-line collections & student fee situation:** Financial Reports show collected amounts by fee line (chart + table + CSV); student profile opens with a Fee situation strip and Finance tab fee-line billed/paid/remaining (`finance-mgmt:student-summary`). |
| 2026-10-09 | **Payment fee-line allocation:** when recording a payment, cashiers choose which invoice fee lines are being paid; allocations persist on `payment_allocations`, drive receipt **Paid for**, and appear on the payments list/CSV export (FIFO fallback for older/online payments). Sync allow-list + `finance-mgmt:payments-record` `allocations`. |
| 2026-10-08 | **Second-desk bootstrap:** Join school no longer fails with “no user accounts were downloaded.” Join installs the school + device, then login uses Supabase Auth, checks school membership, creates/updates the local profile, and caches a local-only password hash for offline use. User `password_hash` is stripped from sync payloads. |
| 2026-10-08 | **Sync conflict resolve:** Backup & Sync Keep local/remote now clears open conflicts from the list (open-only query), resolves duplicate open rows for the same record in one click, applies outbox side effects (`main/sync/resolve-conflict.ts`), and surfaces success/error in the UI instead of a silent no-op. |
| 2026-10-07 | **Sidebar Check for updates:** full-width primary button above the profile footer calls `updater:check` (force) so admins can manually look for app updates; up-to-date / error feedback under the button; available updates still use `UpdateNotifier`. |
| 2026-10-07 | **Support email:** Contact Sofia Support and recovery mailto use `cherubtech7@gmail.com` (`SUPPORT_EMAIL` in `help-support.ts`). |
| 2026-10-07 | **Help & Support:** Documentation (`/help/docs`) and Contact Sofia Support (`/help/support`) unlocked in the sidebar — in-app guides plus mailto diagnostics to `cherubtech7@gmail.com`. |
| 2026-10-07 | **Compact money (K/M):** dashboard home and Reports & Analytics show shortened amounts; CSV export and Print use full comma-formatted values (`formatCompactMoney` / `formatMoney` / `MoneyText`). |
| 2026-10-07 | **Assessment Questions:** Academic Management → Assessment Questions — review/approve/reject teacher PDF question papers with revision history, print when approved, RBAC (`assessment_questions.*`), offline sync + Storage PDFs (`assessment-questions:*` IPC). |
| 2026-10-07 | **Reports charts:** each Reports & Analytics screen uses chart types suited to its data (bars, donuts, lines/areas, gauges) via shared recharts helpers (`renderer/components/reports/charts.tsx`). |
| 2026-10-07 | **Permission-gated modules:** sidebar and Ctrl+K page hits only show modules the signed-in user can access (`filterNavSections` + `auth:get-permissions`). School owners (`admin`) see all; other roles use catalog permissions on each nav item. |
| 2026-10-06 | **Local backup path:** if the configured backup folder is unwritable (common after USB restore onto another Windows user), fall back to `%APPDATA%\\sofia\\backups` and persist that path (`resolveWritableBackupLocation`). |
| 2026-10-06 | **Sync bootstrap:** first Sync on a never-synced / USB-restored primary creates the cloud school via `bootstrap_school_tenant` when `register_device` reports missing tenant (`main/sync/push.ts` + migration `20261006143000_bootstrap_school_tenant.sql`). |
| 2026-10-05 | **Dashboard:** removed Export PDF from the overview header; Sync + setup progress remain. |
| 2026-10-05 | **Dashboard redesign:** overview layout with 4 KPIs (incl. teachers + monthly revenue), growth/finance charts, admissions + activity + attendance gauge, Quick Actions & Attention rail; keeps Sofia Setup Progress + Sync; Sofia indigo primary. |
| 2026-10-05 | **Students list:** row actions are View profile and Edit details icon buttons (`?edit=1` opens the edit modal); search + Add student on a second toolbar row; sorted by class then name. |
| 2026-10-05 | **Nested Back:** `AppShell` auto-shows a Back control on deep routes via `resolveNestedBackHref` (`renderer/lib/nested-back.ts`); optional `backHref` / `backLabel`. |
| 2026-10-05 | **Wide global search:** Ctrl+K / header search queries school data (students, staff, classes, subjects, departments, fee packages, invoices, users) plus pages (`search:global`), and deep-links into profiles or filtered lists. |
| 2026-10-05 | **List UX:** students **Sort by** name/class; header **Ctrl/Cmd+K** global page search (`GlobalSearch`); duplicate guards for students (same class), teachers (same name), subjects (same level); fee structure + setup fee-category filters; Subjects page table with search/department filters and **Add new subject** modal. |
| 2026-10-05 | **Restore from backup file:** Administration → Backup & Sync → **Restore from file…** (`system-admin:backup-pick-restore-file` / `backup-restore-from-file`). Verifies SQLite integrity, stages a copy under `userData/backups/restore-staging`, safety-backs up the live DB, queues replace on restart. |
| 2026-10-05 | Dashboard top row shows a **Sync** button when the device is online (`useOnlineStatus` + `backup-sync:sync-now`); hidden offline. |
| 2026-10-05 | Desktop window always launches **maximized** (`main/helpers/create-window.ts`) so Sofia opens full-screen on the display while keeping the title bar. |
| 2026-10-01 | **Sync DELETE not-found is idempotent:** cloud `Student not found for DELETE` (row never pushed) marks the outbox item synced instead of failed, so Sync Now / Retry stop looping. Unsupported Phase-1 tables are discarded as synced (not failed) so they no longer inflate Failed. |
| 2026-10-01 | **Sync Now drains the outbox**: loops push batches (50× up to ~10 000 items) and pull pages until empty or safety cap; prioritizes staff / assignments / classes / timetable ahead of finance. UI shows progress message when more remain. |
| 2026-10-01 | **Teachers are mobile staff, not desktop users:** Staff → Teachers create/edit provisions Auth with `staff_id`, skips Administration user rows, and **auto-syncs** (`scheduleTeacherReadySync`) so assignments reach the Teacher app when online. Admin → Users rejects bare teacher accounts. |
| 2026-10-01 | **Teacher mobile sync Phase A/B:** architecture docs under `docs/teacher-*.md`; RPCs for classes/students/attendance/assessments/scores/announcements/config/bootstrap + authorized `teacher_push_entity`; sync allowlist `school_day_breaks`; day-schedule + `class_teacher_id` in desk column maps; notification event stub; domain tests. |
| 2026-09-23 | Administration **Users**: soft-delete accounts (`system-admin:users-delete`, permission `system.users.delete`). Revokes sessions and enqueues cloud DELETE. Blocked for self-delete and last active admin. Detail modal + bulk Delete selected. |
| 2026-09-23 | Sofia Teacher mobile API: RPCs `get_teacher_me`, `get_teacher_assignments`, `get_teacher_timetable` unpack `synced_entities` for JWT teachers (`app_metadata.staff_id` / `school_id`). Migration `20260923200000_teacher_mobile_rpcs.sql`. |
| 2026-09-23 | Teachers: **Assignment Builder** replaces the class×subject checkbox matrix on Add/Edit teacher (and Setup staff). Add assignment dialog: searchable class (grouped by section/level) → subjects offered in that class only; cards with edit / copy-to-classes / remove; summary counts; homeroom is a separate single select. Persistence unchanged (`staff_subjects` pairs). |
| 2026-09-23 | Bumped app version to **1.0.1** so tagged Windows publishes match `package.json` (electron-builder release tag). Docs note: git tag `vX.Y.Z` must equal `package.json` version. |
| 2026-09-23 | Windows CI: tagged `v*` builds no longer fail when `WINDOWS_CSC_*` secrets are missing — they build/publish **unsigned** with a warning (same as manual runs). |
| 2026-09-23 | **Display dates** are Day → Month → Year everywhere (e.g. `23 Sept 2026`, `23/09/2026`). Shared helpers: `main/domain/date-format.ts` + `renderer/lib/date-format.ts`. Storage and date inputs stay ISO `YYYY-MM-DD`. |
| 2026-09-23 | App icons: white background; **macOS .icns / icon.png** use baked corner radius; Windows `.ico` stays square (`npm run icons`). |
| 2026-09-23 | Dashboard term filter includes **All terms** (full academic year period for fees, trends, and results). |
| 2026-09-23 | Students list: **Incomplete only** profile filter (missing gender, DOB, or guardian phone). Dashboard Needs Attention links to `/students?incomplete=1` (`students:mgmt-list` + `main/domain/student-profile.ts`). |
| 2026-09-23 | Redesigned **Dashboard** (`/home`): real SQLite KPIs (students, today’s attendance, fees collected/outstanding), attendance & fee **line charts**, student distribution & academic performance **bar charts**, optional department donut, Needs Attention + Recent Activity. Aggregation via `dashboard:summary`; charts via **recharts**. |
| 2026-09-23 | Student billing: managers can **delete pending invoices** (row, detail, or bulk selected). Soft-delete via `finance-mgmt:invoices-delete`; refused if paid, partially paid, overdue, or linked payments/online requests/carried arrears. |
| 2026-09-22 | Payments **Record payment**: student picker is a typeahead search (name/ID) among students with outstanding invoices; invoice list is filtered to that student (auto-selected when only one). |
| 2026-09-22 | Student billing **Generate invoice**: student picker is a typeahead search (name/ID) with suggestion dropdown; selecting a student still auto-selects their class fee structure. |
| 2026-09-22 | Student billing **Generate invoice**: selecting a student auto-selects their class fee structure (day/boarding), preferring class-specific packages. |
| 2026-09-22 | List tables paginate **10 rows** per page: shared `StudentTable` / Setup `DataTable`, academic lists via `ClientPaginatedTable`, plus Staff Workload slots and School Departments/Subjects (`renderer/components/ui/table-pagination.tsx`). Timetable period×day grids are not paginated. |
| 2026-09-22 | Bulk invoice generate supports **All classes**: each active student is billed with their class fee structure (day/boarding), falling back to level/department packages when needed (`feeStructuresForBulkStudent`). |
| 2026-09-22 | Guardian **name** is optional on add student, edit details, and admissions; guardian **phone** remains required. |
| 2026-09-22 | Sidebar module menus are accordion-style: opening one group closes the others (`AppSidebar`). |
| 2026-09-22 | Fixed student edit failing with `NOT NULL constraint failed: students.status` (and residence): update no longer spreads IPC `undefined` fields over existing NOT NULL columns. |
| 2026-09-21 | Student / guardian phones use **Cameroon national format** (9 digits, no country code). `+237` / `237` / leading `0` are stripped; invalid numbers are rejected on create/edit/import (`main/domain/phone.ts`). |
| 2026-09-21 | Student CSV import also reads **Place of Birth**, **Parent Name**, **Parent Contact** (phone), Parent Email, and Relationship; stored on the student record. Template download updated. |
| 2026-09-21 | Class list table: Name (and other data columns) size to content; the empty marks/signature column expands to fill remaining width. |
| 2026-09-21 | Student profile stores **place of birth** (`students.place_of_birth`): add/edit forms, overview, local schema migration, pull sync, and cloud `process_sync_operation` (`20260921090000_students_place_of_birth.sql`). Setup already had a Place of Birth field toggle. |
| 2026-09-21 | Class list print/CSV: choose optional columns beyond full name (sex, student ID, DOB, age, guardian, residence, blank notes column). Index + name always shown; selection is remembered locally. |
| 2026-09-20 | Creating a teacher (or staff user with email) on desktop also provisions **Supabase Auth** for Sofia Teacher via Edge Function `provision-staff-auth` (`main/services/cloud-auth.ts`). Temp password remains `Sofia@Staff1`. Staff Mgmt → Add teacher now creates a local login when email is set. |
| 2026-09-20 | Added desktop test teacher `sofia.teacher.lwm@gmail.com` / `Sofia@Teacher1` (LWM) and `scripts/provision-teacher-auth.ts` to create the matching Supabase Auth user for the Expo teacher app (needs `SUPABASE_SERVICE_ROLE_KEY`). |
| 2026-09-20 | Fee structures support **edit** and **duplicate** (`finance-mgmt:structures-update`). Student profile **Edit details** updates personal, placement, residence, and guardian fields (student ID unchanged). Receipts show **Paid for** fee components with charged vs paid-this-receipt amounts via FIFO allocation (`allocatePaymentToLines`). |
| 2026-09-18 | Student CSV import title-cases full names (`ADA BIYA` → `Ada Biya`, including hyphen/apostrophe tokens) and stores sex as Male/Female from `M`/`F`/`male`/`female`. |
| 2026-09-18 | Receipt templates include **Amount paid** and **Balance remaining** (`{{receipt.amountPaid}}`, `{{receipt.balance}}`, plus invoice totals). Default body updated; existing receipt templates missing those fields are backfilled on catalog ensure. |
| 2026-09-18 | Official documents (admission letters, receipts, certificates, transcripts) share the report-card Cameroon bilingual ministry letterhead (FR · logo · EN) via `wrapOfficialHtml` / `DOCUMENT_PRINT_CSS`; defaults from `DEFAULT_BILINGUAL_HEADER`. |
| 2026-09-18 | Billing respects day vs boarding fee packages: generate-invoice lists only structures matching the student residence (and department/level/class); bulk generate pre-filters by `applies_to_residence`; fee-structure form clarifies Day / Boarding packages for mixed schools. |
| 2026-09-18 | Fee structures can target a **department** (Academic Structure section: General / Commercial / Technical). Invoice generation and bulk billing enforce department + level + class + residence scope (`main/domain/fee-structure-scope.ts`). Light World seed stores `section_id` on fee packages so Gen/Commercial bands stay distinct from Technical. |
| 2026-09-17 | Login hides Join/Create when local users already exist (those routes redirect to Login once setup is done); shows a short note instead. |
| 2026-09-17 | Multi-desk **Step 9**: Storage bucket `school-assets` for logo/stamp/signature + student photos; Sync Now enabled for pull-only; Admin sync dashboard shows queue **by table**; ops guide for primary desk / Sync cadence. Migration `20260917130000_school_assets_storage.sql`. |
| 2026-09-17 | Multi-desk **communication sync (Step 8)**: announcements, internal notices, deliveries, parent threads/messages, notification templates, and channel settings via `synced_entities`. Migration `20260917120000_communication_synced_entities.sql`. |
| 2026-09-17 | Multi-desk **documents & ID cards sync (Step 7)**: templates, issued docs, ID card designer metadata/jobs/cards via `synced_entities`; document/ID sequence counters merge with MAX. Migration `20260917110000_documents_id_cards_synced_entities.sql`. Binary asset files remain local. |
| 2026-09-17 | Multi-desk **academics & attendance sync (Step 6)**: timetable, class/gate/staff attendance, CA/exams, result calculation + runs/rows/summaries, report cards via `synced_entities`; locked result runs do not regress or soft-delete on pull. Migration `20260917100000_academics_synced_entities.sql`. |
| 2026-09-17 | Multi-desk **finance sync (Step 5)**: fee config + invoices/payments/receipts/expenses/budgets/etc. via `synced_entities`; `finance_settings` counters merge with MAX(local, remote). Migration `20260917090000_finance_synced_entities.sql`. |
| 2026-09-17 | Pre-login **Join existing school** (`/join`): secondary desks enter school short code, register device, pull users/structure from cloud, then log in with shared accounts. RPC `lookup_school_by_code`. Fresh installs open Login (Join + Create links). |
| 2026-09-17 | Multi-desk sync MVP: generic `synced_entities` + `process_synced_entity` RPC; sync school foundation, users/RBAC, and light staff across desks (students already synced). Finance/results/docs still local-only. |
| 2026-09-17 | Student CSV import matches existing classes from Level + Department + Specialization (never creates classes), stores date of birth and day/boarding residence for fee structures, and reports skip reasons. Template columns: Full Name, Date of Birth, Level, Department, Specialization, Residence Type, Gender. |
| 2026-09-16 | Setup → Documents: report card template shows a live scaled preview of the official A4 bilingual layout (`ReportCardSetupPreview`) as header, footer, logo, stamp, and signature options change. |
| 2026-09-16 | Official bilingual A4 Student Report Card: ministry FR/EN header, dynamic school branding, results-engine grades + GCE column, class stats, grading-scale legend, signatures; template snapshot in `report_cards.payload` for historical reproducibility. |
| 2026-09-16 | Gate Scanner uses standard AppShell sidebar (no chrome-less takeover); Entrance look is content-only styling. |
| 2026-09-16 | Gate Scanner attendance: USB HID QR entrance check-in at `/academic/attendance/gate-scanner` using immutable `student_code`; `gate_attendance` table with same-day duplicate protection; offline SQLite + sync queue; Web Audio feedback; nav + Attendance hub links. |
| 2026-09-16 | ID Cards: **draft** school templates can always be deleted (gallery + designer); deleting a draft soft-removes any test cards generated from it. Active/archived templates with issued cards still must be archived. |
| 2026-09-16 | ID Cards Template 1: square **1:1** photo (24×24 mm); front field block kept clear of footer decorations with ≥3.5 mm gap. |
| 2026-09-16 | ID Cards Template 1: Sofia Blue (`#1580CF`) accents (no green); **QR-only on back** (`sofia:stu:{student_code}`); removed front barcode; `parseStudentQrPayload` for future offline scanner; Templates 2–3 unchanged. |
| 2026-09-16 | ID Cards Template 1 (THE HERITAGE / CLASSIC): full portrait CR80 redesign (53.98×85.60 mm) with navy/green SVG curves, Inter typography, 24×30 mm photo, Code128 on `student_code`, back QR verification token; design tokens + factory modules; system template hash refresh; path shapes in `CardSurface`; tests for dimensions/barcode uniqueness. |
| 2026-09-16 | Stable checkpoint: promoted `bisect/windows-launch` to `main` and tagged `sofia-windows-stable` (packaged Windows launch with lazy `electron-updater`). |
| 2026-09-16 | App icons: regenerated `resources/icon.png` / `.icns` / `.ico` from official `renderer/assets/images/sofia-icon.png` (replaced incorrect white-bg experiment); added `npm run icons` (`scripts/generate-icons.mjs`); ship `icon.png` via `extraResources` for packaged dock/window icon. |
| 2026-09-16 | Re-enabled Windows auto-update on `bisect/windows-launch` with **lazy `electron-updater`**: `loadAutoUpdater()` uses dynamic `import()` only when init/check/download/install runs; recovery eval + updater IPC + `UpdateNotifier` restored. Static import of `electron-updater` must not return (breaks packaged Windows). Retest Windows cold launch required. |
| 2026-09-16 | Windows launch bisect **confirmed**: packaged Windows launches on `bisect/windows-launch` with sync + userData pin when the entire `electron-updater` import graph is disabled. Breaker is updater load, not pin/appId. Next: re-enable updater only via post-`whenReady` lazy import (see `REAPPLY_REVERTED_COMMITS.md`). |
| 2026-09-16 | Packaged Mac launch: `ERR_MODULE_NOT_FOUND` for `@supabase/supabase-js` because deps were missing from `node_modules` (electron-builder logged `@undefined` paths). Fixed by `npm install` + rebuild; docs note full install before `build:mac` / `build:win` and Intel vs arm64 DMG choice. |
| 2026-09-16 | Windows launch bisect: appId restore alone did not fix launch. Disabling entire `electron-updater` import graph on `bisect/windows-launch` (no updater IPC, no UpdateNotifier, no dynamic updater import) while keeping userData pin — isolates whether electron-updater itself crashes packaged Windows. Startup also writes `%APPDATA%\\sofia\\sofia-startup.log`. |
| 2026-09-15 | Windows launch bisect: after commit 3 still failed with startup-order fix; next isolation — restore original `appId` `com.sofia.app` / productName `SOFIA` (commit 3 had changed these to `com.sofia.school` / `Sofia`). |
| 2026-09-15 | Bisect Windows launch: re-applied sync/packaging commit (`reapply/01`) on branch `bisect/windows-launch` while keeping current icon + signing config — test whether sync alone breaks Windows launch. |
| 2026-09-15 | Windows launch bisect: commits 1–2 (sync / supabase-js) launch OK; **commit 3 (updater + userData pin)** breaks packaged Windows. Fix on `bisect/windows-launch`: pin `userData` before other imports, lazy `electron-store`, defer `electron-updater` import until after `app.whenReady`, non-fatal updater evaluation. |
| 2026-09-15 | Windows packaging: regenerated `resources/icon.ico` as a multi-size ICO (16–256px) from `icon.png` so electron-builder accepts it (requires ≥256×256; old file was 32×32 only). |
| 2026-09-15 | Windows Authenticode: GitHub Actions passes `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` (and `CSC_*` aliases) from repository secrets; tagged `v*` releases require the cert; `win.signtoolOptions` uses SHA-256 + DigiCert RFC3161 timestamp (electron-builder 26 schema). Docs cover how to base64-encode the `.pfx`. |
| 2026-09-15 | Windows CI baseline: added `build:win` / `build:mac` / `build:all` npm scripts (`nextron build --win`, `--publish never`) so `.github/workflows/build-windows.yml` works after the reset to the pre-sync launch baseline. |
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
