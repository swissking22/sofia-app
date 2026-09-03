import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  advanceCoverage,
  coverageFromLog,
  expectedPercent,
  progressFromLeafTopics,
  scheduleStatus,
} from '../../domain/teaching-progress'
import type {
  SyllabusTopic,
  TeachingLog,
  TeachingLogStatus,
  TeachingSyllabus,
} from '../types'
import { BaseRepository } from './base'

export class TeachingProgressRepository extends BaseRepository<TeachingSyllabus> {
  constructor(db: Database.Database) {
    super(db, 'teaching_syllabi')
  }

  listSyllabi(schoolId: string, yearId?: string | null) {
    const params: string[] = [schoolId]
    let sql = `
      SELECT sy.*, sub.name AS subject_name, c.name AS class_name, y.name AS year_name
      FROM teaching_syllabi sy
      LEFT JOIN subjects sub ON sub.id = sy.subject_id
      LEFT JOIN classes c ON c.id = sy.class_id
      LEFT JOIN academic_years y ON y.id = sy.academic_year_id
      WHERE sy.school_id = ? AND sy.deleted_at IS NULL
    `
    if (yearId) {
      sql += ` AND sy.academic_year_id = ?`
      params.push(yearId)
    }
    sql += ` ORDER BY sy.title`
    return this.db.prepare(sql).all(...params) as Array<
      TeachingSyllabus & {
        subject_name: string | null
        class_name: string | null
        year_name: string | null
      }
    >
  }

  createSyllabus(input: {
    school_id: string
    subject_id: string
    academic_year_id: string
    academic_level_id?: string | null
    class_id?: string | null
    title: string
    term_weeks?: number
    created_by?: string | null
    topics: Array<{
      title: string
      objectives?: string | null
      subtopics?: string[]
    }>
  }): TeachingSyllabus {
    if (!input.subject_id) throw new Error('Subject is required.')
    if (!input.academic_year_id) throw new Error('Academic year is required.')
    const title = input.title.trim()
    if (!title) throw new Error('Syllabus title is required.')
    const record: TeachingSyllabus = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      subject_id: input.subject_id,
      academic_year_id: input.academic_year_id,
      academic_level_id: input.academic_level_id ?? null,
      class_id: input.class_id ?? null,
      title,
      term_weeks: input.term_weeks || 12,
      created_by: input.created_by ?? null,
    }
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO teaching_syllabi (
             id, school_id, subject_id, academic_year_id, academic_level_id, class_id,
             title, term_weeks, created_by,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @subject_id, @academic_year_id, @academic_level_id, @class_id,
             @title, @term_weeks, @created_by,
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
      input.topics.forEach((topic, i) => {
        const parent = this.insertTopic({
          school_id: input.school_id,
          syllabus_id: record.id,
          parent_id: null,
          title: topic.title,
          sequence: i,
          objectives: topic.objectives ?? null,
        })
        ;(topic.subtopics ?? []).forEach((sub, j) => {
          this.insertTopic({
            school_id: input.school_id,
            syllabus_id: record.id,
            parent_id: parent.id,
            title: sub,
            sequence: j,
            objectives: null,
          })
        })
      })
    })
    tx()
    return record
  }

  private insertTopic(input: {
    school_id: string
    syllabus_id: string
    parent_id: string | null
    title: string
    sequence: number
    objectives: string | null
  }): SyllabusTopic {
    const record: SyllabusTopic = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      syllabus_id: input.syllabus_id,
      parent_id: input.parent_id,
      title: input.title.trim(),
      sequence: input.sequence,
      objectives: input.objectives,
      coverage_status: 'not_started',
    }
    this.db
      .prepare(
        `INSERT INTO syllabus_topics (
           id, school_id, syllabus_id, parent_id, title, sequence, objectives, coverage_status,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @syllabus_id, @parent_id, @title, @sequence, @objectives, @coverage_status,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'syllabus_topics',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  listTopics(syllabusId: string): SyllabusTopic[] {
    return this.db
      .prepare(
        `SELECT * FROM syllabus_topics
         WHERE syllabus_id = ? AND deleted_at IS NULL
         ORDER BY sequence, created_at`
      )
      .all(syllabusId) as SyllabusTopic[]
  }

  recordLog(input: {
    school_id: string
    staff_id: string
    class_id: string
    subject_id: string
    topic_id?: string | null
    syllabus_id?: string | null
    academic_year_id?: string | null
    academic_term_id?: string | null
    lesson_date: string
    description?: string | null
    status: TeachingLogStatus
    remarks?: string | null
    created_by?: string | null
  }): TeachingLog {
    if (!input.staff_id) throw new Error('Teacher is required.')
    if (!input.class_id) throw new Error('Class is required.')
    if (!input.subject_id) throw new Error('Subject is required.')
    if (!input.lesson_date) throw new Error('Lesson date is required.')
    const record: TeachingLog = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      syllabus_id: input.syllabus_id ?? null,
      topic_id: input.topic_id ?? null,
      staff_id: input.staff_id,
      class_id: input.class_id,
      subject_id: input.subject_id,
      academic_year_id: input.academic_year_id ?? null,
      academic_term_id: input.academic_term_id ?? null,
      lesson_date: input.lesson_date,
      description: input.description?.trim() || null,
      status: input.status,
      progress_percent: null,
      remarks: input.remarks?.trim() || null,
      created_by: input.created_by ?? null,
    }
    this.db
      .prepare(
        `INSERT INTO teaching_logs (
           id, school_id, syllabus_id, topic_id, staff_id, class_id, subject_id,
           academic_year_id, academic_term_id, lesson_date, description, status,
           progress_percent, remarks, created_by,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @syllabus_id, @topic_id, @staff_id, @class_id, @subject_id,
           @academic_year_id, @academic_term_id, @lesson_date, @description, @status,
           @progress_percent, @remarks, @created_by,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'teaching_logs',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )

    if (record.topic_id) {
      const topic = this.db
        .prepare(`SELECT * FROM syllabus_topics WHERE id = ?`)
        .get(record.topic_id) as SyllabusTopic | undefined
      const next = coverageFromLog(input.status)
      if (topic && next) {
        const coverage = advanceCoverage(topic.coverage_status, next)
        this.db
          .prepare(
            `UPDATE syllabus_topics SET coverage_status = ?, updated_at = ?, version = version + 1
             WHERE id = ?`
          )
          .run(coverage, new Date().toISOString(), topic.id)
      }
    }
    return record
  }

  listLogs(
    schoolId: string,
    filters?: {
      staff_id?: string | null
      class_id?: string | null
      subject_id?: string | null
    }
  ) {
    const params: string[] = [schoolId]
    let sql = `
      SELECT l.*, st.full_name AS teacher_name, c.name AS class_name,
             sub.name AS subject_name, t.title AS topic_title
      FROM teaching_logs l
      LEFT JOIN staff st ON st.id = l.staff_id
      LEFT JOIN classes c ON c.id = l.class_id
      LEFT JOIN subjects sub ON sub.id = l.subject_id
      LEFT JOIN syllabus_topics t ON t.id = l.topic_id
      WHERE l.school_id = ? AND l.deleted_at IS NULL
    `
    if (filters?.staff_id) {
      sql += ` AND l.staff_id = ?`
      params.push(filters.staff_id)
    }
    if (filters?.class_id) {
      sql += ` AND l.class_id = ?`
      params.push(filters.class_id)
    }
    if (filters?.subject_id) {
      sql += ` AND l.subject_id = ?`
      params.push(filters.subject_id)
    }
    sql += ` ORDER BY l.lesson_date DESC, l.created_at DESC LIMIT 400`
    return this.db.prepare(sql).all(...params)
  }

  dashboard(schoolId: string, syllabusId: string) {
    const syllabus = this.findById(syllabusId)
    if (!syllabus || syllabus.school_id !== schoolId) {
      throw new Error('Syllabus not found.')
    }
    const topics = this.listTopics(syllabusId)
    const counts = progressFromLeafTopics(topics)
    const year = this.db
      .prepare(`SELECT start_date, end_date FROM academic_years WHERE id = ?`)
      .get(syllabus.academic_year_id) as
      | { start_date: string | null; end_date: string | null }
      | undefined
    const today = new Date().toISOString().slice(0, 10)
    const expected = expectedPercent({
      yearStart: year?.start_date || today,
      yearEnd: year?.end_date || today,
      today,
    })
    return {
      syllabus_id: syllabusId,
      title: syllabus.title,
      term_weeks: syllabus.term_weeks,
      ...counts,
      expected,
      schedule: scheduleStatus(expected, counts.percent),
      topics,
    }
  }
}
