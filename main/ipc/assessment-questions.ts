import { ipcMain, shell } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import {
  ASSESSMENT_QUESTION_STATUS_LABELS,
  ASSESSMENT_QUESTION_TYPE_LABELS,
  assertRejectionNote,
  hasAssessmentQuestionPermission,
} from '../domain/assessment-questions'
import {
  questionPaperFileExists,
  questionPaperToDataUrl,
  saveQuestionPaperFile,
} from '../helpers/assessment-questions'
import type {
  AssessmentQuestionPaperStatus,
  AssessmentQuestionType,
} from '../db/types'
import {
  getSessionPermissionNames,
  isUnrestrictedAdminSession,
} from '../rbac/session-access'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function session(): SessionData | null {
  return getSession()
}

function sid(repos: Repositories, s: SessionData): string {
  return s.schoolId || repos.schools.findLatest()?.id || ''
}

function perms(repos: Repositories, s: SessionData): string[] {
  try {
    return getSessionPermissionNames(repos, s)
  } catch {
    return []
  }
}

function allow(
  repos: Repositories,
  s: SessionData,
  names: string[]
): boolean {
  return hasAssessmentQuestionPermission(
    perms(repos, s),
    names,
    isUnrestrictedAdminSession(repos, s)
  )
}

function wrap<T>(fn: () => T, fallback: string): Result<T> {
  try {
    return { ok: true, data: fn() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : fallback }
  }
}

function audit(
  repos: Repositories,
  s: SessionData,
  schoolId: string,
  action: string,
  entityId: string,
  description: string
): void {
  try {
    repos.systemAdmin.writeAudit({
      school_id: schoolId,
      actor_user_id: s.userId,
      action,
      module_key: 'assessment_questions',
      entity_type: 'assessment_question_paper',
      entity_id: entityId,
      description,
    })
  } catch {
    /* optional */
  }
}

function syncLabel(status: string | null | undefined): string {
  if (status === 'synced') return 'Synced'
  if (status === 'failed') return 'Sync Failed'
  return 'Pending Sync'
}

export function registerAssessmentQuestionsIpc(repos: Repositories): void {
  ipcMain.handle('assessment-questions:meta', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['assessment_questions.view'])) {
      return { ok: false, error: 'Access denied.' }
    }
    const schoolId = sid(repos, s)
    if (!schoolId) return { ok: false, error: 'No school context.' }
    const p = perms(repos, s)
    const isAdmin = isUnrestrictedAdminSession(repos, s)

    return wrap(() => {
      const years = repos.academicYears
        .findAll()
        .filter((y) => y.school_id === schoolId)
      let termRows: Array<{
        id: string
        name: string
        academic_year_id: string
      }> = []
      try {
        termRows = repos.assessmentQuestions
          .getDb()
          .prepare(
            `SELECT t.id, t.name, t.academic_year_id
             FROM academic_terms t
             INNER JOIN academic_years y ON y.id = t.academic_year_id
             WHERE y.school_id = ? AND t.deleted_at IS NULL AND y.deleted_at IS NULL
             ORDER BY t.term_number ASC, t.name ASC`
          )
          .all(schoolId) as Array<{
          id: string
          name: string
          academic_year_id: string
        }>
      } catch {
        termRows = []
      }

      const classes = repos.classes.findBySchool(schoolId)
      const subjects = repos.subjects.findBySchool(schoolId)
      const teachers = repos.staff
        .findBySchool(schoolId)
        .filter((st) => st.staff_type === 'teaching')

      return {
        years: years.map((y) => ({
          id: y.id,
          name: y.name,
          is_current: Boolean(y.is_current),
        })),
        terms: termRows,
        classes: classes.map((c) => ({ id: c.id, name: c.name })),
        subjects: subjects.map((sub) => ({ id: sub.id, name: sub.name })),
        teachers: teachers.map((t) => ({
          id: t.id,
          name: t.full_name,
        })),
        assessment_types: Object.entries(ASSESSMENT_QUESTION_TYPE_LABELS).map(
          ([id, label]) => ({ id, label })
        ),
        status_labels: ASSESSMENT_QUESTION_STATUS_LABELS,
        can_view: allow(repos, s, ['assessment_questions.view']),
        can_review: allow(repos, s, ['assessment_questions.review']),
        can_approve: allow(repos, s, ['assessment_questions.approve']),
        can_reject: allow(repos, s, ['assessment_questions.reject']),
        can_print: allow(repos, s, ['assessment_questions.print']),
        permissions: p,
        is_admin: isAdmin,
      }
    }, 'Failed to load assessment questions meta.')
  })

  ipcMain.handle(
    'assessment-questions:summary',
    (): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['assessment_questions.view'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      if (!schoolId) return { ok: false, error: 'No school context.' }
      return wrap(
        () => repos.assessmentQuestions.summary(schoolId),
        'Failed to load summary.'
      )
    }
  )

  ipcMain.handle(
    'assessment-questions:list',
    (
      _e,
      input: {
        status?: AssessmentQuestionPaperStatus | 'all'
        academic_year_id?: string
        term_id?: string
        class_id?: string
        subject_id?: string
        teacher_staff_id?: string
        assessment_type?: AssessmentQuestionType | 'all'
        query?: string
      }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['assessment_questions.view'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      if (!schoolId) return { ok: false, error: 'No school context.' }
      return wrap(() => {
        const rows = repos.assessmentQuestions.list(schoolId, {
          status: input?.status ?? 'pending_review',
          academic_year_id: input?.academic_year_id || null,
          term_id: input?.term_id || null,
          class_id: input?.class_id || null,
          subject_id: input?.subject_id || null,
          teacher_staff_id: input?.teacher_staff_id || null,
          assessment_type: input?.assessment_type || null,
          query: input?.query || null,
        })
        return {
          rows: rows.map((r) => ({
            ...r,
            status_label:
              ASSESSMENT_QUESTION_STATUS_LABELS[r.current_status] ||
              r.current_status,
            sync_label: syncLabel(r.sync_status),
          })),
        }
      }, 'Failed to list question papers.')
    }
  )

  ipcMain.handle(
    'assessment-questions:get',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['assessment_questions.view'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      if (!schoolId) return { ok: false, error: 'No school context.' }
      return wrap(() => {
        const paper = repos.assessmentQuestions.findPaper(schoolId, input.id)
        if (!paper) throw new Error('Question paper not found.')
        const revisions = repos.assessmentQuestions.listRevisions(
          schoolId,
          paper.id
        )
        const events = repos.assessmentQuestions.listEvents(schoolId, paper.id)
        const current = paper.current_revision_id
          ? repos.assessmentQuestions.findRevision(
              schoolId,
              paper.current_revision_id
            )
          : revisions[0] || null

        const classRow = repos.classes.findById(paper.class_id)
        const subject = repos.subjects.findById(paper.subject_id)
        const teacher = repos.staff.findById(paper.teacher_staff_id)
        const year = paper.academic_year_id
          ? repos.academicYears.findById(paper.academic_year_id)
          : null
        let termName: string | null = null
        if (paper.term_id) {
          try {
            const t = repos.assessmentQuestions
              .getDb()
              .prepare(
                `SELECT name FROM academic_terms WHERE id = ? AND deleted_at IS NULL`
              )
              .get(paper.term_id) as { name: string } | undefined
            termName = t?.name ?? null
          } catch {
            termName = null
          }
        }

        const reviewerIds = [
          ...new Set(
            revisions
              .map((r) => r.reviewed_by_user_id)
              .filter((id): id is string => Boolean(id))
          ),
        ]
        const reviewers = new Map<string, string>()
        for (const uid of reviewerIds) {
          const u = repos.users.findById(uid)
          if (u) reviewers.set(uid, u.email)
        }

        const fileAvailable = questionPaperFileExists(current?.file_path ?? null)
        let pdfDataUrl: string | null = null
        if (fileAvailable && current?.file_path) {
          try {
            pdfDataUrl = questionPaperToDataUrl(current.file_path)
          } catch {
            pdfDataUrl = null
          }
        }

        return {
          paper: {
            ...paper,
            class_name: classRow?.name ?? '—',
            subject_name: subject?.name ?? '—',
            teacher_name: teacher?.full_name ?? '—',
            academic_year_name: year?.name ?? null,
            term_name: termName,
            status_label:
              ASSESSMENT_QUESTION_STATUS_LABELS[paper.current_status],
            sync_label: syncLabel(paper.sync_status),
          },
          current_revision: current
            ? {
                ...current,
                status_label:
                  ASSESSMENT_QUESTION_STATUS_LABELS[current.status],
                reviewer_email: current.reviewed_by_user_id
                  ? reviewers.get(current.reviewed_by_user_id) || null
                  : null,
                file_available: fileAvailable,
              }
            : null,
          revisions: revisions.map((r) => ({
            ...r,
            status_label: ASSESSMENT_QUESTION_STATUS_LABELS[r.status],
            reviewer_email: r.reviewed_by_user_id
              ? reviewers.get(r.reviewed_by_user_id) || null
              : null,
            file_available: questionPaperFileExists(r.file_path),
          })),
          events: events.map((e) => ({
            ...e,
            actor_email: e.actor_user_id
              ? repos.users.findById(e.actor_user_id)?.email || null
              : null,
          })),
          pdf_data_url: pdfDataUrl,
          can_approve:
            paper.current_status === 'pending_review' &&
            allow(repos, s, ['assessment_questions.approve']),
          can_reject:
            paper.current_status === 'pending_review' &&
            allow(repos, s, ['assessment_questions.reject']),
          can_print:
            paper.current_status === 'approved' &&
            allow(repos, s, ['assessment_questions.print']) &&
            fileAvailable,
          print_unavailable_reason:
            paper.current_status !== 'approved'
              ? 'Printing is only available after approval.'
              : !allow(repos, s, ['assessment_questions.print'])
                ? 'You do not have permission to print question papers.'
                : !fileAvailable
                  ? 'The approved PDF is not available on this device yet. Sync to download it.'
                  : null,
        }
      }, 'Failed to load question paper.')
    }
  )

  ipcMain.handle(
    'assessment-questions:approve',
    (
      _e,
      input: { paper_id: string; revision_id: string }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['assessment_questions.approve'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      if (!schoolId) return { ok: false, error: 'No school context.' }
      return wrap(() => {
        const result = repos.assessmentQuestions.approve({
          school_id: schoolId,
          paper_id: input.paper_id,
          revision_id: input.revision_id,
          reviewer_user_id: s.userId,
        })
        audit(
          repos,
          s,
          schoolId,
          'assessment_questions.approved',
          result.paper.id,
          `Approved revision ${result.revision.revision_number} of “${result.paper.title}”`
        )
        return {
          paper: result.paper,
          revision: result.revision,
          sync_label: syncLabel(result.paper.sync_status),
        }
      }, 'Failed to approve question paper.')
    }
  )

  ipcMain.handle(
    'assessment-questions:reject',
    (
      _e,
      input: { paper_id: string; revision_id: string; rejection_note: string }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['assessment_questions.reject'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      if (!schoolId) return { ok: false, error: 'No school context.' }
      return wrap(() => {
        const note = assertRejectionNote(input.rejection_note)
        const result = repos.assessmentQuestions.reject({
          school_id: schoolId,
          paper_id: input.paper_id,
          revision_id: input.revision_id,
          reviewer_user_id: s.userId,
          rejection_note: note,
        })
        audit(
          repos,
          s,
          schoolId,
          'assessment_questions.rejected',
          result.paper.id,
          `Rejected revision ${result.revision.revision_number}: ${note}`
        )
        return {
          paper: result.paper,
          revision: result.revision,
          sync_label: syncLabel(result.paper.sync_status),
        }
      }, 'Failed to reject question paper.')
    }
  )

  ipcMain.handle(
    'assessment-questions:open-file',
    (_e, input: { revision_id: string }): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['assessment_questions.view'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      if (!schoolId) return { ok: false, error: 'No school context.' }
      return wrap(() => {
        const revision = repos.assessmentQuestions.findRevision(
          schoolId,
          input.revision_id
        )
        if (!revision?.file_path || !questionPaperFileExists(revision.file_path)) {
          throw new Error(
            'PDF file is not available on this device. Sync to download it.'
          )
        }
        try {
          repos.assessmentQuestions.recordView({
            school_id: schoolId,
            paper_id: revision.paper_id,
            revision_id: revision.id,
            actor_user_id: s.userId,
          })
        } catch {
          /* non-fatal */
        }
        void shell.openPath(revision.file_path)
        return { opened: true }
      }, 'Failed to open PDF.')
    }
  )

  ipcMain.handle(
    'assessment-questions:record-print',
    (
      _e,
      input: { paper_id: string; revision_id: string }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['assessment_questions.print'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      if (!schoolId) return { ok: false, error: 'No school context.' }
      return wrap(() => {
        const paper = repos.assessmentQuestions.findPaper(
          schoolId,
          input.paper_id
        )
        if (!paper || paper.current_status !== 'approved') {
          throw new Error('Only approved question papers can be printed.')
        }
        repos.assessmentQuestions.recordPrint({
          school_id: schoolId,
          paper_id: input.paper_id,
          revision_id: input.revision_id,
          actor_user_id: s.userId,
        })
        audit(
          repos,
          s,
          schoolId,
          'assessment_questions.printed',
          input.paper_id,
          'Printed approved question paper'
        )
        return { ok: true }
      }, 'Failed to record print.')
    }
  )

  /**
   * Desktop ingest for teacher-submitted PDFs (sync/mobile or local test).
   * Does not grant teachers desktop review rights.
   */
  ipcMain.handle(
    'assessment-questions:submit',
    (
      _e,
      input: {
        paper_id?: string
        title: string
        assessment_type: AssessmentQuestionType
        academic_year_id?: string
        term_id?: string
        class_id: string
        subject_id: string
        teacher_staff_id: string
        file_base64: string
        file_name?: string
        mime_type?: string
      }
    ): Result<unknown> => {
      const s = session()
      // Unrestricted owner can ingest for testing; synced teacher submissions arrive via pull.
      if (
        !s ||
        !(
          isUnrestrictedAdminSession(repos, s) ||
          allow(repos, s, ['assessment_questions.review'])
        )
      ) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      if (!schoolId) return { ok: false, error: 'No school context.' }
      return wrap(() => {
        if (!input?.file_base64) throw new Error('PDF file is required.')
        const saved = saveQuestionPaperFile(
          input.file_base64,
          input.mime_type || 'application/pdf',
          input.file_name
        )
        const result = repos.assessmentQuestions.submitRevision({
          school_id: schoolId,
          paper_id: input.paper_id || null,
          title: input.title,
          assessment_type: input.assessment_type || 'exam',
          academic_year_id: input.academic_year_id || null,
          term_id: input.term_id || null,
          class_id: input.class_id,
          subject_id: input.subject_id,
          teacher_staff_id: input.teacher_staff_id,
          file_path: saved.filePath,
          file_name: saved.fileName,
          mime_type: saved.mimeType,
          file_size: saved.fileSize,
        })
        audit(
          repos,
          s,
          schoolId,
          'assessment_questions.submitted',
          result.paper.id,
          `Revision ${result.revision.revision_number} submitted for “${result.paper.title}”`
        )
        return result
      }, 'Failed to submit question paper.')
    }
  )
}
