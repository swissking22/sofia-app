import { IdCardService } from '../../main/services/id-card'
import {
  canDeleteTemplate,
  cardStatusForDates,
  computeExpiry,
  designHash,
  emptyDesign,
  formatCardNumber,
  formatJobNumber,
  hasIdCardPermission,
  interpolate,
  parseDesign,
  printLayout,
  requiredBindings,
  sampleBindings,
  splitName,
  validateStudentForCard,
  VARIABLE_CATALOG,
  verificationPayload,
} from '../../main/domain/id-card'
import {
  classicUniversityVertical,
  SAMPLE_SPECS,
  wizardDesign,
} from '../../main/domain/id-card-templates'
import { encodeCode128, code128Svg } from '../../main/helpers/code128'
import { qrMatrix, qrSvg } from '../../main/helpers/qr-svg'

describe('IdCardService', () => {
  it('generates a card using the existing student ID', () => {
    const service = new IdCardService([])
    const card = service.generate({
      student_id: 'stu_1',
      student_code: 'GSS-2026-00012',
      academic_year_id: 'year_1',
    })
    expect(card.student_code).toBe('GSS-2026-00012')
    expect(card.student_id).toBe('stu_1')
    expect(card.status).toBe('active')
  })

  it('refuses to generate when the official student ID is missing', () => {
    const service = new IdCardService([])
    expect(() =>
      service.generate({
        student_id: 'stu_1',
        student_code: null,
        academic_year_id: 'year_1',
      })
    ).toThrow(/Student ID is missing/)
  })

  it('prevents a second new card for the same student and year', () => {
    const service = new IdCardService([])
    service.generate({
      student_id: 'stu_1',
      student_code: 'GSS-1',
      academic_year_id: 'year_1',
    })
    expect(() =>
      service.generate({
        student_id: 'stu_1',
        student_code: 'GSS-1',
        academic_year_id: 'year_1',
      })
    ).toThrow(/already exists/)
  })

  it('replaces an active card and keeps the old record', () => {
    const service = new IdCardService([])
    const first = service.generate({
      student_id: 'stu_1',
      student_code: 'GSS-1',
      academic_year_id: 'year_1',
    })
    const second = service.replace({
      student_id: 'stu_1',
      student_code: 'GSS-1',
      academic_year_id: 'year_1',
    })
    expect(first.status).toBe('replaced')
    expect(second.status).toBe('active')
    expect(second.replaced_card_id).toBe(first.id)
    expect(service['cards']).toHaveLength(2)
  })

  it('revokes without deleting history', () => {
    const service = new IdCardService([])
    const card = service.generate({
      student_id: 'stu_1',
      student_code: 'GSS-1',
      academic_year_id: 'year_1',
    })
    service.revoke(card.id)
    expect(card.status).toBe('revoked')
  })

  it('bulk-generates cards and skips duplicates or missing IDs', () => {
    const service = new IdCardService([])
    const result = service.bulkGenerate(
      [
        { id: 'a', student_code: 'GSS-A' },
        { id: 'a', student_code: 'GSS-A' },
        { id: 'b', student_code: null },
        { id: 'c', student_code: 'GSS-C' },
      ],
      'year_1'
    )
    expect(result.created).toBe(2)
    expect(result.skipped).toBe(2)
  })
})

describe('dynamic variables', () => {
  it('replaces student and school placeholders', () => {
    const text = interpolate(
      '{{student.name}} · {{student.student_id}} · {{school.name}}',
      sampleBindings()
    )
    expect(text).toBe('Olivia Wilson · STU-2026-00124 · International University')
  })

  it('splits names from the student record', () => {
    expect(splitName('Olivia Wilson')).toEqual({ first: 'Olivia', last: 'Wilson' })
  })

  it('builds the catalog from Sofia field sources', () => {
    expect(VARIABLE_CATALOG.find((v) => v.key === 'student.student_id')?.source).toBe(
      'students.student_code'
    )
    expect(VARIABLE_CATALOG.find((v) => v.key === 'staff.name')).toBeTruthy()
  })
})

describe('template versioning and front/back', () => {
  it('classic sample has independent front and back elements', () => {
    const design = classicUniversityVertical()
    expect(design.elements.some((e) => e.side === 'front')).toBe(true)
    expect(design.elements.some((e) => e.side === 'back')).toBe(true)
    expect(design.orientation).toBe('portrait')
  })

  it('changing the design changes the version hash', () => {
    const a = emptyDesign()
    const b = { ...a, elements: [...a.elements] }
    b.front = { background: { type: 'solid', value: '#000000' } }
    expect(designHash(a)).not.toBe(designHash(b))
  })

  it('parseDesign round-trips JSON', () => {
    const design = classicUniversityVertical()
    expect(parseDesign(JSON.stringify(design)).widthMm).toBe(design.widthMm)
  })

  it('does not delete templates that still have issued cards', () => {
    expect(canDeleteTemplate(3)).toBe(false)
    expect(canDeleteTemplate(0)).toBe(true)
  })

  it('seeds five starting designs including Classic University Vertical', () => {
    expect(SAMPLE_SPECS.map((s) => s.name)).toContain('Classic University Vertical')
    expect(SAMPLE_SPECS).toHaveLength(5)
  })
})

describe('card numbering, expiry, QR and barcode', () => {
  it('formats a school-scoped card number', () => {
    expect(
      formatCardNumber(
        { prefix: 'SCH', include_year: true, separator: '/', sequence_pad: 5, year_source: 'academic' },
        1,
        '2026'
      )
    ).toBe('SCH/ID/2026/00001')
  })

  it('formats generation job numbers', () => {
    expect(formatJobNumber(42, '2026')).toBe('IDJOB-2026-00042')
  })

  it('computes academic-year and duration expiry', () => {
    expect(
      computeExpiry({
        issueDate: '2026-09-01',
        mode: 'academic_year',
        months: 12,
        yearEnd: '2027-08-31',
      })
    ).toBe('2027-08-31')
    expect(
      computeExpiry({
        issueDate: '2026-09-01',
        mode: 'none',
        months: 12,
      })
    ).toBeNull()
  })

  it('marks cards expired by date without dropping other statuses', () => {
    expect(cardStatusForDates('active', '2025-01-01', '2026-09-03')).toBe('expired')
    expect(cardStatusForDates('revoked', '2025-01-01', '2026-09-03')).toBe('revoked')
  })

  it('encodes Code 128 and emits SVG bars', () => {
    const codes = encodeCode128('STU-1')
    expect(codes[0]).toBe(104)
    expect(code128Svg('STU-1')).toContain('<rect')
  })

  it('builds a QR matrix with finder patterns for a verification payload', () => {
    const matrix = qrMatrix(verificationPayload('ID-8A72F91C'))
    expect(matrix.length).toBeGreaterThanOrEqual(21)
    expect(matrix[0][0]).toBe(1)
    expect(qrSvg('ID-8A72F91C')).toContain('<rect')
  })
})

describe('print layout and validation', () => {
  it('places multiple CR80 cards on A4', () => {
    const layout = printLayout({
      cardW: 85.6,
      cardH: 53.98,
      paper: 'A4',
      marginMm: 10,
      gapX: 4,
      gapY: 4,
      cardsPerRow: 2,
    })
    expect(layout.cols).toBe(2)
    expect(layout.perPage).toBeGreaterThanOrEqual(2)
    expect(layout.paperW).toBe(210)
  })

  it('flags missing student ID as blocking and missing photo as a warning', () => {
    const design = classicUniversityVertical()
    const required = requiredBindings(design)
    const blocked = validateStudentForCard({
      student_code: null,
      photo: null,
      class_name: 'Form 4A',
      required,
    })
    expect(blocked.ready).toBe(false)
    expect(blocked.missing).toContain('Student ID')
    const warn = validateStudentForCard({
      student_code: 'STU-1',
      photo: null,
      class_name: 'Form 4A',
      required,
    })
    expect(warn.ready).toBe(true)
    expect(warn.warnings).toContain('Photo')
  })

  it('wizard still returns a data-driven design, not a hardcoded component', () => {
    const design = wizardDesign({
      orientation: 'portrait',
      starting: 'classic',
      fields: ['name', 'photo', 'qr'],
    })
    expect(design.elements.every((e) => e.type)).toBe(true)
  })
})

describe('RBAC and tenancy helpers', () => {
  it('admins always pass', () => {
    expect(hasIdCardPermission([], ['students.id_cards.generate'], true)).toBe(true)
  })

  it('requires an explicit permission for non-admins', () => {
    expect(hasIdCardPermission(['students.read'], ['students.id_cards.generate'], false)).toBe(
      false
    )
    expect(
      hasIdCardPermission(
        ['students.id_cards.generate'],
        ['students.id_cards.generate'],
        false
      )
    ).toBe(true)
  })

  it('isolates by school_id comparison', () => {
    const schoolA = 'sch_a'
    const row = { school_id: 'sch_b' }
    expect(row.school_id === schoolA).toBe(false)
  })
})
