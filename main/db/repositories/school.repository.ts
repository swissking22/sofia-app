import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  generateSchoolShortCode,
  normalizeShortCode,
  validateShortCode,
} from '../../helpers/school-short-code'
import type { School } from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'

/** Auto-generate a legacy system school code (e.g. SOF-A1B2C3D4). */
export function generateSchoolCode(): string {
  return `SOF-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

export class SchoolRepository extends BaseRepository<School> {
  constructor(db: Database.Database) {
    super(db, 'schools')
  }

  /** True if another active school already uses this short code. */
  isShortCodeTaken(shortCode: string, excludeSchoolId?: string): boolean {
    const code = normalizeShortCode(shortCode)
    if (!code) return false
    const row = this.db
      .prepare(
        `SELECT id FROM schools
         WHERE short_code = ?
           AND deleted_at IS NULL
           ${excludeSchoolId ? 'AND id != ?' : ''}
         LIMIT 1`
      )
      .get(
        ...(excludeSchoolId ? [code, excludeSchoolId] : [code])
      ) as { id: string } | undefined
    return Boolean(row)
  }

  ensureUniqueShortCode(baseCode: string, excludeSchoolId?: string): string {
    let code = normalizeShortCode(baseCode) || 'SCH'
    if (!this.isShortCodeTaken(code, excludeSchoolId)) return code

    let n = 2
    while (n < 1000) {
      const suffix = String(n)
      const truncated = code.slice(0, Math.max(1, 10 - suffix.length))
      const candidate = `${truncated}${suffix}`
      if (!this.isShortCodeTaken(candidate, excludeSchoolId)) return candidate
      n += 1
    }
    return `${code.slice(0, 6)}${randomUUID().slice(0, 4).toUpperCase()}`
  }

  create(
    input: Pick<School, 'name' | 'email'> &
      Partial<Omit<CreateInput<School>, 'name' | 'email'>>
  ): School {
    const baseShort =
      input.short_code?.trim() || generateSchoolShortCode(input.name)
    const short_code = this.ensureUniqueShortCode(baseShort)

    const record: School = {
      ...this.buildBaseFields(),
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      country: input.country ?? null,
      address: input.address ?? null,
      logo_path: input.logo_path ?? null,
      school_code: input.school_code?.trim() || generateSchoolCode(),
      short_code,
      school_type: input.school_type ?? null,
      education_system: input.education_system ?? null,
      school_category: input.school_category ?? null,
      region: input.region ?? null,
      division: input.division ?? null,
      subdivision: input.subdivision ?? null,
      website: input.website ?? null,
      stamp_path: input.stamp_path ?? null,
      principal_signature_path: input.principal_signature_path ?? null,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO schools (
             id, name, email, phone, country, address, logo_path,
             school_code, short_code, school_type, education_system, school_category,
             region, division, subdivision, website,
             stamp_path, principal_signature_path,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @name, @email, @phone, @country, @address, @logo_path,
             @school_code, @short_code, @school_type, @education_system, @school_category,
             @region, @division, @subdivision, @website,
             @stamp_path, @principal_signature_path,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(record)

      enqueueSync(
        this.db,
        this.tableName,
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
    })

    tx()
    return record
  }

  update(id: string, input: UpdateInput<School>): School | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    let short_code = existing.short_code
    if (input.short_code !== undefined) {
      const error = validateShortCode(input.short_code)
      if (error) throw new Error(error)
      const normalized = normalizeShortCode(input.short_code)
      if (this.isShortCodeTaken(normalized, id)) {
        throw new Error(`Short code “${normalized}” is already in use.`)
      }
      short_code = normalized
    } else if (!short_code?.trim()) {
      short_code = this.ensureUniqueShortCode(
        generateSchoolShortCode(input.name ?? existing.name),
        id
      )
    }

    const record: School = {
      ...existing,
      ...input,
      school_code: existing.school_code?.trim()
        ? existing.school_code
        : input.school_code?.trim() || generateSchoolCode(),
      short_code,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE schools
           SET name = @name,
               email = @email,
               phone = @phone,
               country = @country,
               address = @address,
               logo_path = @logo_path,
               school_code = @school_code,
               short_code = @short_code,
               school_type = @school_type,
               education_system = @education_system,
               school_category = @school_category,
               region = @region,
               division = @division,
               subdivision = @subdivision,
               website = @website,
               stamp_path = @stamp_path,
               principal_signature_path = @principal_signature_path,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(record)

      enqueueSync(
        this.db,
        this.tableName,
        record.id,
        'UPDATE',
        record as unknown as Record<string, unknown>
      )
    })

    tx()
    return record
  }

  /** Ensure every active school has school_code + short_code. */
  ensureSchoolCode(school: School): School {
    let current = school
    if (!current.school_code?.trim()) {
      current =
        this.update(current.id, {
          school_code: generateSchoolCode(),
        }) ?? current
    }
    if (!current.short_code?.trim()) {
      current =
        this.update(current.id, {
          short_code: this.ensureUniqueShortCode(
            generateSchoolShortCode(current.name),
            current.id
          ),
        }) ?? current
    }
    return current
  }

  /** Most recently created school (used to resume setup before admin exists). */
  findLatest(): School | undefined {
    return this.db
      .prepare(
        `SELECT * FROM schools WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`
      )
      .get() as School | undefined
  }
}
