/** Staff setup types + IPC helpers. */

export type StaffAdminRole =
  | 'principal'
  | 'vice_principal'
  | 'bursar'
  | 'secretary'

export type StaffGender = 'male' | 'female' | 'other'
export type StaffStatus = 'active' | 'inactive'

export interface StaffMember {
  id: string
  school_id: string
  full_name: string
  gender: StaffGender | null
  phone: string | null
  email: string | null
  staff_type: 'administrative' | 'teaching'
  admin_role: StaffAdminRole | null
  department_id: string | null
  department_name: string | null
  status: StaffStatus
  user_id: string | null
  subject_ids: string[]
  subject_names: string[]
  class_ids: string[]
  class_names: string[]
}

export interface StaffSetupData {
  schoolId: string
  adminStaff: StaffMember[]
  teachers: StaffMember[]
  departments: Array<{ id: string; name: string }>
  subjects: Array<{ id: string; name: string }>
  classes: Array<{ id: string; name: string }>
  tempPassword: string
}

export const ADMIN_ROLE_OPTIONS: Array<{
  role: StaffAdminRole
  label: string
}> = [
  { role: 'principal', label: 'Principal' },
  { role: 'vice_principal', label: 'Vice Principal' },
  { role: 'bursar', label: 'Bursar' },
  { role: 'secretary', label: 'Secretary' },
]

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchStaffSetup(): Promise<Result<StaffSetupData>> {
  return (await window.ipc.invoke('staff:get')) as Result<StaffSetupData>
}

export async function upsertAdminStaff(input: {
  id?: string | null
  admin_role: StaffAdminRole
  full_name: string
  phone?: string | null
  email?: string | null
}): Promise<Result<StaffSetupData>> {
  return (await window.ipc.invoke(
    'staff:upsert-admin',
    input
  )) as Result<StaffSetupData>
}

export async function clearAdminStaff(
  admin_role: StaffAdminRole
): Promise<Result<StaffSetupData>> {
  return (await window.ipc.invoke('staff:clear-admin', {
    admin_role,
  })) as Result<StaffSetupData>
}

export async function upsertTeacher(input: {
  id?: string | null
  full_name: string
  gender?: StaffGender | null
  phone?: string | null
  email?: string | null
  department_id?: string | null
  subject_ids?: string[]
  class_ids?: string[]
  status?: StaffStatus
}): Promise<Result<StaffSetupData>> {
  return (await window.ipc.invoke(
    'staff:upsert-teacher',
    input
  )) as Result<StaffSetupData>
}

export async function deleteTeacher(
  id: string
): Promise<Result<StaffSetupData>> {
  return (await window.ipc.invoke('staff:delete-teacher', {
    id,
  })) as Result<StaffSetupData>
}

export async function importTeachers(
  teachers: Array<{
    full_name: string
    gender?: string | null
    phone?: string | null
    email?: string | null
    department_name?: string | null
  }>
): Promise<Result<StaffSetupData & { imported: number; skipped: number }>> {
  return (await window.ipc.invoke('staff:import-teachers', {
    teachers,
  })) as Result<StaffSetupData & { imported: number; skipped: number }>
}

/** Parse a simple CSV of teachers (header row required). */
export function parseTeacherCsv(text: string): Array<{
  full_name: string
  gender?: string | null
  phone?: string | null
  email?: string | null
  department_name?: string | null
}> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase())
  const nameIdx = headers.findIndex((h) =>
    ['full name', 'fullname', 'full_name'].includes(h)
  )
  const genderIdx = headers.findIndex((h) => h === 'gender')
  const phoneIdx = headers.findIndex((h) => ['phone', 'telephone'].includes(h))
  const emailIdx = headers.findIndex((h) => h === 'email')
  const deptIdx = headers.findIndex((h) =>
    ['department', 'department_name'].includes(h)
  )

  if (nameIdx < 0) return []

  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line)
    return {
      full_name: cols[nameIdx] ?? '',
      gender: genderIdx >= 0 ? cols[genderIdx] || null : null,
      phone: phoneIdx >= 0 ? cols[phoneIdx] || null : null,
      email: emailIdx >= 0 ? cols[emailIdx] || null : null,
      department_name: deptIdx >= 0 ? cols[deptIdx] || null : null,
    }
  })
}

function splitCsvLine(line: string): string[] {
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
