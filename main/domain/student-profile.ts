/**
 * Student profile completeness helpers.
 * Incomplete = missing gender, date of birth, or guardian phone.
 */

export function isIncompleteStudentProfile(student: {
  gender: string | null
  date_of_birth: string | null
  guardian_phone: string | null
}): boolean {
  return (
    !student.gender?.trim() ||
    !student.date_of_birth?.trim() ||
    !student.guardian_phone?.trim()
  )
}

/** SQLite WHERE fragment (alias `s` = students). */
export const INCOMPLETE_PROFILE_SQL = `(
  IFNULL(TRIM(s.gender), '') = ''
  OR IFNULL(TRIM(s.date_of_birth), '') = ''
  OR IFNULL(TRIM(s.guardian_phone), '') = ''
)`
