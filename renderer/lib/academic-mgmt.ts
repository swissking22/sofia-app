/** Academic management IPC helpers. */

export type AttendanceMark = 'present' | 'absent' | 'late' | 'excused'

export interface AcademicMeta {
  classes: Array<{ id: string; name: string }>
  subjects: Array<{ id: string; name: string; class_ids: string[] }>
  teachers: Array<{ id: string; full_name: string }>
  terms: Array<{ id: string; name: string; term_number: number }>
  academic_year: { id: string; name: string } | null
  periods: number
  days: Array<{ day: number; label: string }>
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
}): Promise<Result<unknown>> {
  return (await window.ipc.invoke(
    'timetable:save-slot',
    input
  )) as Result<unknown>
}

export async function clearTimetableSlot(input: {
  class_id: string
  day_of_week: number
  period_number: number
}): Promise<Result<{ cleared: boolean }>> {
  return (await window.ipc.invoke(
    'timetable:clear-slot',
    input
  )) as Result<{ cleared: boolean }>
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
    }>
    subject_rows: Array<{
      student_id: string
      subject_id: string
      subject_name: string | null
      ca_score: number
      exam_score: number
      total: number
      grade: string | null
    }>
  }>
}

export async function processResults(input: {
  class_id: string
  term_id?: string | null
}) {
  return (await window.ipc.invoke(
    'results:process',
    input
  )) as Result<{ run_id: string; students: number; subjects: number }>
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
