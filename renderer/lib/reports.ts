type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type ReportFilters = {
  academic_year_id?: string | null
  term_id?: string | null
  department_id?: string | null
  class_id?: string | null
  subject_id?: string | null
  gender?: string | null
  assessment?: 'results' | 'ca' | 'exam' | null
  from?: string | null
  to?: string | null
  student_id?: string | null
  fee_type?: string | null
  payment_method?: string | null
  expense_category?: string | null
  attendance_threshold?: number | null
}

export async function fetchReportsMeta() {
  return (await window.ipc.invoke('reports:meta')) as Result<{
    can_view_finance: boolean
    can_export: boolean
    currency: string
    attendance_threshold: number
    pass_mark: number
    years: Array<{
      id: string
      name: string
      is_current: number
      start_date: string
      end_date: string
    }>
    terms: Array<{
      id: string
      name: string
      term_number: number
      academic_year_id: string
    }>
    classes: Array<{ id: string; name: string; section_id: string | null }>
    departments: Array<{ id: string; name: string }>
    subjects: Array<{ id: string; name: string }>
    fee_types: Array<{ id: string; name: string; category_key: string }>
  }>
}

export async function fetchAcademicReport(filters: ReportFilters) {
  return (await window.ipc.invoke('reports:academic', filters)) as Result<{
    overall_average: number
    pass_rate: number
    students: number
    subjects: number
    pass_mark: number
    best_class: { class_id: string; class_name: string; average: number } | null
    lowest_class: { class_id: string; class_name: string; average: number } | null
    weak_subject: { subject_id: string; subject_name: string; average: number } | null
    by_class: Array<{
      class_id: string
      class_name: string
      students: number
      average: number
      pass_rate: number
      highest: number
      lowest: number
    }>
    by_subject: Array<{
      subject_id: string
      subject_name: string
      average: number
      pass_rate: number
      highest: number
      lowest: number
    }>
    trend: Array<{ term_id: string; term_name: string; average: number }>
    grade_distribution: Record<string, number>
    ranking: Array<{
      position: number
      student_id: string
      student_name: string
      class_id: string
      class_name: string
      average: number
      grade: string | null
    }>
  }>
}

export async function fetchStudentReport(
  student_id: string,
  filters?: ReportFilters
) {
  return (await window.ipc.invoke('reports:student', {
    student_id,
    ...filters,
  })) as Result<Record<string, unknown>>
}

export async function searchReportStudents(query: string, class_id?: string | null) {
  return (await window.ipc.invoke('reports:students-search', {
    query,
    class_id,
  })) as Result<{
    students: Array<{
      id: string
      name: string
      student_code: string | null
      status: string
      class_name: string | null
    }>
  }>
}

export async function fetchFinancialAnalytics(filters: ReportFilters) {
  return (await window.ipc.invoke(
    'reports:financial',
    filters
  )) as Result<Record<string, unknown>>
}

export async function fetchAttendanceAnalytics(filters: ReportFilters) {
  return (await window.ipc.invoke(
    'reports:attendance',
    filters
  )) as Result<Record<string, unknown>>
}

export async function fetchSchoolInsights(filters: ReportFilters) {
  return (await window.ipc.invoke(
    'reports:insights',
    filters
  )) as Result<Record<string, unknown>>
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
}
