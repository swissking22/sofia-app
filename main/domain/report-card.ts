/**
 * Official student report card — presentation model & template snapshot.
 * Academic marks/grades come from the results engine; this module only assembles display data.
 */

import {
  CAMEROON_20_BANDS,
  GCE_STYLE_BANDS,
  gradeForScore,
  type GradeBandConfig,
} from './results-calculation'

export const REPORT_CARD_TEMPLATE_VERSION = 1

export type ReportCardBilingualHeader = {
  fr_lines: string[]
  en_lines: string[]
}

/** Presentation options snapshotted into each generated card (historical reproducibility). */
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

export const DEFAULT_BILINGUAL_HEADER: ReportCardBilingualHeader = {
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

export function defaultReportCardTemplate(
  partial?: Partial<ReportCardTemplateSnapshot>
): ReportCardTemplateSnapshot {
  const { bilingual_header: headerOverride, ...rest } = partial ?? {}
  return {
    version: REPORT_CARD_TEMPLATE_VERSION,
    title_en: 'STUDENT REPORT CARD',
    title_fr: 'BULLETIN DE NOTES',
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
    ...rest,
    bilingual_header: {
      ...DEFAULT_BILINGUAL_HEADER,
      ...(headerOverride ?? {}),
    },
  }
}

/**
 * Optional school overrides stored in document_templates.body_text as JSON:
 * { "sofia_report_card": { "title_en": "...", "bilingual_header": { ... } } }
 */
export function parseReportCardTemplateOverrides(
  bodyText: string | null | undefined
): Partial<ReportCardTemplateSnapshot> {
  const raw = String(bodyText || '').trim()
  if (!raw.startsWith('{')) return {}
  try {
    const parsed = JSON.parse(raw) as {
      sofia_report_card?: Partial<ReportCardTemplateSnapshot>
    }
    if (!parsed?.sofia_report_card || typeof parsed.sofia_report_card !== 'object') {
      return {}
    }
    return parsed.sofia_report_card
  } catch {
    return {}
  }
}

export function formatGradeRange(min: number, max: number): string {
  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n % 1) < 0.01 ? 0 : 2)
  return `${fmt(min)}–${fmt(max)}`
}

export function gradingScaleLegend(
  bands: GradeBandConfig[]
): ReportCardGradeLegendItem[] {
  return [...bands]
    .sort((a, b) => a.order - b.order || b.min_score - a.min_score)
    .map((b) => ({
      grade: b.grade,
      remark: b.remark,
      range_label: formatGradeRange(b.min_score, b.max_score),
      min_score: b.min_score,
      max_score: b.max_score,
    }))
}

/** Map a /20 subject mark to GCE-style grade via percentage conversion. */
export function gceGradeForMark20(
  mark: number | null | undefined,
  gceBands: GradeBandConfig[] = GCE_STYLE_BANDS
): string | null {
  if (mark == null || Number.isNaN(mark)) return null
  const percent = Math.max(0, Math.min(100, (mark / 20) * 100))
  return gradeForScore(percent, gceBands)?.grade ?? null
}

export function extractGradingFromSnapshot(
  snapshotJson: string | null | undefined
): GradeBandConfig[] | null {
  if (!snapshotJson) return null
  try {
    const snap = JSON.parse(snapshotJson) as {
      config?: { grading?: GradeBandConfig[] }
      grading?: GradeBandConfig[]
    }
    const bands = snap.config?.grading ?? snap.grading
    if (Array.isArray(bands) && bands.length > 0) return bands
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Subjects with no recorded CA, exam, or subject mark are treated as not offered
 * (aligned with Sofia missing/exclude policies — blank ≠ zero).
 */
export function isOfferedSubjectRow(row: {
  ca_score?: number | null
  exam_score?: number | null
  subject_mark?: number | null
  total?: number | null
}): boolean {
  return (
    row.ca_score != null ||
    row.exam_score != null ||
    row.subject_mark != null ||
    row.total != null
  )
}

export function computeClassStats(
  averages: Array<number | null | undefined>
): {
  class_size: number
  class_average: number | null
  highest_average: number | null
  lowest_average: number | null
} {
  const values = averages.filter(
    (v): v is number => typeof v === 'number' && !Number.isNaN(v)
  )
  if (values.length === 0) {
    return {
      class_size: 0,
      class_average: null,
      highest_average: null,
      lowest_average: null,
    }
  }
  const sum = values.reduce((a, b) => a + b, 0)
  return {
    class_size: values.length,
    class_average: Math.round((sum / values.length) * 100) / 100,
    highest_average: Math.max(...values),
    lowest_average: Math.min(...values),
  }
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

export function formatReportScore(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export { formatDisplayDate } from './date-format'

export { CAMEROON_20_BANDS, GCE_STYLE_BANDS }
