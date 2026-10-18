/**
 * Check whether Sunrise staff landed in cloud sync (pull stream + teacher RPCs).
 * synced_entities is not directly selectable even with service_role.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { openSeedDatabase, resolveDefaultDbPath } from './seed/db'

const SCHOOL_ID = '70b485b5-3ae7-4b67-83c6-848ee04f153a'

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

async function main(): Promise<void> {
  loadEnv()
  const raw = (process.env.SUPABASE_URL || '')
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1\/?$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  const anon = process.env.SUPABASE_ANON_KEY?.trim() || ''
  if (!raw || !serviceKey || !anon) {
    throw new Error('Missing SUPABASE_URL / keys in .env')
  }

  const admin = createClient(raw, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const db = openSeedDatabase({ dbPath: resolveDefaultDbPath(true), reset: false })
  const staff = db
    .prepare(
      `SELECT id, email, full_name FROM staff
       WHERE school_id = ? AND deleted_at IS NULL AND staff_type = 'teaching'
       ORDER BY full_name`
    )
    .all(SCHOOL_ID) as Array<{ id: string; email: string; full_name: string }>

  const users = db
    .prepare(
      `SELECT id, email, staff_id FROM users
       WHERE school_id = ? AND deleted_at IS NULL AND role = 'teacher'`
    )
    .all(SCHOOL_ID) as Array<{ id: string; email: string; staff_id: string | null }>

  console.log('local teaching staff', staff.length, 'teacher users', users.length)

  // Direct table — expect grant denial; record it.
  const direct = await fetch(
    `${raw}/rest/v1/synced_entities?select=record_id&school_id=eq.${SCHOOL_ID}&table_name=eq.staff&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    }
  )
  console.log(
    'direct synced_entities SELECT:',
    direct.status,
    (await direct.text()).slice(0, 160)
  )

  const deviceId = randomUUID()
  const reg = await admin.rpc('register_device', {
    p_id: deviceId,
    p_school_id: SCHOOL_ID,
    p_device_name: 'verify-staff-synced',
    p_device_fingerprint: `verify-${Date.now()}`,
  })
  console.log('register_device:', reg.error?.message || JSON.stringify(reg.data))

  let cursor = 0
  let pages = 0
  const foundStaff = new Set<string>()
  const foundUsers = new Set<string>()
  const counts: Record<string, number> = {}

  while (pages < 80) {
    pages += 1
    const pull = await admin.rpc('pull_sync_changes', {
      p_school_id: SCHOOL_ID,
      p_device_id: deviceId,
      p_cursor: cursor,
      p_limit: 500,
    })
    if (pull.error) {
      console.log('pull error', pull.error.message)
      break
    }
    const payload = pull.data as {
      success?: boolean
      changes?: Array<{ table_name: string; record_id: string }>
      new_cursor?: number
      has_more?: boolean
      error?: string
    }
    if (!payload?.success) {
      console.log('pull fail', payload)
      break
    }
    const changes = payload.changes || []
    if (!changes.length) break
    for (const ch of changes) {
      counts[ch.table_name] = (counts[ch.table_name] || 0) + 1
      if (ch.table_name === 'staff') foundStaff.add(ch.record_id)
      if (ch.table_name === 'users') foundUsers.add(ch.record_id)
    }
    cursor = payload.new_cursor ?? cursor
    if (!payload.has_more) break
  }

  console.log('pull pages', pages, 'cursor', cursor)
  console.log(
    'pull counts (top):',
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
  )
  console.log(
    'staff in pull stream:',
    foundStaff.size,
    '/',
    staff.length,
    'teaching'
  )
  const missingStaff = staff.filter((s) => !foundStaff.has(s.id))
  console.log(
    'missing teaching staff:',
    missingStaff.length,
    missingStaff.slice(0, 5).map((s) => s.email)
  )
  console.log(
    'teacher users in pull stream:',
    users.filter((u) => foundUsers.has(u.id)).length,
    '/',
    users.length
  )

  const sample = staff[0]
  if (sample?.email) {
    const pub = createClient(raw, anon)
    const login = await pub.auth.signInWithPassword({
      email: sample.email,
      password: 'Sofia@Staff1',
    })
    if (login.error) {
      console.log('mobile login:', sample.email, login.error.message)
    } else {
      console.log('mobile login: ok', sample.email)
      const me = await pub.rpc('get_teacher_me')
      console.log(
        'get_teacher_me:',
        me.error?.message || JSON.stringify(me.data)?.slice(0, 500)
      )
      const asg = await pub.rpc('get_teacher_assignments')
      const asgData = asg.data as unknown
      console.log(
        'get_teacher_assignments:',
        asg.error?.message ||
          (Array.isArray(asgData)
            ? `rows=${asgData.length}`
            : JSON.stringify(asgData)?.slice(0, 300))
      )
      await pub.auth.signOut()
    }
  }

  // Force re-upsert one staff + user and see if pull can observe them.
  const fullStaff = db
    .prepare(`SELECT * FROM staff WHERE id = ?`)
    .get(sample.id) as Record<string, unknown>
  const fullUser = db
    .prepare(`SELECT * FROM users WHERE staff_id = ? AND deleted_at IS NULL`)
    .get(sample.id) as Record<string, unknown> | undefined
  const deviceId2 = randomUUID()
  await admin.rpc('register_device', {
    p_id: deviceId2,
    p_school_id: SCHOOL_ID,
    p_device_name: 'probe-staff',
    p_device_fingerprint: `probe-${Date.now()}`,
  })

  const staffOp = randomUUID()
  const staffRes = await admin.rpc('process_synced_entity', {
    p_id: staffOp,
    p_school_id: SCHOOL_ID,
    p_device_id: deviceId2,
    p_table_name: 'staff',
    p_record_id: String(fullStaff.id),
    p_operation: 'INSERT',
    p_payload: fullStaff,
  })
  console.log(
    're-upsert staff RPC:',
    staffRes.error?.message || JSON.stringify(staffRes.data)
  )

  if (fullUser) {
    const { password_hash: _pw, ...userSafe } = fullUser
    const userOp = randomUUID()
    const userRes = await admin.rpc('process_synced_entity', {
      p_id: userOp,
      p_school_id: SCHOOL_ID,
      p_device_id: deviceId2,
      p_table_name: 'users',
      p_record_id: String(fullUser.id),
      p_operation: 'INSERT',
      p_payload: userSafe,
    })
    console.log(
      're-upsert user RPC:',
      userRes.error?.message || JSON.stringify(userRes.data)
    )
  }

  // Pull from high cursor near tip to see the new changes
  const tip = await admin.rpc('pull_sync_changes', {
    p_school_id: SCHOOL_ID,
    p_device_id: deviceId2,
    p_cursor: Math.max(0, cursor - 50),
    p_limit: 100,
  })
  const tipChanges =
    ((tip.data as { changes?: Array<{ table_name: string; record_id: string }> })
      ?.changes || [])
  const tipStaff = tipChanges.filter(
    (c) => c.table_name === 'staff' || c.record_id === sample.id
  )
  const tipUsers = tipChanges.filter((c) => c.table_name === 'users')
  console.log(
    'near-tip pull staff hits:',
    tipStaff.length,
    'users hits:',
    tipUsers.length,
    tipStaff[0] ? JSON.stringify(tipStaff[0]).slice(0, 250) : ''
  )

  db.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
