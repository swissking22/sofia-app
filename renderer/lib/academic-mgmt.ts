/** Academic management IPC helpers. */

export type AttendanceMark = 'present' | 'absent' | 'late' | 'excused'

export interface AcademicMeta {
  classes: Array<{
    id: string
    name: string
    academic_level_id: string | null
  }>
  subjects: Array<{
    id: string
    name: string
    class_ids: string[]
    is_common?: boolean
    level_class_ids?: string[]
  }>
  teachers: Array<{
    id: string
    full_name: string
    assignments: Array<{ class_id: string; subject_id: string }>
  }>
  terms: Array<{ id: string; name: string; term_number: number }>
  academic_year: { id: string; name: string } | null
  periods: number
  period_times: Array<{
    period_number: number
    label: string
    start_time: string
    end_time: string
  }>
  breaks: Array<{
    name: string
    after_period: number
    start_time: string
    end_time: string
    duration_minutes: number
  }>
  day_start_time: string
  day_end_time: string
  period_duration_minutes: number
  days: Array<{ day: number; label: string }>
}

/** Interleave teaching periods with break rows for timetable grids. */
export function buildTimetableRows(meta: Pick<
  AcademicMeta,
  'periods' | 'period_times' | 'breaks'
>): Array<
  | {
      kind: 'period'
      period: number
      label: string
      timeLabel: string
    }
  | {
      kind: 'break'
      name: string
      timeLabel: string
    }
> {
  const periods = meta.periods ?? 8
  const breakAfter = new Map(
    (meta.breaks ?? []).map((b) => [b.after_period, b])
  )
  const rows: Array<
    | {
        kind: 'period'
        period: number
        label: string
        timeLabel: string
      }
    | {
        kind: 'break'
        name: string
        timeLabel: string
      }
  > = []

  for (let p = 1; p <= periods; p++) {
    const pt = meta.period_times?.find((x) => x.period_number === p)
    rows.push({
      kind: 'period',
      period: p,
      label: pt?.label ?? `Period ${p}`,
      timeLabel: pt ? `${pt.start_time}–${pt.end_time}` : '',
    })
    const br = breakAfter.get(p)
    if (br) {
      rows.push({
        kind: 'break',
        name: br.name,
        timeLabel: `${br.start_time}–${br.end_time}`,
      })
    }
  }
  return rows
}

export interface TimetableSlotDto {
  id: string
  class_id: string
  class_name: string | null
  subject_id: string | null
  subject_name: string | null
  staff_id: string | null
  staff_name: string | null
  day_of_week: number
  period_number: number
  room: string | null
}

export interface AttendanceSessionDto {
  id: string
  class_id: string
  class_name: string | null
  session_date: string
  notes: string | null
  present: number
  absent: number
  total: number
}

export interface CaAssessmentDto {
  id: string
  name: string
  subject_id: string
  subject_name: string | null
  class_id: string
  class_name: string | null
  term_id: string | null
  weight_percent: number
  max_score: number
  assessment_date: string | null
}

export type CaSequenceStatus = 'inactive' | 'active' | 'complete'

export interface CaSequenceDto {
  name: string
  term_id: string | null
  term_name: string | null
  max_score: number
  created_at: string
  sheet_count: number
  class_count: number
  expected_slots: number
  scored_slots: number
  status: CaSequenceStatus
}

export interface CaSequenceDetailDto {
  name: string
  term_id: string
  term_name: string | null
  max_score: number
  status: CaSequenceStatus
  classes: Array<{ id: string; name: string }>
  sheets: Array<{
    id: string
    class_id: string
    class_name: string | null
    subject_id: string
    subject_name: string | null
    max_score: number
  }>
}

export interface ExamSessionDto {
  id: string
  name: string
  term_id: string | null
  term_name: string | null
  start_date: string | null
  end_date: string | null
  status: string
  paper_count: number
}

export interface ExamPaperDto {
  id: string
  exam_session_id: string
  session_name: string | null
  subject_id: string
  subject_name: string | null
  class_id: string
  class_name: string | null
  max_score: number
  exam_date: string | null
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export const ATTENDANCE_MARKS: Array<{ key: AttendanceMark; label: string }> = [
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
  { key: 'late', label: 'Late' },
  { key: 'excused', label: 'Excused' },
]

export async function fetchAcademicMeta(): Promise<Result<AcademicMeta>> {
  return (await window.ipc.invoke('academic:meta')) as Result<AcademicMeta>
}

export async function fetchTimetable(input?: {
  view?: 'class' | 'teacher'
  class_id?: string
  staff_id?: string
}): Promise<Result<{ slots: TimetableSlotDto[] }>> {
  return (await window.ipc.invoke(
    'timetable:get',
    input ?? {}
  )) as Result<{ slots: TimetableSlotDto[] }>
}

export async function saveTimetableSlot(input: {
  id?: string | null
  class_id: string
  subject_id?: string | null
  staff_id?: string | null
  day_of_week: number
  period_number: number
  room?: string | null
}): Promise<
  Result<{
    slots: unknown[]
    synced_class_ids: string[]
    is_common: boolean
  }>
> {
  return (await window.ipc.invoke(
    'timetable:save-slot',
    input
  )) as Result<{
    slots: unknown[]
    synced_class_ids: string[]
    is_common: boolean
  }>
}

export async function clearTimetableSlot(input: {
  class_id: string
  day_of_week: number
  period_number: number
}): Promise<Result<{ cleared: boolean; synced_class_ids?: string[] }>> {
  return (await window.ipc.invoke(
    'timetable:clear-slot',
    input
  )) as Result<{ cleared: boolean; synced_class_ids?: string[] }>
}

export async function fetchAttendanceSessions(classId?: string | null) {
  return (await window.ipc.invoke('attendance:list-sessions', {
    class_id: classId,
  })) as Result<AttendanceSessionDto[]>
}

export async function fetchAttendanceRoster(input: {
  class_id: string
  session_date: string
}) {
  return (await window.ipc.invoke(
    'attendance:get-roster',
    input
  )) as Result<{
    session_id: string | null
    students: Array<{
      id: string
      name: string
      student_code: string | null
      status: AttendanceMark | null
    }>
  }>
}

export async function saveAttendance(input: {
  class_id: string
  session_date: string
  notes?: string | null
  marks: Array<{ student_id: string; status: AttendanceMark }>
}) {
  return (await window.ipc.invoke(
    'attendance:save',
    input
  )) as Result<{ session_id: string; saved: number }>
}

export async function fetchAttendanceReport(input: {
  class_id: string
  from_date?: string | null
  to_date?: string | null
}) {
  return (await window.ipc.invoke(
    'attendance:report',
    input
  )) as Result<{
    rows: Array<{
      student_id: string
      student_name: string
      student_code: string | null
      present: number
      absent: number
      late: number
      excused: number
      total: number
      rate: number
    }>
  }>
}

export async function fetchCaList() {
  return (await window.ipc.invoke('ca:list')) as Result<CaAssessmentDto[]>
}

export async function fetchCaSequences() {
  return (await window.ipc.invoke('ca:list-sequences')) as Result<
    CaSequenceDto[]
  >
}

export async function fetchCaSequence(input: {
  name: string
  term_id: string
}) {
  return (await window.ipc.invoke(
    'ca:get-sequence',
    input
  )) as Result<CaSequenceDetailDto>
}

export async function updateCaSequence(input: {
  name: string
  term_id: string
  new_name?: string
  max_score?: number
}) {
  return (await window.ipc.invoke('ca:update-sequence', input)) as Result<{
    updated: number
    name: string
    max_score: number
  }>
}

export async function deleteCaSequence(input: {
  name: string
  term_id: string
}) {
  return (await window.ipc.invoke('ca:delete-sequence', input)) as Result<{
    deleted: number
  }>
}

export async function createCaAssessment(input: {
  name: string
  subject_id: string
  class_id: string
  term_id?: string | null
  weight_percent: number
  max_score: number
  assessment_date?: string | null
}) {
  return (await window.ipc.invoke('ca:create', input)) as Result<unknown>
}

/** Create one assessment for a term across all (or selected) classes × subjects. */
export async function openCaSequence(input: {
  name: string
  term_id: string
  class_ids?: string[]
  all_classes?: boolean
  weight_percent?: number
  max_score?: number
  assessment_date?: string | null
  skip_existing?: boolean
}) {
  return (await window.ipc.invoke('ca:open-sequence', input)) as Result<{
    created: number
    skipped: number
    class_count: number
    assessments: Array<{
      id: string
      class_id: string
      subject_id: string
      name: string
    }>
  }>
}

export async function fetchAnnualResultsSummary(input: {
  class_id: string
  academic_year_id?: string | null
}) {
  return (await window.ipc.invoke(
    'results:annual-summary',
    input
  )) as Result<{
    class_id: string
    class_name: string
    pass_mark: number
    terms: Array<{
      term_id: string | null
      term_name: string
      term_number: number
      run_status: string | null
      student_count: number
    }>
    students: Array<{
      student_id: string
      student_name: string
      student_code: string | null
      term_averages: Array<{
        term_id: string | null
        term_number: number
        average: number | null
      }>
      annual_average: number | null
      status: 'PASSED' | 'FAILED' | 'INCOMPLETE'
    }>
  }>
}

export async function fetchCaScores(assessmentId: string) {
  return (await window.ipc.invoke('ca:get-scores', {
    assessment_id: assessmentId,
  })) as Result<{
    assessment: {
      id: string
      name: string
      max_score: number
      class_id: string
      subject_name: string | null
      teacher_name: string | null
    }
    students: Array<{
      id: string
      name: string
      student_code: string | null
      score: number | null
    }>
  }>
}

export async function saveCaScores(input: {
  assessment_id: string
  scores: Array<{ student_id: string; score: number | null }>
}) {
  return (await window.ipc.invoke(
    'ca:save-scores',
    input
  )) as Result<{ saved: number }>
}

export async function fetchExamSessions() {
  return (await window.ipc.invoke('exams:list')) as Result<ExamSessionDto[]>
}

export async function createExamSession(input: {
  name: string
  term_id?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string
  papers?: Array<{
    subject_id: string
    class_id: string
    max_score: number
    exam_date?: string | null
  }>
}) {
  return (await window.ipc.invoke('exams:create', input)) as Result<unknown>
}

export async function fetchExamPapers(input?: {
  session_id?: string
  class_id?: string
}) {
  return (await window.ipc.invoke(
    'exams:list-papers',
    input ?? {}
  )) as Result<ExamPaperDto[]>
}

export async function fetchExamScores(paperId: string) {
  return (await window.ipc.invoke('exams:get-scores', {
    paper_id: paperId,
  })) as Result<{
    paper: {
      id: string
      max_score: number
      subject_name: string | null
      class_id: string
      class_name: string | null
    }
    students: Array<{
      id: string
      name: string
      student_code: string | null
      score: number | null
    }>
  }>
}

export async function saveExamScores(input: {
  paper_id: string
  scores: Array<{ student_id: string; score: number | null }>
}) {
  return (await window.ipc.invoke(
    'exams:save-scores',
    input
  )) as Result<{ saved: number }>
}

export async function fetchResults(input: {
  class_id: string
  term_id?: string | null
}) {
  return (await window.ipc.invoke('results:get', input)) as Result<{
    run: {
      id: string
      status: string
      computed_at: string | null
      published_at: string | null
      calculation_version?: number | null
    } | null
    summaries: Array<{
      student_id: string
      student_name: string
      student_code: string | null
      average: number
      total: number
      grade: string | null
      position: number | null
      remark: string | null
      total_coefficients?: number | null
      total_weighted_marks?: number | null
      passed_subjects?: number | null
      status?: string | null
    }>
    subject_rows: Array<{
      student_id: string
      subject_id: string
      subject_name: string | null
      ca_score: number
      exam_score: number
      total: number
      grade: string | null
      ca_average?: number | null
      subject_mark?: number | null
      coefficient?: number
      weighted_mark?: number
      sequence_scores?: Array<{
        name: string
        raw: number | null
        max: number
        normalized: number | null
        status: string
        included: boolean
      }>
      remark?: string | null
    }>
    class_summary?: {
      total_students: number
      processed_students: number
      incomplete_students: number
      passed_students: number
      failed_students: number
      class_average: number | null
      highest_average: number | null
      lowest_average: number | null
    } | null
    calculation_profile?: {
      id: string
      name: string
      version: number
      ca_weight: number
      exam_weight: number
      pass_mark: number
      sequence_method: string
      rounding_places: number | string
      scale: number
      status: string
    } | null
  }>
}

export async function processResults(input: {
  class_id: string
  term_id?: string | null
}) {
  return (await window.ipc.invoke(
    'results:process',
    input
  )) as Result<{
    run_id: string
    students: number
    subjects: number
    profile?: string
    class_id?: string
    class_name?: string
  }>
}

export async function bulkProcessResults(input: {
  term_id?: string | null
}) {
  return (await window.ipc.invoke(
    'results:bulk-process',
    input
  )) as Result<{
    succeeded: number
    failed: number
    skipped: number
    results: Array<{
      class_id: string
      class_name: string
      run_id?: string
      students?: number
      subjects?: number
      profile?: string
      error?: string
    }>
  }>
}

export type SequenceSheetKind = 'correction' | 'final'
export type SequenceSortMode = 'name' | 'merit'

export interface SequenceSheetPayload {
  school: {
    name: string
    address: string | null
    phone: string | null
    email: string | null
    logo_url: string | null
    region: string | null
  }
  academic_year: { id: string; name: string } | null
  term: { id: string; name: string; term_number: number } | null
  sequence_name: string
  sheet_kind: SequenceSheetKind
  sort: SequenceSortMode
  classes: Array<{
    class_id: string
    class_name: string
    sequence_name: string
    subjects: Array<{
      subject_id: string
      subject_name: string
      coefficient: number
    }>
    students: Array<{
      student_id: string
      student_name: string
      student_code: string | null
      cells: Array<{
        subject_id: string
        mark: number | null
        coefficient: number
        weighted_mark: number | null
        incomplete: boolean
      }>
      total_weighted_marks: number
      total_coefficients: number
      average: number | null
      average_rounded: number | null
      position: number | null
      incomplete: boolean
    }>
    class_average: number | null
  }>
}

export async function fetchSequenceSheet(input: {
  class_id?: string | null
  class_ids?: string[]
  all_classes?: boolean
  term_id: string
  sequence_name: string
  sheet_kind?: SequenceSheetKind
  sort?: SequenceSortMode
}) {
  return (await window.ipc.invoke(
    'results:sequence-sheet',
    input
  )) as Result<SequenceSheetPayload>
}

export async function approveResults(input: {
  class_id: string
  term_id?: string | null
}) {
  return (await window.ipc.invoke(
    'results:approve',
    input
  )) as Result<{ status: string }>
}

export async function publishResults(input: {
  class_id: string
  term_id?: string | null
  lock?: boolean
}) {
  return (await window.ipc.invoke(
    'results:publish',
    input
  )) as Result<{ status: string }>
}

export async function lockResults(input: {
  class_id: string
  term_id?: string | null
}) {
  return publishResults({ ...input, lock: true })
}

export async function fetchReportCards(input?: {
  class_id?: string
  term_id?: string | null
}) {
  return (await window.ipc.invoke(
    'report-cards:list',
    input ?? {}
  )) as Result<
    Array<{
      id: string
      student_id: string
      student_name: string | null
      student_code: string | null
      class_id: string
      class_name: string | null
      term_id: string | null
      status: string
      generated_at: string | null
    }>
  >
}

export async function generateReportCards(input: {
  class_id: string
  term_id?: string | null
}) {
  return (await window.ipc.invoke(
    'report-cards:generate',
    input
  )) as Result<{ generated: number }>
}

export async function fetchReportCard(id: string) {
  return (await window.ipc.invoke('report-cards:get', { id })) as Result<{
    id: string
    status: string
    generated_at: string | null
    payload: Record<string, unknown> | null
  }>
}

export async function fetchAcademicDashboard() {
  return (await window.ipc.invoke(
    'academic-reports:dashboard'
  )) as Result<{
    attendance_sessions: number
    ca_assessments: number
    exam_sessions: number
    published_results: number
    report_cards: number
    class_averages: Array<{
      class_id: string
      class_name: string
      average: number
      students: number
    }>
  }>
}
