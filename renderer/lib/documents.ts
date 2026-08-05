/** Document template setup types + IPC helpers. */

export type DocumentTemplateKey =
  | 'report_card'
  | 'admission_letter'
  | 'receipt'
  | 'certificate'

export interface DocumentTemplateDto {
  id: string
  template_key: DocumentTemplateKey
  title: string
  header_text: string
  footer_text: string
  logo_url: string | null
  has_custom_logo: boolean
  show_logo: boolean
  show_stamp: boolean
  show_signature: boolean
  signature_label: string
  is_enabled: boolean
}

export interface DocumentsSetup {
  schoolId: string
  schoolName: string
  schoolLogoUrl: string | null
  schoolStampUrl: string | null
  schoolSignatureUrl: string | null
  templates: DocumentTemplateDto[]
}

export interface DocumentTemplateSaveInput {
  template_key: DocumentTemplateKey
  header_text: string
  footer_text: string
  show_logo: boolean
  show_stamp: boolean
  show_signature: boolean
  signature_label: string
  is_enabled: boolean
  logoBase64?: string | null
  logoMimeType?: string
  clearLogo?: boolean
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchDocumentsSetup(): Promise<Result<DocumentsSetup>> {
  return (await window.ipc.invoke(
    'documents:get-setup'
  )) as Result<DocumentsSetup>
}

export async function saveDocumentTemplate(
  input: DocumentTemplateSaveInput
): Promise<Result<DocumentsSetup>> {
  return (await window.ipc.invoke(
    'documents:save-template',
    input
  )) as Result<DocumentsSetup>
}

export const TEMPLATE_SHORT_LABELS: Record<DocumentTemplateKey, string> = {
  report_card: 'Report Card',
  admission_letter: 'Admission Letter',
  receipt: 'Receipt',
  certificate: 'Certificate',
}
