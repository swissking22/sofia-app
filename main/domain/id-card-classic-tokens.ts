/**
 * Design tokens for Template 1 — THE HERITAGE / CLASSIC (portrait CR80).
 * Physical units are millimetres. Keep aspect ratio fixed at CR80 portrait.
 *
 * Accent: Sofia Blue (#1580CF). App chrome uses indigo (--sofia-primary);
 * ID cards use this dedicated blue per Template 1 brand direction.
 */

import { CR80_HEIGHT_MM, CR80_WIDTH_MM } from './id-card'

/** Finished portrait card (CR80 rotated): 53.98 × 85.60 mm. */
export const CLASSIC_CARD = {
  widthMm: CR80_HEIGHT_MM, // 53.98
  heightMm: CR80_WIDTH_MM, // 85.60
  /** CR80 long × short (physical plastic). */
  finishedLongMm: CR80_WIDTH_MM, // 85.60
  finishedShortMm: CR80_HEIGHT_MM, // 53.98
  bleedMm: 2,
  safeMm: 3,
  cornerRadiusMm: 3,
} as const

export const ID_CARD_NAVY = '#0F1C2E'
export const ID_CARD_NAVY_DEEP = '#0A1420'
/** Sofia Blue — primary Template 1 accent (not app indigo). */
export const ID_CARD_BLUE = '#1580CF'
export const ID_CARD_BLUE_LIGHT = '#3B9BDB'
export const ID_CARD_WHITE = '#FFFFFF'
export const ID_CARD_MUTED = '#64748B'
export const ID_CARD_BORDER = '#E2E8F0'
export const ID_CARD_INK = '#0F172A'
export const ID_CARD_FIELD_BG = '#F8FAFC'

/** Inter stack — Inter when bundled, Segoe UI metrics as offline fallback. */
export const ID_CARD_FONT =
  "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif"

export const CLASSIC_SPACE = {
  margin: CLASSIC_CARD.safeMm,
  gapXs: 0.8,
  gapSm: 1.4,
  gapMd: 2.2,
  gapLg: 3.2,
  headerH: 17,
  footerH: 10,
  /** Square 1:1 student photo (mm). */
  photoW: 24,
  photoH: 24,
  /** Clear gap between last content and footer wave. */
  contentGapAboveFooter: 3.5,
  /** Back QR only — no front barcode. */
  qrSize: 20,
  borderThin: 0.25,
  borderPhoto: 0.45,
  labelLetterSpacing: 0.55,
  typeLetterSpacing: 1.1,
  fieldRowH: 5.5,
  identityBlockH: 9.5,
} as const

/** Y where footer decoration begins (front/back wave). */
export function classicFooterTopY(): number {
  return CLASSIC_CARD.heightMm - CLASSIC_SPACE.footerH - 1
}

/** Max Y for content bottom edge (above footer + spacing). */
export function classicContentBottomLimit(): number {
  return classicFooterTopY() - CLASSIC_SPACE.contentGapAboveFooter
}

export const CLASSIC_TYPE = {
  schoolName: { size: 8.5, weight: 700 },
  motto: { size: 5.5, weight: 500 },
  studentName: { size: 11, weight: 700 },
  studentNameCompact: { size: 9, weight: 700 },
  studentType: { size: 6, weight: 500 },
  fieldLabel: { size: 5.5, weight: 500 },
  fieldValue: { size: 7.5, weight: 600 },
  footer: { size: 5.5, weight: 400 },
  scanLabel: { size: 5.5, weight: 500 },
} as const

/** Content box inside safe margins. */
export function classicContentBox() {
  const m = CLASSIC_SPACE.margin
  return {
    x: m,
    y: m,
    w: CLASSIC_CARD.widthMm - m * 2,
    h: CLASSIC_CARD.heightMm - m * 2,
  }
}

/**
 * SVG path for a bottom wave (viewBox matches element w×h in mm units).
 * Navy / Sofia Blue curves — vector, print-stable.
 */
export function classicWavePath(width: number, height: number, phase = 0): string {
  const mid = height * 0.42
  const amp = height * 0.28
  const y1 = mid + Math.sin(phase) * amp * 0.15
  const y2 = mid - amp * 0.35
  const y3 = mid + amp * 0.25
  return [
    `M 0 ${y1}`,
    `C ${width * 0.28} ${y2}, ${width * 0.55} ${y3}, ${width} ${mid}`,
    `L ${width} ${height}`,
    `L 0 ${height}`,
    'Z',
  ].join(' ')
}

export function classicHeaderWavePath(width: number, height: number): string {
  const dip = height * 0.72
  return [
    'M 0 0',
    `L ${width} 0`,
    `L ${width} ${dip * 0.55}`,
    `C ${width * 0.72} ${height}, ${width * 0.35} ${height * 0.92}, 0 ${dip}`,
    'Z',
  ].join(' ')
}

/**
 * Deterministic offline QR payload for Template 1.
 * Encodes immutable student_code only (no PII).
 * Future scanner: strip optional prefix, look up students.student_code.
 */
export const STUDENT_QR_PREFIX = 'sofia:stu:'

export function studentQrPayload(studentCode: string): string {
  const code = studentCode.trim()
  if (!code) return ''
  return `${STUDENT_QR_PREFIX}${code}`
}

/** Extract student_code from a scanned QR / keyboard-wedge string. */
export function parseStudentQrPayload(raw: string): string | null {
  const value = String(raw || '').trim()
  if (!value) return null
  if (value.startsWith(STUDENT_QR_PREFIX)) {
    const code = value.slice(STUDENT_QR_PREFIX.length).trim()
    return code || null
  }
  // Bare student_code (e.g. IAE-2026-00124) for simple scanners
  if (/^[A-Za-z0-9][A-Za-z0-9._/-]{2,63}$/.test(value) && !value.startsWith('sofia:v1:')) {
    return value
  }
  return null
}
