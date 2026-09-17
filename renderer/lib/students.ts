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

export type StudentImportCsvRow = {
  full_name: string
  date_of_birth?: string | null
  level_name?: string | null
  department_name?: string | null
  specialization_name?: string | null
  residence_type?: string | null
  class_name?: string | null
  gender?: string | null
}

export type StudentImportSkipReason =
  | 'missing_name'
  | 'missing_residence'
  | 'invalid_residence'
  | 'invalid_date_of_birth'
  | 'missing_level'
  | 'unknown_level'
  | 'missing_department'
  | 'unknown_department'
  | 'unknown_specialization'
  | 'no_matching_class'
  | 'ambiguous_class'

const STUDENT_IMPORT_SKIP_LABELS: Record<StudentImportSkipReason, string> = {
  missing_name: 'missing name',
  missing_residence: 'missing residence type',
  invalid_residence: 'invalid residence type',
  invalid_date_of_birth: 'invalid date of birth',
  missing_level: 'missing level',
  unknown_level: 'unknown level',
  missing_department: 'missing department',
  unknown_department: 'unknown department',
  unknown_specialization: 'unknown specialization',
  no_matching_class: 'no matching class',
  ambiguous_class: 'ambiguous class',
}

export async function importStudents(
  students: StudentImportCsvRow[]
): Promise<
  Result<{
    imported: number
    skipped: number
    student_count: number
    skip_reasons?: Array<{ reason: StudentImportSkipReason; count: number }>
  }>
> {
  return (await window.ipc.invoke('students:import', {
    students,
  })) as Result<{
    imported: number
    skipped: number
    student_count: number
    skip_reasons?: Array<{ reason: StudentImportSkipReason; count: number }>
  }>
}

export function formatStudentImportSummary(input: {
  imported: number
  skipped: number
  skip_reasons?: Array<{ reason: StudentImportSkipReason; count: number }>
}): string {
  const importedLabel = `Imported ${input.imported} student${
    input.imported === 1 ? '' : 's'
  }`
  if (!input.skipped) return `${importedLabel}.`
  const parts = (input.skip_reasons ?? [])
    .map((row) => `${row.count} ${STUDENT_IMPORT_SKIP_LABELS[row.reason]}`)
    .filter(Boolean)
  const detail = parts.length
    ? parts.join(', ')
    : 'check level, department, and class'
  return `${importedLabel} (${input.skipped} skipped — ${detail}).`
}

/** CSV template that opens cleanly in Excel. */
export function buildStudentImportTemplateCsv(): string {
  return [
    'Full Name,Date of Birth,Level,Department,Specialization,Residence Type,Gender',
    'Ada Biya,2012-04-15,Form 1,General,,Day,Female',
    'Jean Nkodo,15/04/2012,Form 4,Technical,Electrical,Boarding,Male',
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

const NAME_HEADERS = ['full name', 'fullname', 'full_name', 'student name', 'name']
const DOB_HEADERS = [
  'date of birth',
  'date_of_birth',
  'dob',
  'birth date',
  'birthdate',
]
const LEVEL_HEADERS = ['level', 'academic level', 'form']
const DEPT_HEADERS = ['department', 'dept', 'section', 'stream']
const SPEC_HEADERS = ['specialization', 'spec', 'option']
const RESIDENCE_HEADERS = [
  'residence type',
  'residence',
  'residence_type',
  'boarding',
  'day/boarding',
]
const CLASS_HEADERS = ['class', 'class name', 'class_name']
const GENDER_HEADERS = ['gender', 'sex']

/** Parse student CSV (Excel-exported CSV supported). */
export function parseStudentCsv(text: string): StudentImportCsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]).map((h) =>
    h.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  )
  const nameIdx = firstHeader(headers, NAME_HEADERS)
  if (nameIdx < 0) return []

  const dobIdx = firstHeader(headers, DOB_HEADERS)
  const levelIdx = firstHeader(headers, LEVEL_HEADERS)
  const deptIdx = firstHeader(headers, DEPT_HEADERS)
  const specIdx = firstHeader(headers, SPEC_HEADERS)
  const residenceIdx = firstHeader(headers, RESIDENCE_HEADERS)
  const classIdx = firstHeader(headers, CLASS_HEADERS)
  const genderIdx = firstHeader(headers, GENDER_HEADERS)

  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line)
    return {
      full_name: cols[nameIdx] ?? '',
      date_of_birth: cell(cols, dobIdx),
      level_name: cell(cols, levelIdx),
      department_name: cell(cols, deptIdx),
      specialization_name: cell(cols, specIdx),
      residence_type: cell(cols, residenceIdx),
      class_name: cell(cols, classIdx),
      gender: cell(cols, genderIdx),
    }
  })
}

function firstHeader(headers: string[], aliases: string[]): number {
  const wanted = aliases.map((a) => a.replace(/_/g, ' '))
  return headers.findIndex((h) => wanted.includes(h))
}

function cell(cols: string[], idx: number): string | null {
  if (idx < 0) return null
  return cols[idx] || null
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
