/**
 * Sunrise Academy — timetable mock data + teacher mobile readiness.
 *
 * - Sets day schedule (8 periods, Mon–Fri)
 * - Fills timetable_slots from staff_subjects (avoids teacher clashes)
 * - Ensures Teacher-role desktop users + provisions Supabase Auth for mobile
 *
 * Usage:
 *   npx tsx scripts/seed/seedSunriseTimetableTeachers.ts --dev
 *
 * Mobile login (after Sync Now on desktop):
 *   any teacher email @sofia.demo  /  Sofia@Staff1
 */

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { hashSync } from 'bcryptjs'
import { DEFAULT_DAY_SCHEDULE } from '../../main/domain/day-schedule'
import { openSeedDatabase, resolveDefaultDbPath } from './db'
import { baseFields, runInTransaction } from './helpers'

const SCHOOL_NAME = 'Sunrise Academy'
const STAFF_TEMP_PASSWORD = 'Sofia@Staff1'
const DAYS = [1, 2, 3, 4, 5] as const // Mon–Fri
const ROOMS = ['A1', 'A2', 'B1', 'B2', 'Lab 1', 'Lab 2', 'Hall'] as const
const BCRYPT_ROUNDS = 10

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const has = (flag: string) => args.includes(flag)
  return {
    dbPath: get('--db') || resolveDefaultDbPath(has('--dev')),
    skipAuth: has('--skip-auth'),
  }
}

/** Load repo `.env` without pulling Electron-bound sync modules. */
function loadEnvFile(): void {
  if (typeof (process as { loadEnvFile?: () => void }).loadEnvFile === 'function') {
    try {
      ;(process as { loadEnvFile: () => void }).loadEnvFile()
      return
    } catch {
      /* missing or already loaded */
    }
  }
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

async function provisionTeacherAuth(input: {
  email: string
  password: string
  schoolId: string
  staffId: string
  schoolName: string
  displayName: string
}): Promise<void> {
  loadEnvFile()
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1\/?$/, '')
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    ''
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''

  const payload = {
    email: input.email,
    password: input.password,
    role: 'teacher' as const,
    school_id: input.schoolId,
    staff_id: input.staffId,
    school_name: input.schoolName,
    display_name: input.displayName,
    reset_password: true,
  }

  // Prefer Edge Function (same path as desktop)
  if (url && anonKey) {
    const res = await fetch(`${url}/functions/v1/provision-staff-auth`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const body = (await res.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; error?: string }
      | null
    if (res.ok && body && 'ok' in body && body.ok === true) return
    if (!serviceKey) {
      const message =
        body && 'error' in body && body.error
          ? body.error
          : `Cloud auth provision failed (${res.status}).`
      throw new Error(message)
    }
  }

  if (!url || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for Auth provision.'
    )
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const appMetadata = {
    role: 'teacher',
    school_id: input.schoolId,
    staff_id: input.staffId,
    school_name: input.schoolName,
  }
  const userMetadata = { full_name: input.displayName }

  let existing: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null =
    null
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === input.email.toLowerCase()
    )
    if (match) {
      existing = match
      break
    }
    if (data.users.length < 200) break
  }

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      password: input.password,
      app_metadata: { ...existing.app_metadata, ...appMetadata },
      user_metadata: { ...existing.user_metadata, ...userMetadata },
    })
    if (error) throw error
    return
  }

  const { error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  })
  if (error) throw error
}

function splitDisplayName(displayName: string): {
  first_name: string
  last_name: string
} {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { first_name: 'Teacher', last_name: '' }
  if (parts.length === 1) return { first_name: parts[0]!, last_name: '' }
  return {
    first_name: parts[0]!,
    last_name: parts.slice(1).join(' '),
  }
}

type Assignment = { subject_id: string; staff_id: string; subject_name: string }

async function main(): Promise<void> {
  const { dbPath, skipAuth } = parseArgs(process.argv)
  console.log(`[sofia:seed] Sunrise timetable + teachers → ${dbPath}`)

  const db = openSeedDatabase({ dbPath, reset: false })
  const now = new Date().toISOString()
  const schedule = DEFAULT_DAY_SCHEDULE
  const passwordHash = hashSync(STAFF_TEMP_PASSWORD, BCRYPT_ROUNDS)

  try {
    const school = db
      .prepare(
        `SELECT id, name FROM schools
         WHERE deleted_at IS NULL AND name = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(SCHOOL_NAME) as { id: string; name: string } | undefined
    if (!school) throw new Error(`School “${SCHOOL_NAME}” not found.`)

    // --- Day schedule ---
    runInTransaction(db, () => {
      db.prepare(
        `UPDATE schools SET
           day_start_time = ?,
           day_end_time = ?,
           period_duration_minutes = ?,
           periods_per_day = ?,
           max_teacher_periods = COALESCE(max_teacher_periods, 30),
           updated_at = ?,
           sync_status = 'pending',
           version = version + 1
         WHERE id = ?`
      ).run(
        schedule.day_start_time,
        schedule.day_end_time,
        schedule.period_duration_minutes,
        schedule.periods_per_day,
        now,
        school.id
      )

      db.prepare(
        `UPDATE school_day_breaks SET deleted_at = ?, updated_at = ?, sync_status = 'pending'
         WHERE school_id = ? AND deleted_at IS NULL`
      ).run(now, now, school.id)

      const insertBreak = db.prepare(`
        INSERT INTO school_day_breaks (
          id, school_id, name, after_period, duration_minutes, sort_order,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @name, @after_period, @duration_minutes, @sort_order,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )
      `)
      schedule.breaks.forEach((b, i) => {
        insertBreak.run({
          ...baseFields(now),
          school_id: school.id,
          name: b.name,
          after_period: b.after_period,
          duration_minutes: b.duration_minutes,
          sort_order: i,
        })
      })
    })
    console.log(
      `  Day schedule: ${schedule.periods_per_day} periods, ${schedule.day_start_time}–${schedule.day_end_time}`
    )

    const classes = db
      .prepare(
        `SELECT id, name FROM classes
         WHERE school_id = ? AND deleted_at IS NULL AND is_active = 1
         ORDER BY name`
      )
      .all(school.id) as Array<{ id: string; name: string }>

    // Soft-delete existing slots for this school
    runInTransaction(db, () => {
      db.prepare(
        `UPDATE timetable_slots SET deleted_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
         WHERE school_id = ? AND deleted_at IS NULL`
      ).run(now, now, school.id)
    })

    const insertSlot = db.prepare(`
      INSERT INTO timetable_slots (
        id, school_id, class_id, subject_id, staff_id,
        day_of_week, period_number, room,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @class_id, @subject_id, @staff_id,
        @day_of_week, @period_number, @room,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    /** staff_id → set of "day:period" already taken */
    const teacherBusy = new Map<string, Set<string>>()

    function isBusy(staffId: string, day: number, period: number): boolean {
      return teacherBusy.get(staffId)?.has(`${day}:${period}`) ?? false
    }
    function markBusy(staffId: string, day: number, period: number): void {
      let set = teacherBusy.get(staffId)
      if (!set) {
        set = new Set()
        teacherBusy.set(staffId, set)
      }
      set.add(`${day}:${period}`)
    }

    let slotCount = 0

    runInTransaction(db, () => {
      for (const klass of classes) {
        const assignments = db
          .prepare(
            `SELECT ss.subject_id, ss.staff_id, s.name AS subject_name
             FROM staff_subjects ss
             JOIN subjects s ON s.id = ss.subject_id
             WHERE ss.class_id = ? AND ss.deleted_at IS NULL
               AND s.deleted_at IS NULL
             ORDER BY s.name`
          )
          .all(klass.id) as Assignment[]

        if (!assignments.length) {
          console.warn(`  Skip ${klass.name}: no staff_subjects`)
          continue
        }

        const periodsPerWeek = DAYS.length * schedule.periods_per_day
        const roster: Assignment[] = []
        let i = 0
        while (roster.length < periodsPerWeek) {
          roster.push(assignments[i % assignments.length]!)
          i += 1
          if (i >= assignments.length * 3) break
        }
        while (roster.length < periodsPerWeek) {
          roster.push(assignments[roster.length % assignments.length]!)
        }

        let rosterIdx = 0
        let classSlots = 0
        for (const day of DAYS) {
          for (let period = 1; period <= schedule.periods_per_day; period++) {
            let chosen: Assignment | null = null
            for (let attempt = 0; attempt < roster.length; attempt++) {
              const cand = roster[(rosterIdx + attempt) % roster.length]!
              if (!isBusy(cand.staff_id, day, period)) {
                chosen = cand
                rosterIdx = (rosterIdx + attempt + 1) % roster.length
                break
              }
            }
            if (!chosen) {
              chosen = roster[rosterIdx % roster.length]!
              rosterIdx = (rosterIdx + 1) % roster.length
            }

            markBusy(chosen.staff_id, day, period)
            insertSlot.run({
              ...baseFields(now),
              school_id: school.id,
              class_id: klass.id,
              subject_id: chosen.subject_id,
              staff_id: chosen.staff_id,
              day_of_week: day,
              period_number: period,
              room: ROOMS[(day + period + classSlots) % ROOMS.length],
            })
            slotCount += 1
            classSlots += 1
          }
        }
        console.log(
          `  ${klass.name}: ${classSlots} slots · ${assignments.length} subject assignments`
        )
      }
    })

    console.log(`  Timetable slots created: ${slotCount}`)

    // --- Teacher desktop users (Teacher role) ---
    const teacherRole = db
      .prepare(
        `SELECT id FROM roles
         WHERE school_id = ? AND name = 'Teacher' AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(school.id) as { id: string } | undefined
    if (!teacherRole) {
      throw new Error('Teacher role missing — run seed/setup first.')
    }

    const teachers = db
      .prepare(
        `SELECT id, full_name, email FROM staff
         WHERE school_id = ? AND deleted_at IS NULL
           AND staff_type = 'teaching' AND status = 'active'
           AND email IS NOT NULL AND trim(email) != ''
         ORDER BY full_name`
      )
      .all(school.id) as Array<{
      id: string
      full_name: string
      email: string
    }>

    console.log(
      `\n  Preparing ${teachers.length} teachers for mobile (password ${STAFF_TEMP_PASSWORD})…`
    )

    const findUser = db.prepare(
      `SELECT id, school_id FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL LIMIT 1`
    )
    const updateUser = db.prepare(`
      UPDATE users SET
        staff_id = ?, role = 'teacher', role_id = ?, status = 'active',
        first_name = ?, last_name = ?, password_hash = ?,
        updated_at = ?, sync_status = 'pending', version = version + 1
      WHERE id = ?
    `)
    const insertUser = db.prepare(`
      INSERT INTO users (
        id, school_id, email, password_hash, role, role_id,
        first_name, last_name, phone, status, last_login_at, staff_id,
        failed_login_count, locked_until, must_change_password,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @email, @password_hash, 'teacher', @role_id,
        @first_name, @last_name, NULL, 'active', NULL, @staff_id,
        0, NULL, 0,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)
    const linkStaff = db.prepare(`
      UPDATE staff SET user_id = ?, updated_at = ?, sync_status = 'pending', version = version + 1
      WHERE id = ?
    `)

    let okUsers = 0
    const userWarnings: string[] = []

    runInTransaction(db, () => {
      for (const teacher of teachers) {
        const email = teacher.email.trim().toLowerCase()
        const names = splitDisplayName(teacher.full_name)
        const existing = findUser.get(email) as
          | { id: string; school_id: string }
          | undefined

        if (existing) {
          if (existing.school_id !== school.id) {
            userWarnings.push(
              `${email}: already used by another school account`
            )
            continue
          }
          updateUser.run(
            teacher.id,
            teacherRole.id,
            names.first_name,
            names.last_name,
            passwordHash,
            now,
            existing.id
          )
          linkStaff.run(existing.id, now, teacher.id)
          okUsers += 1
          continue
        }

        const fields = baseFields(now)
        insertUser.run({
          ...fields,
          school_id: school.id,
          email,
          password_hash: passwordHash,
          role_id: teacherRole.id,
          first_name: names.first_name,
          last_name: names.last_name,
          staff_id: teacher.id,
        })
        linkStaff.run(fields.id, now, teacher.id)
        okUsers += 1
      }
    })

    console.log(`  Desktop Teacher users: ${okUsers}`)
    if (userWarnings.length) {
      console.log('  User warnings:')
      for (const w of userWarnings) console.log(`    - ${w}`)
    }

    // --- Supabase Auth ---
    let okAuth = 0
    const authWarnings: string[] = []

    if (!skipAuth) {
      for (const teacher of teachers) {
        try {
          await provisionTeacherAuth({
            email: teacher.email.trim().toLowerCase(),
            password: STAFF_TEMP_PASSWORD,
            schoolId: school.id,
            staffId: teacher.id,
            schoolName: school.name,
            displayName: teacher.full_name,
          })
          okAuth += 1
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          authWarnings.push(`${teacher.email}: ${msg}`)
        }
      }
      console.log(`  Supabase Auth provisioned: ${okAuth}`)
      if (authWarnings.length) {
        console.log('  Auth warnings:')
        for (const w of authWarnings.slice(0, 10)) console.log(`    - ${w}`)
        if (authWarnings.length > 10) {
          console.log(`    … +${authWarnings.length - 10} more`)
        }
      }
    } else {
      console.log('  Skipped Supabase Auth (--skip-auth)')
    }

    const sample = teachers.slice(0, 3)
    console.log('\nDone.')
    console.log('Next:')
    console.log('  1. Restart / open the desktop app as admin@sunrise.demo')
    console.log('  2. Sync Now (push timetable + users to cloud)')
    console.log('  3. Mobile (Sofia Teacher) login examples:')
    for (const t of sample) {
      console.log(`       ${t.email}  /  ${STAFF_TEMP_PASSWORD}`)
    }
  } finally {
    db.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
