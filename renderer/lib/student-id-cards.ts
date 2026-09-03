type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type VariableDef = {
  key: string
  label: string
  category: string
  source: string
}

export type CardElement = {
  id: string
  type: string
  side: 'front' | 'back'
  x: number
  y: number
  w: number
  h: number
  rotation?: number
  z?: number
  locked?: boolean
  hidden?: boolean
  opacity?: number
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number | string
  fontStyle?: string
  align?: string
  letterSpacing?: number
  lineHeight?: number
  color?: string
  textTransform?: string
  writingMode?: string
  imageBinding?: string
  imageSrc?: string
  objectFit?: string
  borderRadius?: number
  crop?: string
  fill?: string
  stroke?: string
  strokeWidth?: number
  shape?: string
  qrBinding?: string
  barcodeBinding?: string
  icon?: string
  borderColor?: string
  borderWidth?: number
  resolvedText?: string
  resolvedImage?: string
  qrSvg?: string
  barcodeSvg?: string
}

export type CardDesign = {
  widthMm: number
  heightMm: number
  unit: string
  orientation: 'landscape' | 'portrait'
  front: { background: { type: string; value: string; value2?: string; imageSrc?: string } }
  back: { background: { type: string; value: string; value2?: string; imageSrc?: string } }
  elements: CardElement[]
}

export async function fetchIdCardMeta() {
  return (await window.ipc.invoke('students:id-cards-meta')) as Result<{
    can_manage: boolean
    can_generate: boolean
    can_print: boolean
    can_issue: boolean
    can_replace: boolean
    can_revoke: boolean
    can_settings: boolean
    variables: VariableDef[]
    school: {
      name: string
      short_code: string
      phone: string
      address: string
      email: string
      website: string
      logo_url: string | null
    }
    years: Array<{ id: string; name: string; is_current: number }>
    classes: Array<{ id: string; name: string; stream: string | null; section_id: string | null }>
    students: Array<{
      id: string
      name: string
      student_code: string | null
      class_id: string
      class_name: string | null
      department_name: string | null
      stream: string | null
      status: string
    }>
  }>
}

export async function fetchIdCardDashboard() {
  return (await window.ipc.invoke('id-cards:dashboard')) as Result<{
    active_students: number
    cards_issued: number
    pending: number
    expiring_soon: number
    expired: number
    templates: number
    recent_jobs: Array<{
      id: string
      job_number: string
      status: string
      successful: number
      total: number
      created_at: string
      template_name: string | null
      created_by_email: string | null
    }>
  }>
}

export async function fetchIdCardTemplates() {
  return (await window.ipc.invoke('id-cards:templates-list')) as Result<{
    templates: Array<{
      id: string
      name: string
      description: string
      card_type: string
      orientation: string
      status: string
      current_version_number: number
      updated_at: string
      updated_by_email: string | null
      design: CardDesign
    }>
  }>
}

export async function fetchIdCardTemplate(id: string) {
  return (await window.ipc.invoke('id-cards:template-get', { id })) as Result<{
    template: {
      id: string
      name: string
      description: string
      status: string
      card_type: string
      orientation: string
      width_mm: number
      height_mm: number
      current_version_number: number
    }
    design: CardDesign
  }>
}

export async function saveIdCardTemplate(input: {
  id?: string
  name: string
  description?: string
  card_type?: 'student' | 'staff'
  status?: 'draft' | 'active' | 'archived'
  design: CardDesign
}) {
  return (await window.ipc.invoke('id-cards:template-save', input)) as Result<{ id: string }>
}

export async function wizardIdCardTemplate(input: {
  name: string
  card_type: 'student' | 'staff'
  orientation: 'landscape' | 'portrait'
  starting: 'blank' | 'classic' | 'modern' | 'minimal' | 'branding'
  fields: string[]
}) {
  return (await window.ipc.invoke('id-cards:template-wizard', input)) as Result<{ id: string }>
}

export async function idCardTemplateAction(input: {
  id: string
  action: 'duplicate' | 'activate' | 'archive' | 'delete' | 'rename'
  name?: string
}) {
  return (await window.ipc.invoke('id-cards:template-action', input)) as Result<unknown>
}

export async function previewIdCard(input: {
  template_id: string
  student_id?: string | null
  academic_year_id?: string | null
  sample?: boolean
}) {
  return (await window.ipc.invoke('id-cards:preview', input)) as Result<{
    design: CardDesign
    bindings: Record<string, string>
  }>
}

export async function validateIdCardSelection(input: {
  template_id: string
  student_ids: string[]
}) {
  return (await window.ipc.invoke('id-cards:validate', input)) as Result<{
    ready: Array<{ id: string; name: string }>
    blocked: Array<{ id: string; name: string; missing: string[] }>
    warnings: Array<{ id: string; name: string; warnings: string[] }>
    total: number
  }>
}

export async function runIdCardJob(input: Record<string, unknown>) {
  return (await window.ipc.invoke('id-cards:generate-job', input)) as Result<{
    id: string
    job_number: string
    status: string
    total: number
    processed: number
    successful: number
    failed: number
    skipped: number
    items: Array<{
      student_id: string
      student_name: string
      status: string
      error: string | null
      warning: string | null
      card_id: string | null
    }>
  }>
}

export async function fetchIssuedIdCards(input?: {
  academic_year_id?: string
  class_id?: string
  status?: string
  search?: string
}) {
  return (await window.ipc.invoke('id-cards:issued-list', input)) as Result<{
    cards: Array<{
      id: string
      student_id: string
      student_code: string
      student_name: string
      class_name: string | null
      academic_year_id: string
      year_name: string | null
      card_number: string | null
      verification_code: string | null
      status: string
      effective_status: string
      card_kind: string
      issue_date: string | null
      expiry_date: string | null
      generated_at: string
      template_name: string | null
      template_version_id: string | null
    }>
  }>
}

export async function setIdCardStatus(id: string, status: 'issued' | 'revoked' | 'active') {
  return (await window.ipc.invoke('id-cards:card-status', { id, status })) as Result<unknown>
}

export async function replaceIdCard(input: {
  student_id: string
  academic_year_id: string
  template_id: string
  reason: string
}) {
  return (await window.ipc.invoke('id-cards:replace', input)) as Result<unknown>
}

export async function fetchIdCardSettings() {
  return (await window.ipc.invoke('id-cards:settings-get')) as Result<Record<string, unknown>>
}

export async function saveIdCardSettings(input: Record<string, unknown>) {
  return (await window.ipc.invoke('id-cards:settings-save', input)) as Result<Record<string, unknown>>
}

export async function fetchIdCardPrintHistory() {
  return (await window.ipc.invoke('id-cards:print-history')) as Result<{
    rows: Array<{
      id: string
      printed_at: string
      card_count: number
      paper_size: string
      printed_by_email: string | null
    }>
  }>
}

export async function fetchIdCards(input?: { academic_year_id?: string; class_id?: string }) {
  return fetchIssuedIdCards(input)
}

export async function generateIdCard(input: {
  student_id: string
  academic_year_id: string
  regenerate?: boolean
}) {
  return (await window.ipc.invoke('students:id-cards-generate', input)) as Result<unknown>
}

export async function bulkGenerateIdCards(input: {
  academic_year_id: string
  class_id?: string | null
  student_ids?: string[]
}) {
  return (await window.ipc.invoke('students:id-cards-bulk', input)) as Result<{
    created: number
    skipped: number
  }>
}

export async function fetchIdCardsPrint(ids: string[], mark = false) {
  return (await window.ipc.invoke('students:id-cards-print', {
    ids,
    mark,
  })) as Result<{
    school: {
      name: string
      short_code: string
      phone: string
      address: string
      logo_url: string | null
    }
    cards: Array<{
      id: string
      student_code: string
      student_name: string
      class_name: string | null
      year_name: string | null
      valid_from: string
      valid_to: string
      photo_url: string | null
      status: string
      design: CardDesign
    }>
  }>
}
