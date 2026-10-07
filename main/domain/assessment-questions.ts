/** Domain rules for assessment question paper review & approval. */

import type {
  AssessmentQuestionPaperStatus,
  AssessmentQuestionType,
} from '../db/types'

export const ASSESSMENT_QUESTION_STATUSES: AssessmentQuestionPaperStatus[] = [
  'pending_review',
  'approved',
  'rejected',
]

export const ASSESSMENT_QUESTION_TYPES: AssessmentQuestionType[] = [
  'exam',
  'ca',
  'mock',
  'test',
  'other',
]

export const ASSESSMENT_QUESTION_TYPE_LABELS: Record<
  AssessmentQuestionType,
  string
> = {
  exam: 'Examination',
  ca: 'Continuous assessment',
  mock: 'Mock exam',
  test: 'Test',
  other: 'Other',
}

export const ASSESSMENT_QUESTION_STATUS_LABELS: Record<
  AssessmentQuestionPaperStatus,
  string
> = {
  pending_review: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
}

/** Sync pull: never regress an approved paper to pending/rejected. */
export const ASSESSMENT_QUESTION_STATUS_RANK: Record<
  AssessmentQuestionPaperStatus,
  number
> = {
  pending_review: 0,
  rejected: 1,
  approved: 2,
}

export function preferAssessmentQuestionStatus(
  local: unknown,
  remote: unknown
): AssessmentQuestionPaperStatus {
  const l = String(local || 'pending_review') as AssessmentQuestionPaperStatus
  const r = String(remote || 'pending_review') as AssessmentQuestionPaperStatus
  const lr = ASSESSMENT_QUESTION_STATUS_RANK[l] ?? 0
  const rr = ASSESSMENT_QUESTION_STATUS_RANK[r] ?? 0
  return rr >= lr ? r : l
}

export function isTerminalApproved(
  status: AssessmentQuestionPaperStatus
): boolean {
  return status === 'approved'
}

export function canResubmit(status: AssessmentQuestionPaperStatus): boolean {
  return status === 'rejected'
}

export function assertRejectionNote(note: string | null | undefined): string {
  const trimmed = (note || '').trim()
  if (trimmed.length < 8) {
    throw new Error(
      'A rejection note of at least 8 characters is required so the teacher knows what to fix.'
    )
  }
  return trimmed
}

export function hasAssessmentQuestionPermission(
  userPermissions: string[],
  required: string[],
  isAdmin = false
): boolean {
  if (isAdmin) return true
  return required.some((p) => userPermissions.includes(p))
}
