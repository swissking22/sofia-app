/** Class list CSV + display helpers for print/export. */

export type ClassListRow = {
  student_code: string | null
  name: string
  gender: string | null
  date_of_birth: string | null
  guardian_name: string | null
  guardian_phone: string | null
  residence_type?: string | null
}

export const CLASS_LIST_CSV_HEADERS = [
  'Index',
  'Name',
  'Sex',
] as const

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

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function classListToCsv(rows: ClassListRow[]): string {
  const lines = [CLASS_LIST_CSV_HEADERS.map(csvEscape).join(',')]
  rows.forEach((row, index) => {
    lines.push(
      [
        index + 1,
        row.name,
        sexAbbreviation(row.gender),
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

export function classListsToCsv(sections: ClassListCsvSection[]): string {
  if (sections.length <= 1) {
    return classListToCsv(sections[0]?.students ?? [])
  }
  const lines = [['Class', 'Index', 'Name', 'Sex'].map(csvEscape).join(',')]
  for (const section of sections) {
    section.students.forEach((row, index) => {
      lines.push(
        [
          section.class_name,
          index + 1,
          row.name,
          sexAbbreviation(row.gender),
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
