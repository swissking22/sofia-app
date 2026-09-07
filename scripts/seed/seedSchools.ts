import { faker } from '@faker-js/faker'
import { hashSync } from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import type { SeedContext } from './context'
import { baseFields, runInTransaction } from './helpers'

const DEMO_PASSWORD = 'Sofia@Demo1'
const BCRYPT_ROUNDS = 10

const SCHOOL_DEFS = [
  {
    name: 'Greenfield Secondary School',
    short_code: 'GFS',
    email: 'admin@greenfield.demo',
    region: 'Centre',
  },
  {
    name: 'Sunrise Academy',
    short_code: 'SRA',
    email: 'admin@sunrise.demo',
    region: 'Littoral',
  },
  {
    name: 'International Academy of Excellence',
    short_code: 'IAE',
    email: 'admin@iae.demo',
    region: 'South West',
  },
] as const

/**
 * Seeds schools, RBAC permissions/roles, and a demo admin user per school.
 */
export function seedSchools(ctx: SeedContext): void {
  const { db } = ctx
  const now = new Date().toISOString()
  const password_hash = hashSync(DEMO_PASSWORD, BCRYPT_ROUNDS)

  runInTransaction(db, () => {
    // Global permission catalog (minimal set for login/RBAC)
    const permInsert = db.prepare(`
      INSERT OR IGNORE INTO permissions (
        id, name, label, module_key, module_label,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @name, @label, @module_key, @module_label,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    const perms = [
      ['dashboard.view', 'View dashboard', 'dashboard', 'Dashboard'],
      ['students.manage', 'Manage students', 'students', 'Students'],
      ['finance.manage', 'Manage finance', 'finance', 'Finance'],
      ['staff.manage', 'Manage staff', 'staff', 'Staff'],
      ['academic.manage', 'Manage academics', 'academic', 'Academic'],
    ] as const

    for (const [name, label, module_key, module_label] of perms) {
      const existing = db
        .prepare(`SELECT id FROM permissions WHERE name = ?`)
        .get(name)
      if (existing) continue
      permInsert.run({
        ...baseFields(now),
        name,
        label,
        module_key,
        module_label,
      })
    }

    const schoolInsert = db.prepare(`
      INSERT INTO schools (
        id, name, email, phone, country, address, logo_path,
        school_code, short_code, school_type, education_system, school_category,
        region, division, subdivision, website, stamp_path, principal_signature_path,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @name, @email, @phone, @country, @address, NULL,
        @school_code, @short_code, 'secondary', 'anglophone', 'public',
        @region, @division, @subdivision, @website, NULL, NULL,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    // max_teacher_periods may exist after migration
    try {
      db.exec(
        `ALTER TABLE schools ADD COLUMN max_teacher_periods INTEGER NOT NULL DEFAULT 30`
      )
    } catch {
      /* already exists */
    }

    const roleInsert = db.prepare(`
      INSERT INTO roles (
        id, school_id, name, description, is_system,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @name, @description, 1,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    const userInsert = db.prepare(`
      INSERT INTO users (
        id, school_id, email, password_hash, role, role_id,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @email, @password_hash, 'admin', @role_id,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    for (const def of SCHOOL_DEFS) {
      const schoolId = randomUUID()
      const base = baseFields(now)
      schoolInsert.run({
        ...base,
        id: schoolId,
        name: def.name,
        email: def.email,
        phone: faker.phone.number({ style: 'international' }),
        country: 'Cameroon',
        address: faker.location.streetAddress(),
        school_code: def.short_code,
        short_code: def.short_code,
        region: def.region,
        division: faker.location.city(),
        subdivision: faker.location.city(),
        website: `https://${def.short_code.toLowerCase()}.demo`,
      })

      try {
        db.prepare(
          `UPDATE schools SET max_teacher_periods = 30 WHERE id = ?`
        ).run(schoolId)
      } catch {
        /* ignore */
      }

      const roleId = randomUUID()
      roleInsert.run({
        ...baseFields(now),
        id: roleId,
        school_id: schoolId,
        name: 'Principal',
        description: 'Full access administrator',
      })

      // Attach all permissions to Principal
      const allPerms = db
        .prepare(`SELECT id FROM permissions WHERE deleted_at IS NULL`)
        .all() as Array<{ id: string }>
      const rpInsert = db.prepare(`
        INSERT INTO role_permissions (
          id, role_id, permission_id,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @role_id, @permission_id,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )
      `)
      for (const p of allPerms) {
        rpInsert.run({
          ...baseFields(now),
          role_id: roleId,
          permission_id: p.id,
        })
      }

      const userId = randomUUID()
      userInsert.run({
        ...baseFields(now),
        id: userId,
        school_id: schoolId,
        email: def.email,
        password_hash,
        role_id: roleId,
      })

      ctx.schools.push({
        id: schoolId,
        name: def.name,
        short_code: def.short_code,
        email: def.email,
      })
      ctx.adminEmails.push(def.email)
      ctx.counters.set(schoolId, {
        invoice: 1,
        payment: 1,
        receipt: 1,
        expense: 1,
      })
    }
  })

  console.log(
    `  Schools: ${ctx.schools.length} (login password: ${DEMO_PASSWORD})`
  )
}
