import {
  DocumentGenerationService,
  DocumentNumberService,
  DocumentTemplateService,
} from '../../main/services/documents'
import {
  amountInWords,
  assertTransition,
  canDeleteTemplate,
  CATALOG_TEMPLATES,
  filterOfficialRows,
  formatDocumentNumber,
  isOfficialResultStatus,
  makeVerificationCode,
  nextStatusAfterGenerate,
  resolveTemplate,
  sequenceKey,
  transcriptExclusionMessage,
  wrapOfficialHtml,
} from '../../main/domain/documents'

describe('Document numbering', () => {
  it('formats school code, type, year, and padded sequence', () => {
    expect(
      formatDocumentNumber({
        schoolCode: 'GSS',
        typeCode: 'ADM',
        year: 2026,
        sequence: 1,
      })
    ).toBe('GSS/ADM/2026/0001')
  })

  it('uses a custom pattern', () => {
    expect(
      formatDocumentNumber({
        pattern: '{SCHOOL}-{TYPE}-{SEQ}',
        schoolCode: 'SA',
        typeCode: 'trN',
        year: 2026,
        sequence: 12,
      })
    ).toBe('SA-TRN-0012')
  })

  it('allocates sequential numbers and isolates schools', () => {
    const svc = new DocumentNumberService([])
    const a1 = svc.next({
      schoolId: 'sch_a',
      typeCode: 'CERT',
      year: 2026,
      schoolCode: 'GSS',
    })
    const a2 = svc.next({
      schoolId: 'sch_a',
      typeCode: 'CERT',
      year: 2026,
      schoolCode: 'GSS',
    })
    const b1 = svc.next({
      schoolId: 'sch_b',
      typeCode: 'CERT',
      year: 2026,
      schoolCode: 'SA',
    })
    expect(a1.number).toBe('GSS/CERT/2026/0001')
    expect(a2.number).toBe('GSS/CERT/2026/0002')
    expect(b1.number).toBe('SA/CERT/2026/0001')
    expect(sequenceKey('sch_a', 'CERT', 2026)).not.toBe(sequenceKey('sch_b', 'CERT', 2026))
  })

  it('refuses duplicate numbers in generate', () => {
    const numbers = new DocumentNumberService([
      { school_id: 's1', type_code: 'ADM', year_key: '2026', next_number: 1 },
    ])
    const gen = new DocumentGenerationService(numbers, [
      {
        id: 'd1',
        school_id: 's1',
        document_number: 'GSS/ADM/2026/0001',
        verification_code: 'SOFIA-AAAAAA',
        version: 1,
        status: 'issued',
        supersedes_id: null,
      },
    ])
    expect(() =>
      gen.generate({
        schoolId: 's1',
        typeCode: 'ADM',
        year: '2026',
        schoolCode: 'GSS',
        verificationRaw: 'bbbbbb',
        requiresApproval: false,
        existingIds: ['d1'],
      })
    ).toThrow(/already exists/)
  })
})

describe('Templates', () => {
  it('replaces approved variables and leaves unknown tokens', () => {
    const html = resolveTemplate(
      '<p>{{student.name}} {{evil.token}} <script>x</script></p>',
      { 'student.name': 'Ada <X>' }
    )
    expect(html).toContain('Ada &lt;X&gt;')
    expect(html).toContain('{{evil.token}}')
    expect(html).not.toContain('<script>')
  })

  it('keeps a single default template per family and school', () => {
    const svc = new DocumentTemplateService()
    const next = svc.setDefault({
      schoolId: 's1',
      family: 'receipt',
      templateId: 'b',
      templates: [
        { id: 'a', school_id: 's1', family: 'receipt', is_default: true },
        { id: 'b', school_id: 's1', family: 'receipt', is_default: false },
        { id: 'c', school_id: 's2', family: 'receipt', is_default: true },
      ],
    })
    expect(next.find((t) => t.id === 'a')?.is_default).toBe(false)
    expect(next.find((t) => t.id === 'b')?.is_default).toBe(true)
    expect(next.find((t) => t.id === 'c')).toBeUndefined()
  })

  it('blocks deleting templates that already have issued documents', () => {
    expect(canDeleteTemplate(0)).toBe(true)
    expect(canDeleteTemplate(1)).toBe(false)
  })
})

describe('Admission / certificate / transcript rules', () => {
  it('issues immediately when approval is not required', () => {
    expect(nextStatusAfterGenerate(false)).toBe('issued')
    expect(nextStatusAfterGenerate(true)).toBe('generated')
  })

  it('only treats published or locked results as official', () => {
    expect(isOfficialResultStatus('published')).toBe(true)
    expect(isOfficialResultStatus('locked')).toBe(true)
    expect(isOfficialResultStatus('draft')).toBe(false)
    const rows = filterOfficialRows([
      { status: 'draft', grade: 'A' },
      { status: 'published', grade: 'B' },
    ])
    expect(rows).toEqual([{ status: 'published', grade: 'B' }])
  })

  it('explains when a term cannot appear on a transcript', () => {
    expect(transcriptExclusionMessage({ termName: 'Term 2', status: 'draft' })).toMatch(
      /Term 2 have not yet been finalized/
    )
  })

  it('keeps superseded history on regenerate', () => {
    const numbers = new DocumentNumberService([])
    const gen = new DocumentGenerationService(numbers, [])
    const current = {
      id: 'old',
      school_id: 's1',
      document_number: 'GSS/TRN/2026/0001',
      verification_code: 'SOFIA-ABC123',
      version: 1,
      status: 'issued' as const,
      supersedes_id: null,
    }
    const result = gen.regenerate(current)
    expect(result.previous).toBe('superseded')
    expect(result.nextVersion).toBe(2)
    expect(result.supersedes_id).toBe('old')
    expect(() => assertTransition('voided', 'issued')).toThrow()
  })

  it('builds a verification id without student data', () => {
    expect(makeVerificationCode('7f82k3')).toBe('SOFIA-7F82K3')
  })

  it('writes CFA amounts in words for receipts', () => {
    expect(amountInWords(2500)).toBe('Two thousand five hundred CFA francs')
  })

  it('wraps official documents with the bilingual ministry header', () => {
    const html = wrapOfficialHtml({
      title: 'Letter of Admission',
      header: 'Admission',
      body: '<p>Welcome.</p>',
      footer: '',
      schoolName: 'Light World Mission',
      schoolContact: 'Tel: 123',
      showLogo: true,
      showStamp: false,
      showSignature: false,
    })
    expect(html).toContain('doc-gov-header')
    expect(html).toMatch(/CAMEROUN/i)
    expect(html).toMatch(/CAMEROON/i)
    expect(html).toMatch(/MINISTÈRE DES ENSEIGNEMENTS SECONDAIRES/i)
    expect(html).toMatch(/MINISTRY OF SECONDARY EDUCATION/i)
    expect(html).toContain('Light World Mission')
    expect(html).toContain('Letter of Admission')
  })

  it('default receipt catalog body includes amount paid and balance', () => {
    const receipt = CATALOG_TEMPLATES.find((t) => t.key === 'receipt')
    expect(receipt?.body).toMatch(/receipt\.amountPaid|payment\.amount/)
    expect(receipt?.body).toMatch(/receipt\.balance/)
    expect(receipt?.body).toMatch(/Amount paid/i)
    expect(receipt?.body).toMatch(/Balance remaining/i)
  })
})
