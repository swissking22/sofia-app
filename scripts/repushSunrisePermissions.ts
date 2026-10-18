/**
 * Force-push the permissions catalog into Sunrise cloud synced_entities.
 * Mobile `get_mobile_access` joins role_permissions → permissions by record_id;
 * after tenant purge, SRA had roles/users but zero permissions rows → empty grants.
 *
 * Usage:
 *   node --import ./scripts/mock-electron-register.mjs --import tsx scripts/repushSunrisePermissions.ts --dev
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
  const anon = process.env.SUPABASE_ANON_KEY?.trim() || ''
  if (!raw || !serviceKey) throw new Error('Missing SUPABASE_URL / SERVICE_ROLE_KEY')

  const admin = createClient(raw, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const db = openSeedDatabase({ dbPath, reset: false })
  db.pragma('busy_timeout = 15000')

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
      p_device_name: 'repush-permissions',
      p_device_fingerprint: `repush-perm-${Date.now()}`,
    })
    if (reg.error) throw reg.error

    const perms = db
      .prepare(
        `SELECT * FROM permissions WHERE deleted_at IS NULL ORDER BY name`
      )
      .all() as Array<Record<string, unknown>>

    console.log(
      `[sofia] Pushing ${perms.length} permissions for ${school.name} (${school.id})`
    )

    let ok = 0
    let fail = 0
    for (const row of perms) {
      const payload = { ...row, school_id: school.id }
      const { data, error } = await admin.rpc('process_synced_entity', {
        p_id: randomUUID(),
        p_school_id: school.id,
        p_device_id: deviceId,
        p_table_name: 'permissions',
        p_record_id: String(row.id),
        p_operation: 'INSERT',
        p_payload: payload,
      })
      if (error || !(data as { success?: boolean })?.success) {
        fail += 1
        if (fail <= 5) {
          console.warn(
            '  fail',
            row.name,
            error?.message || JSON.stringify(data)
          )
        }
      } else {
        ok += 1
      }
    }
    console.log(`  permissions: ${ok} ok, ${fail} failed`)
    try {
      db.prepare(
        `UPDATE permissions SET sync_status = 'synced' WHERE deleted_at IS NULL`
      ).run()
    } catch (err) {
      console.warn(
        '  local sync_status update skipped:',
        err instanceof Error ? err.message : err
      )
    }

    // Spot-check mobile access for first teaching staff with Auth password.
    if (anon) {
      const sample = db
        .prepare(
          `SELECT email FROM staff
           WHERE school_id = ? AND deleted_at IS NULL AND staff_type = 'teaching'
             AND email IS NOT NULL AND trim(email) <> ''
           ORDER BY full_name LIMIT 1`
        )
        .get(school.id) as { email: string } | undefined
      if (sample?.email) {
        const pub = createClient(raw, anon)
        const login = await pub.auth.signInWithPassword({
          email: sample.email,
          password: 'Sofia@Staff1',
        })
        if (login.error) {
          console.log('spot-check login:', login.error.message)
        } else {
          const access = await pub.rpc('get_mobile_access')
          const body = access.data as {
            ok?: boolean
            role_name?: string
            permissions?: Array<{ name?: string }>
          } | null
          console.log(
            'get_mobile_access:',
            body?.ok,
            'role=',
            body?.role_name,
            'perms=',
            Array.isArray(body?.permissions) ? body!.permissions!.length : body
          )
          if (Array.isArray(body?.permissions) && body!.permissions!.length) {
            console.log(
              '  sample grants:',
              body!.permissions!.slice(0, 8).map((p) => p.name)
            )
          }
          await pub.auth.signOut()
        }
      }
    }
  } finally {
    db.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
