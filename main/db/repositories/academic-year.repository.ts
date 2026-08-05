import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type {
  AcademicTerm,
  AcademicYear,
  CalendarEvent,
  CalendarEventType,
} from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'

const TERM_NAMES = ['First Term', 'Second Term', 'Third Term'] as const

export interface AcademicYearSetupInput {
  name: string
  start_date: string
  end_date: string
  terms: Array<{
    term_number: number
    name?: string
    start_date: string
    end_date: string
  }>
  events: Array<{
    id?: string | null
    type: CalendarEventType
    title: string
    start_date: string
    end_date: string
  }>
}

export interface AcademicYearSetupDto {
  id: string
  school_id: string
  name: string
  start_date: string
  end_date: string
  terms: Array<{
    id: string
    term_number: number
    name: string
    start_date: string
    end_date: string
  }>
  events: Array<{
    id: string
    type: CalendarEventType
    title: string
    start_date: string
    end_date: string
  }>
}

export class AcademicYearRepository extends BaseRepository<AcademicYear> {
  constructor(db: Database.Database) {
    super(db, 'academic_years')
  }

  findCurrentForSchool(schoolId: string): AcademicYear | undefined {
    return this.db
      .prepare(
        `SELECT * FROM academic_years
         WHERE school_id = ? AND deleted_at IS NULL AND is_current = 1
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(schoolId) as AcademicYear | undefined
  }

  findLatestForSchool(schoolId: string): AcademicYear | undefined {
    return this.db
      .prepare(
        `SELECT * FROM academic_years
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(schoolId) as AcademicYear | undefined
  }

  create(input: CreateInput<AcademicYear>): AcademicYear {
    const record: AcademicYear = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      name: input.name,
      start_date: input.start_date,
      end_date: input.end_date,
      is_current: input.is_current ?? 1,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO academic_years (
             id, school_id, name, start_date, end_date, is_current,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @name, @start_date, @end_date, @is_current,
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

  update(id: string, input: UpdateInput<AcademicYear>): AcademicYear | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    const record: AcademicYear = {
      ...existing,
      ...input,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE academic_years
           SET school_id = @school_id,
               name = @name,
               start_date = @start_date,
               end_date = @end_date,
               is_current = @is_current,
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

  findTerms(yearId: string): AcademicTerm[] {
    return this.db
      .prepare(
        `SELECT * FROM academic_terms
         WHERE academic_year_id = ? AND deleted_at IS NULL
         ORDER BY term_number ASC`
      )
      .all(yearId) as AcademicTerm[]
  }

  findEvents(yearId: string): CalendarEvent[] {
    return this.db
      .prepare(
        `SELECT * FROM calendar_events
         WHERE academic_year_id = ? AND deleted_at IS NULL
         ORDER BY start_date ASC`
      )
      .all(yearId) as CalendarEvent[]
  }

  getSetupDto(schoolId: string): AcademicYearSetupDto | null {
    const year =
      this.findCurrentForSchool(schoolId) ?? this.findLatestForSchool(schoolId)
    if (!year) return null

    return {
      id: year.id,
      school_id: year.school_id,
      name: year.name,
      start_date: year.start_date,
      end_date: year.end_date,
      terms: this.findTerms(year.id).map((t) => ({
        id: t.id,
        term_number: t.term_number,
        name: t.name,
        start_date: t.start_date,
        end_date: t.end_date,
      })),
      events: this.findEvents(year.id).map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        start_date: e.start_date,
        end_date: e.end_date,
      })),
    }
  }

  /** Create or update current academic year + terms + calendar events. */
  saveSetup(schoolId: string, input: AcademicYearSetupInput): AcademicYearSetupDto {
    const save = this.db.transaction(() => {
      let year =
        this.findCurrentForSchool(schoolId) ?? this.findLatestForSchool(schoolId)

      if (!year) {
        year = this.create({
          school_id: schoolId,
          name: input.name,
          start_date: input.start_date,
          end_date: input.end_date,
          is_current: 1,
        })
      } else {
        year = this.update(year.id, {
          name: input.name,
          start_date: input.start_date,
          end_date: input.end_date,
          is_current: 1,
        })!
      }

      const existingTerms = this.findTerms(year.id)
      for (let n = 1; n <= 3; n++) {
        const termInput = input.terms.find((t) => t.term_number === n)
        const name = termInput?.name || TERM_NAMES[n - 1]
        const start_date = termInput?.start_date || ''
        const end_date = termInput?.end_date || ''
        const existing = existingTerms.find((t) => t.term_number === n)

        if (existing) {
          this.updateTerm(existing.id, { name, start_date, end_date })
        } else {
          this.createTerm({
            academic_year_id: year.id,
            name,
            term_number: n,
            start_date,
            end_date,
          })
        }
      }

      // Soft-delete events not present in payload; upsert the rest
      const existingEvents = this.findEvents(year.id)
      const keepIds = new Set(
        input.events.map((e) => e.id).filter((id): id is string => Boolean(id))
      )

      for (const ev of existingEvents) {
        if (!keepIds.has(ev.id)) {
          this.softDeleteEvent(ev.id)
        }
      }

      for (const ev of input.events) {
        if (ev.id) {
          const found = existingEvents.find((e) => e.id === ev.id)
          if (found) {
            this.updateEvent(ev.id, {
              type: ev.type,
              title: ev.title,
              start_date: ev.start_date,
              end_date: ev.end_date,
            })
            continue
          }
        }
        this.createEvent({
          academic_year_id: year.id,
          type: ev.type,
          title: ev.title,
          start_date: ev.start_date,
          end_date: ev.end_date,
        })
      }

      return this.getSetupDto(schoolId)!
    })

    return save()
  }

  private createTerm(input: CreateInput<AcademicTerm>): AcademicTerm {
    const record: AcademicTerm = {
      ...this.buildBaseFields(),
      academic_year_id: input.academic_year_id,
      name: input.name,
      term_number: input.term_number,
      start_date: input.start_date,
      end_date: input.end_date,
    }

    this.db
      .prepare(
        `INSERT INTO academic_terms (
           id, academic_year_id, name, term_number, start_date, end_date,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @academic_year_id, @name, @term_number, @start_date, @end_date,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)

    enqueueSync(
      this.db,
      'academic_terms',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  private updateTerm(
    id: string,
    input: UpdateInput<AcademicTerm>
  ): AcademicTerm | undefined {
    const existing = this.db
      .prepare(
        `SELECT * FROM academic_terms WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as AcademicTerm | undefined
    if (!existing) return undefined

    const record: AcademicTerm = {
      ...existing,
      ...input,
      ...this.applyUpdateMeta(existing),
    }

    this.db
      .prepare(
        `UPDATE academic_terms
         SET name = @name,
             term_number = @term_number,
             start_date = @start_date,
             end_date = @end_date,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)

    enqueueSync(
      this.db,
      'academic_terms',
      record.id,
      'UPDATE',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  private createEvent(input: CreateInput<CalendarEvent>): CalendarEvent {
    const record: CalendarEvent = {
      ...this.buildBaseFields(),
      academic_year_id: input.academic_year_id,
      type: input.type,
      title: input.title,
      start_date: input.start_date,
      end_date: input.end_date,
    }

    this.db
      .prepare(
        `INSERT INTO calendar_events (
           id, academic_year_id, type, title, start_date, end_date,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @academic_year_id, @type, @title, @start_date, @end_date,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)

    enqueueSync(
      this.db,
      'calendar_events',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  private updateEvent(
    id: string,
    input: UpdateInput<CalendarEvent>
  ): CalendarEvent | undefined {
    const existing = this.db
      .prepare(
        `SELECT * FROM calendar_events WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as CalendarEvent | undefined
    if (!existing) return undefined

    const record: CalendarEvent = {
      ...existing,
      ...input,
      ...this.applyUpdateMeta(existing),
    }

    this.db
      .prepare(
        `UPDATE calendar_events
         SET type = @type,
             title = @title,
             start_date = @start_date,
             end_date = @end_date,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)

    enqueueSync(
      this.db,
      'calendar_events',
      record.id,
      'UPDATE',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  private softDeleteEvent(id: string): void {
    const existing = this.db
      .prepare(
        `SELECT * FROM calendar_events WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as CalendarEvent | undefined
    if (!existing) return

    const now = new Date().toISOString()
    const record: CalendarEvent = {
      ...existing,
      deleted_at: now,
      updated_at: now,
      version: existing.version + 1,
      sync_status: 'pending',
    }

    this.db
      .prepare(
        `UPDATE calendar_events
         SET deleted_at = @deleted_at,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)

    enqueueSync(
      this.db,
      'calendar_events',
      id,
      'DELETE',
      record as unknown as Record<string, unknown>
    )
  }
}
