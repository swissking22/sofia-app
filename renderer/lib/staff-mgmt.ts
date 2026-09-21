/** Staff Management IPC helpers. */

export type StaffStatus = 'active' | 'inactive'
export type StaffType = 'administrative' | 'teaching'
export type StaffJobRole =
  | 'teacher'
  | 'head_of_department'
  | 'admin'
  | 'support'
export type StaffAttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'half_day'
export type LeaveType = 'sick' | 'casual' | 'paid' | 'unpaid'
export type LeaveRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'

type Result<T> = { ok: true; data: T; warning?: string } | { ok: false; error: string }

export interface StaffDto {
  id: string
  school_id: string
  full_name: string
  gender: string | null
  phone: string | null
  email: string | null
  staff_type: StaffType
  admin_role: string | null
  department_id: string | null
  department_name: string | null
  status: StaffStatus
  user_id: string | null
  employee_code: string | null
  joining_date: string | null
  address: string | null
  job_role: StaffJobRole | null
  subject_ids: string[]
  subject_names: string[]
  class_ids: string[]
  class_names: string[]
  teaching_assignments: Array<{
    class_id: string
    subject_id: string
    class_name: string | null
    subject_name: string | null
  }>
  homeroom_class_ids: string[]
  homeroom_class_names: string[]
}

export interface StaffMeta {
  departments: Array<{ id: string; name: string }>
  subjects: Array<{ id: string; name: string; class_ids: string[] }>
  classes: Array<{
    id: string
    name: string
    class_teacher_id: string | null
  }>
  max_teacher_periods: number
  leave_types: LeaveType[]
  job_roles: StaffJobRole[]
  can_manage: boolean
  self_staff_id: string | null
}

export const JOB_ROLE_LABELS: Record<StaffJobRole, string> = {
  teacher: 'Teacher',
  head_of_department: 'Head of Department',
  admin: 'Admin',
  support: 'Support',
}

export const ATTENDANCE_LABELS: Record<StaffAttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  half_day: 'Half Day',
}

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  sick: 'Sick Leave',
  casual: 'Casual Leave',
  paid: 'Paid Leave',
  unpaid: 'Unpaid Leave',
}

export async function fetchStaffMeta(): Promise<Result<StaffMeta>> {
  return (await window.ipc.invoke('staff-mgmt:meta')) as Result<StaffMeta>
}

export async function fetchTeachers(filters?: {
  status?: StaffStatus | 'all'
  search?: string | null
  departmentId?: string | null
  jobRole?: StaffJobRole | 'all'
}): Promise<Result<{ teachers: StaffDto[] }>> {
  return (await window.ipc.invoke(
    'staff-mgmt:teachers-list',
    filters ?? {}
  )) as Result<{ teachers: StaffDto[] }>
}

export async function fetchDirectory(filters?: {
  status?: StaffStatus | 'all'
  search?: string | null
  staffType?: StaffType | 'all'
  jobRole?: StaffJobRole | 'all'
}): Promise<Result<{ staff: StaffDto[] }>> {
  return (await window.ipc.invoke(
    'staff-mgmt:directory-list',
    filters ?? {}
  )) as Result<{ staff: StaffDto[] }>
}

export async function fetchStaff(
  id: string
): Promise<Result<StaffDto>> {
  return (await window.ipc.invoke('staff-mgmt:get', { id })) as Result<StaffDto>
}

export async function createStaff(
  input: Record<string, unknown>
): Promise<Result<StaffDto>> {
  return (await window.ipc.invoke(
    'staff-mgmt:create',
    input
  )) as Result<StaffDto>
}

export async function updateStaff(
  input: Record<string, unknown> & { id: string }
): Promise<Result<StaffDto>> {
  return (await window.ipc.invoke(
    'staff-mgmt:update',
    input
  )) as Result<StaffDto>
}

export async function deleteStaff(
  id: string
): Promise<Result<{ id: string }>> {
  return (await window.ipc.invoke('staff-mgmt:delete', {
    id,
  })) as Result<{ id: string }>
}

export async function fetchWorkloadSummary(): Promise<
  Result<{
    max_periods: number
    rows: Array<{
      staff_id: string
      full_name: string
      employee_code: string | null
      period_count: number
      subject_count: number
      class_count: number
      over_max: boolean
      has_conflict: boolean
    }>
  }>
> {
  return (await window.ipc.invoke(
    'staff-mgmt:workload-summary'
  )) as Result<{
    max_periods: number
    rows: Array<{
      staff_id: string
      full_name: string
      employee_code: string | null
      period_count: number
      subject_count: number
      class_count: number
      over_max: boolean
      has_conflict: boolean
    }>
  }>
}

export async function fetchWorkloadDetail(staff_id: string) {
  return await window.ipc.invoke('staff-mgmt:workload-detail', { staff_id })
}

export async function fetchAttendanceDay(date: string) {
  return await window.ipc.invoke('staff-mgmt:attendance-day-get', { date })
}

export async function saveAttendanceDay(input: {
  date: string
  marks: Array<{
    staff_id: string
    status: StaffAttendanceStatus
    notes?: string | null
  }>
}) {
  return await window.ipc.invoke('staff-mgmt:attendance-day-save', input)
}

export async function fetchAttendanceMonth(year: number, month: number) {
  return await window.ipc.invoke('staff-mgmt:attendance-month', {
    year,
    month,
  })
}

export async function fetchAttendanceHistory(input: {
  staff_id: string
  from?: string | null
  to?: string | null
}) {
  return await window.ipc.invoke('staff-mgmt:attendance-history', input)
}

export async function exportAttendanceCsv(year: number, month: number) {
  return await window.ipc.invoke('staff-mgmt:attendance-export-csv', {
    year,
    month,
  })
}

export async function fetchLeaveBalances(input?: {
  staff_id?: string | null
  year?: number | null
}) {
  return await window.ipc.invoke('staff-mgmt:leave-balances', input ?? {})
}

export async function fetchLeaveList(input?: {
  status?: LeaveRequestStatus | 'all'
  staff_id?: string | null
  year?: number | null
}) {
  return await window.ipc.invoke('staff-mgmt:leave-list', input ?? {})
}

export async function applyLeave(input: {
  staff_id?: string | null
  leave_type: LeaveType
  start_date: string
  end_date: string
  reason?: string | null
}) {
  return await window.ipc.invoke('staff-mgmt:leave-apply', input)
}

export async function decideLeave(input: {
  id: string
  decision: 'approved' | 'rejected' | 'cancelled'
  review_notes?: string | null
}) {
  return await window.ipc.invoke('staff-mgmt:leave-decide', input)
}

export async function fetchLeaveCalendar(from: string, to: string) {
  return await window.ipc.invoke('staff-mgmt:leave-calendar', { from, to })
}

export async function fetchStaffNotifications() {
  return await window.ipc.invoke('staff-mgmt:notifications-list')
}

export async function markNotificationRead(input?: {
  id?: string | null
  all?: boolean
}) {
  return await window.ipc.invoke(
    'staff-mgmt:notifications-mark-read',
    input ?? {}
  )
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
