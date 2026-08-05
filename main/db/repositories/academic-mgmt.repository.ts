import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type {
  AttendanceMark,
  AttendanceRecord,
  AttendanceSession,
  CaAssessment,
  CaScore,
  ExamPaper,
  ExamScore,
  ExamSession,
  ExamSessionStatus,
  ReportCard,
  ReportCardStatus,
  ResultRun,
  ResultRunStatus,
  ResultStudentSummary,
  ResultSubjectRow,
  TimetableSlot,
} from '../types'
import { BaseRepository } from './base'

const SYNC_COLS =
  'created_at, updated_at, deleted_at, sync_status, version'

export class TimetableRepository extends BaseRepository<TimetableSlot> {
  constructor(db: Database.Database) {
    super(db, 'timetable_slots')
  }

  findByClass(classId: string): TimetableSlot[] {
    return this.db
      .prepare(
        `SELECT * FROM timetable_slots
         WHERE class_id = ? AND deleted_at IS NULL
         ORDER BY day_of_week ASC, period_number ASC`
      )
      .all(classId) as TimetableSlot[]
  }

  findByStaff(staffId: string): TimetableSlot[] {
    return this.db
      .prepare(
        `SELECT * FROM timetable_slots
         WHERE staff_id = ? AND deleted_at IS NULL
         ORDER BY day_of_week ASC, period_number ASC`
      )
      .all(staffId) as TimetableSlot[]
  }

  findBySchool(schoolId: string): TimetableSlot[] {
    return this.db
      .prepare(
        `SELECT * FROM timetable_slots
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY class_id, day_of_week, period_number`
      )
      .all(schoolId) as TimetableSlot[]
  }

  upsertSlot(input: {
    id?: string | null
    school_id: string
    class_id: string
    subject_id?: string | null
    staff_id?: string | null
    day_of_week: number
    period_number: number
    room?: string | null
  }): TimetableSlot {
    const existing = input.id ? this.findById(input.id) : undefined
    const byCell = this.db
      .prepare(
        `SELECT * FROM timetable_slots
         WHERE class_id = ? AND day_of_week = ? AND period_number = ?
           AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(
        input.class_id,
        input.day_of_week,
        input.period_number
      ) as TimetableSlot | undefined

    const target = existing ?? byCell
    if (target) {
      const record: TimetableSlot = {
        ...target,
        subject_id: input.subject_id ?? null,
        staff_id: input.staff_id ?? null,
        room: input.room ?? null,
        ...this.applyUpdateMeta(target),
      }
      this.db
        .prepare(
          `UPDATE timetable_slots
           SET subject_id = @subject_id, staff_id = @staff_id, room = @room,
               updated_at = @updated_at, version = @version, sync_status = @sync_status
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
      return record
    }

    const record: TimetableSlot = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      class_id: input.class_id,
      subject_id: input.subject_id ?? null,
      staff_id: input.staff_id ?? null,
      day_of_week: input.day_of_week,
      period_number: input.period_number,
      room: input.room ?? null,
    }
    this.db
      .prepare(
        `INSERT INTO timetable_slots (
          id, school_id, class_id, subject_id, staff_id,
          day_of_week, period_number, room, ${SYNC_COLS}
        ) VALUES (
          @id, @school_id, @class_id, @subject_id, @staff_id,
          @day_of_week, @period_number, @room,
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
    return record
  }

  clearCell(classId: string, day: number, period: number): void {
    const slot = this.db
      .prepare(
        `SELECT * FROM timetable_slots
         WHERE class_id = ? AND day_of_week = ? AND period_number = ?
           AND deleted_at IS NULL LIMIT 1`
      )
      .get(classId, day, period) as TimetableSlot | undefined
    if (slot) this.delete(slot.id)
  }
}

export class AttendanceRepository extends BaseRepository<AttendanceSession> {
  constructor(db: Database.Database) {
    super(db, 'attendance_sessions')
  }

  findSessions(schoolId: string, classId?: string | null): AttendanceSession[] {
    if (classId) {
      return this.db
        .prepare(
          `SELECT * FROM attendance_sessions
           WHERE school_id = ? AND class_id = ? AND deleted_at IS NULL
           ORDER BY session_date DESC`
        )
        .all(schoolId, classId) as AttendanceSession[]
    }
    return this.db
      .prepare(
        `SELECT * FROM attendance_sessions
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY session_date DESC`
      )
      .all(schoolId) as AttendanceSession[]
  }

  findSessionByClassDate(
    classId: string,
    sessionDate: string
  ): AttendanceSession | undefined {
    return this.db
      .prepare(
        `SELECT * FROM attendance_sessions
         WHERE class_id = ? AND session_date = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(classId, sessionDate) as AttendanceSession | undefined
  }

  createSession(input: {
    school_id: string
    class_id: string
    session_date: string
    notes?: string | null
  }): AttendanceSession {
    const record: AttendanceSession = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      class_id: input.class_id,
      session_date: input.session_date,
      notes: input.notes ?? null,
    }
    this.db
      .prepare(
        `INSERT INTO attendance_sessions (
          id, school_id, class_id, session_date, notes, ${SYNC_COLS}
        ) VALUES (
          @id, @school_id, @class_id, @session_date, @notes,
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
    return record
  }

  findRecords(sessionId: string): AttendanceRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM attendance_records
         WHERE session_id = ? AND deleted_at IS NULL`
      )
      .all(sessionId) as AttendanceRecord[]
  }

  upsertRecord(input: {
    session_id: string
    student_id: string
    status: AttendanceMark
  }): AttendanceRecord {
    const existing = this.db
      .prepare(
        `SELECT * FROM attendance_records
         WHERE session_id = ? AND student_id = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(input.session_id, input.student_id) as AttendanceRecord | undefined

    if (existing) {
      const record: AttendanceRecord = {
        ...existing,
        status: input.status,
        ...this.applyUpdateMeta(existing),
      }
      this.db
        .prepare(
          `UPDATE attendance_records
           SET status = @status, updated_at = @updated_at,
               version = @version, sync_status = @sync_status
           WHERE id = @id`
        )
        .run(record)
      enqueueSync(
        this.db,
        'attendance_records',
        record.id,
        'UPDATE',
        record as unknown as Record<string, unknown>
      )
      return record
    }

    const record: AttendanceRecord = {
      ...this.buildBaseFields(),
      session_id: input.session_id,
      student_id: input.student_id,
      status: input.status,
    }
    this.db
      .prepare(
        `INSERT INTO attendance_records (
          id, session_id, student_id, status, ${SYNC_COLS}
        ) VALUES (
          @id, @session_id, @student_id, @status,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'attendance_records',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  reportByClass(
    schoolId: string,
    classId: string,
    fromDate?: string | null,
    toDate?: string | null
  ): Array<{
    student_id: string
    present: number
    absent: number
    late: number
    excused: number
    total: number
  }> {
    let sql = `
      SELECT r.student_id,
        SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN r.status = 'absent' THEN 1 ELSE 0 END) AS absent,
        SUM(CASE WHEN r.status = 'late' THEN 1 ELSE 0 END) AS late,
        SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END) AS excused,
        COUNT(*) AS total
      FROM attendance_records r
      JOIN attendance_sessions s ON s.id = r.session_id
      WHERE s.school_id = ? AND s.class_id = ?
        AND s.deleted_at IS NULL AND r.deleted_at IS NULL`
    const params: unknown[] = [schoolId, classId]
    if (fromDate) {
      sql += ` AND s.session_date >= ?`
      params.push(fromDate)
    }
    if (toDate) {
      sql += ` AND s.session_date <= ?`
      params.push(toDate)
    }
    sql += ` GROUP BY r.student_id`
    return this.db.prepare(sql).all(...params) as Array<{
      student_id: string
      present: number
      absent: number
      late: number
      excused: number
      total: number
    }>
  }
}

export class CaRepository extends BaseRepository<CaAssessment> {
  constructor(db: Database.Database) {
    super(db, 'ca_assessments')
  }

  findBySchool(schoolId: string): CaAssessment[] {
    return this.db
      .prepare(
        `SELECT * FROM ca_assessments
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      )
      .all(schoolId) as CaAssessment[]
  }

  create(input: {
    school_id: string
    name: string
    subject_id: string
    class_id: string
    term_id?: string | null
    academic_year_id?: string | null
    weight_percent: number
    max_score: number
    assessment_date?: string | null
  }): CaAssessment {
    const record: CaAssessment = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      name: input.name.trim(),
      subject_id: input.subject_id,
      class_id: input.class_id,
      term_id: input.term_id ?? null,
      academic_year_id: input.academic_year_id ?? null,
      weight_percent: input.weight_percent,
      max_score: input.max_score,
      assessment_date: input.assessment_date ?? null,
    }
    this.db
      .prepare(
        `INSERT INTO ca_assessments (
          id, school_id, name, subject_id, class_id, term_id, academic_year_id,
          weight_percent, max_score, assessment_date, ${SYNC_COLS}
        ) VALUES (
          @id, @school_id, @name, @subject_id, @class_id, @term_id, @academic_year_id,
          @weight_percent, @max_score, @assessment_date,
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
    return record
  }

  updateAssessment(
    id: string,
    input: Partial<{
      name: string
      weight_percent: number
      max_score: number
      assessment_date: string | null
      term_id: string | null
    }>
  ): CaAssessment | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const record: CaAssessment = {
      ...existing,
      name: input.name?.trim() ?? existing.name,
      weight_percent: input.weight_percent ?? existing.weight_percent,
      max_score: input.max_score ?? existing.max_score,
      assessment_date:
        input.assessment_date !== undefined
          ? input.assessment_date
          : existing.assessment_date,
      term_id:
        input.term_id !== undefined ? input.term_id : existing.term_id,
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE ca_assessments
         SET name = @name, weight_percent = @weight_percent, max_score = @max_score,
             assessment_date = @assessment_date, term_id = @term_id,
             updated_at = @updated_at, version = @version, sync_status = @sync_status
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
    return record
  }

  findScores(assessmentId: string): CaScore[] {
    return this.db
      .prepare(
        `SELECT * FROM ca_scores
         WHERE assessment_id = ? AND deleted_at IS NULL`
      )
      .all(assessmentId) as CaScore[]
  }

  findScoresForClassTerm(
    classId: string,
    termId: string | null
  ): Array<CaAssessment & { scores: CaScore[] }> {
    let sql = `SELECT * FROM ca_assessments
      WHERE class_id = ? AND deleted_at IS NULL`
    const params: unknown[] = [classId]
    if (termId) {
      sql += ` AND (term_id = ? OR term_id IS NULL)`
      params.push(termId)
    }
    const assessments = this.db.prepare(sql).all(...params) as CaAssessment[]
    return assessments.map((a) => ({
      ...a,
      scores: this.findScores(a.id),
    }))
  }

  upsertScore(input: {
    assessment_id: string
    student_id: string
    score: number | null
  }): CaScore {
    const existing = this.db
      .prepare(
        `SELECT * FROM ca_scores
         WHERE assessment_id = ? AND student_id = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(input.assessment_id, input.student_id) as CaScore | undefined

    if (existing) {
      const record: CaScore = {
        ...existing,
        score: input.score,
        ...this.applyUpdateMeta(existing),
      }
      this.db
        .prepare(
          `UPDATE ca_scores
           SET score = @score, updated_at = @updated_at,
               version = @version, sync_status = @sync_status
           WHERE id = @id`
        )
        .run(record)
      enqueueSync(
        this.db,
        'ca_scores',
        record.id,
        'UPDATE',
        record as unknown as Record<string, unknown>
      )
      return record
    }

    const record: CaScore = {
      ...this.buildBaseFields(),
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      score: input.score,
    }
    this.db
      .prepare(
        `INSERT INTO ca_scores (
          id, assessment_id, student_id, score, ${SYNC_COLS}
        ) VALUES (
          @id, @assessment_id, @student_id, @score,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'ca_scores',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }
}

export class ExamRepository extends BaseRepository<ExamSession> {
  constructor(db: Database.Database) {
    super(db, 'exam_sessions')
  }

  findBySchool(schoolId: string): ExamSession[] {
    return this.db
      .prepare(
        `SELECT * FROM exam_sessions
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      )
      .all(schoolId) as ExamSession[]
  }

  createSession(input: {
    school_id: string
    name: string
    term_id?: string | null
    academic_year_id?: string | null
    start_date?: string | null
    end_date?: string | null
    status?: ExamSessionStatus
  }): ExamSession {
    const record: ExamSession = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      name: input.name.trim(),
      term_id: input.term_id ?? null,
      academic_year_id: input.academic_year_id ?? null,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      status: input.status ?? 'draft',
    }
    this.db
      .prepare(
        `INSERT INTO exam_sessions (
          id, school_id, name, term_id, academic_year_id,
          start_date, end_date, status, ${SYNC_COLS}
        ) VALUES (
          @id, @school_id, @name, @term_id, @academic_year_id,
          @start_date, @end_date, @status,
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
    return record
  }

  updateSession(
    id: string,
    input: Partial<{
      name: string
      start_date: string | null
      end_date: string | null
      status: ExamSessionStatus
      term_id: string | null
    }>
  ): ExamSession | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const record: ExamSession = {
      ...existing,
      name: input.name?.trim() ?? existing.name,
      start_date:
        input.start_date !== undefined ? input.start_date : existing.start_date,
      end_date:
        input.end_date !== undefined ? input.end_date : existing.end_date,
      status: input.status ?? existing.status,
      term_id: input.term_id !== undefined ? input.term_id : existing.term_id,
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE exam_sessions
         SET name = @name, start_date = @start_date, end_date = @end_date,
             status = @status, term_id = @term_id,
             updated_at = @updated_at, version = @version, sync_status = @sync_status
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
    return record
  }

  findPapers(sessionId: string): ExamPaper[] {
    return this.db
      .prepare(
        `SELECT * FROM exam_papers
         WHERE exam_session_id = ? AND deleted_at IS NULL`
      )
      .all(sessionId) as ExamPaper[]
  }

  findPaperById(id: string): ExamPaper | undefined {
    return this.db
      .prepare(
        `SELECT * FROM exam_papers WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as ExamPaper | undefined
  }

  findPapersByClass(
    classId: string,
    termId?: string | null
  ): ExamPaper[] {
    if (termId) {
      return this.db
        .prepare(
          `SELECT p.* FROM exam_papers p
           JOIN exam_sessions s ON s.id = p.exam_session_id
           WHERE p.class_id = ? AND s.term_id = ?
             AND p.deleted_at IS NULL AND s.deleted_at IS NULL`
        )
        .all(classId, termId) as ExamPaper[]
    }
    return this.db
      .prepare(
        `SELECT * FROM exam_papers
         WHERE class_id = ? AND deleted_at IS NULL`
      )
      .all(classId) as ExamPaper[]
  }

  upsertPaper(input: {
    id?: string | null
    exam_session_id: string
    subject_id: string
    class_id: string
    max_score: number
    exam_date?: string | null
  }): ExamPaper {
    const existing = input.id
      ? (this.db
          .prepare(
            `SELECT * FROM exam_papers WHERE id = ? AND deleted_at IS NULL`
          )
          .get(input.id) as ExamPaper | undefined)
      : (this.db
          .prepare(
            `SELECT * FROM exam_papers
             WHERE exam_session_id = ? AND subject_id = ? AND class_id = ?
               AND deleted_at IS NULL LIMIT 1`
          )
          .get(
            input.exam_session_id,
            input.subject_id,
            input.class_id
          ) as ExamPaper | undefined)

    if (existing) {
      const record: ExamPaper = {
        ...existing,
        max_score: input.max_score,
        exam_date: input.exam_date ?? existing.exam_date,
        ...this.applyUpdateMeta(existing),
      }
      this.db
        .prepare(
          `UPDATE exam_papers
           SET max_score = @max_score, exam_date = @exam_date,
               updated_at = @updated_at, version = @version, sync_status = @sync_status
           WHERE id = @id`
        )
        .run(record)
      enqueueSync(
        this.db,
        'exam_papers',
        record.id,
        'UPDATE',
        record as unknown as Record<string, unknown>
      )
      return record
    }

    const record: ExamPaper = {
      ...this.buildBaseFields(),
      exam_session_id: input.exam_session_id,
      subject_id: input.subject_id,
      class_id: input.class_id,
      max_score: input.max_score,
      exam_date: input.exam_date ?? null,
    }
    this.db
      .prepare(
        `INSERT INTO exam_papers (
          id, exam_session_id, subject_id, class_id, max_score, exam_date, ${SYNC_COLS}
        ) VALUES (
          @id, @exam_session_id, @subject_id, @class_id, @max_score, @exam_date,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'exam_papers',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  findScores(paperId: string): ExamScore[] {
    return this.db
      .prepare(
        `SELECT * FROM exam_scores
         WHERE paper_id = ? AND deleted_at IS NULL`
      )
      .all(paperId) as ExamScore[]
  }

  upsertScore(input: {
    paper_id: string
    student_id: string
    score: number | null
  }): ExamScore {
    const existing = this.db
      .prepare(
        `SELECT * FROM exam_scores
         WHERE paper_id = ? AND student_id = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(input.paper_id, input.student_id) as ExamScore | undefined

    if (existing) {
      const record: ExamScore = {
        ...existing,
        score: input.score,
        ...this.applyUpdateMeta(existing),
      }
      this.db
        .prepare(
          `UPDATE exam_scores
           SET score = @score, updated_at = @updated_at,
               version = @version, sync_status = @sync_status
           WHERE id = @id`
        )
        .run(record)
      enqueueSync(
        this.db,
        'exam_scores',
        record.id,
        'UPDATE',
        record as unknown as Record<string, unknown>
      )
      return record
    }

    const record: ExamScore = {
      ...this.buildBaseFields(),
      paper_id: input.paper_id,
      student_id: input.student_id,
      score: input.score,
    }
    this.db
      .prepare(
        `INSERT INTO exam_scores (
          id, paper_id, student_id, score, ${SYNC_COLS}
        ) VALUES (
          @id, @paper_id, @student_id, @score,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'exam_scores',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }
}

export class ResultsRepository extends BaseRepository<ResultRun> {
  constructor(db: Database.Database) {
    super(db, 'result_runs')
  }

  findByClassTerm(
    classId: string,
    termId: string | null
  ): ResultRun | undefined {
    if (termId) {
      return this.db
        .prepare(
          `SELECT * FROM result_runs
           WHERE class_id = ? AND term_id = ? AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(classId, termId) as ResultRun | undefined
    }
    return this.db
      .prepare(
        `SELECT * FROM result_runs
         WHERE class_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(classId) as ResultRun | undefined
  }

  findBySchool(schoolId: string): ResultRun[] {
    return this.db
      .prepare(
        `SELECT * FROM result_runs
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      )
      .all(schoolId) as ResultRun[]
  }

  createRun(input: {
    school_id: string
    class_id: string
    term_id?: string | null
    academic_year_id?: string | null
    status?: ResultRunStatus
  }): ResultRun {
    const record: ResultRun = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      class_id: input.class_id,
      term_id: input.term_id ?? null,
      academic_year_id: input.academic_year_id ?? null,
      status: input.status ?? 'draft',
      computed_at: null,
      published_at: null,
    }
    this.db
      .prepare(
        `INSERT INTO result_runs (
          id, school_id, class_id, term_id, academic_year_id,
          status, computed_at, published_at, ${SYNC_COLS}
        ) VALUES (
          @id, @school_id, @class_id, @term_id, @academic_year_id,
          @status, @computed_at, @published_at,
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
    return record
  }

  updateStatus(
    id: string,
    status: ResultRunStatus,
    extras?: { computed_at?: string | null; published_at?: string | null }
  ): ResultRun | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const record: ResultRun = {
      ...existing,
      status,
      computed_at:
        extras?.computed_at !== undefined
          ? extras.computed_at
          : existing.computed_at,
      published_at:
        extras?.published_at !== undefined
          ? extras.published_at
          : existing.published_at,
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE result_runs
         SET status = @status, computed_at = @computed_at, published_at = @published_at,
             updated_at = @updated_at, version = @version, sync_status = @sync_status
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
    return record
  }

  softDeleteRows(runId: string): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE result_subject_rows
         SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
         WHERE result_run_id = ? AND deleted_at IS NULL`
      )
      .run(now, now, runId)
    this.db
      .prepare(
        `UPDATE result_student_summaries
         SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
         WHERE result_run_id = ? AND deleted_at IS NULL`
      )
      .run(now, now, runId)
  }

  insertSubjectRow(input: {
    result_run_id: string
    student_id: string
    subject_id: string
    ca_score: number
    exam_score: number
    total: number
    grade: string | null
  }): ResultSubjectRow {
    const record: ResultSubjectRow = {
      ...this.buildBaseFields(),
      ...input,
    }
    this.db
      .prepare(
        `INSERT INTO result_subject_rows (
          id, result_run_id, student_id, subject_id,
          ca_score, exam_score, total, grade, ${SYNC_COLS}
        ) VALUES (
          @id, @result_run_id, @student_id, @subject_id,
          @ca_score, @exam_score, @total, @grade,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'result_subject_rows',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  insertSummary(input: {
    result_run_id: string
    student_id: string
    average: number
    total: number
    grade: string | null
    position: number | null
    remark: string | null
  }): ResultStudentSummary {
    const record: ResultStudentSummary = {
      ...this.buildBaseFields(),
      ...input,
    }
    this.db
      .prepare(
        `INSERT INTO result_student_summaries (
          id, result_run_id, student_id, average, total, grade, position, remark, ${SYNC_COLS}
        ) VALUES (
          @id, @result_run_id, @student_id, @average, @total, @grade, @position, @remark,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'result_student_summaries',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  findSubjectRows(runId: string): ResultSubjectRow[] {
    return this.db
      .prepare(
        `SELECT * FROM result_subject_rows
         WHERE result_run_id = ? AND deleted_at IS NULL`
      )
      .all(runId) as ResultSubjectRow[]
  }

  findSummaries(runId: string): ResultStudentSummary[] {
    return this.db
      .prepare(
        `SELECT * FROM result_student_summaries
         WHERE result_run_id = ? AND deleted_at IS NULL
         ORDER BY CASE WHEN position IS NULL THEN 1 ELSE 0 END, position ASC, average DESC`
      )
      .all(runId) as ResultStudentSummary[]
  }
}

export class ReportCardRepository extends BaseRepository<ReportCard> {
  constructor(db: Database.Database) {
    super(db, 'report_cards')
  }

  findByClassTerm(
    classId: string,
    termId: string | null
  ): ReportCard[] {
    if (termId) {
      return this.db
        .prepare(
          `SELECT * FROM report_cards
           WHERE class_id = ? AND term_id = ? AND deleted_at IS NULL
           ORDER BY created_at DESC`
        )
        .all(classId, termId) as ReportCard[]
    }
    return this.db
      .prepare(
        `SELECT * FROM report_cards
         WHERE class_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      )
      .all(classId) as ReportCard[]
  }

  findBySchool(schoolId: string): ReportCard[] {
    return this.db
      .prepare(
        `SELECT * FROM report_cards
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY generated_at DESC, created_at DESC`
      )
      .all(schoolId) as ReportCard[]
  }

  upsertCard(input: {
    school_id: string
    student_id: string
    class_id: string
    term_id?: string | null
    academic_year_id?: string | null
    result_run_id?: string | null
    status?: ReportCardStatus
    payload?: string | null
  }): ReportCard {
    const existing = this.db
      .prepare(
        `SELECT * FROM report_cards
         WHERE student_id = ? AND class_id = ?
           AND IFNULL(term_id, '') = IFNULL(?, '')
           AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(
        input.student_id,
        input.class_id,
        input.term_id ?? null
      ) as ReportCard | undefined

    const now = new Date().toISOString()
    if (existing) {
      const record: ReportCard = {
        ...existing,
        result_run_id: input.result_run_id ?? existing.result_run_id,
        status: input.status ?? 'generated',
        generated_at: now,
        payload: input.payload ?? existing.payload,
        ...this.applyUpdateMeta(existing),
      }
      this.db
        .prepare(
          `UPDATE report_cards
           SET result_run_id = @result_run_id, status = @status,
               generated_at = @generated_at, payload = @payload,
               updated_at = @updated_at, version = @version, sync_status = @sync_status
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
      return record
    }

    const record: ReportCard = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      student_id: input.student_id,
      class_id: input.class_id,
      term_id: input.term_id ?? null,
      academic_year_id: input.academic_year_id ?? null,
      result_run_id: input.result_run_id ?? null,
      status: input.status ?? 'generated',
      generated_at: now,
      payload: input.payload ?? null,
    }
    this.db
      .prepare(
        `INSERT INTO report_cards (
          id, school_id, student_id, class_id, term_id, academic_year_id,
          result_run_id, status, generated_at, payload, ${SYNC_COLS}
        ) VALUES (
          @id, @school_id, @student_id, @class_id, @term_id, @academic_year_id,
          @result_run_id, @status, @generated_at, @payload,
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
    return record
  }
}
