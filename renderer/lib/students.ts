/** Student setup types + IPC helpers. */

export type StudentInfoFieldKey =
  | 'full_name'
  | 'gender'
  | 'date_of_birth'
  | 'place_of_birth'
  | 'parent_information'
  | 'emergency_contact'

export type AdmissionTypeKey = 'new' | 'returning' | 'transfer'

export const STUDENT_INFO_FIELD_OPTIONS: Array<{
  key: StudentInfoFieldKey
  label: string
  required?: boolean
}> = [
  { key: 'full_name', label: 'Full Name', required: true },
  { key: 'gender', label: 'Gender' },
  { key: 'date_of_birth', label: 'Date of Birth' },
  { key: 'place_of_birth', label: 'Place of Birth' },
  { key: 'parent_information', label: 'Parent Information' },
  { key: 'emergency_contact', label: 'Emergency Contact' },
]

export const ADMISSION_TYPE_OPTIONS: Array<{
  key: AdmissionTypeKey
  label: string
  description: string
}> = [
  {
    key: 'new',
    label: 'New Student',
    description: 'First-time admissions into the school',
  },
  {
    key: 'returning',
    label: 'Returning Student',
    description: 'Students re-enrolling for a new year',
  },
  {
    key: 'transfer',
    label: 'Transfer Student',
    description: 'Students transferring from another school',
  },
]

export const DEFAULT_STUDENT_ID_FORMAT = 'SOF-{SEQ}'

export interface StudentSettings {
  id: string
  school_id: string
  student_id_format: string
  student_id_example: string
  fields: Record<StudentInfoFieldKey, boolean>
  admission: Record<AdmissionTypeKey, boolean>
  student_count: number
}

export interface StudentSettingsSaveInput {
  student_id_format: string
  fields: Record<StudentInfoFieldKey, boolean>
  admission: Record<AdmissionTypeKey, boolean>
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export function previewStudentIdFormat(
  format: string,
  year = new Date().getFullYear()
): string {
  const trimmed = format.trim() || DEFAULT_STUDENT_ID_FORMAT
  return trimmed
    .replace(/\{YEAR\}/gi, String(year))
    .replace(/\{SEQ\}/gi, '0001')
}

export async function fetchStudentSettings(): Promise<Result<StudentSettings>> {
  return (await window.ipc.invoke(
    'students:get-settings'
  )) as Result<StudentSettings>
}

export async function saveStudentSettings(
  input: StudentSettingsSaveInput
): Promise<Result<StudentSettings>> {
  return (await window.ipc.invoke(
    'students:save-settings',
    input
  )) as Result<StudentSettings>
}

export async function importStudents(
  students: Array<{
    full_name: string
    class_name?: string | null
    gender?: string | null
  }>
): Promise<
  Result<{ imported: number; skipped: number; student_count: number }>
> {
  return (await window.ipc.invoke('students:import', {
    students,
  })) as Result<{ imported: number; skipped: number; student_count: number }>
}

/** CSV template that opens cleanly in Excel. */
export function buildStudentImportTemplateCsv(): string {
  return [
    'Full Name,Gender,Date of Birth,Place of Birth,Class,Parent Name,Parent Phone,Emergency Contact,Emergency Phone',
    'Ada Biya,Female,2012-04-15,Yaounde,Form 1 A,Marie Biya,+237600000001,Jean Biya,+237600000002',
  ].join('\n')
}

export function downloadStudentImportTemplate(): void {
  const csv = buildStudentImportTemplateCsv()
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sofia-student-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/** Parse student CSV (Excel-exported CSV supported). */
export function parseStudentCsv(text: string): Array<{
  full_name: string
  class_name?: string | null
  gender?: string | null
}> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase())
  const nameIdx = headers.findIndex((h) =>
    ['full name', 'fullname', 'full_name', 'student name'].includes(h)
  )
  const classIdx = headers.findIndex((h) =>
    ['class', 'class name', 'class_name'].includes(h)
  )
  const genderIdx = headers.findIndex((h) => h === 'gender')

  if (nameIdx < 0) return []

  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line)
    return {
      full_name: cols[nameIdx] ?? '',
      class_name: classIdx >= 0 ? cols[classIdx] || null : null,
      gender: genderIdx >= 0 ? cols[genderIdx] || null : null,
    }
  })
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  result.push(current.trim())
  return result
}
