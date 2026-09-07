/** Student ID settings types + IPC helpers (mirrors main helpers). */

export type SequenceScope = 'school' | 'year' | 'year_level'

export type StudentIdToken =
  | 'SCHOOL'
  | 'YEAR'
  | 'LEVEL'
  | 'SECTION'
  | 'SPECIALIZATION'
  | 'SEQ'

export interface PatternSegment {
  type: 'token' | 'text'
  value: string
}

export interface StudentIdSettings {
  id: string
  school_id: string
  pattern: string
  sequence_scope: SequenceScope
  next_sequence_number: number
  school_short_code: string
  school_name: string
}

export const STUDENT_ID_TOKENS: Array<{ key: StudentIdToken; label: string }> = [
  { key: 'SCHOOL', label: 'School' },
  { key: 'YEAR', label: 'Year' },
  { key: 'LEVEL', label: 'Level' },
  { key: 'SECTION', label: 'Section' },
  { key: 'SPECIALIZATION', label: 'Specialization' },
  { key: 'SEQ', label: 'Sequence' },
]

export const DEFAULT_STUDENT_ID_PATTERN = '{SCHOOL}-{SEQ}'

export const PATTERN_PRESETS: Array<{
  id: string
  label: string
  pattern: string
}> = [
  {
    id: 'school-seq',
    label: 'GBHS-0001',
    pattern: '{SCHOOL}-{SEQ}',
  },
  {
    id: 'school-year-seq',
    label: 'GBHS-2026-0001',
    pattern: '{SCHOOL}-{YEAR}-{SEQ}',
  },
  {
    id: 'year-seq',
    label: '2026-0001',
    pattern: '{YEAR}-{SEQ}',
  },
  {
    id: 'school-level-seq',
    label: 'GBHS-F1-0001',
    pattern: '{SCHOOL}-{LEVEL}-{SEQ}',
  },
  {
    id: 'custom',
    label: 'Custom',
    pattern: '',
  },
]

export function padSequence(number: number, length = 4): string {
  return String(Math.max(0, Math.floor(number))).padStart(length, '0')
}

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
  return segments.length ? segments : [{ type: 'token', value: 'SCHOOL' }]
}

export function serializePattern(segments: PatternSegment[]): string {
  return segments
    .map((s) => (s.type === 'token' ? `{${s.value}}` : s.value))
    .join('')
}

export function buildStudentIdPreview(
  pattern: string,
  values: {
    SCHOOL: string
    YEAR: number
    LEVEL: string
    SECTION?: string
    SPECIALIZATION?: string
    SEQ: number
  }
): string {
  return pattern.replace(/\{([A-Z_]+)\}/gi, (_, raw: string) => {
    const key = raw.toUpperCase() as keyof typeof values
    const val = values[key]
    if (val === undefined || val === null || val === '') return ''
    if (key === 'SEQ') return padSequence(Number(val))
    return String(val)
  })
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchStudentIdSettings(): Promise<
  Result<StudentIdSettings>
> {
  return (await window.ipc.invoke(
    'student-id:get-settings'
  )) as Result<StudentIdSettings>
}

export async function saveStudentIdSettings(input: {
  pattern: string
  sequence_scope: SequenceScope
  next_sequence_number?: number
}): Promise<Result<StudentIdSettings>> {
  return (await window.ipc.invoke(
    'student-id:save-settings',
    input
  )) as Result<StudentIdSettings>
}
