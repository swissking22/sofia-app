# 🚨 SOFIA SYSTEM RULES (MANDATORY)

You are building SOFIA, an offline-first school management desktop application.

You MUST follow ALL rules below strictly. Do not deviate.

---

# 🧠 CORE PRINCIPLES

1. OFFLINE FIRST
- The system must work 100% without internet
- All data is stored locally using SQLite
- No external API calls

2. SYNC-READY ARCHITECTURE
- Every data change MUST be tracked
- Sync will be implemented later
- NEVER skip sync tracking

3. SIMPLE MVP
- Do NOT over-engineer
- Do NOT introduce unnecessary libraries
- Keep code clean and minimal

---

# 🧱 TECH STACK (FIXED)

- Nextron (Electron + Next.js)
- TypeScript
- SQLite (better-sqlite3)
- Tailwind CSS
- Electron IPC (NO REST API)

---

# 📁 PROJECT STRUCTURE (MANDATORY)

/main
  /db
    index.ts
    schema.ts
    /repositories
  /ipc
  /sync
  index.ts

/renderer
  /pages
  /components
  /layouts
  /lib

---

# 🗄️ DATABASE RULES

## 🔴 ALL TABLES MUST INCLUDE:

- id (uuid)
- created_at
- updated_at
- deleted_at (nullable)
- sync_status (pending, synced)
- version (integer, default 1)

---

## 🔴 SOFT DELETE ONLY

- NEVER hard delete records
- Use deleted_at instead

---

## 🔴 VERSIONING

- Every UPDATE must:
  - increment version
  - update updated_at

---

## 🔴 SYNC QUEUE (CRITICAL)

Table: sync_queue

Fields:
- id
- table_name
- record_id
- operation (INSERT, UPDATE, DELETE)
- payload (JSON string)
- status (pending, synced, failed)
- retry_count
- last_attempt_at
- created_at

---

# 🔄 SYNC RULES (MANDATORY)

Every repository operation MUST:

### CREATE
- Insert into main table
- Insert into sync_queue (operation = INSERT)

### UPDATE
- Update main table
- Increment version
- Insert into sync_queue (operation = UPDATE)

### DELETE
- Set deleted_at
- Insert into sync_queue (operation = DELETE)

---

## 🔴 PAYLOAD RULE

- Store FULL RECORD snapshot in payload
- Must include id + updated_at

---

# 🧠 REPOSITORY PATTERN (MANDATORY)

ALL database access MUST go through repositories.

Each repository MUST have:

- create()
- update()
- delete()
- findAll()
- findById()

Repositories MUST:
- Handle timestamps
- Handle versioning
- Handle sync_queue writes

---

# 🔌 IPC RULES

- Renderer MUST NOT access DB directly
- All communication goes through IPC

---

# 🔐 AUTH RULES

- Passwords MUST be hashed (bcrypt)
- NEVER store plain passwords

---

# 🎨 UI RULES

- Use Tailwind CSS
- Keep UI simple and clean
- No complex design systems
- Always use Tailwind CSS v4 canonical class syntax for CSS variables:
  - Prefer `bg-(--sofia-primary)`, `focus:border-(--sofia-primary)`, `focus:ring-(--sofia-primary)/15`
  - Never use `bg-[var(--sofia-primary)]`, `focus:border-[var(--sofia-primary)]`, or similar `[var(--token)]` forms
  - When editing a file that still uses the old form, convert those classes to the canonical form

---

# 🚫 FORBIDDEN

DO NOT:

❌ Use external APIs  
❌ Use Prisma / ORM  
❌ Use Redux  
❌ Use REST server  
❌ Hard delete data  
❌ Skip sync_queue  
❌ Store plain passwords  

---

# ⚙️ SYNC WORKER RULES

- Read from sync_queue
- Simulate sending to server
- Mark as "synced"
- DO NOT call real API

---

# 🧪 TESTING RULES

Every feature MUST be testable via:

1. Create data
2. Update data
3. Delete data

Verify:
- sync_queue is updated correctly

---

# 🚀 DEVELOPMENT ORDER (STRICT)

1. Database connection
2. Schema creation
3. Sync queue logic
4. Repository layer
5. Auth system
6. IPC layer
7. UI (login/register)
8. Dashboard
9. Modules (students, classes, subjects)
10. Sync worker

---

# ⚠️ FINAL RULE

If unsure:

👉 Choose SIMPLE over COMPLEX  
👉 Choose LOCAL over NETWORK  
👉 Choose WORKING over PERFECT  

---

# ✅ OUTPUT REQUIREMENTS

When generating code:

- Use TypeScript
- Use async/await
- Keep functions small and reusable
- Add comments for important logic

---

# 🔥 ENFORCEMENT

If any rule is violated:
STOP and FIX before continuing.

DO NOT proceed with invalid architecture.