/**
 * Report card presentation helpers (mirrors main/domain/report-card.ts for the renderer).
 */

export type ReportCardBilingualHeader = {
  fr_lines: string[]
  en_lines: string[]
}

export type ReportCardTemplateSnapshot = {
  version: number
  title_en: string
  title_fr: string
  bilingual_header: ReportCardBilingualHeader
  show_ca: boolean
  show_exam: boolean
  show_coefficient: boolean
  show_weighted: boolean
  show_gce: boolean
  show_subject_remark: boolean
  show_class_average: boolean
  show_grading_scale: boolean
  show_signatures: boolean
  principal_label: string
  parent_label: string
}

export type ReportCardSubjectRow = {
  subject_id: string
  subject_name: string
  ca_score: number | null
  exam_score: number | null
  subject_mark: number | null
  coefficient: number
  weighted_mark: number | null
  grade: string | null
  gce_grade: string | null
  remark: string
}

export type ReportCardGradeLegendItem = {
  grade: string
  remark: string
  range_label: string
  min_score: number
  max_score: number
}

export type ReportCardPayload = {
  schema_version: number
  template: ReportCardTemplateSnapshot
  school: {
    name: string
    motto: string | null
    address: string | null
    phone: string | null
    email: string | null
    website: string | null
    logo_url: string | null
    stamp_url: string | null
    signature_url: string | null
    principal_name: string | null
    principal_title: string | null
  }
  document: {
    header: string
    footer: string
  }
  student: {
    name: string
    student_code: string | null
    date_of_birth: string | null
    gender: string | null
    class_name: string
    department: string | null
  }
  academic: {
    year_name: string | null
    term_name: string | null
  }
  subjects: ReportCardSubjectRow[]
  summary: {
    total_weighted_marks: number | null
    total_coefficients: number | null
    average: number | null
    grade: string | null
    gce_grade: string | null
    position: number | null
    class_size: number | null
    class_average: number | null
    highest_average: number | null
    lowest_average: number | null
    status: string | null
    remark: string | null
  }
  grading_scale: ReportCardGradeLegendItem[]
}

const DEFAULT_HEADER: ReportCardBilingualHeader = {
  fr_lines: [
    'RÉPUBLIQUE DU CAMEROUN',
    'Paix — Travail — Patrie',
    'MINISTÈRE DES ENSEIGNEMENTS SECONDAIRES',
  ],
  en_lines: [
    'REPUBLIC OF CAMEROON',
    'Peace — Work — Fatherland',
    'MINISTRY OF SECONDARY EDUCATION',
  ],
}

function defaultTemplate(): ReportCardTemplateSnapshot {
  return {
    version: 1,
    title_en: 'STUDENT REPORT CARD',
    title_fr: 'BULLETIN DE NOTES',
    bilingual_header: { ...DEFAULT_HEADER },
    show_ca: true,
    show_exam: true,
    show_coefficient: true,
    show_weighted: true,
    show_gce: true,
    show_subject_remark: true,
    show_class_average: true,
    show_grading_scale: true,
    show_signatures: true,
    principal_label: 'Principal / Head of School',
    parent_label: 'Parent / Guardian',
  }
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

/** Normalize new schema payloads and legacy flat payloads from older generations. */
export function normalizeReportCardPayload(
  raw: Record<string, unknown> | null
): ReportCardPayload | null {
  if (!raw) return null

  if (raw.schema_version && raw.template && raw.school && raw.student) {
    return raw as unknown as ReportCardPayload
  }

  // Legacy flat payload
  const subjectsRaw = Array.isArray(raw.subjects) ? raw.subjects : []
  const subjects: ReportCardSubjectRow[] = subjectsRaw.map((row, i) => {
    const r = row as Record<string, unknown>
    const mark = asNumber(r.subject_mark) ?? asNumber(r.total)
    return {
      subject_id: asString(r.subject_id) || `subj-${i}`,
      subject_name: asString(r.subject_name) || '—',
      ca_score: asNumber(r.ca_score),
      exam_score: asNumber(r.exam_score),
      subject_mark: mark,
      coefficient: asNumber(r.coefficient) ?? 1,
      weighted_mark: asNumber(r.weighted_mark),
      grade: asString(r.grade),
      gce_grade: asString(r.gce_grade),
      remark: asString(r.remark) || '',
    }
  })

  const schoolName = asString(raw.school_name) || 'School'
  const tpl = defaultTemplate()
  if (asString(raw.header)) tpl.title_en = asString(raw.header)!

  return {
    schema_version: 0,
    template: tpl,
    school: {
      name: schoolName,
      motto: null,
      address: null,
      phone: null,
      email: null,
      website: null,
      logo_url: null,
      stamp_url: null,
      signature_url: null,
      principal_name: null,
      principal_title: null,
    },
    document: {
      header: asString(raw.header) || tpl.title_en,
      footer: asString(raw.footer) || '',
    },
    student: {
      name: asString(raw.student_name) || '—',
      student_code: asString(raw.student_code),
      date_of_birth: null,
      gender: null,
      class_name: asString(raw.class_name) || '—',
      department: null,
    },
    academic: {
      year_name: asString(raw.year_name),
      term_name: asString(raw.term_name),
    },
    subjects,
    summary: {
      total_weighted_marks:
        asNumber(raw.total_weighted_marks) ?? asNumber(raw.total),
      total_coefficients: asNumber(raw.total_coefficients),
      average: asNumber(raw.average),
      grade: asString(raw.grade),
      gce_grade: null,
      position: asNumber(raw.position),
      class_size: null,
      class_average: null,
      highest_average: null,
      lowest_average: null,
      status: asString(raw.status),
      remark: asString(raw.remark),
    },
    grading_scale: [],
  }
}

export function formatReportScore(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function ordinalPosition(n: number | null | undefined): string {
  if (n == null) return '—'
  const v = Math.floor(n)
  const mod100 = v % 100
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`
  switch (v % 10) {
    case 1:
      return `${v}st`
    case 2:
      return `${v}nd`
    case 3:
      return `${v}rd`
    default:
      return `${v}th`
  }
}

export function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export type ReportCardSetupPreviewInput = {
  schoolName: string
  headerText: string
  footerText: string
  logoUrl: string | null
  stampUrl: string | null
  signatureUrl: string | null
  signatureLabel: string
  showLogo: boolean
  showStamp: boolean
  showSignature: boolean
}

const SAMPLE_GRADING_SCALE: ReportCardGradeLegendItem[] = [
  { grade: 'A', remark: 'Excellent', range_label: '16–20', min_score: 16, max_score: 20 },
  { grade: 'B', remark: 'Very Good', range_label: '14–15.99', min_score: 14, max_score: 15.99 },
  { grade: 'C', remark: 'Good', range_label: '12–13.99', min_score: 12, max_score: 13.99 },
  { grade: 'D', remark: 'Pass', range_label: '10–11.99', min_score: 10, max_score: 11.99 },
  { grade: 'F', remark: 'Fail', range_label: '0–9.99', min_score: 0, max_score: 9.99 },
]

/** Sample payload for Setup → Documents live preview (no real student/results). */
export function buildReportCardSetupPreviewPayload(
  input: ReportCardSetupPreviewInput
): ReportCardPayload {
  const header = input.headerText.trim() || 'STUDENT REPORT CARD'
  const template = defaultTemplate()
  template.title_en = header
  template.principal_label = input.signatureLabel.trim() || template.principal_label
  template.show_signatures = input.showSignature || input.showStamp

  const subjects: ReportCardSubjectRow[] = [
    {
      subject_id: 'preview-math',
      subject_name: 'Mathematics',
      ca_score: 15,
      exam_score: 14,
      subject_mark: 14.4,
      coefficient: 4,
      weighted_mark: 57.6,
      grade: 'B',
      gce_grade: 'B3',
      remark: 'Very Good',
    },
    {
      subject_id: 'preview-eng',
      subject_name: 'English Language',
      ca_score: 16,
      exam_score: 15,
      subject_mark: 15.4,
      coefficient: 4,
      weighted_mark: 61.6,
      grade: 'A',
      gce_grade: 'A2',
      remark: 'Excellent',
    },
    {
      subject_id: 'preview-bio',
      subject_name: 'Biology',
      ca_score: 13,
      exam_score: 12,
      subject_mark: 12.4,
      coefficient: 3,
      weighted_mark: 37.2,
      grade: 'C',
      gce_grade: 'C4',
      remark: 'Good',
    },
  ]

  return {
    schema_version: 1,
    template,
    school: {
      name: input.schoolName.trim() || 'Sample Secondary School',
      motto: 'Excellence Through Knowledge',
      address: '123 Education Avenue, Yaoundé',
      phone: '+237 600 000 000',
      email: 'info@school.example',
      website: 'www.school.example',
      logo_url: input.showLogo ? input.logoUrl : null,
      stamp_url: input.showStamp ? input.stampUrl : null,
      signature_url: input.showSignature ? input.signatureUrl : null,
      principal_name: 'Dr. Jane Principal',
      principal_title: 'Principal',
    },
    document: {
      header,
      footer: input.footerText.trim(),
    },
    student: {
      name: 'Jane Doe',
      student_code: 'STU-2025-0042',
      date_of_birth: '2010-03-15',
      gender: 'F',
      class_name: 'Form 1A',
      department: 'General',
    },
    academic: {
      year_name: '2025/2026',
      term_name: 'First Term',
    },
    subjects,
    summary: {
      total_weighted_marks: 156.4,
      total_coefficients: 11,
      average: 14.22,
      grade: 'B',
      gce_grade: 'B3',
      position: 3,
      class_size: 32,
      class_average: 13.8,
      highest_average: 16.1,
      lowest_average: 9.4,
      status: 'Promoted',
      remark: 'A diligent student with consistent effort.',
    },
    grading_scale: SAMPLE_GRADING_SCALE,
  }
}
