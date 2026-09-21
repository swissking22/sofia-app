/** Class list CSV + display helpers (kept in sync with main/domain/class-list.ts). */

export type ClassListRow = {
  student_code: string | null
  name: string
  gender: string | null
  date_of_birth: string | null
  guardian_name: string | null
  guardian_phone: string | null
  residence_type?: string | null
}

/** Optional columns (beyond always-on Index + Name). */
export type ClassListOptionalColumn =
  | 'sex'
  | 'student_code'
  | 'date_of_birth'
  | 'age'
  | 'guardian_name'
  | 'guardian_phone'
  | 'residence'
  | 'blank'

export const CLASS_LIST_OPTIONAL_COLUMNS: ReadonlyArray<{
  key: ClassListOptionalColumn
  label: string
  /** Short header used in print/CSV tables. */
  header: string
  defaultOn: boolean
}> = [
  { key: 'sex', label: 'Sex (M/F)', header: 'Sex', defaultOn: true },
  {
    key: 'student_code',
    label: 'Student ID',
    header: 'Student ID',
    defaultOn: false,
  },
  {
    key: 'date_of_birth',
    label: 'Date of birth',
    header: 'DOB',
    defaultOn: false,
  },
  { key: 'age', label: 'Age', header: 'Age', defaultOn: false },
  {
    key: 'guardian_name',
    label: 'Guardian name',
    header: 'Guardian',
    defaultOn: false,
  },
  {
    key: 'guardian_phone',
    label: 'Guardian phone',
    header: 'Guardian phone',
    defaultOn: false,
  },
  {
    key: 'residence',
    label: 'Residence (day/boarding)',
    header: 'Residence',
    defaultOn: false,
  },
  {
    key: 'blank',
    label: 'Empty column (marks / signature)',
    header: '',
    defaultOn: true,
  },
]

export const DEFAULT_CLASS_LIST_OPTIONAL_COLUMNS: ClassListOptionalColumn[] =
  CLASS_LIST_OPTIONAL_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key)

/** @deprecated Prefer building headers from selected columns. */
export const CLASS_LIST_CSV_HEADERS = ['Index', 'Name', 'Sex'] as const

/** Male/Female → M/F for class lists. */
export function sexAbbreviation(value: string | null | undefined): string {
  const raw = (value ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (raw === 'male' || raw === 'm') return 'M'
  if (raw === 'female' || raw === 'f') return 'F'
  return raw.charAt(0).toUpperCase()
}

export function residenceLabel(value: string | null | undefined): string {
  if (value === 'boarding') return 'Boarding'
  if (value === 'day') return 'Day'
  return value?.trim() || '—'
}

/** Whole years from ISO date (YYYY-MM-DD) as of `asOf`. */
export function ageFromDob(
  dob: string | null | undefined,
  asOf: Date = new Date()
): number | null {
  if (!dob) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob.trim())
  if (!m) return null
  const born = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(born.getTime())) return null
  let age = asOf.getFullYear() - born.getFullYear()
  const md = asOf.getMonth() - born.getMonth()
  if (md < 0 || (md === 0 && asOf.getDate() < born.getDate())) age -= 1
  return age >= 0 && age < 120 ? age : null
}

export function normalizeClassListColumns(
  columns: ClassListOptionalColumn[] | null | undefined
): ClassListOptionalColumn[] {
  const allowed = new Set(CLASS_LIST_OPTIONAL_COLUMNS.map((c) => c.key))
  const seen = new Set<ClassListOptionalColumn>()
  const next: ClassListOptionalColumn[] = []
  for (const key of columns ?? DEFAULT_CLASS_LIST_OPTIONAL_COLUMNS) {
    if (!allowed.has(key) || seen.has(key)) continue
    seen.add(key)
    next.push(key)
  }
  return next
}

export function classListColumnHeader(key: ClassListOptionalColumn): string {
  return CLASS_LIST_OPTIONAL_COLUMNS.find((c) => c.key === key)?.header ?? key
}

export function classListCellValue(
  row: ClassListRow,
  key: ClassListOptionalColumn,
  asOf: Date = new Date()
): string {
  switch (key) {
    case 'sex':
      return sexAbbreviation(row.gender)
    case 'student_code':
      return row.student_code?.trim() || ''
    case 'date_of_birth':
      return row.date_of_birth?.trim() || ''
    case 'age': {
      const age = ageFromDob(row.date_of_birth, asOf)
      return age == null ? '' : String(age)
    }
    case 'guardian_name':
      return row.guardian_name?.trim() || ''
    case 'guardian_phone':
      return row.guardian_phone?.trim() || ''
    case 'residence':
      return residenceLabel(row.residence_type)
    case 'blank':
      return ''
    default:
      return ''
  }
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function optionalHeaders(columns: ClassListOptionalColumn[]): string[] {
  return columns.map((key) => classListColumnHeader(key) || 'Notes')
}

export function classListToCsv(
  rows: ClassListRow[],
  columns: ClassListOptionalColumn[] = DEFAULT_CLASS_LIST_OPTIONAL_COLUMNS
): string {
  const opts = normalizeClassListColumns(columns)
  const lines = [
    ['Index', 'Name', ...optionalHeaders(opts)].map(csvEscape).join(','),
  ]
  rows.forEach((row, index) => {
    lines.push(
      [
        index + 1,
        row.name,
        ...opts.map((key) => classListCellValue(row, key)),
      ]
        .map(csvEscape)
        .join(',')
    )
  })
  return lines.join('\n')
}

export type ClassListCsvSection = {
  class_name: string
  students: ClassListRow[]
}

export function classListsToCsv(
  sections: ClassListCsvSection[],
  columns: ClassListOptionalColumn[] = DEFAULT_CLASS_LIST_OPTIONAL_COLUMNS
): string {
  const opts = normalizeClassListColumns(columns)
  if (sections.length <= 1) {
    return classListToCsv(sections[0]?.students ?? [], opts)
  }
  const lines = [
    ['Class', 'Index', 'Name', ...optionalHeaders(opts)]
      .map(csvEscape)
      .join(','),
  ]
  for (const section of sections) {
    section.students.forEach((row, index) => {
      lines.push(
        [
          section.class_name,
          index + 1,
          row.name,
          ...opts.map((key) => classListCellValue(row, key)),
        ]
          .map(csvEscape)
          .join(',')
      )
    })
  }
  return lines.join('\n')
}

export function classListDocumentTitle(
  className: string | null | undefined
): string {
  const name = className?.trim()
  return name ? `${name} class list` : 'Class list'
}

/** Filesystem-safe name, keeping the class label readable. */
export function sanitizeFilename(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || 'Class list'
}

export function classListFilename(className: string | null | undefined): string {
  return `${sanitizeFilename(classListDocumentTitle(className))}.csv`
}
