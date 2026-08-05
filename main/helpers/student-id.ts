/** Student ID pattern helpers (shared by main + preview logic). */

export type StudentIdToken =
  | 'SCHOOL'
  | 'YEAR'
  | 'LEVEL'
  | 'SECTION'
  | 'SPECIALIZATION'
  | 'SEQ'

export type SequenceScope = 'year' | 'year_level'

export interface PatternSegment {
  /** Token name or literal text */
  type: 'token' | 'text'
  value: string
}

export interface StudentIdTokenValues {
  SCHOOL?: string
  YEAR?: string | number
  LEVEL?: string
  SECTION?: string
  SPECIALIZATION?: string
  SEQ?: string | number
}

export const STUDENT_ID_TOKENS: Array<{
  key: StudentIdToken
  label: string
}> = [
  { key: 'SCHOOL', label: 'School' },
  { key: 'YEAR', label: 'Year' },
  { key: 'LEVEL', label: 'Level' },
  { key: 'SECTION', label: 'Section' },
  { key: 'SPECIALIZATION', label: 'Specialization' },
  { key: 'SEQ', label: 'Sequence' },
]

export const DEFAULT_STUDENT_ID_PATTERN = '{SCHOOL}-{YEAR}-{SEQ}'

export function padSequence(number: number, length = 3): string {
  const n = Math.max(0, Math.floor(number))
  return String(n).padStart(length, '0')
}

/** Parse "{SCHOOL}-{YEAR}-{SEQ}" into ordered segments. */
export function parsePattern(pattern: string): PatternSegment[] {
  const source = pattern.trim() || DEFAULT_STUDENT_ID_PATTERN
  const segments: PatternSegment[] = []
  const re = /\{([A-Z_]+)\}|([^{]+)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    if (match[1]) {
      segments.push({ type: 'token', value: match[1].toUpperCase() })
    } else if (match[2]) {
      segments.push({ type: 'text', value: match[2] })
    }
  }
  return segments.length
    ? segments
    : [{ type: 'token', value: 'SCHOOL' }]
}

export function serializePattern(segments: PatternSegment[]): string {
  return segments
    .map((s) => (s.type === 'token' ? `{${s.value}}` : s.value))
    .join('')
}

export function buildStudentId(
  pattern: string,
  values: StudentIdTokenValues
): string {
  return pattern.replace(/\{([A-Z_]+)\}/gi, (_, raw: string) => {
    const key = raw.toUpperCase() as StudentIdToken
    const val = values[key]
    if (val === undefined || val === null || val === '') return ''
    if (key === 'SEQ') {
      const num = typeof val === 'number' ? val : Number(val)
      return Number.isFinite(num) ? padSequence(num) : String(val)
    }
    return String(val)
  })
}

/** Derive a short level code from a level name (Form 1 → F1). */
export function deriveLevelShortName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'LV'

  const formMatch = trimmed.match(/^form\s*(\d+)/i)
  if (formMatch) return `F${formMatch[1]}`

  const sixthMatch = trimmed.match(/^(lower|upper)\s*sixth/i)
  if (sixthMatch) {
    return sixthMatch[1].toLowerCase() === 'lower' ? 'LS' : 'US'
  }

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 1) {
    return words[0]!.slice(0, 3).toUpperCase()
  }
  return words
    .map((w) => w[0]!)
    .join('')
    .slice(0, 4)
    .toUpperCase()
}

export const PATTERN_PRESETS: Array<{
  id: string
  label: string
  pattern: string
}> = [
  {
    id: 'school-year-seq',
    label: 'GBHS-2026-001',
    pattern: '{SCHOOL}-{YEAR}-{SEQ}',
  },
  {
    id: 'year-seq',
    label: '2026-001',
    pattern: '{YEAR}-{SEQ}',
  },
  {
    id: 'school-level-seq',
    label: 'GBHS-F1-001',
    pattern: '{SCHOOL}-{LEVEL}-{SEQ}',
  },
  {
    id: 'custom',
    label: 'Custom',
    pattern: '',
  },
]
