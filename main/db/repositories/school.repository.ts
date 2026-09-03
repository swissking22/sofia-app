import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  buildDaySchedule,
  mergeDaySchedule,
  normalizeBreaks,
  validateDaySchedule,
  type DayBreakInput,
  type DayScheduleConfig,
} from '../../domain/day-schedule'
import {
  generateSchoolShortCode,
  normalizeShortCode,
  validateShortCode,
} from '../../helpers/school-short-code'
import type { School, SchoolDayBreak } from '../types'
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
      max_teacher_periods: input.max_teacher_periods ?? null,
      day_start_time: input.day_start_time ?? null,
      day_end_time: input.day_end_time ?? null,
      period_duration_minutes: input.period_duration_minutes ?? null,
      periods_per_day: input.periods_per_day ?? null,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO schools (
             id, name, email, phone, country, address, logo_path,
             school_code, short_code, school_type, education_system, school_category,
             region, division, subdivision, website,
             stamp_path, principal_signature_path, max_teacher_periods,
             day_start_time, day_end_time, period_duration_minutes, periods_per_day,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @name, @email, @phone, @country, @address, @logo_path,
             @school_code, @short_code, @school_type, @education_system, @school_category,
             @region, @division, @subdivision, @website,
             @stamp_path, @principal_signature_path, @max_teacher_periods,
             @day_start_time, @day_end_time, @period_duration_minutes, @periods_per_day,
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
               max_teacher_periods = @max_teacher_periods,
               day_start_time = @day_start_time,
               day_end_time = @day_end_time,
               period_duration_minutes = @period_duration_minutes,
               periods_per_day = @periods_per_day,
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

  listDayBreaks(schoolId: string): SchoolDayBreak[] {
    return this.db
      .prepare(
        `SELECT * FROM school_day_breaks
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY after_period ASC, sort_order ASC`
      )
      .all(schoolId) as SchoolDayBreak[]
  }

  /**
   * Effective day schedule for timetable grids.
   * Unconfigured schools get DEFAULT_DAY_SCHEDULE (08:00–15:00, 45 min × 8).
   */
  getDayScheduleConfig(schoolId: string): DayScheduleConfig {
    const school = this.findById(schoolId)
    if (!school) return mergeDaySchedule(null)

    const breaks = this.listDayBreaks(schoolId)
    const hasCustom =
      Boolean(school.day_start_time?.trim()) ||
      Boolean(school.day_end_time?.trim()) ||
      school.period_duration_minutes != null ||
      school.periods_per_day != null ||
      breaks.length > 0

    if (!hasCustom) return mergeDaySchedule(null)

    return mergeDaySchedule({
      day_start_time: school.day_start_time ?? undefined,
      day_end_time: school.day_end_time ?? undefined,
      period_duration_minutes: school.period_duration_minutes ?? undefined,
      periods_per_day: school.periods_per_day ?? undefined,
      breaks: breaks.map((b) => ({
        name: b.name,
        after_period: b.after_period,
        duration_minutes: b.duration_minutes,
      })),
    })
  }

  getDayScheduleDto(schoolId: string) {
    const config = this.getDayScheduleConfig(schoolId)
    const built = buildDaySchedule(config)
    return {
      ...config,
      periods: built.periods,
      blocks: built.blocks,
      computed_end_time: built.computed_end_time,
    }
  }

  saveDaySchedule(
    schoolId: string,
    input: {
      day_start_time: string
      day_end_time: string
      period_duration_minutes: number
      periods_per_day: number
      breaks: DayBreakInput[]
    }
  ) {
    const school = this.findById(schoolId)
    if (!school) throw new Error('School not found.')

    const config: DayScheduleConfig = {
      day_start_time: input.day_start_time,
      day_end_time: input.day_end_time,
      period_duration_minutes: Number(input.period_duration_minutes),
      periods_per_day: Number(input.periods_per_day),
      breaks: normalizeBreaks(input.breaks ?? []),
    }
    const error = validateDaySchedule(config)
    if (error) throw new Error(error)

    const now = new Date().toISOString()
    const tx = this.db.transaction(() => {
      const updated =
        this.update(schoolId, {
          day_start_time: config.day_start_time,
          day_end_time: config.day_end_time,
          period_duration_minutes: config.period_duration_minutes,
          periods_per_day: config.periods_per_day,
        }) ?? school

      const existing = this.listDayBreaks(schoolId)
      for (const row of existing) {
        this.db
          .prepare(
            `UPDATE school_day_breaks
             SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
             WHERE id = ?`
          )
          .run(now, now, row.id)
        enqueueSync(this.db, 'school_day_breaks', row.id, 'DELETE', {
          id: row.id,
          school_id: schoolId,
        })
      }

      config.breaks.forEach((b, index) => {
        const record: SchoolDayBreak = {
          id: randomUUID(),
          school_id: schoolId,
          name: b.name,
          after_period: b.after_period,
          duration_minutes: b.duration_minutes,
          sort_order: index,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          sync_status: 'pending',
          version: 1,
        }
        this.db
          .prepare(
            `INSERT INTO school_day_breaks (
               id, school_id, name, after_period, duration_minutes, sort_order,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (
               @id, @school_id, @name, @after_period, @duration_minutes, @sort_order,
               @created_at, @updated_at, @deleted_at, @sync_status, @version
             )`
          )
          .run(record)
        enqueueSync(
          this.db,
          'school_day_breaks',
          record.id,
          'INSERT',
          record as unknown as Record<string, unknown>
        )
      })

      return updated
    })

    tx()
    return this.getDayScheduleDto(schoolId)
  }
}
