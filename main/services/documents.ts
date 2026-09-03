import {
  DEFAULT_NUMBER_PATTERN,
  type DocumentFamily,
  type IssuedDocumentStatus,
  amountInWords,
  assertTransition,
  formatDocumentNumber,
  makeVerificationCode,
  nextStatusAfterGenerate,
  resolveTemplate,
  sequenceKey,
  wrapOfficialHtml,
} from '../domain/documents'

export interface NumberSequenceRow {
  school_id: string
  type_code: string
  year_key: string
  next_number: number
}

export class DocumentNumberService {
  constructor(private sequences: NumberSequenceRow[]) {}

  next(input: {
    schoolId: string
    typeCode: string
    year: string | number
    schoolCode: string
    pattern?: string | null
  }): { number: string; sequence: number } {
    const year_key = String(input.year)
    const type_code = input.typeCode.toUpperCase()
    let row = this.sequences.find(
      (s) =>
        s.school_id === input.schoolId &&
        s.type_code === type_code &&
        s.year_key === year_key
    )
    if (!row) {
      row = {
        school_id: input.schoolId,
        type_code,
        year_key,
        next_number: 1,
      }
      this.sequences.push(row)
    }
    const sequence = row.next_number
    row.next_number = sequence + 1
    return {
      sequence,
      number: formatDocumentNumber({
        pattern: input.pattern || DEFAULT_NUMBER_PATTERN,
        schoolCode: input.schoolCode,
        typeCode: type_code,
        year: year_key,
        sequence,
      }),
    }
  }
}

export class DocumentTemplateService {
  setDefault(input: {
    schoolId: string
    family: DocumentFamily
    templateId: string
    templates: Array<{ id: string; school_id: string; family: DocumentFamily; is_default: boolean }>
  }): Array<{ id: string; is_default: boolean }> {
    return input.templates
      .filter((t) => t.school_id === input.schoolId && t.family === input.family)
      .map((t) => ({
        id: t.id,
        is_default: t.id === input.templateId,
      }))
  }

  activate(current: boolean): boolean {
    return !current
  }
}

export interface IssuedDocRec {
  id: string
  school_id: string
  document_number: string
  verification_code: string
  version: number
  status: IssuedDocumentStatus
  supersedes_id: string | null
}

export class DocumentGenerationService {
  constructor(
    private numbers: DocumentNumberService,
    private issued: IssuedDocRec[]
  ) {}

  generate(input: {
    schoolId: string
    typeCode: string
    year: string
    schoolCode: string
    pattern?: string | null
    verificationRaw: string
    requiresApproval: boolean
    existingIds: string[]
  }): Omit<IssuedDocRec, 'id'> & { sequence: number } {
    const { number, sequence } = this.numbers.next({
      schoolId: input.schoolId,
      typeCode: input.typeCode,
      year: input.year,
      schoolCode: input.schoolCode,
      pattern: input.pattern,
    })
    const duplicate = this.issued.some(
      (d) => d.school_id === input.schoolId && d.document_number === number
    )
    if (duplicate) {
      throw new Error('Document number already exists for this school.')
    }
    let code = makeVerificationCode(input.verificationRaw)
    const used = new Set(
      this.issued
        .filter((d) => d.school_id === input.schoolId)
        .map((d) => d.verification_code)
    )
    let i = 0
    while (used.has(code) && i < 8) {
      code = makeVerificationCode(`${input.verificationRaw}${i}`)
      i += 1
    }
    return {
      school_id: input.schoolId,
      document_number: number,
      verification_code: code,
      version: 1,
      status: nextStatusAfterGenerate(input.requiresApproval),
      supersedes_id: null,
      sequence,
    }
  }

  regenerate(current: IssuedDocRec): {
    previous: IssuedDocumentStatus
    nextVersion: number
    supersedes_id: string
  } {
    assertTransition(current.status, 'superseded')
    return {
      previous: 'superseded',
      nextVersion: current.version + 1,
      supersedes_id: current.id,
    }
  }

  issue(current: IssuedDocRec): IssuedDocumentStatus {
    assertTransition(current.status, 'issued')
    return 'issued'
  }

  voidDoc(current: IssuedDocRec): IssuedDocumentStatus {
    assertTransition(current.status, 'voided')
    return 'voided'
  }
}

export {
  amountInWords,
  resolveTemplate,
  sequenceKey,
  wrapOfficialHtml,
}
