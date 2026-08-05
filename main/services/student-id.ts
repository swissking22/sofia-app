import type { Repositories } from '../db/repositories'
import {
  buildStudentId,
  deriveLevelShortName,
  padSequence,
} from '../helpers/student-id'

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
  const withCodes = repos.schools.ensureSchoolCode(school)

  const settings = repos.studentIdSettings.ensureDefaults(input.schoolId)

  if (
    settings.sequence_scope === 'year_level' &&
    !input.academicLevelId
  ) {
    throw new Error(
      'Academic level is required when sequence resets per level per year.'
    )
  }

  // Scope-aware max: for year_level, allocate from settings counter still
  // (simple counter). A more advanced per-level counter can hang off this later.
  // For year_level uniqueness we include LEVEL in the pattern (preset).
  const { sequence } = repos.studentIdSettings.allocateSequence(input.schoolId)

  let levelShort = ''
  if (input.academicLevelId) {
    const level = repos.academicLevels.findById(input.academicLevelId)
    levelShort =
      level?.short_name?.trim() ||
      (level ? deriveLevelShortName(level.name) : '')
  }

  const student_code = buildStudentId(settings.pattern, {
    SCHOOL: withCodes.short_code,
    YEAR: input.admissionYear,
    LEVEL: levelShort,
    SECTION: input.sectionName?.trim() || '',
    SPECIALIZATION: input.specializationAbbr?.trim() || '',
    SEQ: padSequence(sequence),
  })

  // Collision guard (unique index also enforces this)
  const clash = repos.students.findBySchoolAndCode(
    input.schoolId,
    student_code
  )
  if (clash) {
    throw new Error(
      `Generated student ID “${student_code}” already exists. Adjust the pattern or sequence.`
    )
  }

  return {
    student_code,
    sequence_number: sequence,
    pattern: settings.pattern,
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
