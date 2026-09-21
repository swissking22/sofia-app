/**
 * One-off / ops helper to provision a teacher Auth user.
 * Prefer creating teachers in the desktop app (auto-provisions via Edge Function).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/provision-teacher-auth.ts
 */
import { provisionStaffAuth } from '../main/services/cloud-auth'

const email = process.env.TEACHER_EMAIL || 'sofia.teacher.lwm@gmail.com'
const password = process.env.TEACHER_PASSWORD || 'Sofia@Teacher1'
const schoolId =
  process.env.SCHOOL_ID || '0dd470f4-4505-4aa5-a8ea-0b4c340daa5d'
const staffId =
  process.env.STAFF_ID || '768530a8-6f9f-49eb-aeb7-2b787fa21d7f'
const schoolName =
  process.env.SCHOOL_NAME ||
  'Light World Mission Anglo-Saxon Boarding and Day College'

async function main() {
  const result = await provisionStaffAuth({
    email,
    password,
    role: 'teacher',
    schoolId,
    staffId,
    schoolName,
    displayName: 'Test Teacher',
    resetPassword: true,
  })

  console.log(result.created ? 'Created' : 'Updated', 'Auth teacher', result.id)
  console.log('\nLogin:')
  console.log(`  Email:    ${email}`)
  console.log(`  Password: ${password}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
