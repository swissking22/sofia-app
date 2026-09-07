import type Database from 'better-sqlite3'
import type { Repositories } from '../db/repositories'
import type { School, StudentIdSettings } from '../db/types'
import {
  DEFAULT_STUDENT_ID_PATTERN,
  buildStudentId,
  deriveLevelShortName,
  padSequence,
} from '../helpers/student-id'
import { normalizeShortCode } from '../helpers/school-short-code'

export interface GenerateStudentIdInput {
  schoolId: string
  admissionYear: number
  academicLevelId?: string | null
  sectionName?: string | null
  specializationAbbr?: string | null
}

export interface GeneratedStudentId {
  student_code: string
  sequence_number: number
  pattern: string
}

export interface GenerateStudentCodeOptions {
  sequence?: number
  admissionYear?: number
  academicLevelId?: string | null
  sectionName?: string | null
  specializationAbbr?: string | null
}

/**
 * Reusable function/service to generate a permanent student code from school settings.
 * Supports {SCHOOL} and {SEQ} (and optional tokens if present in custom patterns).
 * Does not include {YEAR} in the default pattern {SCHOOL}-{SEQ}.
 */
export function generateStudentCode(
  db: Database.Database,
  schoolId: string,
  options?: GenerateStudentCodeOptions
): {
  student_code: string
  sequence_number: number
  pattern: string
} {
  // 1. Load the school's student_id_settings
  let settings = db
    .prepare(
      `SELECT * FROM student_id_settings WHERE school_id = ? AND deleted_at IS NULL LIMIT 1`
    )
    .get(schoolId) as StudentIdSettings | undefined

  if (!settings) {
    let initialSeq = 1
    try {
      const maxRow = db
        .prepare(
          `SELECT MAX(sequence_number) as max_seq FROM students WHERE school_id = ? AND deleted_at IS NULL`
        )
        .get(schoolId) as { max_seq: number | null } | undefined
      if (maxRow?.max_seq != null && maxRow.max_seq > 0) {
        initialSeq = maxRow.max_seq + 1
      }
    } catch {
      /* ignore */
    }

    settings = {
      id: '',
      school_id: schoolId,
      pattern: DEFAULT_STUDENT_ID_PATTERN,
      sequence_scope: 'school',
      next_sequence_number: initialSeq,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      sync_status: 'pending',
      version: 1,
    }
  }

  // 2. Load the school's short_code
  const school = db
    .prepare(
      `SELECT id, name, short_code, school_code FROM schools WHERE id = ? AND deleted_at IS NULL LIMIT 1`
    )
    .get(schoolId) as School | undefined

  let schoolShortCode = school?.short_code?.trim() || ''
  if (!schoolShortCode) {
    schoolShortCode = school?.name ? normalizeShortCode(school.name) : 'SCH'
  }

  // 3. Read sequence number
  const sequence = options?.sequence ?? settings.next_sequence_number

  // 4. Resolve level short name if needed by custom patterns
  let levelShort = ''
  if (options?.academicLevelId) {
    try {
      const level = db
        .prepare(
          `SELECT name, short_name FROM academic_levels WHERE id = ? AND deleted_at IS NULL LIMIT 1`
        )
        .get(options.academicLevelId) as
        | { name: string; short_name: string | null }
        | undefined
      if (level) {
        levelShort =
          level.short_name?.trim() || deriveLevelShortName(level.name)
      }
    } catch {
      /* ignore */
    }
  }

  // 5. Generate the student code from the configured pattern
  const pattern = settings.pattern || DEFAULT_STUDENT_ID_PATTERN
  const student_code = buildStudentId(pattern, {
    SCHOOL: schoolShortCode,
    YEAR: options?.admissionYear ?? new Date().getFullYear(),
    LEVEL: levelShort,
    SECTION: options?.sectionName?.trim() || '',
    SPECIALIZATION: options?.specializationAbbr?.trim() || '',
    SEQ: padSequence(sequence, 4),
  })

  return {
    student_code,
    sequence_number: sequence,
    pattern,
  }
}

/**
 * Generate the next immutable student ID for a school.
 * Existing student codes are never rewritten when pattern/short_code changes.
 */
export function generateStudentId(
  repos: Repositories,
  input: GenerateStudentIdInput
): GeneratedStudentId {
  const school = repos.schools.findById(input.schoolId)
  if (!school) throw new Error('School not found.')
  repos.schools.ensureSchoolCode(school)

  const settings = repos.studentIdSettings.ensureDefaults(input.schoolId)

  if (
    settings.sequence_scope === 'year_level' &&
    !input.academicLevelId
  ) {
    throw new Error(
      'Academic level is required when sequence resets per level per year.'
    )
  }

  const { sequence } = repos.studentIdSettings.allocateSequence(input.schoolId)

  const generated = generateStudentCode(repos.schools.getDb(), input.schoolId, {
    sequence,
    admissionYear: input.admissionYear,
    academicLevelId: input.academicLevelId,
    sectionName: input.sectionName,
    specializationAbbr: input.specializationAbbr,
  })

  // Collision guard (unique index also enforces this)
  const clash = repos.students.findBySchoolAndCode(
    input.schoolId,
    generated.student_code
  )
  if (clash) {
    throw new Error(
      `Generated student ID “${generated.student_code}” already exists. Adjust the pattern or sequence.`
    )
  }

  return {
    student_code: generated.student_code,
    sequence_number: sequence,
    pattern: generated.pattern,
  }
}

export {
  buildStudentId,
  padSequence,
  deriveLevelShortName,
} from '../helpers/student-id'

export {
  generateSchoolShortCode,
  normalizeShortCode,
  validateShortCode,
} from '../helpers/school-short-code'
