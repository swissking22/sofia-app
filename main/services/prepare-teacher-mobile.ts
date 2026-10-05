/**
 * Prepare a teaching staff member for Sofia Teacher (mobile):
 * - Supabase Auth with app_metadata.staff_id / school_id / role=teacher
 * - Does NOT create a desktop login (teachers are staff, not Administration users)
 * - Schedules cloud sync so assignments appear on mobile
 */
import { tryProvisionStaffAuth } from './cloud-auth'
import { scheduleTeacherReadySync } from '../sync/auto-sync'
import { STAFF_TEMP_PASSWORD } from '../db/repositories/staff.repository'

export type PrepareTeacherMobileInput = {
  schoolId: string
  staffId: string
  email: string | null | undefined
  displayName: string
  schoolName?: string | null
  /** When true, overwrite Auth password (new teacher or explicit reset). */
  resetPassword: boolean
  password?: string
}

export async function prepareTeacherForMobile(
  input: PrepareTeacherMobileInput
): Promise<string | null> {
  const email = input.email?.trim()
  if (!email) {
    return 'Add an email to enable Sofia Teacher mobile login.'
  }

  const warning = await tryProvisionStaffAuth({
    email,
    password: input.password || STAFF_TEMP_PASSWORD,
    role: 'teacher',
    schoolId: input.schoolId,
    staffId: input.staffId,
    schoolName: input.schoolName ?? null,
    displayName: input.displayName,
    resetPassword: input.resetPassword,
  })

  scheduleTeacherReadySync(input.schoolId)
  return warning
}
