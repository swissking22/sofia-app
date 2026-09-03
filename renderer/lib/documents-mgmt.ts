/** Documents module IPC client. */

export type DocumentFamily =
  | 'admission_letter'
  | 'certificate'
  | 'transcript'
  | 'receipt'
  | 'official'
  | 'report_card'

export type IssuedStatus = 'draft' | 'generated' | 'issued' | 'voided' | 'superseded'

export interface DocumentTemplateDto {
  id: string
  template_key: string
  title: string
  header_text: string
  footer_text: string
  body_text: string
  document_family: DocumentFamily | string
  type_code: string
  category: string
  description: string
  number_pattern: string
  signatory_role: string
  signature_label: string
  is_enabled: number
  is_default: number
  requires_approval: number
  show_logo: number
  show_stamp: number
  show_signature: number
  updated_at: string
}

export interface IssuedDocumentDto {
  id: string
  document_family: string
  template_id: string
  document_number: string
  verification_code: string
  student_id: string | null
  student_name?: string | null
  student_code?: string | null
  class_name?: string | null
  year_name?: string | null
  template_title?: string | null
  academic_year_id: string | null
  status: string
  version_number: number
  generated_by: string | null
  generated_by_email?: string | null
  created_at: string
  issued_at: string | null
  rendered_html: string
  supersedes_id: string | null
  admission_date?: string | null
  admission_year?: number | null
}

export interface DocumentsMeta {
  years: Array<{ id: string; name: string; is_current: number; start_date: string }>
  terms: Array<{ id: string; name: string; academic_year_id: string; term_number: number }>
  classes: Array<{ id: string; name: string; section_id: string | null }>
  sections: Array<{ id: string; name: string }>
  students: Array<{
    id: string
    name: string
    student_code: string | null
    class_id: string
    status: string
    admission_year: number | null
  }>
  can_view: boolean
  can_generate: boolean
  can_manage: boolean
  can_receipts: boolean
  can_export: boolean
  print_css: string
}

export interface GeneratePayload {
  template_id: string
  student_id: string
  academic_year_id?: string | null
  term_id?: string | null
  document_date?: string | null
  reason?: string | null
  custom_text?: string | null
  recipient?: string | null
  conditions?: string | null
  reporting_date?: string | null
  transcript_scope?: 'current' | 'selected' | 'history'
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchDocumentsMeta(): Promise<Result<DocumentsMeta>> {
  return (await window.ipc.invoke('documents-mgmt:meta')) as Result<DocumentsMeta>
}

export async function fetchDocumentTemplates(
  family?: DocumentFamily
): Promise<Result<{ templates: DocumentTemplateDto[] }>> {
  return (await window.ipc.invoke('documents-mgmt:templates-list', {
    family,
  })) as Result<{ templates: DocumentTemplateDto[] }>
}

export async function fetchDocumentTemplate(id: string) {
  return (await window.ipc.invoke('documents-mgmt:templates-get', { id })) as Result<{
    template: DocumentTemplateDto
    variables: Array<{ key: string; label: string; category: string }>
  }>
}

export async function saveDocumentType(input: Record<string, unknown>) {
  return (await window.ipc.invoke(
    'documents-mgmt:templates-save',
    input
  )) as Result<DocumentTemplateDto>
}

export async function duplicateDocumentTemplate(id: string) {
  return (await window.ipc.invoke('documents-mgmt:templates-duplicate', {
    id,
  })) as Result<DocumentTemplateDto>
}

export async function setDefaultDocumentTemplate(id: string) {
  return (await window.ipc.invoke('documents-mgmt:templates-set-default', {
    id,
  })) as Result<DocumentTemplateDto>
}

export async function setDocumentTemplateActive(id: string, enabled: boolean) {
  return (await window.ipc.invoke('documents-mgmt:templates-set-active', {
    id,
    enabled,
  })) as Result<DocumentTemplateDto>
}

export async function fetchIssuedDocuments(filters: {
  family?: DocumentFamily
  status?: string
  class_id?: string
  student_id?: string
  academic_year_id?: string
  from?: string
  to?: string
  section_id?: string
}): Promise<Result<{ documents: IssuedDocumentDto[] }>> {
  return (await window.ipc.invoke(
    'documents-mgmt:list',
    filters
  )) as Result<{ documents: IssuedDocumentDto[] }>
}

export async function fetchIssuedDocument(id: string) {
  return (await window.ipc.invoke('documents-mgmt:get', { id })) as Result<{
    document: IssuedDocumentDto
    css: string
  }>
}

export async function previewDocument(input: GeneratePayload) {
  return (await window.ipc.invoke('documents-mgmt:preview', input)) as Result<{
    html: string
    css: string
    warnings: string[]
  }>
}

export async function generateDocument(input: GeneratePayload) {
  return (await window.ipc.invoke(
    'documents-mgmt:generate',
    input
  )) as Result<IssuedDocumentDto>
}

export async function generateDocumentsBulk(
  input: Omit<GeneratePayload, 'student_id'> & { student_ids: string[] }
) {
  return (await window.ipc.invoke('documents-mgmt:generate-bulk', input)) as Result<{
    created: IssuedDocumentDto[]
    errors: Array<{ student_id: string; error: string }>
  }>
}

export async function issueDocument(id: string) {
  return (await window.ipc.invoke('documents-mgmt:issue', {
    id,
  })) as Result<IssuedDocumentDto>
}

export async function voidDocument(id: string) {
  return (await window.ipc.invoke('documents-mgmt:void', {
    id,
  })) as Result<IssuedDocumentDto>
}

export async function regenerateDocument(id: string) {
  return (await window.ipc.invoke('documents-mgmt:regenerate', {
    id,
  })) as Result<IssuedDocumentDto>
}

export async function archiveDocumentTemplate(id: string) {
  return (await window.ipc.invoke('documents-mgmt:templates-archive', {
    id,
  })) as Result<{ ok: boolean }>
}

export async function fetchDocumentVariables(family: DocumentFamily) {
  return (await window.ipc.invoke('documents-mgmt:variables', {
    family,
  })) as Result<{ variables: Array<{ key: string; label: string; category: string }> }>
}

export async function logDocumentExport(id: string) {
  return (await window.ipc.invoke('documents-mgmt:log-export', { id })) as Result<{
    id: string
  }>
}

export async function fetchSignatories() {
  return (await window.ipc.invoke('documents-mgmt:signatories-list')) as Result<{
    signatories: Array<{
      id: string
      role_key: string
      display_name: string
      title: string
      is_active: number
    }>
  }>
}

export async function saveSignatory(input: {
  role_key: string
  display_name: string
  title: string
  is_active?: boolean
}) {
  return (await window.ipc.invoke(
    'documents-mgmt:signatories-save',
    input
  )) as Result<{
    signatories: Array<{
      id: string
      role_key: string
      display_name: string
      title: string
      is_active: number
    }>
  }>
}

export async function searchDocumentStudents(query: string, class_id?: string | null) {
  return (await window.ipc.invoke('documents-mgmt:students-search', {
    query,
    class_id,
  })) as Result<{
    students: Array<{
      id: string
      name: string
      student_code: string | null
      class_id: string
      class_name: string | null
    }>
  }>
}
