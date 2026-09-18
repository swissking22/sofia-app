export type ResidenceType = 'day' | 'boarding'

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

export const STUDENT_IMPORT_SKIP_LABELS: Record<StudentImportSkipReason, string> =
  {
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

export type StudentImportStructure = {
  levels: Array<{
    id: string
    name: string
    short_name?: string | null
    is_active?: number | null
  }>
  sections: Array<{
    id: string
    name: string
    is_active?: number | null
  }>
  specializations: Array<{
    id: string
    section_id: string
    name: string
    abbreviation?: string | null
    is_active?: number | null
  }>
  classes: Array<{
    id: string
    name: string
    academic_level_id: string | null
    section_id: string | null
    specialization_id: string | null
    is_active?: number | null
  }>
}

export type StudentImportResolved = {
  name: string
  class_id: string
  gender: string | null
  date_of_birth: string | null
  residence_type: ResidenceType
}

export type StudentImportResult =
  | { ok: true; data: StudentImportResolved }
  | { ok: false; reason: StudentImportSkipReason }

const DAY_ALIASES = new Set([
  'day',
  'day student',
  'day-student',
  'day scholar',
  'externe',
  'extern',
  'external',
  'non-boarder',
  'non boarder',
  'nonboarder',
])

const BOARDING_ALIASES = new Set([
  'boarding',
  'boarder',
  'boarders',
  'boarding student',
  'internat',
  'interne',
  'intern',
  'resident',
  'residential',
])

export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Capitalize the first letter of a name token; keep the rest lowercased. */
function capitalizeToken(token: string): string {
  if (!token) return token
  return token
    .split(/([-'])/)
    .map((part) => {
      if (part === '-' || part === "'") return part
      if (!part) return part
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join('')
}

/** Collapse spaces and title-case each word (e.g. ADA BIYA → Ada Biya). */
export function normalizeFullName(value: string | null | undefined): string {
  const collapsed = collapseSpaces(value ?? '')
  if (!collapsed) return ''
  return collapsed
    .split(' ')
    .map((word) => capitalizeToken(word))
    .join(' ')
}

export function normalizeResidence(
  value: string | null | undefined
): ResidenceType | 'invalid' | null {
  const raw = collapseSpaces(value ?? '').toLowerCase()
  if (!raw) return null
  if (DAY_ALIASES.has(raw)) return 'day'
  if (BOARDING_ALIASES.has(raw)) return 'boarding'
  return 'invalid'
}

export function normalizeGender(
  value: string | null | undefined
): string | null {
  const raw = collapseSpaces(value ?? '').toLowerCase()
  if (!raw) return null
  if (
    ['male', 'm', 'boy', 'homme', 'garcon', 'garçon', 'masculin'].includes(raw)
  ) {
    return 'Male'
  }
  if (
    ['female', 'f', 'girl', 'femme', 'fille', 'feminin', 'féminin'].includes(
      raw
    )
  ) {
    return 'Female'
  }
  return null
}

export function normalizeDateOfBirth(
  value: string | null | undefined
): string | null | 'invalid' {
  const raw = collapseSpaces(value ?? '')
  if (!raw) return null

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw)
  if (iso) {
    return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }

  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw)
  if (dmy) {
    return toIsoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
  }

  return 'invalid'
}

function toIsoDate(
  year: number,
  month: number,
  day: number
): string | 'invalid' {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return 'invalid'
  if (month < 1 || month > 12 || day < 1 || day > 31) return 'invalid'
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return 'invalid'
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function key(value: string | null | undefined): string {
  return collapseSpaces(value ?? '').toLowerCase()
}

function isActive(flag: number | null | undefined): boolean {
  return flag == null || flag === 1
}

function matchOne<T>(
  items: T[],
  predicate: (item: T) => boolean
): T | 'ambiguous' | null {
  const hits = items.filter(predicate)
  if (hits.length === 1) return hits[0]
  if (hits.length > 1) return 'ambiguous'
  return null
}

export function resolveStudentImport(
  row: StudentImportCsvRow,
  structure: StudentImportStructure
): StudentImportResult {
  const name = normalizeFullName(row.full_name)
  if (!name) return { ok: false, reason: 'missing_name' }

  const residence = normalizeResidence(row.residence_type)
  if (residence == null) return { ok: false, reason: 'missing_residence' }
  if (residence === 'invalid') return { ok: false, reason: 'invalid_residence' }

  const dob = normalizeDateOfBirth(row.date_of_birth)
  if (dob === 'invalid') return { ok: false, reason: 'invalid_date_of_birth' }

  const classId = resolveImportClass(row, structure)
  if (!classId.ok) return classId

  return {
    ok: true,
    data: {
      name,
      class_id: classId.classId,
      gender: normalizeGender(row.gender),
      date_of_birth: dob,
      residence_type: residence,
    },
  }
}

function resolveImportClass(
  row: StudentImportCsvRow,
  structure: StudentImportStructure
):
  | { ok: true; classId: string }
  | { ok: false; reason: StudentImportSkipReason } {
  const levelKey = key(row.level_name)
  const deptKey = key(row.department_name)
  const specKey = key(row.specialization_name)
  const classKey = key(row.class_name)

  const activeClasses = structure.classes.filter((c) => isActive(c.is_active))

  if (levelKey || deptKey || specKey) {
    if (!levelKey) return { ok: false, reason: 'missing_level' }
    if (!deptKey) return { ok: false, reason: 'missing_department' }

    const levels = structure.levels.filter((l) => isActive(l.is_active))
    const level = matchOne(
      levels,
      (l) => key(l.name) === levelKey || key(l.short_name) === levelKey
    )
    if (level === 'ambiguous') return { ok: false, reason: 'unknown_level' }
    if (!level) return { ok: false, reason: 'unknown_level' }

    const sections = structure.sections.filter((s) => isActive(s.is_active))
    const section = matchOne(sections, (s) => key(s.name) === deptKey)
    if (section === 'ambiguous') return { ok: false, reason: 'unknown_department' }
    if (!section) return { ok: false, reason: 'unknown_department' }

    const sectionSpecs = structure.specializations.filter(
      (s) => s.section_id === section.id && isActive(s.is_active)
    )
    let specializationId: string | null | undefined
    if (specKey) {
      const spec = matchOne(
        sectionSpecs,
        (s) => key(s.name) === specKey || key(s.abbreviation) === specKey
      )
      if (spec === 'ambiguous') {
        return { ok: false, reason: 'unknown_specialization' }
      }
      if (!spec) return { ok: false, reason: 'unknown_specialization' }
      specializationId = spec.id
    }

    let candidates = activeClasses.filter(
      (c) =>
        c.academic_level_id === level.id && c.section_id === section.id
    )
    if (specializationId) {
      candidates = candidates.filter(
        (c) => c.specialization_id === specializationId
      )
    } else if (specKey === '' || specKey == null) {
      const unspecialized = candidates.filter((c) => !c.specialization_id)
      if (unspecialized.length > 0) candidates = unspecialized
    }

    const picked = pickClass(candidates, classKey)
    if (picked) return { ok: true, classId: picked.id }
    if (candidates.length > 1) return { ok: false, reason: 'ambiguous_class' }
    return { ok: false, reason: 'no_matching_class' }
  }

  if (!classKey) return { ok: false, reason: 'missing_level' }
  const byName = matchOne(activeClasses, (c) => key(c.name) === classKey)
  if (byName === 'ambiguous') return { ok: false, reason: 'ambiguous_class' }
  if (!byName) return { ok: false, reason: 'no_matching_class' }
  return { ok: true, classId: byName.id }
}

function pickClass(
  candidates: StudentImportStructure['classes'],
  classKey: string
): StudentImportStructure['classes'][number] | null {
  if (candidates.length === 0) return null

  if (classKey) {
    const named = matchOne(candidates, (c) => key(c.name) === classKey)
    if (named && named !== 'ambiguous') return named
    if (named === 'ambiguous') return null
  }

  if (candidates.length === 1) return candidates[0]
  return null
}

export function tallySkipReasons(
  reasons: StudentImportSkipReason[]
): Array<{ reason: StudentImportSkipReason; count: number }> {
  const counts = new Map<StudentImportSkipReason, number>()
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count }))
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
  const detail = parts.length ? parts.join(', ') : 'check level, department, and class'
  return `${importedLabel} (${input.skipped} skipped — ${detail}).`
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

export function buildStudentImportTemplateCsv(): string {
  return [
    'Full Name,Date of Birth,Level,Department,Specialization,Residence Type,Gender',
    'Ada Biya,2012-04-15,Form 1,General,,Day,Female',
    'Jean Nkodo,15/04/2012,Form 4,Technical,Electrical,Boarding,Male',
  ].join('\n')
}

export function parseStudentCsv(text: string): StudentImportCsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]).map((h) => key(h).replace(/_/g, ' '))
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

export function splitCsvLine(line: string): string[] {
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
