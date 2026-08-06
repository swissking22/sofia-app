# SOFIA

**SOFIA** is an offline-first school management desktop application. It runs locally on each machine, stores all data in SQLite, and talks between the UI and the database through Electron IPC — no internet required for day-to-day use.

Built with [Nextron](https://github.com/saltyshiomix/nextron) (Electron + Next.js), TypeScript, Tailwind CSS, and `better-sqlite3`.

---

## Features

### Ready to use

| Area | What’s included |
|------|-----------------|
| **Setup wizard** | School profile, academic year, structure, grading, staff, roles, student IDs, import, finance/docs/comms/backup setup |
| **Dashboard** | Enrollment and overview KPIs |
| **School management** | Profile, year/terms, classes, departments, subjects |
| **Student management** | Roster, create (auto student ID), profile tabs, admissions (approve → student), transfers, promotion, documents, alumni |
| **Academic management** | Timetable, attendance, continuous assessment, exams, results processing/publish, report cards, academic reports |

### Coming soon

Staff directory & leave, full finance operations, communication center, cross-cutting analytics hub, assignments, and system admin screens. See [DOCS.md](./DOCS.md) for the live status of each screen.

---

## Requirements

- **Node.js** 20+ (LTS recommended)
- **npm** (or yarn / pnpm)
- macOS, Windows, or Linux (Electron)

Native module `better-sqlite3` is rebuilt for Electron via `postinstall`.

---

## Getting started

```bash
# Install dependencies
npm install

# Start development (Next.js renderer + Electron)
npm run dev
```

On first launch:

1. Register / sign in.
2. Complete the **Setup wizard** (`/setup/...`).
3. Prefer finishing **Academic structure**, **Grading system**, and **Student ID** before heavy student or results work.

### Production build

```bash
npm run build
```

Output goes to `dist/` (see `electron-builder.yml`). Product name: **SOFIA** (`com.sofia.app`).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run the app in development with hot reload |
| `npm run build` | Package a production Electron build |
| `npm test` | Run Jest unit tests (finance & staff business logic) |
| `npm run seed` | Populate `data/sofia.seed.db` with demo school data |
| `npm run seed:dev` | Reset & seed the Electron development `sofia.db` |
| `npm run postinstall` | Install Electron native deps (runs after `npm install`) |

---

## Project structure

```
sofia/
├── main/                 # Electron main process
│   ├── db/               # SQLite schema, types, repositories
│   ├── ipc/              # IPC handlers (no REST API)
│   ├── sync/             # Sync queue (offline-ready)
│   ├── services/         # Domain services (finance, staff, student ID)
│   ├── domain/           # Pure business rules (money, leave, aging)
│   ├── helpers/          # Window, assets, file helpers
│   ├── auth/             # Session / auth
│   └── main.ts           # Entry
├── tests/                # Jest unit tests (mocked repositories)
├── scripts/seed/         # Fake demo data seeder (Faker + better-sqlite3)
├── renderer/             # Next.js UI
│   ├── pages/            # Routes (setup, school, students, academic, …)
│   ├── components/       # Shared UI
│   └── lib/              # IPC client helpers + navigation
├── resources/            # App icons for packaging
├── DOCS.md               # Product / how-to documentation
├── RULES.md              # Mandatory engineering rules
└── package.json
```

---

## Architecture

- **Offline first** — all data lives in a local SQLite database.
- **IPC only** — the renderer calls `window.ipc.invoke(...)`; there is no HTTP API.
- **Repositories** — every create/update/delete goes through repositories that soft-delete and enqueue sync records.
- **Sync-ready** — `sync_status` / `version` / `sync_queue` are maintained now; remote sync comes later.
- **UI** — Tailwind CSS v4, Hugeicons; no shadcn.

Engineering constraints are spelled out in [RULES.md](./RULES.md).

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [DOCS.md](./DOCS.md) | How to use each built module (routes, workflows, changelog) |
| [RULES.md](./RULES.md) | Stack, DB, sync, and coding rules for contributors / agents |

When you add a module or change a user-facing workflow, update **DOCS.md** in the same change.

---

## Typical academic workflow

1. Configure school structure, subjects, grading, and staff (Setup / School).
2. Enroll students (auto ID on create).
3. Optional: build timetable; take attendance.
4. Enter **CA** scores → create **exams** and enter scores.
5. **Process** results for class + term → **publish** (optionally lock).
6. **Generate** report cards → view / print.
7. Review summaries under **Academic reports**.

---

## Development notes

- After schema or IPC changes, **restart** the Nextron process so migrations and handlers reload.
- Database files are ignored by git (`*.db`). Dev DB lives under the Electron user data directory.
- Navigation for unfinished areas uses `comingSoon` in `renderer/lib/navigation.ts`.

---

## License

Private project (`"private": true` in `package.json`). Copyright © 2026 SOFIA.
