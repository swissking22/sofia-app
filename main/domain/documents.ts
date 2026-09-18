import { DEFAULT_BILINGUAL_HEADER } from './report-card'

/** Shared document numbering, templates, and rendering (no React, no SQL). */

export const DEFAULT_NUMBER_PATTERN = '{SCHOOL_CODE}/{TYPE}/{YEAR}/{SEQUENCE}'

export type DocumentFamily =
  | 'admission_letter'
  | 'certificate'
  | 'transcript'
  | 'receipt'
  | 'official'
  | 'report_card'

export type IssuedDocumentStatus =
  | 'draft'
  | 'generated'
  | 'issued'
  | 'voided'
  | 'superseded'

export type DocumentCategory =
  | 'academic'
  | 'administrative'
  | 'student'
  | 'finance'
  | 'other'

export type SignatoryRole = 'principal' | 'headteacher' | 'registrar' | 'bursar'

export interface DocumentVariableDef {
  key: string
  label: string
  category: 'school' | 'student' | 'academic' | 'finance' | 'document'
}

export const DOCUMENT_VARIABLES: DocumentVariableDef[] = [
  { key: 'school.name', label: 'School name', category: 'school' },
  { key: 'school.shortCode', label: 'School short code', category: 'school' },
  { key: 'school.address', label: 'School address', category: 'school' },
  { key: 'school.phone', label: 'School phone', category: 'school' },
  { key: 'school.email', label: 'School email', category: 'school' },
  { key: 'school.website', label: 'School website', category: 'school' },
  { key: 'school.principal', label: 'Principal / Headteacher', category: 'school' },
  { key: 'student.name', label: 'Student name', category: 'student' },
  { key: 'student.id', label: 'Student ID', category: 'student' },
  { key: 'student.admissionNumber', label: 'Admission number', category: 'student' },
  { key: 'student.class', label: 'Class', category: 'student' },
  { key: 'student.department', label: 'Department', category: 'student' },
  { key: 'student.academicYear', label: 'Student academic year', category: 'student' },
  { key: 'student.gender', label: 'Gender', category: 'student' },
  { key: 'student.dateOfBirth', label: 'Date of birth', category: 'student' },
  { key: 'student.status', label: 'Student status', category: 'student' },
  { key: 'student.balance', label: 'Outstanding balance', category: 'finance' },
  { key: 'academic.year', label: 'Academic year', category: 'academic' },
  { key: 'academic.term', label: 'Term', category: 'academic' },
  { key: 'academic.average', label: 'Overall average', category: 'academic' },
  { key: 'academic.grade', label: 'Overall grade', category: 'academic' },
  { key: 'academic.position', label: 'Position', category: 'academic' },
  { key: 'academic.status', label: 'Academic status', category: 'academic' },
  { key: 'receipt.number', label: 'Receipt number', category: 'finance' },
  { key: 'receipt.date', label: 'Receipt date', category: 'finance' },
  { key: 'payment.amount', label: 'Amount paid', category: 'finance' },
  { key: 'payment.amountWords', label: 'Amount in words', category: 'finance' },
  { key: 'payment.method', label: 'Payment method', category: 'finance' },
  { key: 'payment.reference', label: 'Payment reference', category: 'finance' },
  { key: 'invoice.reference', label: 'Invoice reference', category: 'finance' },
  { key: 'document.number', label: 'Document number', category: 'document' },
  { key: 'document.date', label: 'Document date', category: 'document' },
  { key: 'document.type', label: 'Document type', category: 'document' },
  { key: 'document.title', label: 'Document title', category: 'document' },
  { key: 'document.verification', label: 'Verification ID', category: 'document' },
  { key: 'document.reason', label: 'Reason / description', category: 'document' },
  { key: 'document.recipient', label: 'Recipient', category: 'document' },
  { key: 'document.conditions', label: 'Admission conditions', category: 'document' },
  { key: 'document.reportingDate', label: 'Reporting date', category: 'document' },
  { key: 'document.customText', label: 'Custom text', category: 'document' },
  { key: 'signatory.name', label: 'Signatory name', category: 'document' },
  { key: 'signatory.title', label: 'Signatory title', category: 'document' },
]

const VARIABLE_SET = new Set(DOCUMENT_VARIABLES.map((v) => v.key))

const FAMILY_VARIABLES: Record<DocumentFamily, string[]> = {
  admission_letter: [
    'school.name',
    'school.shortCode',
    'school.address',
    'school.phone',
    'school.email',
    'school.principal',
    'student.name',
    'student.id',
    'student.admissionNumber',
    'student.class',
    'student.department',
    'student.academicYear',
    'student.dateOfBirth',
    'student.status',
    'academic.year',
    'document.number',
    'document.date',
    'document.type',
    'document.conditions',
    'document.reportingDate',
    'signatory.name',
    'signatory.title',
  ],
  certificate: [
    'school.name',
    'school.shortCode',
    'school.address',
    'school.phone',
    'school.email',
    'school.principal',
    'student.name',
    'student.id',
    'student.class',
    'student.department',
    'student.academicYear',
    'academic.year',
    'academic.average',
    'academic.grade',
    'document.number',
    'document.date',
    'document.type',
    'document.reason',
    'document.customText',
    'document.verification',
    'signatory.name',
    'signatory.title',
  ],
  transcript: [
    'school.name',
    'school.shortCode',
    'school.address',
    'school.phone',
    'school.email',
    'school.principal',
    'student.name',
    'student.id',
    'student.admissionNumber',
    'student.class',
    'student.department',
    'student.gender',
    'student.dateOfBirth',
    'academic.year',
    'academic.term',
    'academic.average',
    'academic.grade',
    'academic.position',
    'academic.status',
    'document.number',
    'document.date',
    'document.verification',
    'signatory.name',
    'signatory.title',
  ],
  receipt: [
    'school.name',
    'school.shortCode',
    'school.address',
    'school.phone',
    'school.email',
    'student.name',
    'student.id',
    'student.admissionNumber',
    'student.class',
    'student.balance',
    'receipt.number',
    'receipt.date',
    'payment.amount',
    'payment.amountWords',
    'payment.method',
    'payment.reference',
    'invoice.reference',
    'signatory.name',
    'signatory.title',
  ],
  official: [
    'school.name',
    'school.shortCode',
    'school.address',
    'school.phone',
    'school.email',
    'school.principal',
    'student.name',
    'student.id',
    'student.class',
    'student.department',
    'student.academicYear',
    'academic.year',
    'document.number',
    'document.date',
    'document.type',
    'document.recipient',
    'document.customText',
    'document.verification',
    'signatory.name',
    'signatory.title',
  ],
  report_card: [
    'school.name',
    'student.name',
    'student.id',
    'student.class',
    'academic.year',
    'academic.term',
    'academic.average',
    'academic.grade',
    'academic.position',
  ],
}

export function variablesForFamily(family: DocumentFamily): DocumentVariableDef[] {
  const allowed = new Set(FAMILY_VARIABLES[family] ?? [])
  return DOCUMENT_VARIABLES.filter((v) => allowed.has(v.key))
}

export function padDocumentSequence(n: number, length = 4): string {
  return String(Math.max(0, Math.floor(n))).padStart(length, '0')
}

export function formatDocumentNumber(input: {
  pattern?: string | null
  schoolCode: string
  typeCode: string
  year: string | number
  sequence: number
}): string {
  const pattern = (input.pattern || DEFAULT_NUMBER_PATTERN).trim()
  const values: Record<string, string> = {
    SCHOOL_CODE: input.schoolCode || 'SCH',
    SCHOOL: input.schoolCode || 'SCH',
    TYPE: (input.typeCode || 'DOC').toUpperCase(),
    YEAR: String(input.year),
    SEQUENCE: padDocumentSequence(input.sequence),
    SEQ: padDocumentSequence(input.sequence),
  }
  return pattern.replace(/\{([A-Z_]+)\}/gi, (_, raw: string) => {
    const key = raw.toUpperCase()
    return values[key] ?? ''
  })
}

export function sequenceKey(
  schoolId: string,
  typeCode: string,
  year: string | number
): string {
  return `${schoolId}::${typeCode.toUpperCase()}::${year}`
}

export function makeVerificationCode(randomHex: string): string {
  const body = randomHex.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()
  return `SOFIA-${body.padEnd(6, 'X')}`
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function stripUnsafeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]
const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
]

function chunkToWords(n: number): string {
  if (n < 20) return ONES[n]
  if (n < 100) {
    const rest = n % 10
    return TENS[Math.floor(n / 10)] + (rest ? `-${ONES[rest]}` : '')
  }
  const rest = n % 100
  return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` and ${chunkToWords(rest)}` : ''}`
}

/** Integer amount in English words (Cameroon CFA-style receipts). */
export function amountInWords(amount: number, currency = 'CFA francs'): string {
  const n = Math.round(Math.abs(amount))
  if (n === 0) return `Zero ${currency}`
  const parts: string[] = []
  let remaining = n
  const scales: Array<{ value: number; name: string }> = [
    { value: 1_000_000_000, name: 'billion' },
    { value: 1_000_000, name: 'million' },
    { value: 1_000, name: 'thousand' },
  ]
  for (const scale of scales) {
    if (remaining >= scale.value) {
      const qty = Math.floor(remaining / scale.value)
      parts.push(`${chunkToWords(qty)} ${scale.name}`)
      remaining %= scale.value
    }
  }
  if (remaining) parts.push(chunkToWords(remaining))
  const body = parts.join(' ')
  return `${body.charAt(0).toUpperCase()}${body.slice(1)} ${currency}`
}

export function finalizeTemplateDecision(input: {
  family: DocumentFamily
  schoolId: string
  existingDefaults: Array<{ id: string; school_id: string; family: DocumentFamily }>
  wantDefault: boolean
}): { is_default: boolean; unsetIds: string[] } {
  if (!input.wantDefault) return { is_default: false, unsetIds: [] }
  const unsetIds = input.existingDefaults
    .filter((row) => row.school_id === input.schoolId && row.family === input.family)
    .map((row) => row.id)
  return { is_default: true, unsetIds }
}

export function canDeleteTemplate(issuedCount: number): boolean {
  return issuedCount === 0
}

export type TranscriptRunStatus = 'draft' | 'computed' | 'published' | 'locked'

export function isOfficialResultStatus(status: string): boolean {
  return status === 'published' || status === 'locked'
}

export function transcriptExclusionMessage(input: {
  termName: string
  status: string
}): string {
  return `Results for ${input.termName} have not yet been finalized and cannot be included in an official transcript.`
}

export function filterOfficialRows<T extends { status: string }>(rows: T[]): T[] {
  return rows.filter((r) => isOfficialResultStatus(r.status))
}

const VARIABLE_RE = /\{\{([a-zA-Z0-9_.]+)\}\}/g
const BLOCK_KEYS = new Set(['transcript.results', 'receipt.lines', 'grading.bands'])

/** Replace approved {{dot.keys}}. Unknown tokens are left unchanged. */
export function resolveTemplate(
  template: string,
  values: Record<string, string>,
  blocks: Record<string, string> = {}
): string {
  const html = stripUnsafeHtml(template)
  const withBlocks = html.replace(VARIABLE_RE, (match, key: string) => {
    if (BLOCK_KEYS.has(key)) return blocks[key] ?? ''
    return match
  })
  return withBlocks.replace(VARIABLE_RE, (match, key: string) => {
    if (!VARIABLE_SET.has(key)) return match
    const raw = values[key]
    if (raw === undefined || raw === null) return ''
    return escapeHtml(String(raw))
  })
}

export function wrapOfficialHtml(input: {
  title: string
  header: string
  body: string
  footer: string
  schoolName: string
  documentNumber?: string
  verification?: string
  logoUrl?: string | null
  stampUrl?: string | null
  signatureUrl?: string | null
  showLogo?: boolean
  showStamp?: boolean
  showSignature?: boolean
  signatureLabel?: string
  signatoryName?: string
  /** School contact line (address · phone · email). */
  schoolContact?: string | null
  /**
   * When true (default), render the Cameroon bilingual ministry letterhead
   * used on official report cards (FR left, logo centre, EN right).
   */
  showBilingualHeader?: boolean
  bilingualHeader?: { fr_lines: string[]; en_lines: string[] }
}): string {
  const showBilingual = input.showBilingualHeader !== false
  const headerLines = input.bilingualHeader ?? DEFAULT_BILINGUAL_HEADER
  const fr = headerLines.fr_lines
  const en = headerLines.en_lines
  const rowCount = Math.max(fr.length, en.length)

  const logoInner =
    input.showLogo && input.logoUrl
      ? `<img src="${escapeHtml(input.logoUrl)}" alt="" />`
      : `<div class="doc-logo-fallback" aria-hidden="true">${escapeHtml(
          (input.schoolName || 'S').slice(0, 1).toUpperCase()
        )}</div>`

  const bilingualBlock = showBilingual
    ? `<header class="doc-gov-header">
    <div class="doc-gov-col doc-gov-fr">
      ${Array.from({ length: rowCount })
        .map((_, i) => {
          const text = fr[i] ?? ''
          const cls = i === 0 ? 'doc-gov-strong' : 'doc-gov-line'
          return `<p class="${cls}">${escapeHtml(text)}</p>`
        })
        .join('\n      ')}
    </div>
    <div class="doc-gov-logo">${logoInner}</div>
    <div class="doc-gov-col doc-gov-en">
      ${Array.from({ length: rowCount })
        .map((_, i) => {
          const text = en[i] ?? ''
          const cls = i === 0 ? 'doc-gov-strong' : 'doc-gov-line'
          return `<p class="${cls}">${escapeHtml(text)}</p>`
        })
        .join('\n      ')}
    </div>
  </header>`
    : input.showLogo && input.logoUrl
      ? `<img src="${escapeHtml(input.logoUrl)}" alt="" class="doc-logo" />`
      : ''

  const stamp =
    input.showStamp && input.stampUrl
      ? `<img src="${escapeHtml(input.stampUrl)}" alt="" class="doc-stamp" />`
      : `<div class="doc-stamp-box">School stamp</div>`
  const signatureImg =
    input.showSignature && input.signatureUrl
      ? `<img src="${escapeHtml(input.signatureUrl)}" alt="" class="doc-sign-img" />`
      : ''
  const contact = (input.schoolContact || '').trim()

  return `<article class="sofia-document">
  ${bilingualBlock}
  <section class="doc-school-identity">
    <p class="doc-school">${escapeHtml(input.schoolName)}</p>
    ${contact ? `<p class="doc-contact">${escapeHtml(contact)}</p>` : ''}
  </section>
  <div class="doc-title-block">
    <h1 class="doc-title">${escapeHtml(input.title)}</h1>
    ${input.header ? `<p class="doc-header-text">${input.header}</p>` : ''}
    ${
      input.documentNumber
        ? `<p class="doc-number">No. ${escapeHtml(input.documentNumber)}</p>`
        : ''
    }
  </div>
  <div class="doc-body">${input.body}</div>
  <footer class="doc-footer">
    ${input.footer ? `<p>${input.footer}</p>` : ''}
    <div class="doc-auth">
      <div>
        ${signatureImg}
        <p class="doc-sign-line">${escapeHtml(input.signatoryName || '')}</p>
        <p class="doc-sign-label">${escapeHtml(input.signatureLabel || 'Principal')}</p>
      </div>
      <div class="doc-stamp-wrap">${input.showStamp === false ? '' : stamp}</div>
    </div>
    ${
      input.verification
        ? `<p class="doc-verify">Verification ID: ${escapeHtml(input.verification)}</p>`
        : ''
    }
    <p class="doc-page">Page <span class="page-num"></span></p>
  </footer>
</article>`
}

export const DOCUMENT_PRINT_CSS = `
.sofia-document { font-family: "Times New Roman", Times, Georgia, serif; color: #111; max-width: 210mm; margin: 0 auto; font-size: 11pt; line-height: 1.35; }
.doc-gov-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: start;
  border-bottom: 1.5px solid #111;
  padding-bottom: 10px;
}
.doc-gov-col { font-size: 8.5pt; line-height: 1.25; }
.doc-gov-fr { text-align: left; }
.doc-gov-en { text-align: right; }
.doc-gov-strong {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin: 0 0 2px;
}
.doc-gov-line { margin: 0 0 2px; font-style: italic; }
.doc-gov-logo {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.doc-gov-logo img { max-width: 64px; max-height: 64px; object-fit: contain; }
.doc-logo-fallback {
  width: 56px;
  height: 56px;
  border: 1.5px solid #111;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 20pt;
}
.doc-logo { height: 64px; object-fit: contain; margin: 0 auto 8px; display: block; }
.doc-school-identity { text-align: center; margin-top: 10px; }
.doc-school {
  font-size: 16pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin: 0;
}
.doc-contact { margin: 4px 0 0; font-size: 8.5pt; color: #333; }
.doc-title-block {
  text-align: center;
  margin: 14px 0 16px;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 10px;
}
.doc-title { font-size: 14pt; margin: 0; text-transform: uppercase; letter-spacing: 0.06em; }
.doc-header-text, .doc-number { font-size: 10pt; color: #334155; margin: 4px 0 0; }
.doc-body { font-size: 11pt; line-height: 1.55; min-height: 240px; }
.doc-body p { margin: 0 0 10px; }
.doc-body table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
.doc-body th, .doc-body td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
.doc-body th { background: #f8fafc; }
.doc-footer { margin-top: 28px; border-top: 1px solid #cbd5e1; padding-top: 16px; font-size: 10pt; color: #475569; }
.doc-auth { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; }
.doc-sign-img { height: 48px; object-fit: contain; }
.doc-sign-line { min-height: 40px; border-bottom: 1px solid #64748b; min-width: 180px; margin: 0; }
.doc-sign-label { margin: 4px 0 0; font-weight: 600; }
.doc-stamp-box { width: 96px; height: 96px; border: 1px dashed #94a3b8; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #94a3b8; }
.doc-stamp { height: 96px; object-fit: contain; }
.doc-verify { margin-top: 16px; font-size: 11px; letter-spacing: .08em; }
.doc-page { display: none; }
@page { size: A4; margin: 16mm; }
@media print {
  .doc-page { display: block; text-align: right; }
}
`

export interface CatalogTemplateDef {
  key: string
  family: DocumentFamily
  title: string
  description: string
  category: DocumentCategory
  typeCode: string
  header: string
  footer: string
  body: string
  signatureLabel: string
  signatoryRole: SignatoryRole
  isDefault: boolean
  requiresApproval: boolean
}

export const CATALOG_TEMPLATES: CatalogTemplateDef[] = [
  {
    key: 'admission_letter',
    family: 'admission_letter',
    title: 'Admission Letter',
    description: 'Official offer of admission.',
    category: 'student',
    typeCode: 'ADM',
    header: 'Letter of Admission',
    footer: 'Welcome to our school community.',
    body: `<p>Dear Parent / Guardian,</p>
<p>We are pleased to offer admission to <strong>{{student.name}}</strong> (Student ID: {{student.id}}) into <strong>{{student.class}}</strong>, {{student.department}}, for the {{academic.year}} academic year.</p>
<p>Date of birth: {{student.dateOfBirth}}<br/>Admission date: {{document.date}}<br/>Reporting date: {{document.reportingDate}}</p>
<p>{{document.conditions}}</p>
<p>Yours faithfully,</p>`,
    signatureLabel: 'Principal',
    signatoryRole: 'principal',
    isDefault: true,
    requiresApproval: false,
  },
  {
    key: 'receipt',
    family: 'receipt',
    title: 'Receipt Template',
    description: 'Default payment receipt layout used by Finance &amp; Fees.',
    category: 'finance',
    typeCode: 'RCP',
    header: 'Official Payment Receipt',
    footer: 'Thank you for your payment. Keep this receipt for your records.',
    body: `<p><strong>Receipt:</strong> {{receipt.number}} &nbsp; <strong>Date:</strong> {{receipt.date}}</p>
<p><strong>Student:</strong> {{student.name}} ({{student.id}})<br/>Class: {{student.class}}</p>
<p><strong>Amount paid:</strong> {{payment.amount}} ({{payment.amountWords}})<br/>
Method: {{payment.method}} &nbsp; Reference: {{payment.reference}}<br/>
Invoice: {{invoice.reference}}<br/>
Outstanding balance: {{student.balance}}</p>
{{receipt.lines}}`,
    signatureLabel: 'Bursar',
    signatoryRole: 'bursar',
    isDefault: true,
    requiresApproval: false,
  },
  {
    key: 'certificate',
    family: 'certificate',
    title: 'Academic Achievement Certificate',
    description: 'Generic certificate of academic achievement.',
    category: 'academic',
    typeCode: 'CERT',
    header: 'Certificate of Achievement',
    footer: 'Awarded in recognition of academic excellence.',
    body: `<p style="text-align:center">This is to certify that</p>
<p style="text-align:center;font-size:20px"><strong>{{student.name}}</strong></p>
<p style="text-align:center">({{student.id}} · {{student.class}})</p>
<p>{{document.customText}}</p>
<p>Awarded for {{document.reason}} during {{academic.year}}.</p>`,
    signatureLabel: 'Principal',
    signatoryRole: 'principal',
    isDefault: true,
    requiresApproval: true,
  },
  {
    key: 'certificate.school_leaving',
    family: 'certificate',
    title: 'School Leaving Certificate',
    description: 'Issued when a student completes or leaves the school.',
    category: 'academic',
    typeCode: 'SLC',
    header: 'School Leaving Certificate',
    footer: 'Issued by the school administration.',
    body: `<p>This is to certify that <strong>{{student.name}}</strong> ({{student.id}}) was a student of {{school.name}} in {{student.class}} during {{academic.year}}.</p>
<p>{{document.customText}}</p>`,
    signatureLabel: 'Principal',
    signatoryRole: 'principal',
    isDefault: false,
    requiresApproval: true,
  },
  {
    key: 'certificate.completion',
    family: 'certificate',
    title: 'Completion Certificate',
    description: 'Certifies completion of a programme or class.',
    category: 'academic',
    typeCode: 'CMP',
    header: 'Certificate of Completion',
    footer: '',
    body: `<p>This certifies that <strong>{{student.name}}</strong> has completed {{student.class}} at {{school.name}} for {{academic.year}}.</p>
<p>{{document.customText}}</p>`,
    signatureLabel: 'Principal',
    signatoryRole: 'principal',
    isDefault: false,
    requiresApproval: true,
  },
  {
    key: 'certificate.participation',
    family: 'certificate',
    title: 'Participation Certificate',
    description: 'Recognition of participation in a school activity.',
    category: 'student',
    typeCode: 'PAR',
    header: 'Certificate of Participation',
    footer: '',
    body: `<p>This is to certify that <strong>{{student.name}}</strong> participated in {{document.reason}}.</p>
<p>{{document.customText}}</p>`,
    signatureLabel: 'Principal',
    signatoryRole: 'principal',
    isDefault: false,
    requiresApproval: false,
  },
  {
    key: 'certificate.conduct',
    family: 'certificate',
    title: 'Conduct Certificate',
    description: 'Statement of student conduct.',
    category: 'student',
    typeCode: 'CND',
    header: 'Certificate of Conduct',
    footer: '',
    body: `<p>This is to certify that the conduct of <strong>{{student.name}}</strong> ({{student.id}}, {{student.class}}) has been satisfactory during {{academic.year}}.</p>
<p>{{document.customText}}</p>`,
    signatureLabel: 'Principal',
    signatoryRole: 'principal',
    isDefault: false,
    requiresApproval: true,
  },
  {
    key: 'transcript',
    family: 'transcript',
    title: 'Academic Transcript',
    description: 'Official transcript from finalized results.',
    category: 'academic',
    typeCode: 'TRN',
    header: 'Official Academic Transcript',
    footer: 'Only published or locked results appear on this transcript.',
    body: `<p><strong>Student:</strong> {{student.name}} &nbsp; <strong>ID:</strong> {{student.id}}<br/>
Admission no.: {{student.admissionNumber}} &nbsp; Gender: {{student.gender}}<br/>
Date of birth: {{student.dateOfBirth}}<br/>
Class: {{student.class}} &nbsp; Department: {{student.department}}</p>
{{transcript.results}}
<p><strong>Overall average:</strong> {{academic.average}} &nbsp; <strong>Grade:</strong> {{academic.grade}} &nbsp; <strong>Position:</strong> {{academic.position}}<br/>
Academic status: {{academic.status}}</p>
{{grading.bands}}`,
    signatureLabel: 'Registrar',
    signatoryRole: 'registrar',
    isDefault: true,
    requiresApproval: true,
  },
  {
    key: 'official.enrollment',
    family: 'official',
    title: 'Certificate of Enrollment',
    description: 'Confirms that a student is enrolled.',
    category: 'student',
    typeCode: 'COE',
    header: 'Certificate of Enrollment',
    footer: '',
    body: `<p>This is to certify that <strong>{{student.name}}</strong> ({{student.id}}) is enrolled at {{school.name}} in {{student.class}}, {{student.department}}, for {{academic.year}}.</p>
<p>{{document.customText}}</p>`,
    signatureLabel: 'Registrar',
    signatoryRole: 'registrar',
    isDefault: true,
    requiresApproval: false,
  },
  {
    key: 'official.recommendation',
    family: 'official',
    title: 'Recommendation Letter',
    description: 'School recommendation for a student.',
    category: 'administrative',
    typeCode: 'REC',
    header: 'Letter of Recommendation',
    footer: '',
    body: `<p>To {{document.recipient}},</p>
<p>I write to recommend <strong>{{student.name}}</strong> ({{student.id}}), currently in {{student.class}} at {{school.name}}.</p>
<p>{{document.customText}}</p>
<p>Yours faithfully,</p>`,
    signatureLabel: 'Principal',
    signatoryRole: 'principal',
    isDefault: false,
    requiresApproval: true,
  },
  {
    key: 'official.confirmation',
    family: 'official',
    title: 'Confirmation Letter',
    description: 'Confirms student registration or a stated fact.',
    category: 'administrative',
    typeCode: 'CNF',
    header: 'Confirmation Letter',
    footer: '',
    body: `<p>To whom it may concern,</p>
<p>This letter confirms that <strong>{{student.name}}</strong> is a student of {{school.name}} in {{student.class}} for {{academic.year}}.</p>
<p>{{document.customText}}</p>`,
    signatureLabel: 'Registrar',
    signatoryRole: 'registrar',
    isDefault: false,
    requiresApproval: false,
  },
  {
    key: 'official.transfer',
    family: 'official',
    title: 'Transfer Letter',
    description: 'Official transfer correspondence.',
    category: 'student',
    typeCode: 'TRF',
    header: 'Transfer Letter',
    footer: '',
    body: `<p>To {{document.recipient}},</p>
<p>This letter concerns the transfer of <strong>{{student.name}}</strong> ({{student.id}}) from {{student.class}} at {{school.name}}.</p>
<p>{{document.customText}}</p>`,
    signatureLabel: 'Principal',
    signatoryRole: 'principal',
    isDefault: false,
    requiresApproval: true,
  },
  {
    key: 'official.withdrawal',
    family: 'official',
    title: 'Withdrawal Letter',
    description: 'Confirms student withdrawal.',
    category: 'student',
    typeCode: 'WDL',
    header: 'Withdrawal Letter',
    footer: '',
    body: `<p>This is to certify that <strong>{{student.name}}</strong> ({{student.id}}) has withdrawn from {{school.name}}.</p>
<p>{{document.customText}}</p>`,
    signatureLabel: 'Principal',
    signatoryRole: 'principal',
    isDefault: false,
    requiresApproval: true,
  },
  {
    key: 'report_card',
    family: 'report_card',
    title: 'Report Card Template',
    description: 'Term report card layout (Academic Management).',
    category: 'academic',
    typeCode: 'RC',
    header: 'Official Term Report Card',
    footer: 'This report is computer generated and valid without stamp.',
    body: `<p>Student: {{student.name}} · {{student.class}} · {{academic.year}} {{academic.term}}</p>
{{transcript.results}}`,
    signatureLabel: 'Principal',
    signatoryRole: 'principal',
    isDefault: true,
    requiresApproval: false,
  },
]

export function resultsTableHtml(
  rows: Array<{
    year?: string
    term?: string
    subject: string
    ca?: string | number
    exam?: string | number
    total?: string | number
    grade?: string
  }>
): string {
  if (!rows.length) return '<p><em>No finalized results available.</em></p>'
  const body = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.year || '')}</td>
        <td>${escapeHtml(r.term || '')}</td>
        <td>${escapeHtml(r.subject)}</td>
        <td>${escapeHtml(String(r.ca ?? ''))}</td>
        <td>${escapeHtml(String(r.exam ?? ''))}</td>
        <td>${escapeHtml(String(r.total ?? ''))}</td>
        <td>${escapeHtml(r.grade || '')}</td>
      </tr>`
    )
    .join('')
  return `<table><thead><tr>
    <th>Year</th><th>Term</th><th>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th>
  </tr></thead><tbody>${body}</tbody></table>`
}

export function receiptLinesHtml(
  lines: Array<{ description: string; amount: string }>
): string {
  if (!lines.length) return ''
  const body = lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.description)}</td><td>${escapeHtml(l.amount)}</td></tr>`
    )
    .join('')
  return `<table><thead><tr><th>Fee component</th><th>Amount</th></tr></thead><tbody>${body}</tbody></table>`
}

export function gradingBandsHtml(
  bands: Array<{ grade: string; min_score: number; max_score?: number | null }>
): string {
  if (!bands.length) return ''
  const body = bands
    .map(
      (b) =>
        `<tr><td>${escapeHtml(b.grade)}</td><td>${escapeHtml(String(b.min_score))}${
          b.max_score != null ? ` – ${escapeHtml(String(b.max_score))}` : '+'
        }</td></tr>`
    )
    .join('')
  return `<p><strong>Grading</strong></p><table><thead><tr><th>Grade</th><th>Range</th></tr></thead><tbody>${body}</tbody></table>`
}

export function nextStatusAfterGenerate(requiresApproval: boolean): IssuedDocumentStatus {
  return requiresApproval ? 'generated' : 'issued'
}

export function assertTransition(
  from: IssuedDocumentStatus,
  to: IssuedDocumentStatus
): void {
  const allowed: Record<IssuedDocumentStatus, IssuedDocumentStatus[]> = {
    draft: ['generated', 'voided'],
    generated: ['issued', 'voided', 'superseded'],
    issued: ['voided', 'superseded'],
    voided: [],
    superseded: [],
  }
  if (!allowed[from].includes(to)) {
    throw new Error(`Cannot change a ${from} document to ${to}.`)
  }
}
