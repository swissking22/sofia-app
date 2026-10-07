/** Renderer IPC helpers for Assessment Questions review workflow. */

export type AssessmentQuestionStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'

export type AssessmentQuestionType =
  | 'exam'
  | 'ca'
  | 'mock'
  | 'test'
  | 'other'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type AssessmentQuestionsMeta = {
  years: Array<{ id: string; name: string; is_current: boolean }>
  terms: Array<{ id: string; name: string; academic_year_id: string }>
  classes: Array<{ id: string; name: string }>
  subjects: Array<{ id: string; name: string }>
  teachers: Array<{ id: string; name: string }>
  assessment_types: Array<{ id: string; label: string }>
  status_labels: Record<AssessmentQuestionStatus, string>
  can_view: boolean
  can_review: boolean
  can_approve: boolean
  can_reject: boolean
  can_print: boolean
}

export type AssessmentQuestionSummary = {
  pending_review: number
  approved: number
  rejected: number
  total: number
}

export type AssessmentQuestionListRow = {
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
  current_status: AssessmentQuestionStatus
  submitted_at: string | null
  reviewed_at: string | null
  sync_status: string
  sync_label: string
  status_label: string
  rejection_note: string | null
}

export type AssessmentQuestionDetail = {
  paper: {
    id: string
    title: string
    assessment_type: AssessmentQuestionType
    class_name: string
    subject_name: string
    teacher_name: string
    academic_year_name: string | null
    term_name: string | null
    current_revision_number: number
    current_status: AssessmentQuestionStatus
    status_label: string
    sync_status: string
    sync_label: string
    current_revision_id: string | null
  }
  current_revision: {
    id: string
    revision_number: number
    status: AssessmentQuestionStatus
    status_label: string
    submitted_at: string
    reviewed_at: string | null
    reviewer_email: string | null
    rejection_note: string | null
    file_name: string | null
    file_available: boolean
  } | null
  revisions: Array<{
    id: string
    revision_number: number
    status: AssessmentQuestionStatus
    status_label: string
    submitted_at: string
    reviewed_at: string | null
    reviewer_email: string | null
    rejection_note: string | null
    file_available: boolean
  }>
  events: Array<{
    id: string
    action: string
    notes: string | null
    created_at: string
    actor_email: string | null
    revision_id: string | null
  }>
  pdf_data_url: string | null
  can_approve: boolean
  can_reject: boolean
  can_print: boolean
  print_unavailable_reason: string | null
}

export async function fetchAssessmentQuestionsMeta(): Promise<
  Result<AssessmentQuestionsMeta>
> {
  return (await window.ipc.invoke(
    'assessment-questions:meta'
  )) as Result<AssessmentQuestionsMeta>
}

export async function fetchAssessmentQuestionsSummary(): Promise<
  Result<AssessmentQuestionSummary>
> {
  return (await window.ipc.invoke(
    'assessment-questions:summary'
  )) as Result<AssessmentQuestionSummary>
}

export async function fetchAssessmentQuestionsList(filters: {
  status?: AssessmentQuestionStatus | 'all'
  academic_year_id?: string
  term_id?: string
  class_id?: string
  subject_id?: string
  teacher_staff_id?: string
  assessment_type?: AssessmentQuestionType | 'all'
  query?: string
}): Promise<Result<{ rows: AssessmentQuestionListRow[] }>> {
  return (await window.ipc.invoke(
    'assessment-questions:list',
    filters
  )) as Result<{ rows: AssessmentQuestionListRow[] }>
}

export async function fetchAssessmentQuestion(
  id: string
): Promise<Result<AssessmentQuestionDetail>> {
  return (await window.ipc.invoke('assessment-questions:get', {
    id,
  })) as Result<AssessmentQuestionDetail>
}

export async function approveAssessmentQuestion(input: {
  paper_id: string
  revision_id: string
}): Promise<Result<unknown>> {
  return (await window.ipc.invoke(
    'assessment-questions:approve',
    input
  )) as Result<unknown>
}

export async function rejectAssessmentQuestion(input: {
  paper_id: string
  revision_id: string
  rejection_note: string
}): Promise<Result<unknown>> {
  return (await window.ipc.invoke(
    'assessment-questions:reject',
    input
  )) as Result<unknown>
}

export async function openAssessmentQuestionFile(
  revision_id: string
): Promise<Result<unknown>> {
  return (await window.ipc.invoke('assessment-questions:open-file', {
    revision_id,
  })) as Result<unknown>
}

export async function recordAssessmentQuestionPrint(input: {
  paper_id: string
  revision_id: string
}): Promise<Result<unknown>> {
  return (await window.ipc.invoke(
    'assessment-questions:record-print',
    input
  )) as Result<unknown>
}

export async function submitAssessmentQuestion(input: {
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
}): Promise<Result<unknown>> {
  return (await window.ipc.invoke(
    'assessment-questions:submit',
    input
  )) as Result<unknown>
}
