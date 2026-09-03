type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchTeachingMeta() {
  return (await window.ipc.invoke('academic:teaching-meta')) as Result<{
    can_manage: boolean
    self_staff_id: string | null
    classes: Array<{ id: string; name: string }>
    subjects: Array<{ id: string; name: string }>
    teachers: Array<{ id: string; name: string }>
    years: Array<{ id: string; name: string; is_current: number }>
    levels: Array<{ id: string; name: string }>
  }>
}

export async function fetchSyllabi(academic_year_id?: string) {
  return (await window.ipc.invoke('academic:syllabi-list', {
    academic_year_id,
  })) as Result<{
    syllabi: Array<{
      id: string
      title: string
      subject_id: string
      subject_name: string | null
      class_name: string | null
      year_name: string | null
      term_weeks: number
    }>
  }>
}

export async function createSyllabus(input: {
  subject_id: string
  academic_year_id: string
  academic_level_id?: string | null
  class_id?: string | null
  title: string
  term_weeks?: number
  topics: Array<{ title: string; objectives?: string; subtopics?: string[] }>
}) {
  return (await window.ipc.invoke(
    'academic:syllabi-create',
    input
  )) as Result<unknown>
}

export async function fetchSyllabusDashboard(syllabus_id: string) {
  return (await window.ipc.invoke('academic:syllabi-topics', {
    syllabus_id,
  })) as Result<{
    title: string
    total: number
    completed: number
    in_progress: number
    not_started: number
    percent: number
    expected: number
    schedule: 'on_track' | 'ahead' | 'behind'
    topics: Array<{
      id: string
      parent_id: string | null
      title: string
      coverage_status: string
      sequence: number
    }>
  }>
}

export async function fetchTeachingLogs(input?: {
  staff_id?: string
  class_id?: string
  subject_id?: string
}) {
  return (await window.ipc.invoke(
    'academic:teaching-logs',
    input
  )) as Result<{
    logs: Array<{
      id: string
      lesson_date: string
      class_name: string | null
      subject_name: string | null
      topic_title: string | null
      teacher_name: string | null
      status: string
      description: string | null
      remarks: string | null
    }>
  }>
}

export async function recordTeachingLog(input: {
  staff_id?: string | null
  class_id: string
  subject_id: string
  topic_id?: string | null
  syllabus_id?: string | null
  academic_year_id?: string | null
  lesson_date: string
  description?: string | null
  status: 'planned' | 'taught' | 'partially_covered' | 'completed'
  remarks?: string | null
}) {
  return (await window.ipc.invoke(
    'academic:teaching-log-create',
    input
  )) as Result<unknown>
}
