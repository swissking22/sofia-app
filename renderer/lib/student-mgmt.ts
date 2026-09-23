/** Student management IPC helpers + shared options. */

export type StudentStatus = 'active' | 'alumni' | 'transferred'

export interface StudentDto {
  id: string
  name: string
  class_id: string
  class_name: string | null
  academic_level_id: string | null
  level_name: string | null
  section_id: string | null
  section_name: string | null
  school_id: string | null
  student_code: string | null
  admission_year: number | null
  sequence_number: number | null
  gender: string | null
  date_of_birth: string | null
  place_of_birth: string | null
  phone: string | null
  email: string | null
  address: string | null
  admission_type: string | null
  residence_type?: string | null
  guardian_name: string | null
  guardian_phone: string | null
  guardian_email: string | null
  guardian_relationship: string | null
  status: string
  photo_url: string | null
  created_at: string
  updated_at: string
}

export interface StudentListResult {
  students: StudentDto[]
  filters: {
    years: number[]
    levels: Array<{ id: string; name: string; sort_order: number }>
    sections: Array<{ id: string; name: string }>
    classes: Array<{
      id: string
      name: string
      academic_level_id: string | null
      section_id: string | null
      level_sort_order?: number | null
      section_name?: string | null
    }>
  }
}

export interface StudentCreateInput {
  name: string
  class_id: string
  admission_year: number
  gender?: string | null
  date_of_birth?: string | null
  place_of_birth?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  admission_type?: string | null
  guardian_name?: string | null
  guardian_phone?: string | null
  guardian_email?: string | null
  guardian_relationship?: string | null
  residence_type?: 'day' | 'boarding' | null
}

export interface TransferDto {
  id: string
  school_id: string
  student_id: string
  from_class_id: string | null
  to_school_name: string
  transfer_date: string
  reason: string | null
  status: string
  student_name: string | null
  student_code: string | null
  created_at: string
}

export interface StudentDocumentDto {
  id: string
  school_id: string
  student_id: string
  student_name: string | null
  document_type: string
  title: string
  file_path: string | null
  file_url: string | null
  notes: string | null
  created_at: string
}

export interface PromotionPreview {
  from_year: number
  to_year?: number
  classes: Array<{
    class_id: string
    class_name: string
    academic_level_id: string | null
    level_name: string | null
    section_id: string | null
    section_name: string | null
    student_count: number
    suggested_to_class_id: string | null
    suggested_to_class_name: string | null
  }>
  mappings: Array<{
    from_class_id: string
    to_class_id: string | null
    student_count: number
  }>
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export const GENDER_OPTIONS = ['Male', 'Female'] as const

export const ADMISSION_TYPE_OPTIONS = [
  { key: 'new', label: 'New admission' },
  { key: 'returning', label: 'Returning' },
  { key: 'transfer', label: 'Transfer in' },
] as const

export const RESIDENCE_TYPE_OPTIONS = [
  { key: 'day', label: 'Day student' },
  { key: 'boarding', label: 'Boarding student' },
] as const

export const DOCUMENT_TYPE_OPTIONS = [
  { key: 'birth_certificate', label: 'Birth certificate' },
  { key: 'report_card', label: 'Report card' },
  { key: 'id_card', label: 'ID card' },
  { key: 'medical', label: 'Medical' },
  { key: 'other', label: 'Other' },
] as const

export const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  alumni: 'Alumni',
  transferred: 'Transferred',
}

export async function fetchStudentList(filters?: {
  status?: StudentStatus | 'all'
  admissionYear?: number | null
  academicLevelId?: string | null
  sectionId?: string | null
  classId?: string | null
  search?: string | null
  incompleteProfiles?: boolean
}): Promise<Result<StudentListResult>> {
  return (await window.ipc.invoke(
    'students:mgmt-list',
    filters ?? {}
  )) as Result<StudentListResult>
}

export interface ClassListDto {
  title: string
  generated_at: string
  all_classes: boolean
  school: {
    name: string
    address: string | null
    phone: string | null
    email: string | null
    school_code: string
    region: string | null
    division: string | null
    logo_url: string | null
  }
  academic_year: { id: string; name: string } | null
  class: {
    id: string
    name: string
    level_name: string | null
    level_sort_order?: number | null
    section_name: string | null
  } | null
  students: StudentDto[]
  groups: Array<{
    class: {
      id: string
      name: string
      level_name: string | null
      level_sort_order?: number | null
      section_name: string | null
    } | null
    students: StudentDto[]
  }>
}

export async function fetchClassList(input: {
  class_id?: string | null
  student_ids?: string[]
}): Promise<Result<ClassListDto>> {
  return (await window.ipc.invoke(
    'students:class-list',
    input
  )) as Result<ClassListDto>
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

export async function fetchStudent(
  id: string
): Promise<Result<StudentDto>> {
  return (await window.ipc.invoke('students:mgmt-get', {
    id,
  })) as Result<StudentDto>
}

export async function createStudent(
  input: StudentCreateInput
): Promise<Result<StudentDto>> {
  return (await window.ipc.invoke(
    'students:mgmt-create',
    input
  )) as Result<StudentDto>
}

export async function updateStudent(
  input: Partial<StudentCreateInput> & { id: string; status?: string }
): Promise<Result<StudentDto>> {
  return (await window.ipc.invoke(
    'students:mgmt-update',
    input
  )) as Result<StudentDto>
}

export async function bulkUpdateStudentStatus(
  ids: string[],
  status: StudentStatus
): Promise<Result<{ updated: number }>> {
  return (await window.ipc.invoke('students:mgmt-bulk-status', {
    ids,
    status,
  })) as Result<{ updated: number }>
}

export async function deleteStudent(
  id: string
): Promise<Result<{ id: string }>> {
  return (await window.ipc.invoke('students:mgmt-delete', {
    id,
  })) as Result<{ id: string }>
}

export async function createAdmission(
  input: Record<string, unknown>
): Promise<Result<unknown>> {
  return (await window.ipc.invoke(
    'admissions:create',
    input
  )) as Result<unknown>
}

export type AdmissionStatusFilter = 'pending' | 'accepted' | 'rejected' | 'all'

export interface AdmissionDto {
  id: string
  full_name: string
  gender: string | null
  phone: string | null
  email: string | null
  academic_level_id: string | null
  level_name: string | null
  preferred_class_id: string | null
  class_name: string | null
  admission_year: number | null
  guardian_name: string | null
  guardian_phone: string | null
  status: string
  notes: string | null
  student_id: string | null
  photo_url: string | null
  created_at: string
}

export const ADMISSION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
}

export async function fetchAdmissions(filters?: {
  status?: AdmissionStatusFilter
  search?: string | null
  admissionYear?: number | null
}): Promise<Result<AdmissionDto[]>> {
  return (await window.ipc.invoke(
    'admissions:list',
    filters ?? {}
  )) as Result<AdmissionDto[]>
}

export async function approveAdmission(input: {
  id: string
  class_id?: string | null
  admission_year?: number | null
}): Promise<
  Result<{
    admission_id: string
    student_id: string
    student_code: string | null
  }>
> {
  return (await window.ipc.invoke(
    'admissions:approve',
    input
  )) as Result<{
    admission_id: string
    student_id: string
    student_code: string | null
  }>
}

export async function rejectAdmission(input: {
  id: string
  notes?: string | null
}): Promise<Result<{ id: string; status: string }>> {
  return (await window.ipc.invoke(
    'admissions:reject',
    input
  )) as Result<{ id: string; status: string }>
}

export async function fetchTransfers(): Promise<Result<TransferDto[]>> {
  return (await window.ipc.invoke('transfers:list')) as Result<TransferDto[]>
}

export async function createTransfer(input: {
  student_id: string
  to_school_name: string
  transfer_date: string
  reason?: string | null
}): Promise<Result<TransferDto>> {
  return (await window.ipc.invoke(
    'transfers:create',
    input
  )) as Result<TransferDto>
}

export async function fetchDocuments(): Promise<
  Result<StudentDocumentDto[]>
> {
  return (await window.ipc.invoke(
    'documents:list'
  )) as Result<StudentDocumentDto[]>
}

export async function fetchStudentDocuments(
  studentId: string
): Promise<Result<StudentDocumentDto[]>> {
  return (await window.ipc.invoke('documents:list-by-student', {
    student_id: studentId,
  })) as Result<StudentDocumentDto[]>
}

export async function uploadDocument(input: {
  student_id: string
  document_type: string
  title: string
  file_base64: string
  mime_type?: string
  original_name?: string
  notes?: string | null
}): Promise<Result<StudentDocumentDto>> {
  return (await window.ipc.invoke(
    'documents:upload',
    input
  )) as Result<StudentDocumentDto>
}

export async function fetchPromotionPreview(
  fromYear: number,
  toYear?: number
): Promise<Result<PromotionPreview>> {
  return (await window.ipc.invoke('promotions:preview', {
    from_year: fromYear,
    to_year: toYear,
  })) as Result<PromotionPreview>
}

export async function runPromotion(input: {
  from_year: number
  to_year: number
  mappings: Array<{ from_class_id: string; to_class_id: string | null }>
  confirm: boolean
}): Promise<
  Result<PromotionPreview | { run_id: string; moved: number; status: string }>
> {
  return (await window.ipc.invoke(
    'promotions:run',
    input
  )) as Result<
    PromotionPreview | { run_id: string; moved: number; status: string }
  >
}

export async function fetchAlumni(): Promise<Result<StudentDto[]>> {
  return (await window.ipc.invoke('alumni:list')) as Result<StudentDto[]>
}
