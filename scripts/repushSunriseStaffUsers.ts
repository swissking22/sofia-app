/**
 * Force re-upsert Sunrise staff + teacher users into cloud synced_entities.
 * Earlier Sync Now marked local queue rows synced but staff/users never
 * appeared in the pull stream / get_teacher_me.
 *
 * Usage:
 *   node --import tsx scripts/repushSunriseStaffUsers.ts --dev
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { openSeedDatabase, resolveDefaultDbPath } from './seed/db'

const SCHOOL_NAME = 'Sunrise Academy'

function loadEnv(): void {
  for (const line of fs.readFileSync(path.resolve('.env'), 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    process.env[k] = v
  }
}

function parseArgs(argv: string[]) {
  const has = (flag: string) => argv.includes(flag)
  const i = argv.indexOf('--db')
  return {
    dbPath: i >= 0 ? argv[i + 1] : resolveDefaultDbPath(has('--dev')),
  }
}

async function main(): Promise<void> {
  loadEnv()
  const { dbPath } = parseArgs(process.argv)
  const raw = (process.env.SUPABASE_URL || '')
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1\/?$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  if (!raw || !serviceKey) throw new Error('Missing SUPABASE_URL / SERVICE_ROLE_KEY')

  const admin = createClient(raw, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const db = openSeedDatabase({ dbPath, reset: false })

  try {
    const school = db
      .prepare(
        `SELECT id, name FROM schools
         WHERE deleted_at IS NULL AND name = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(SCHOOL_NAME) as { id: string; name: string } | undefined
    if (!school) throw new Error(`School “${SCHOOL_NAME}” not found.`)

    const deviceId = randomUUID()
    const reg = await admin.rpc('register_device', {
      p_id: deviceId,
      p_school_id: school.id,
      p_device_name: 'repush-staff-users',
      p_device_fingerprint: `repush-${Date.now()}`,
    })
    if (reg.error) throw reg.error
    console.log(`[sofia] Re-push staff/users for ${school.name}`)

    const staffRows = db
      .prepare(
        `SELECT * FROM staff
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY full_name`
      )
      .all(school.id) as Array<Record<string, unknown>>

    let staffOk = 0
    let staffFail = 0
    for (const row of staffRows) {
      const { data, error } = await admin.rpc('process_synced_entity', {
        p_id: randomUUID(),
        p_school_id: school.id,
        p_device_id: deviceId,
        p_table_name: 'staff',
        p_record_id: String(row.id),
        p_operation: 'INSERT',
        p_payload: row,
      })
      if (error || !(data as { success?: boolean })?.success) {
        staffFail += 1
        console.warn(
          '  staff fail',
          row.email,
          error?.message || JSON.stringify(data)
        )
      } else {
        staffOk += 1
      }
    }
    console.log(`  staff: ${staffOk} ok, ${staffFail} failed (of ${staffRows.length})`)

    const users = db
      .prepare(
        `SELECT * FROM users
         WHERE school_id = ? AND deleted_at IS NULL`
      )
      .all(school.id) as Array<Record<string, unknown>>

    let userOk = 0
    let userFail = 0
    for (const row of users) {
      const { password_hash: _pw, ...safe } = row
      const { data, error } = await admin.rpc('process_synced_entity', {
        p_id: randomUUID(),
        p_school_id: school.id,
        p_device_id: deviceId,
        p_table_name: 'users',
        p_record_id: String(row.id),
        p_operation: 'INSERT',
        p_payload: safe,
      })
      if (error || !(data as { success?: boolean })?.success) {
        userFail += 1
        console.warn(
          '  user fail',
          row.email,
          error?.message || JSON.stringify(data)
        )
      } else {
        userOk += 1
      }
    }
    console.log(`  users: ${userOk} ok, ${userFail} failed (of ${users.length})`)

    // Spot-check teacher profile
    const anon = process.env.SUPABASE_ANON_KEY?.trim() || ''
    const teacher = staffRows.find((r) => r.staff_type === 'teaching' && r.email)
    if (teacher?.email && anon) {
      const pub = createClient(raw, anon)
      const login = await pub.auth.signInWithPassword({
        email: String(teacher.email),
        password: 'Sofia@Staff1',
      })
      if (!login.error) {
        const me = await pub.rpc('get_teacher_me')
        console.log('  get_teacher_me spot-check:', JSON.stringify(me.data)?.slice(0, 350))
        await pub.auth.signOut()
      }
    }

    console.log('Done.')
  } finally {
    db.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
