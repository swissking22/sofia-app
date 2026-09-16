/**
 * Template 1 — THE HERITAGE / CLASSIC
 * Portrait CR80: navy + Sofia Blue curves, Inter typography,
 * 24×24 mm (1:1) photo, QR on back only (immutable student_code — no barcode).
 * Front text stays clear of footer waves (≥ contentGapAboveFooter).
 */

import { el, type CardDesign, type CardElement } from './id-card'
import {
  CLASSIC_CARD,
  CLASSIC_SPACE,
  CLASSIC_TYPE,
  ID_CARD_BLUE,
  ID_CARD_BLUE_LIGHT,
  ID_CARD_BORDER,
  ID_CARD_FIELD_BG,
  ID_CARD_FONT,
  ID_CARD_INK,
  ID_CARD_MUTED,
  ID_CARD_NAVY,
  ID_CARD_NAVY_DEEP,
  ID_CARD_WHITE,
  classicContentBottomLimit,
  classicContentBox,
  classicHeaderWavePath,
  classicWavePath,
} from './id-card-classic-tokens'

function pathShape(
  partial: Omit<CardElement, 'type' | 'rotation' | 'locked' | 'hidden' | 'opacity' | 'shape'> &
    Partial<Pick<CardElement, 'rotation' | 'locked' | 'hidden' | 'opacity'>> & {
      pathD: string
      fill: string
    }
): CardElement {
  return el({
    ...partial,
    type: 'shape',
    shape: 'path',
  })
}

function textEl(
  partial: Omit<CardElement, 'type' | 'rotation' | 'locked' | 'hidden' | 'opacity'> &
    Partial<Pick<CardElement, 'rotation' | 'locked' | 'hidden' | 'opacity'>>
): CardElement {
  return el({
    fontFamily: ID_CARD_FONT,
    ...partial,
    type: 'text',
  })
}

/** IdCardHeader — school logo, name, motto on navy/blue curves. */
export function classicIdCardHeader(side: 'front' | 'back' = 'front'): CardElement[] {
  const W = CLASSIC_CARD.widthMm
  const S = CLASSIC_SPACE
  const prefix = side === 'front' ? 'c1f' : 'c1b'
  return [
    pathShape({
      id: `${prefix}_hdr_navy`,
      side,
      x: 0,
      y: 0,
      w: W,
      h: S.headerH + 2,
      z: 1,
      fill: ID_CARD_NAVY,
      pathD: classicHeaderWavePath(W, S.headerH + 2),
    }),
    pathShape({
      id: `${prefix}_hdr_blue`,
      side,
      x: 0,
      y: S.headerH - 1.2,
      w: W,
      h: 3.2,
      z: 2,
      fill: ID_CARD_BLUE,
      pathD: classicWavePath(W, 3.2, 0.4),
      opacity: 0.95,
    }),
    el({
      id: `${prefix}_logo`,
      type: 'image',
      side,
      x: S.margin,
      y: 2.4,
      w: 9,
      h: 9,
      z: 5,
      imageBinding: 'school.logo',
      objectFit: 'contain',
      crop: 'rounded',
      borderRadius: 1,
      borderWidth: 0.2,
      borderColor: ID_CARD_WHITE,
    }),
    textEl({
      id: `${prefix}_school_name`,
      side,
      x: S.margin + 10.5,
      y: 2.6,
      w: W - S.margin * 2 - 10.5,
      h: 7,
      z: 5,
      text: '{{school.name}}',
      color: ID_CARD_WHITE,
      fontSize: CLASSIC_TYPE.schoolName.size,
      fontWeight: CLASSIC_TYPE.schoolName.weight,
      align: 'left',
      lineHeight: 1.15,
    }),
    textEl({
      id: `${prefix}_motto`,
      side,
      x: S.margin + 10.5,
      y: 10,
      w: W - S.margin * 2 - 10.5,
      h: 3.5,
      z: 5,
      text: '{{school.motto}}',
      color: ID_CARD_BLUE_LIGHT,
      fontSize: CLASSIC_TYPE.motto.size,
      fontWeight: CLASSIC_TYPE.motto.weight,
      align: 'left',
      letterSpacing: 0.3,
    }),
  ]
}

/** StudentPhoto — fixed square 1:1 frame (24×24 mm). */
export function classicStudentPhoto(y: number): CardElement[] {
  const W = CLASSIC_CARD.widthMm
  const S = CLASSIC_SPACE
  const x = (W - S.photoW) / 2
  return [
    el({
      id: 'c1f_photo_frame',
      type: 'shape',
      side: 'front',
      shape: 'roundRect',
      x: x - 0.6,
      y: y - 0.6,
      w: S.photoW + 1.2,
      h: S.photoH + 1.2,
      z: 4,
      fill: ID_CARD_WHITE,
      stroke: ID_CARD_BLUE,
      strokeWidth: S.borderPhoto,
      borderRadius: 1.2,
    }),
    el({
      id: 'c1f_photo',
      type: 'image',
      side: 'front',
      x,
      y,
      w: S.photoW,
      h: S.photoH,
      z: 5,
      imageBinding: 'student.photo',
      objectFit: 'cover',
      crop: 'rounded',
      borderRadius: 0.8,
    }),
  ]
}

/** StudentIdentity — name + STUDENT type. */
export function classicStudentIdentity(y: number): CardElement[] {
  const box = classicContentBox()
  const S = CLASSIC_SPACE
  return [
    textEl({
      id: 'c1f_name',
      side: 'front',
      x: box.x,
      y,
      w: box.w,
      h: 6.5,
      z: 6,
      text: '{{student.name}}',
      color: ID_CARD_INK,
      fontSize: CLASSIC_TYPE.studentName.size,
      fontWeight: CLASSIC_TYPE.studentName.weight,
      align: 'center',
      lineHeight: 1.1,
    }),
    textEl({
      id: 'c1f_type',
      side: 'front',
      x: box.x,
      y: y + 6.2,
      w: box.w,
      h: 2.8,
      z: 6,
      text: '{{student.type}}',
      color: ID_CARD_BLUE,
      fontSize: CLASSIC_TYPE.studentType.size,
      fontWeight: CLASSIC_TYPE.studentType.weight,
      align: 'center',
      textTransform: 'uppercase',
      letterSpacing: S.typeLetterSpacing,
    }),
  ]
}

function fieldPair(
  id: string,
  y: number,
  label: string,
  valueTemplate: string
): CardElement[] {
  const box = classicContentBox()
  const S = CLASSIC_SPACE
  const colW = (box.w - S.gapSm) / 2
  return [
    textEl({
      id: `${id}_lbl`,
      side: 'front',
      x: box.x,
      y,
      w: colW,
      h: 2.2,
      z: 6,
      text: label,
      color: ID_CARD_MUTED,
      fontSize: CLASSIC_TYPE.fieldLabel.size,
      fontWeight: CLASSIC_TYPE.fieldLabel.weight,
      textTransform: 'uppercase',
      letterSpacing: S.labelLetterSpacing,
    }),
    textEl({
      id: `${id}_val`,
      side: 'front',
      x: box.x,
      y: y + 2.1,
      w: colW,
      h: 3.0,
      z: 6,
      text: valueTemplate,
      color: ID_CARD_INK,
      fontSize: CLASSIC_TYPE.fieldValue.size,
      fontWeight: CLASSIC_TYPE.fieldValue.weight,
    }),
  ]
}

/** StudentField grid — two columns. */
export function classicStudentFields(startY: number): CardElement[] {
  const rowH = CLASSIC_SPACE.fieldRowH
  const box = classicContentBox()
  const S = CLASSIC_SPACE
  const colW = (box.w - S.gapSm) / 2
  const xRight = box.x + colW + S.gapSm

  const left = (id: string, y: number, label: string, value: string) =>
    fieldPair(id, y, label, value)

  const right = (id: string, y: number, label: string, value: string): CardElement[] => [
    textEl({
      id: `${id}_lbl`,
      side: 'front',
      x: xRight,
      y,
      w: colW,
      h: 2.2,
      z: 6,
      text: label,
      color: ID_CARD_MUTED,
      fontSize: CLASSIC_TYPE.fieldLabel.size,
      fontWeight: CLASSIC_TYPE.fieldLabel.weight,
      textTransform: 'uppercase',
      letterSpacing: S.labelLetterSpacing,
    }),
    textEl({
      id: `${id}_val`,
      side: 'front',
      x: xRight,
      y: y + 2.1,
      w: colW,
      h: 3.0,
      z: 6,
      text: value,
      color: ID_CARD_INK,
      fontSize: CLASSIC_TYPE.fieldValue.size,
      fontWeight: CLASSIC_TYPE.fieldValue.weight,
    }),
  ]

  return [
    ...left('c1f_id', startY, 'Student ID', '{{student.student_id}}'),
    ...right('c1f_class', startY, 'Class', '{{student.class}}'),
    ...left('c1f_dept', startY + rowH, 'Department', '{{student.department}}'),
    ...right('c1f_dob', startY + rowH, 'Date of Birth', '{{student.date_of_birth}}'),
    ...left('c1f_adm', startY + rowH * 2, 'Admission Year', '{{student.admission_year}}'),
    ...right('c1f_level', startY + rowH * 2, 'Level', '{{academic.level}}'),
  ]
}

export function classicFrontFooter(): CardElement[] {
  const W = CLASSIC_CARD.widthMm
  const H = CLASSIC_CARD.heightMm
  const S = CLASSIC_SPACE
  return [
    pathShape({
      id: 'c1f_foot_blue',
      side: 'front',
      x: 0,
      y: H - S.footerH - 1,
      w: W,
      h: S.footerH + 1,
      z: 2,
      fill: ID_CARD_BLUE,
      pathD: classicWavePath(W, S.footerH + 1, 1.2),
    }),
    pathShape({
      id: 'c1f_foot_navy',
      side: 'front',
      x: 0,
      y: H - S.footerH + 2.5,
      w: W,
      h: S.footerH,
      z: 3,
      fill: ID_CARD_NAVY_DEEP,
      pathD: classicWavePath(W, S.footerH, 2.1),
    }),
  ]
}

/**
 * StudentQrCode — back only.
 * Payload: sofia:stu:{student_code} via {{student.qr_payload}} (deterministic, no PII).
 */
export function classicStudentQrCode(): CardElement[] {
  const W = CLASSIC_CARD.widthMm
  const S = CLASSIC_SPACE
  const box = classicContentBox()
  const qrX = (W - S.qrSize) / 2
  const qrY = 48
  return [
    el({
      id: 'c1b_qr_frame',
      type: 'shape',
      side: 'back',
      shape: 'roundRect',
      x: qrX - 2,
      y: qrY - 2,
      w: S.qrSize + 4,
      h: S.qrSize + 6,
      z: 4,
      fill: ID_CARD_WHITE,
      stroke: ID_CARD_BORDER,
      strokeWidth: S.borderThin,
      borderRadius: 1,
    }),
    el({
      id: 'c1b_qr',
      type: 'qr',
      side: 'back',
      x: qrX,
      y: qrY,
      w: S.qrSize,
      h: S.qrSize,
      z: 6,
      qrBinding: '{{student.qr_payload}}',
    }),
    textEl({
      id: 'c1b_scan',
      side: 'back',
      x: box.x,
      y: qrY + S.qrSize + 0.8,
      w: box.w,
      h: 2.6,
      z: 6,
      text: 'SCAN TO VERIFY',
      color: ID_CARD_MUTED,
      fontSize: CLASSIC_TYPE.scanLabel.size,
      fontWeight: CLASSIC_TYPE.scanLabel.weight,
      align: 'center',
      textTransform: 'uppercase',
      letterSpacing: S.labelLetterSpacing,
    }),
  ]
}

/** IdCardBack — property notice, contacts, QR, signature, branded footer. */
export function classicIdCardBack(): CardElement[] {
  const W = CLASSIC_CARD.widthMm
  const H = CLASSIC_CARD.heightMm
  const S = CLASSIC_SPACE
  const box = classicContentBox()

  return [
    ...classicIdCardHeader('back'),
    el({
      id: 'c1b_panel',
      type: 'shape',
      side: 'back',
      shape: 'roundRect',
      x: box.x,
      y: 22,
      w: box.w,
      h: 22,
      z: 3,
      fill: ID_CARD_FIELD_BG,
      stroke: ID_CARD_BORDER,
      strokeWidth: S.borderThin,
      borderRadius: 1.2,
    }),
    textEl({
      id: 'c1b_property',
      side: 'back',
      x: box.x + 1.2,
      y: 23.2,
      w: box.w - 2.4,
      h: 8,
      z: 5,
      text: 'THIS CARD REMAINS THE PROPERTY OF {{school.name}}.',
      color: ID_CARD_INK,
      fontSize: CLASSIC_TYPE.footer.size + 0.5,
      fontWeight: 600,
      align: 'center',
      lineHeight: 1.25,
      textTransform: 'uppercase',
      letterSpacing: 0.2,
    }),
    textEl({
      id: 'c1b_return',
      side: 'back',
      x: box.x + 1.2,
      y: 31.5,
      w: box.w - 2.4,
      h: 4,
      z: 5,
      text: 'If found, please return to the school.',
      color: ID_CARD_MUTED,
      fontSize: CLASSIC_TYPE.footer.size,
      fontWeight: 400,
      align: 'center',
    }),
    textEl({
      id: 'c1b_address',
      side: 'back',
      x: box.x + 1.2,
      y: 36,
      w: box.w - 2.4,
      h: 3,
      z: 5,
      text: '{{school.address}}',
      color: ID_CARD_INK,
      fontSize: CLASSIC_TYPE.footer.size,
      fontWeight: 500,
      align: 'center',
    }),
    textEl({
      id: 'c1b_phone',
      side: 'back',
      x: box.x + 1.2,
      y: 39,
      w: box.w - 2.4,
      h: 2.8,
      z: 5,
      text: '{{school.phone}}',
      color: ID_CARD_INK,
      fontSize: CLASSIC_TYPE.footer.size,
      fontWeight: 500,
      align: 'center',
    }),
    textEl({
      id: 'c1b_email',
      side: 'back',
      x: box.x + 1.2,
      y: 41.5,
      w: box.w - 2.4,
      h: 2.8,
      z: 5,
      text: '{{school.email}}',
      color: ID_CARD_INK,
      fontSize: CLASSIC_TYPE.footer.size,
      fontWeight: 500,
      align: 'center',
    }),
    ...classicStudentQrCode(),
    textEl({
      id: 'c1b_sig_label',
      side: 'back',
      x: box.x,
      y: 74,
      w: box.w,
      h: 2.4,
      z: 5,
      text: 'AUTHORIZED SIGNATURE',
      color: ID_CARD_MUTED,
      fontSize: CLASSIC_TYPE.fieldLabel.size,
      fontWeight: CLASSIC_TYPE.fieldLabel.weight,
      align: 'center',
      textTransform: 'uppercase',
      letterSpacing: S.labelLetterSpacing,
    }),
    el({
      id: 'c1b_sig_line',
      type: 'shape',
      side: 'back',
      shape: 'line',
      x: box.x + 6,
      y: 78.5,
      w: box.w - 12,
      h: 0.25,
      z: 5,
      fill: ID_CARD_BORDER,
      stroke: ID_CARD_BORDER,
    }),
    el({
      id: 'c1b_signature',
      type: 'image',
      side: 'back',
      x: (W - 18) / 2,
      y: 72.5,
      w: 18,
      h: 6,
      z: 6,
      imageBinding: 'school.signature',
      objectFit: 'contain',
    }),
    pathShape({
      id: 'c1b_foot_blue',
      side: 'back',
      x: 0,
      y: H - S.footerH - 1,
      w: W,
      h: S.footerH + 1,
      z: 2,
      fill: ID_CARD_BLUE,
      pathD: classicWavePath(W, S.footerH + 1, 0.8),
    }),
    pathShape({
      id: 'c1b_foot_navy',
      side: 'back',
      x: 0,
      y: H - S.footerH + 2.5,
      w: W,
      h: S.footerH,
      z: 3,
      fill: ID_CARD_NAVY,
      pathD: classicWavePath(W, S.footerH, 1.6),
    }),
  ]
}

/** Full Template 1 design (portrait CR80). No front barcode. */
export function classicHeritageDesign(): CardDesign {
  const S = CLASSIC_SPACE
  const contentBottom = classicContentBottomLimit()
  const fieldsBlockH = S.fieldRowH * 2 + 5.1
  const photoY = S.headerH + 2.8
  const identityY = photoY + S.photoH + S.gapMd
  // Keep fields above footer decoration with explicit spacing.
  let fieldsY = identityY + S.identityBlockH
  const fieldsBottom = fieldsY + fieldsBlockH
  if (fieldsBottom > contentBottom) {
    fieldsY = Math.max(identityY + S.gapLg, contentBottom - fieldsBlockH)
  }

  return {
    widthMm: CLASSIC_CARD.widthMm,
    heightMm: CLASSIC_CARD.heightMm,
    unit: 'mm',
    orientation: 'portrait',
    front: { background: { type: 'solid', value: ID_CARD_WHITE } },
    back: { background: { type: 'solid', value: ID_CARD_WHITE } },
    elements: [
      ...classicIdCardHeader('front'),
      ...classicStudentPhoto(photoY),
      ...classicStudentIdentity(identityY),
      ...classicStudentFields(fieldsY),
      ...classicFrontFooter(),
      ...classicIdCardBack(),
    ],
  }
}
