import { createHash, randomBytes } from 'crypto'
import { addMonths } from './teaching-progress'
import {
  DEFAULT_ACADEMIC_CREST,
  DEFAULT_SAMPLE_SIGNATURE,
  DEFAULT_SAMPLE_STUDENT_PHOTO,
} from './id-card-assets'

export const CR80_WIDTH_MM = 85.6
export const CR80_HEIGHT_MM = 53.98
export const PX_PER_MM = 4

export type CardType = 'student' | 'staff'
export type CardOrientation = 'landscape' | 'portrait'
export type TemplateStatus = 'draft' | 'active' | 'archived'
export type CardStatus =
  | 'generated'
  | 'issued'
  | 'active'
  | 'expired'
  | 'revoked'
  | 'replaced'
export type CardKind = 'new' | 'replacement' | 'renewal'
export type ReplacementReason =
  | 'lost'
  | 'damaged'
  | 'incorrect_information'
  | 'name_change'
  | 'class_change'
  | 'other'
export type LengthUnit = 'mm' | 'cm' | 'in'
export type CardSide = 'front' | 'back'
export type ElementType =
  | 'text'
  | 'image'
  | 'shape'
  | 'qr'
  | 'barcode'
  | 'icon'
export type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'path'
export type ImageFit = 'cover' | 'contain' | 'fill'
export type ImageBinding =
  | 'student.photo'
  | 'staff.photo'
  | 'school.logo'
  | 'school.signature'
  | 'custom'
export type IconKind =
  | 'phone'
  | 'email'
  | 'location'
  | 'website'
  | 'emergency'
  | 'school'
export type ExpiryMode = 'none' | 'academic_year' | 'duration' | 'custom'
export type JobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
export type ItemStatus = 'pending' | 'ready' | 'warning' | 'skipped' | 'success' | 'failed'
export type PaperSize = 'A4' | 'A3' | 'Letter' | 'custom'
export type BackgroundType = 'solid' | 'gradient' | 'image'
export type MissingPhotoPolicy = 'generate_without' | 'skip' | 'cancel'

export interface SideBackground {
  type: BackgroundType
  value: string
  value2?: string
  imageSrc?: string
  opacity?: number
}

export interface CardElement {
  id: string
  type: ElementType
  side: CardSide
  x: number
  y: number
  w: number
  h: number
  rotation: number
  z: number
  locked: boolean
  hidden: boolean
  opacity: number
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number | string
  fontStyle?: 'normal' | 'italic'
  align?: 'left' | 'center' | 'right'
  letterSpacing?: number
  lineHeight?: number
  color?: string
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  writingMode?: 'horizontal' | 'vertical'
  imageBinding?: ImageBinding
  imageSrc?: string
  objectFit?: ImageFit
  borderRadius?: number
  crop?: 'none' | 'circle' | 'square' | 'rounded'
  fill?: string
  stroke?: string
  strokeWidth?: number
  shape?: ShapeKind
  /** SVG path `d` for shape:'path' (coordinates in element mm space). */
  pathD?: string
  qrBinding?: string
  barcodeBinding?: string
  icon?: IconKind
  borderColor?: string
  borderWidth?: number
}

export interface CardDesign {
  widthMm: number
  heightMm: number
  unit: LengthUnit
  orientation: CardOrientation
  front: { background: SideBackground }
  back: { background: SideBackground }
  elements: CardElement[]
}

export interface NumberingConfig {
  prefix: string
  include_year: boolean
  separator: string
  sequence_pad: number
  year_source: 'academic' | 'calendar'
}

export interface IdCardSettingsShape {
  numbering: NumberingConfig
  expiry_mode: ExpiryMode
  expiry_months: number
  custom_expiry_date: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
  font_family: string
  motto: string
  footer_text: string
  paper_size: PaperSize
  cards_per_row: number
  margin_mm: number
  gap_x_mm: number
  gap_y_mm: number
  crop_marks: boolean
  missing_photo_policy: MissingPhotoPolicy
}

export interface VariableDef {
  key: string
  label: string
  category: 'student' | 'staff' | 'academic' | 'school' | 'card' | 'date' | 'system'
  source: string
}

export type BindingMap = Record<string, string>

export const DEFAULT_NUMBERING: NumberingConfig = {
  prefix: 'SCH',
  include_year: true,
  separator: '/',
  sequence_pad: 5,
  year_source: 'academic',
}

export const DEFAULT_SETTINGS: IdCardSettingsShape = {
  numbering: { ...DEFAULT_NUMBERING },
  expiry_mode: 'academic_year',
  expiry_months: 12,
  custom_expiry_date: null,
  primary_color: '#0B2C5C',
  secondary_color: '#1E4D8C',
  accent_color: '#C9A227',
  font_family: 'Georgia, serif',
  motto: '',
  footer_text: 'If found, please return to the school office.',
  paper_size: 'A4',
  cards_per_row: 2,
  margin_mm: 10,
  gap_x_mm: 4,
  gap_y_mm: 4,
  crop_marks: false,
  missing_photo_policy: 'generate_without',
}

export const VARIABLE_CATALOG: VariableDef[] = [
  { key: 'student.name', label: 'Student Name', category: 'student', source: 'students.name' },
  { key: 'student.first_name', label: 'First Name', category: 'student', source: 'students.name' },
  { key: 'student.last_name', label: 'Last Name', category: 'student', source: 'students.name' },
  { key: 'student.student_id', label: 'Student ID', category: 'student', source: 'students.student_code' },
  { key: 'student.gender', label: 'Gender', category: 'student', source: 'students.gender' },
  { key: 'student.date_of_birth', label: 'Date of Birth', category: 'student', source: 'students.date_of_birth' },
  { key: 'student.photo', label: 'Student Photo', category: 'student', source: 'students.photo_path' },
  { key: 'student.class', label: 'Class', category: 'student', source: 'classes.name' },
  { key: 'student.stream', label: 'Stream', category: 'student', source: 'classes.stream' },
  { key: 'student.department', label: 'Department', category: 'student', source: 'sections.name' },
  { key: 'student.admission_year', label: 'Admission Year', category: 'student', source: 'students.admission_year' },
  { key: 'student.type', label: 'Student Type', category: 'student', source: 'students.status' },
  { key: 'student.qr_payload', label: 'Student QR Payload', category: 'student', source: 'students.student_code' },
  { key: 'staff.name', label: 'Staff Name', category: 'staff', source: 'staff.name' },
  { key: 'staff.staff_id', label: 'Staff ID', category: 'staff', source: 'staff.employee_code' },
  { key: 'staff.role', label: 'Staff Role', category: 'staff', source: 'staff.job_role' },
  { key: 'staff.department', label: 'Staff Department', category: 'staff', source: 'departments.name' },
  { key: 'staff.photo', label: 'Staff Photo', category: 'staff', source: 'staff.photo_path' },
  { key: 'academic.year', label: 'Academic Year', category: 'academic', source: 'academic_years.name' },
  { key: 'academic.term', label: 'Term', category: 'academic', source: 'academic_terms.name' },
  { key: 'academic.level', label: 'Level', category: 'academic', source: 'academic_levels.name' },
  { key: 'academic.class', label: 'Academic Class', category: 'academic', source: 'classes.name' },
  { key: 'academic.department', label: 'Academic Department', category: 'academic', source: 'sections.name' },
  { key: 'school.name', label: 'School Name', category: 'school', source: 'schools.name' },
  { key: 'school.short_code', label: 'School Code', category: 'school', source: 'schools.short_code' },
  { key: 'school.logo', label: 'School Logo', category: 'school', source: 'schools.logo_path' },
  { key: 'school.address', label: 'Address', category: 'school', source: 'schools.address' },
  { key: 'school.phone', label: 'Phone', category: 'school', source: 'schools.phone' },
  { key: 'school.email', label: 'Email', category: 'school', source: 'schools.email' },
  { key: 'school.website', label: 'Website', category: 'school', source: 'schools.website' },
  { key: 'school.motto', label: 'Motto', category: 'school', source: 'id_card_settings.motto' },
  { key: 'card.number', label: 'Card Number', category: 'card', source: 'student_id_cards.card_number' },
  { key: 'card.issue_date', label: 'Issue Date', category: 'card', source: 'student_id_cards.issue_date' },
  { key: 'card.expiry_date', label: 'Expiry Date', category: 'card', source: 'student_id_cards.expiry_date' },
  { key: 'card.status', label: 'Card Status', category: 'card', source: 'student_id_cards.status' },
  { key: 'card.verification_code', label: 'Verification Code', category: 'card', source: 'student_id_cards.verification_code' },
  { key: 'card.barcode', label: 'Barcode Value', category: 'card', source: 'students.student_code' },
  { key: 'card.qr_code', label: 'QR Payload', category: 'card', source: 'student_id_cards.verification_code' },
  { key: 'date.today', label: 'Today', category: 'date', source: 'system.date' },
  { key: 'date.year', label: 'Calendar Year', category: 'date', source: 'system.year' },
  { key: 'system.generated_at', label: 'Generated At', category: 'system', source: 'system.now' },
]

export function emptyDesign(
  orientation: CardOrientation = 'landscape'
): CardDesign {
  const landscape = orientation === 'landscape'
  return {
    widthMm: landscape ? CR80_WIDTH_MM : CR80_HEIGHT_MM,
    heightMm: landscape ? CR80_HEIGHT_MM : CR80_WIDTH_MM,
    unit: 'mm',
    orientation,
    front: { background: { type: 'solid', value: '#ffffff' } },
    back: { background: { type: 'solid', value: '#ffffff' } },
    elements: [],
  }
}

export function parseDesign(json: string | null | undefined): CardDesign {
  if (!json) return emptyDesign()
  try {
    const parsed = JSON.parse(json) as CardDesign
    if (!parsed || !Array.isArray(parsed.elements)) return emptyDesign()
    return {
      ...emptyDesign(parsed.orientation),
      ...parsed,
      elements: parsed.elements,
    }
  } catch {
    return emptyDesign()
  }
}

export function designHash(design: CardDesign): string {
  return createHash('sha256').update(JSON.stringify(design)).digest('hex').slice(0, 16)
}

export function interpolate(template: string, bindings: BindingMap): string {
  return String(template ?? '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, raw: string) => {
    const key = raw.trim()
    const value = bindings[key]
    return value == null ? '' : String(value)
  })
}

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

export function sampleBindings(): BindingMap {
  return {
    'student.name': 'Olivia Wilson',
    'student.first_name': 'Olivia',
    'student.last_name': 'Wilson',
    'student.student_id': 'IAE-2026-00124',
    'student.gender': 'Female',
    'student.date_of_birth': '2009-04-18',
    'student.photo': DEFAULT_SAMPLE_STUDENT_PHOTO,
    'student.class': 'Form 5A',
    'student.stream': 'A',
    'student.department': 'General',
    'student.admission_year': '2024',
    'student.type': 'STUDENT',
    'student.qr_payload': 'sofia:stu:IAE-2026-00124',
    'staff.name': 'Jean Mbarga',
    'staff.staff_id': 'STF-0042',
    'staff.role': 'Teacher',
    'staff.department': 'Sciences',
    'staff.photo': '',
    'academic.year': '2026/2027',
    'academic.term': 'First Term',
    'academic.level': 'Form 5',
    'academic.class': 'Form 5A',
    'academic.department': 'General',
    'school.name': 'International Academy of Excellence',
    'school.short_code': 'IAE',
    'school.logo': DEFAULT_ACADEMIC_CREST,
    'school.address': 'Yaoundé, Cameroon',
    'school.phone': '+237 222 000 000',
    'school.email': 'admissions@iae.edu',
    'school.website': 'www.iae.edu',
    'school.motto': 'Excellence • Integrity • Future',
    'school.signature': DEFAULT_SAMPLE_SIGNATURE,
    'card.number': 'IAE/ID/2026/00124',
    'card.issue_date': '01 September 2026',
    'card.expiry_date': '31 August 2027',
    'card.status': 'Active',
    'card.verification_code': 'ID-8A72F91C',
    'card.barcode': 'IAE-2026-00124',
    'card.qr_code': 'sofia:v1:ID-8A72F91C',
    'date.today': '06 Sep 2026',
    'date.year': '2026',
    'system.generated_at': '06 Sep 2026 10:42',
  }
}

export function verificationPayload(code: string): string {
  return `sofia:v1:${code}`
}

export function newVerificationCode(): string {
  return `ID-${randomBytes(4).toString('hex').toUpperCase()}`
}

export function academicYearToken(yearName: string | null | undefined): string {
  const match = String(yearName || '').match(/(20\d{2})/)
  if (match) return match[1]
  return String(new Date().getFullYear())
}

export function formatCardNumber(
  config: NumberingConfig,
  sequence: number,
  yearToken: string
): string {
  const sep = config.separator || '/'
  const parts = [config.prefix || 'SCH', 'ID']
  if (config.include_year) parts.push(yearToken)
  parts.push(String(Math.max(1, sequence)).padStart(config.sequence_pad || 5, '0'))
  return parts.join(sep)
}

export function formatJobNumber(sequence: number, yearToken: string): string {
  return `IDJOB-${yearToken}-${String(sequence).padStart(5, '0')}`
}

export function computeExpiry(input: {
  issueDate: string
  mode: ExpiryMode
  months: number
  customDate?: string | null
  yearEnd?: string | null
}): string | null {
  if (input.mode === 'none') return null
  if (input.mode === 'custom' && input.customDate) return input.customDate
  if (input.mode === 'academic_year' && input.yearEnd) return input.yearEnd
  return addMonths(input.issueDate, Math.max(1, input.months || 12))
}

export function cardStatusForDates(
  status: CardStatus,
  expiryDate: string | null,
  today = todayIso()
): CardStatus {
  if (status === 'revoked' || status === 'replaced') return status
  if (expiryDate && expiryDate < today) return 'expired'
  return status
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function toMm(value: number, unit: LengthUnit): number {
  if (unit === 'cm') return value * 10
  if (unit === 'in') return value * 25.4
  return value
}

export function fromMm(mm: number, unit: LengthUnit): number {
  if (unit === 'cm') return mm / 10
  if (unit === 'in') return mm / 25.4
  return mm
}

export const PAPER_MM: Record<Exclude<PaperSize, 'custom'>, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  Letter: { w: 215.9, h: 279.4 },
}

export function printLayout(input: {
  cardW: number
  cardH: number
  paper: PaperSize
  customW?: number
  customH?: number
  marginMm: number
  gapX: number
  gapY: number
  cardsPerRow?: number
}): {
  paperW: number
  paperH: number
  cols: number
  rows: number
  perPage: number
  positions: Array<{ col: number; row: number; x: number; y: number }>
} {
  const paper =
    input.paper === 'custom'
      ? { w: input.customW || 210, h: input.customH || 297 }
      : PAPER_MM[input.paper]
  const margin = Math.max(0, input.marginMm)
  const availW = Math.max(input.cardW, paper.w - margin * 2)
  const availH = Math.max(input.cardH, paper.h - margin * 2)
  const cols = Math.max(
    1,
    input.cardsPerRow ||
      Math.floor((availW + input.gapX) / (input.cardW + input.gapX))
  )
  const rows = Math.max(
    1,
    Math.floor((availH + input.gapY) / (input.cardH + input.gapY))
  )
  const positions: Array<{ col: number; row: number; x: number; y: number }> = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({
        col: c,
        row: r,
        x: margin + c * (input.cardW + input.gapX),
        y: margin + r * (input.cardH + input.gapY),
      })
    }
  }
  return {
    paperW: paper.w,
    paperH: paper.h,
    cols,
    rows,
    perPage: cols * rows,
    positions,
  }
}

export function requiredBindings(design: CardDesign): string[] {
  const keys = new Set<string>()
  for (const el of design.elements) {
    if (el.hidden) continue
    const scan = (value?: string) => {
      if (!value) return
      const re = /\{\{\s*([^}]+)\s*\}\}/g
      let m: RegExpExecArray | null
      while ((m = re.exec(value))) keys.add(m[1].trim())
    }
    scan(el.text)
    scan(el.qrBinding)
    scan(el.barcodeBinding)
    if (el.imageBinding === 'student.photo') keys.add('student.photo')
    if (el.imageBinding === 'school.logo') keys.add('school.logo')
  }
  return Array.from(keys)
}

export function validateStudentForCard(input: {
  student_code: string | null
  photo: string | null
  class_name: string | null
  required: string[]
}): { ready: boolean; missing: string[]; warnings: string[] } {
  const missing: string[] = []
  const warnings: string[] = []
  if (input.required.includes('student.student_id') && !input.student_code?.trim()) {
    missing.push('Student ID')
  }
  if (input.required.includes('student.class') && !input.class_name?.trim()) {
    missing.push('Class')
  }
  if (input.required.includes('student.photo') && !input.photo) {
    warnings.push('Photo')
  }
  return { ready: missing.length === 0, missing, warnings }
}

export function requireStudentCode(studentCode: string | null): string {
  const code = studentCode?.trim()
  if (!code) {
    throw new Error(
      'Student ID is missing. Generate the official student ID before printing a card.'
    )
  }
  return code
}

export function validityWindow(
  generatedOn: string,
  months: number
): { valid_from: string; valid_to: string } {
  const monthsSafe = Math.max(1, months || 12)
  return {
    valid_from: generatedOn,
    valid_to: addMonths(generatedOn, monthsSafe),
  }
}

/** Draft school templates are always removable; active/archived only when unused. */
export function canDeleteTemplate(
  issuedCount: number,
  status?: TemplateStatus
): boolean {
  if (status === 'draft') return true
  return issuedCount === 0
}

export function nextZ(elements: CardElement[], side: CardSide): number {
  const zs = elements.filter((e) => e.side === side).map((e) => e.z)
  return zs.length ? Math.max(...zs) + 1 : 1
}

export function reorderLayer(
  elements: CardElement[],
  id: string,
  direction: 'front' | 'back' | 'forward' | 'backward'
): CardElement[] {
  const target = elements.find((e) => e.id === id)
  if (!target) return elements
  const same = elements.filter((e) => e.side === target.side).sort((a, b) => a.z - b.z)
  const idx = same.findIndex((e) => e.id === id)
  if (direction === 'front') target.z = (same[same.length - 1]?.z ?? 0) + 1
  else if (direction === 'back') target.z = (same[0]?.z ?? 1) - 1
  else if (direction === 'forward' && same[idx + 1]) {
    const swap = same[idx + 1].z
    same[idx + 1].z = target.z
    target.z = swap
  } else if (direction === 'backward' && same[idx - 1]) {
    const swap = same[idx - 1].z
    same[idx - 1].z = target.z
    target.z = swap
  }
  return elements.map((e) => (e.id === id ? { ...target } : e))
}

export function alignElements(
  elements: CardElement[],
  ids: string[],
  align: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
): CardElement[] {
  const selected = elements.filter((e) => ids.includes(e.id))
  if (!selected.length) return elements
  const minX = Math.min(...selected.map((e) => e.x))
  const maxX = Math.max(...selected.map((e) => e.x + e.w))
  const minY = Math.min(...selected.map((e) => e.y))
  const maxY = Math.max(...selected.map((e) => e.y + e.h))
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  return elements.map((e) => {
    if (!ids.includes(e.id)) return e
    const next = { ...e }
    if (align === 'left') next.x = minX
    if (align === 'right') next.x = maxX - e.w
    if (align === 'center') next.x = midX - e.w / 2
    if (align === 'top') next.y = minY
    if (align === 'bottom') next.y = maxY - e.h
    if (align === 'middle') next.y = midY - e.h / 2
    return next
  })
}

export function distributeElements(
  elements: CardElement[],
  ids: string[],
  axis: 'horizontal' | 'vertical'
): CardElement[] {
  const selected = elements
    .filter((e) => ids.includes(e.id))
    .sort((a, b) => (axis === 'horizontal' ? a.x - b.x : a.y - b.y))
  if (selected.length < 3) return elements
  const first = selected[0]
  const last = selected[selected.length - 1]
  const span =
    axis === 'horizontal'
      ? last.x + last.w - first.x
      : last.y + last.h - first.y
  const totalSize = selected.reduce((s, e) => s + (axis === 'horizontal' ? e.w : e.h), 0)
  const gap = (span - totalSize) / (selected.length - 1)
  let cursor = axis === 'horizontal' ? first.x : first.y
  const placed = new Map<string, number>()
  for (const el of selected) {
    placed.set(el.id, cursor)
    cursor += (axis === 'horizontal' ? el.w : el.h) + gap
  }
  return elements.map((e) => {
    const pos = placed.get(e.id)
    if (pos == null) return e
    return axis === 'horizontal' ? { ...e, x: pos } : { ...e, y: pos }
  })
}

export function hasIdCardPermission(
  names: string[],
  needed: string[],
  isAdmin: boolean
): boolean {
  if (isAdmin) return true
  if (names.includes('students.id_cards.manage') && needed.some((n) => n.includes('template') || n.includes('manage'))) {
    return true
  }
  return needed.some((n) => names.includes(n))
}

export function el(
  partial: Omit<CardElement, 'rotation' | 'locked' | 'hidden' | 'opacity'> &
    Partial<Pick<CardElement, 'rotation' | 'locked' | 'hidden' | 'opacity'>>
): CardElement {
  return {
    rotation: 0,
    locked: false,
    hidden: false,
    opacity: 1,
    ...partial,
  }
}
