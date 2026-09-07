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

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function classListToCsv(rows: ClassListRow[]): string {
  const lines = [CLASS_LIST_CSV_HEADERS.map(csvEscape).join(',')]
  rows.forEach((row, index) => {
    lines.push(
      [index + 1, row.name, sexAbbreviation(row.gender)].map(csvEscape).join(',')
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
