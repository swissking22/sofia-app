import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type {
  AssessmentQuestionPaper,
  AssessmentQuestionPaperEvent,
  AssessmentQuestionPaperEventAction,
  AssessmentQuestionPaperRevision,
  AssessmentQuestionPaperStatus,
  AssessmentQuestionType,
} from '../types'
import { BaseRepository } from './base'

export interface AssessmentQuestionListFilters {
  status?: AssessmentQuestionPaperStatus | 'all'
  academic_year_id?: string | null
  term_id?: string | null
  class_id?: string | null
  subject_id?: string | null
  teacher_staff_id?: string | null
  assessment_type?: AssessmentQuestionType | 'all' | null
  query?: string | null
}

export interface AssessmentQuestionListRow {
  id: string
  title: string
  assessment_type: AssessmentQuestionType
  class_id: string
  class_name: string
  subject_id: string
  subject_name: string
  teacher_staff_id: string
  teacher_name: string
  academic_year_id: string | null
  academic_year_name: string | null
  term_id: string | null
  term_name: string | null
  current_revision_id: string | null
  current_revision_number: number
  current_status: AssessmentQuestionPaperStatus
  submitted_at: string | null
  reviewed_at: string | null
  sync_status: string
  rejection_note: string | null
}

export interface AssessmentQuestionSummary {
  pending_review: number
  approved: number
  rejected: number
  total: number
}

export class AssessmentQuestionsRepository extends BaseRepository<AssessmentQuestionPaper> {
  constructor(db: Database.Database) {
    super(db, 'assessment_question_papers')
  }

  summary(schoolId: string): AssessmentQuestionSummary {
    const rows = this.db
      .prepare(
        `SELECT current_status AS status, COUNT(*) AS c
         FROM assessment_question_papers
         WHERE school_id = ? AND deleted_at IS NULL
         GROUP BY current_status`
      )
      .all(schoolId) as Array<{ status: string; c: number }>
    const out: AssessmentQuestionSummary = {
      pending_review: 0,
      approved: 0,
      rejected: 0,
      total: 0,
    }
    for (const r of rows) {
      out.total += r.c
      if (r.status === 'pending_review') out.pending_review = r.c
      else if (r.status === 'approved') out.approved = r.c
      else if (r.status === 'rejected') out.rejected = r.c
    }
    return out
  }

  list(
    schoolId: string,
    filters: AssessmentQuestionListFilters = {}
  ): AssessmentQuestionListRow[] {
    const status = filters.status && filters.status !== 'all' ? filters.status : null
    const rows = this.db
      .prepare(
        `SELECT
           p.id, p.title, p.assessment_type,
           p.class_id, COALESCE(c.name, '—') AS class_name,
           p.subject_id, COALESCE(s.name, '—') AS subject_name,
           p.teacher_staff_id,
           COALESCE(st.full_name, '—') AS teacher_name,
           p.academic_year_id, ay.name AS academic_year_name,
           p.term_id, t.name AS term_name,
           p.current_revision_id, p.current_revision_number, p.current_status,
           r.submitted_at, r.reviewed_at, p.sync_status, r.rejection_note
         FROM assessment_question_papers p
         LEFT JOIN classes c ON c.id = p.class_id
         LEFT JOIN subjects s ON s.id = p.subject_id
         LEFT JOIN staff st ON st.id = p.teacher_staff_id
         LEFT JOIN academic_years ay ON ay.id = p.academic_year_id
         LEFT JOIN academic_terms t ON t.id = p.term_id
         LEFT JOIN assessment_question_paper_revisions r ON r.id = p.current_revision_id
         WHERE p.school_id = ? AND p.deleted_at IS NULL
           AND (? IS NULL OR p.current_status = ?)
           AND (? IS NULL OR p.academic_year_id = ?)
           AND (? IS NULL OR p.term_id = ?)
           AND (? IS NULL OR p.class_id = ?)
           AND (? IS NULL OR p.subject_id = ?)
           AND (? IS NULL OR p.teacher_staff_id = ?)
           AND (? IS NULL OR p.assessment_type = ?)
         ORDER BY
           CASE p.current_status
             WHEN 'pending_review' THEN 0
             WHEN 'rejected' THEN 1
             ELSE 2
           END,
           COALESCE(r.submitted_at, p.updated_at) DESC`
      )
      .all(
        schoolId,
        status,
        status,
        filters.academic_year_id || null,
        filters.academic_year_id || null,
        filters.term_id || null,
        filters.term_id || null,
        filters.class_id || null,
        filters.class_id || null,
        filters.subject_id || null,
        filters.subject_id || null,
        filters.teacher_staff_id || null,
        filters.teacher_staff_id || null,
        filters.assessment_type && filters.assessment_type !== 'all'
          ? filters.assessment_type
          : null,
        filters.assessment_type && filters.assessment_type !== 'all'
          ? filters.assessment_type
          : null
      ) as AssessmentQuestionListRow[]

    const q = (filters.query || '').trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = [
        r.title,
        r.class_name,
        r.subject_name,
        r.teacher_name,
        r.assessment_type,
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }

  findPaper(schoolId: string, id: string): AssessmentQuestionPaper | undefined {
    return this.db
      .prepare(
        `SELECT * FROM assessment_question_papers
         WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .get(id, schoolId) as AssessmentQuestionPaper | undefined
  }

  findRevision(
    schoolId: string,
    id: string
  ): AssessmentQuestionPaperRevision | undefined {
    return this.db
      .prepare(
        `SELECT * FROM assessment_question_paper_revisions
         WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .get(id, schoolId) as AssessmentQuestionPaperRevision | undefined
  }

  listRevisions(
    schoolId: string,
    paperId: string
  ): AssessmentQuestionPaperRevision[] {
    return this.db
      .prepare(
        `SELECT * FROM assessment_question_paper_revisions
         WHERE school_id = ? AND paper_id = ? AND deleted_at IS NULL
         ORDER BY revision_number DESC`
      )
      .all(schoolId, paperId) as AssessmentQuestionPaperRevision[]
  }

  listEvents(
    schoolId: string,
    paperId: string
  ): AssessmentQuestionPaperEvent[] {
    return this.db
      .prepare(
        `SELECT * FROM assessment_question_paper_events
         WHERE school_id = ? AND paper_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      )
      .all(schoolId, paperId) as AssessmentQuestionPaperEvent[]
  }

  /**
   * Teacher (or sync ingest) creates a paper + first revision, or adds a
   * revision to an existing rejected paper.
   */
  submitRevision(input: {
    school_id: string
    paper_id?: string | null
    title: string
    assessment_type: AssessmentQuestionType
    academic_year_id?: string | null
    term_id?: string | null
    class_id: string
    subject_id: string
    teacher_staff_id: string
    exam_session_id?: string | null
    exam_paper_id?: string | null
    ca_assessment_id?: string | null
    file_path: string
    file_name: string
    mime_type: string
    file_size: number
    submitted_by_staff_id?: string | null
  }): {
    paper: AssessmentQuestionPaper
    revision: AssessmentQuestionPaperRevision
  } {
    const now = new Date().toISOString()
    return this.db.transaction(() => {
      let paper: AssessmentQuestionPaper | undefined
      if (input.paper_id) {
        paper = this.findPaper(input.school_id, input.paper_id)
        if (!paper) throw new Error('Question paper not found.')
        if (paper.current_status === 'approved') {
          throw new Error(
            'This question paper is already approved. Start a new paper to replace it.'
          )
        }
        if (paper.current_status === 'pending_review') {
          throw new Error(
            'A revision is already pending review. Wait for a decision before resubmitting.'
          )
        }
      }

      const isResubmit = Boolean(paper)
      const revisionNumber = paper ? paper.current_revision_number + 1 : 1
      const revisionBase = this.buildBaseFields()
      const revision: AssessmentQuestionPaperRevision = {
        ...revisionBase,
        school_id: input.school_id,
        paper_id: '', // set below
        revision_number: revisionNumber,
        file_path: input.file_path,
        file_name: input.file_name,
        mime_type: input.mime_type,
        file_size: input.file_size,
        status: 'pending_review',
        submitted_by_staff_id:
          input.submitted_by_staff_id || input.teacher_staff_id,
        submitted_at: now,
        reviewed_by_user_id: null,
        reviewed_at: null,
        rejection_note: null,
      }

      if (!paper) {
        const paperBase = this.buildBaseFields()
        paper = {
          ...paperBase,
          school_id: input.school_id,
          title: input.title.trim(),
          assessment_type: input.assessment_type,
          academic_year_id: input.academic_year_id || null,
          term_id: input.term_id || null,
          class_id: input.class_id,
          subject_id: input.subject_id,
          teacher_staff_id: input.teacher_staff_id,
          exam_session_id: input.exam_session_id || null,
          exam_paper_id: input.exam_paper_id || null,
          ca_assessment_id: input.ca_assessment_id || null,
          current_revision_id: revision.id,
          current_revision_number: revisionNumber,
          current_status: 'pending_review',
        }
        this.db
          .prepare(
            `INSERT INTO assessment_question_papers (
               id, school_id, title, assessment_type, academic_year_id, term_id,
               class_id, subject_id, teacher_staff_id, exam_session_id, exam_paper_id,
               ca_assessment_id, current_revision_id, current_revision_number, current_status,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (
               @id, @school_id, @title, @assessment_type, @academic_year_id, @term_id,
               @class_id, @subject_id, @teacher_staff_id, @exam_session_id, @exam_paper_id,
               @ca_assessment_id, @current_revision_id, @current_revision_number, @current_status,
               @created_at, @updated_at, @deleted_at, @sync_status, @version
             )`
          )
          .run(paper)
        enqueueSync(
          this.db,
          'assessment_question_papers',
          paper.id,
          'INSERT',
          paper as unknown as Record<string, unknown>
        )
      } else {
        paper = {
          ...paper,
          title: input.title.trim() || paper.title,
          current_revision_id: revision.id,
          current_revision_number: revisionNumber,
          current_status: 'pending_review',
          ...this.applyUpdateMeta(paper),
        }
        this.db
          .prepare(
            `UPDATE assessment_question_papers
             SET title = @title,
                 current_revision_id = @current_revision_id,
                 current_revision_number = @current_revision_number,
                 current_status = @current_status,
                 updated_at = @updated_at,
                 version = @version,
                 sync_status = @sync_status
             WHERE id = @id`
          )
          .run(paper)
        enqueueSync(
          this.db,
          'assessment_question_papers',
          paper.id,
          'UPDATE',
          paper as unknown as Record<string, unknown>
        )
      }

      revision.paper_id = paper.id
      this.db
        .prepare(
          `INSERT INTO assessment_question_paper_revisions (
             id, school_id, paper_id, revision_number, file_path, file_name,
             mime_type, file_size, status, submitted_by_staff_id, submitted_at,
             reviewed_by_user_id, reviewed_at, rejection_note,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @paper_id, @revision_number, @file_path, @file_name,
             @mime_type, @file_size, @status, @submitted_by_staff_id, @submitted_at,
             @reviewed_by_user_id, @reviewed_at, @rejection_note,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(revision)
      enqueueSync(
        this.db,
        'assessment_question_paper_revisions',
        revision.id,
        'INSERT',
        revision as unknown as Record<string, unknown>
      )

      this.addEvent({
        school_id: input.school_id,
        paper_id: paper.id,
        revision_id: revision.id,
        action: isResubmit ? 'resubmitted' : 'submitted',
        actor_staff_id: revision.submitted_by_staff_id,
        notes: isResubmit ? `Revision ${revisionNumber}` : null,
      })

      return { paper, revision }
    })()
  }

  approve(input: {
    school_id: string
    paper_id: string
    revision_id: string
    reviewer_user_id: string
  }): {
    paper: AssessmentQuestionPaper
    revision: AssessmentQuestionPaperRevision
  } {
    return this.db.transaction(() => {
      const paper = this.findPaper(input.school_id, input.paper_id)
      if (!paper) throw new Error('Question paper not found.')
      const revision = this.findRevision(input.school_id, input.revision_id)
      if (!revision || revision.paper_id !== paper.id) {
        throw new Error('Revision not found for this paper.')
      }
      if (revision.status !== 'pending_review') {
        throw new Error('Only pending revisions can be approved.')
      }
      if (paper.current_revision_id !== revision.id) {
        throw new Error('Approve the current revision only.')
      }
      if (!revision.file_path) {
        throw new Error('This revision has no PDF file attached.')
      }

      const now = new Date().toISOString()
      const updatedRevision: AssessmentQuestionPaperRevision = {
        ...revision,
        status: 'approved',
        reviewed_by_user_id: input.reviewer_user_id,
        reviewed_at: now,
        rejection_note: null,
        ...this.applyUpdateMeta(revision),
      }
      this.db
        .prepare(
          `UPDATE assessment_question_paper_revisions
           SET status = @status,
               reviewed_by_user_id = @reviewed_by_user_id,
               reviewed_at = @reviewed_at,
               rejection_note = @rejection_note,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(updatedRevision)
      enqueueSync(
        this.db,
        'assessment_question_paper_revisions',
        updatedRevision.id,
        'UPDATE',
        updatedRevision as unknown as Record<string, unknown>
      )

      const updatedPaper: AssessmentQuestionPaper = {
        ...paper,
        current_status: 'approved',
        ...this.applyUpdateMeta(paper),
      }
      this.db
        .prepare(
          `UPDATE assessment_question_papers
           SET current_status = @current_status,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(updatedPaper)
      enqueueSync(
        this.db,
        'assessment_question_papers',
        updatedPaper.id,
        'UPDATE',
        updatedPaper as unknown as Record<string, unknown>
      )

      this.addEvent({
        school_id: input.school_id,
        paper_id: paper.id,
        revision_id: revision.id,
        action: 'approved',
        actor_user_id: input.reviewer_user_id,
        notes: `Approved revision ${revision.revision_number}`,
      })

      return { paper: updatedPaper, revision: updatedRevision }
    })()
  }

  reject(input: {
    school_id: string
    paper_id: string
    revision_id: string
    reviewer_user_id: string
    rejection_note: string
  }): {
    paper: AssessmentQuestionPaper
    revision: AssessmentQuestionPaperRevision
  } {
    return this.db.transaction(() => {
      const paper = this.findPaper(input.school_id, input.paper_id)
      if (!paper) throw new Error('Question paper not found.')
      const revision = this.findRevision(input.school_id, input.revision_id)
      if (!revision || revision.paper_id !== paper.id) {
        throw new Error('Revision not found for this paper.')
      }
      if (revision.status !== 'pending_review') {
        throw new Error('Only pending revisions can be rejected.')
      }
      if (paper.current_revision_id !== revision.id) {
        throw new Error('Reject the current revision only.')
      }

      const now = new Date().toISOString()
      const updatedRevision: AssessmentQuestionPaperRevision = {
        ...revision,
        status: 'rejected',
        reviewed_by_user_id: input.reviewer_user_id,
        reviewed_at: now,
        rejection_note: input.rejection_note,
        ...this.applyUpdateMeta(revision),
      }
      this.db
        .prepare(
          `UPDATE assessment_question_paper_revisions
           SET status = @status,
               reviewed_by_user_id = @reviewed_by_user_id,
               reviewed_at = @reviewed_at,
               rejection_note = @rejection_note,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(updatedRevision)
      enqueueSync(
        this.db,
        'assessment_question_paper_revisions',
        updatedRevision.id,
        'UPDATE',
        updatedRevision as unknown as Record<string, unknown>
      )

      const updatedPaper: AssessmentQuestionPaper = {
        ...paper,
        current_status: 'rejected',
        ...this.applyUpdateMeta(paper),
      }
      this.db
        .prepare(
          `UPDATE assessment_question_papers
           SET current_status = @current_status,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(updatedPaper)
      enqueueSync(
        this.db,
        'assessment_question_papers',
        updatedPaper.id,
        'UPDATE',
        updatedPaper as unknown as Record<string, unknown>
      )

      this.addEvent({
        school_id: input.school_id,
        paper_id: paper.id,
        revision_id: revision.id,
        action: 'rejected',
        actor_user_id: input.reviewer_user_id,
        notes: input.rejection_note,
      })

      return { paper: updatedPaper, revision: updatedRevision }
    })()
  }

  recordView(input: {
    school_id: string
    paper_id: string
    revision_id: string
    actor_user_id: string
  }): void {
    this.addEvent({
      school_id: input.school_id,
      paper_id: input.paper_id,
      revision_id: input.revision_id,
      action: 'viewed',
      actor_user_id: input.actor_user_id,
      notes: null,
    })
  }

  recordPrint(input: {
    school_id: string
    paper_id: string
    revision_id: string
    actor_user_id: string
  }): void {
    const revision = this.findRevision(input.school_id, input.revision_id)
    if (!revision || revision.status !== 'approved') {
      throw new Error('Only approved question papers can be printed.')
    }
    this.addEvent({
      school_id: input.school_id,
      paper_id: input.paper_id,
      revision_id: input.revision_id,
      action: 'printed',
      actor_user_id: input.actor_user_id,
      notes: `Printed revision ${revision.revision_number}`,
    })
  }

  private addEvent(input: {
    school_id: string
    paper_id: string
    revision_id: string | null
    action: AssessmentQuestionPaperEventAction
    actor_user_id?: string | null
    actor_staff_id?: string | null
    notes?: string | null
  }): AssessmentQuestionPaperEvent {
    const record: AssessmentQuestionPaperEvent = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      paper_id: input.paper_id,
      revision_id: input.revision_id,
      action: input.action,
      actor_user_id: input.actor_user_id || null,
      actor_staff_id: input.actor_staff_id || null,
      notes: input.notes || null,
    }
    this.db
      .prepare(
        `INSERT INTO assessment_question_paper_events (
           id, school_id, paper_id, revision_id, action,
           actor_user_id, actor_staff_id, notes,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @paper_id, @revision_id, @action,
           @actor_user_id, @actor_staff_id, @notes,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'assessment_question_paper_events',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }
}
