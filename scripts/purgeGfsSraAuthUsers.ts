/**
 * Delete Supabase Auth users whose app_metadata.school_id is GFS/SRA tenants.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const TARGET_SCHOOLS = new Set([
  '70b485b5-3ae7-4b67-83c6-848ee04f153a',
  '946662bd-5cfd-442a-bc8d-80944e906fd2',
])

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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  if (!raw || !key) throw new Error('Missing SUPABASE_URL / SERVICE_ROLE_KEY')

  const admin = createClient(raw, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let deleted = 0
  let scanned = 0
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    const users = data.users || []
    if (!users.length) break
    for (const u of users) {
      scanned += 1
      const schoolId = String(
        (u.app_metadata as { school_id?: string } | undefined)?.school_id || ''
      )
      if (!TARGET_SCHOOLS.has(schoolId)) continue
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id)
      if (delErr) {
        console.warn('fail', u.email, delErr.message)
      } else {
        deleted += 1
        console.log('deleted', u.email, schoolId)
      }
    }
    if (users.length < 200) break
  }
  console.log(`Done. scanned=${scanned} deleted=${deleted}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
