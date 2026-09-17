import {
  buildStudentImportTemplateCsv,
  formatStudentImportSummary,
  normalizeDateOfBirth,
  normalizeFullName,
  normalizeGender,
  normalizeResidence,
  parseStudentCsv,
  resolveStudentImport,
  tallySkipReasons,
  type StudentImportStructure,
} from '../../main/domain/student-import'

const structure: StudentImportStructure = {
  levels: [
    { id: 'l1', name: 'Form 1', short_name: 'F1', is_active: 1 },
    { id: 'l4', name: 'Form 4', short_name: 'F4', is_active: 1 },
  ],
  sections: [
    { id: 's-gen', name: 'General', is_active: 1 },
    { id: 's-tech', name: 'Technical', is_active: 1 },
  ],
  specializations: [
    {
      id: 'sp-el',
      section_id: 's-tech',
      name: 'Electrical',
      abbreviation: 'EL',
      is_active: 1,
    },
  ],
  classes: [
    {
      id: 'c-f1-a',
      name: 'Form 1 A',
      academic_level_id: 'l1',
      section_id: 's-gen',
      specialization_id: null,
      is_active: 1,
    },
    {
      id: 'c-f1-b',
      name: 'Form 1 B',
      academic_level_id: 'l1',
      section_id: 's-gen',
      specialization_id: null,
      is_active: 1,
    },
    {
      id: 'c-f4-el',
      name: 'Form 4 EL',
      academic_level_id: 'l4',
      section_id: 's-tech',
      specialization_id: 'sp-el',
      is_active: 1,
    },
    {
      id: 'c-f4-el-a',
      name: 'Form 4 EL A',
      academic_level_id: 'l4',
      section_id: 's-tech',
      specialization_id: 'sp-el',
      is_active: 1,
    },
  ],
}

const uniqueStructure: StudentImportStructure = {
  ...structure,
  classes: [
    {
      id: 'c-f1',
      name: 'Form 1',
      academic_level_id: 'l1',
      section_id: 's-gen',
      specialization_id: null,
      is_active: 1,
    },
    structure.classes[2],
  ],
}

describe('student import normalization', () => {
  it('collapses extra spaces in names', () => {
    expect(normalizeFullName('  Ada   Biya ')).toBe('Ada Biya')
  })

  it('parses date of birth in ISO and DMY forms', () => {
    expect(normalizeDateOfBirth('2012-04-15')).toBe('2012-04-15')
    expect(normalizeDateOfBirth('15/04/2012')).toBe('2012-04-15')
    expect(normalizeDateOfBirth('15-04-2012')).toBe('2012-04-15')
    expect(normalizeDateOfBirth('2012/4/5')).toBe('2012-04-05')
    expect(normalizeDateOfBirth('31/02/2012')).toBe('invalid')
    expect(normalizeDateOfBirth('')).toBe(null)
  })

  it('normalizes residence aliases and rejects unknown values', () => {
    expect(normalizeResidence('Day student')).toBe('day')
    expect(normalizeResidence('externe')).toBe('day')
    expect(normalizeResidence('Boarder')).toBe('boarding')
    expect(normalizeResidence('internat')).toBe('boarding')
    expect(normalizeResidence('hostel')).toBe('invalid')
    expect(normalizeResidence('')).toBe(null)
  })

  it('normalizes gender to Male/Female', () => {
    expect(normalizeGender('m')).toBe('Male')
    expect(normalizeGender('fille')).toBe('Female')
    expect(normalizeGender('')).toBe(null)
  })
})

describe('student import CSV parse', () => {
  it('reads the hierarchy template columns', () => {
    const csv = buildStudentImportTemplateCsv()
    const rows = parseStudentCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      full_name: 'Ada Biya',
      date_of_birth: '2012-04-15',
      level_name: 'Form 1',
      department_name: 'General',
      specialization_name: null,
      residence_type: 'Day',
      gender: 'Female',
    })
    expect(rows[1]).toMatchObject({
      full_name: 'Jean Nkodo',
      date_of_birth: '15/04/2012',
      level_name: 'Form 4',
      department_name: 'Technical',
      specialization_name: 'Electrical',
      residence_type: 'Boarding',
    })
  })
})

describe('student import class matching', () => {
  it('selects a unique class from level + department', () => {
    const res = resolveStudentImport(
      {
        full_name: 'Ada Biya',
        level_name: 'Form 1',
        department_name: 'General',
        residence_type: 'Day',
        date_of_birth: '15/04/2012',
      },
      uniqueStructure
    )
    expect(res).toEqual({
      ok: true,
      data: {
        name: 'Ada Biya',
        class_id: 'c-f1',
        gender: null,
        date_of_birth: '2012-04-15',
        residence_type: 'day',
      },
    })
  })

  it('selects a unique specialized class by abbreviation', () => {
    const res = resolveStudentImport(
      {
        full_name: 'Jean Nkodo',
        level_name: 'F4',
        department_name: 'Technical',
        specialization_name: 'EL',
        residence_type: 'boarder',
      },
      uniqueStructure
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.class_id).toBe('c-f4-el')
      expect(res.data.residence_type).toBe('boarding')
    }
  })

  it('skips when several classes share the same level and department', () => {
    const res = resolveStudentImport(
      {
        full_name: 'Ada Biya',
        level_name: 'Form 1',
        department_name: 'General',
        residence_type: 'Day',
      },
      structure
    )
    expect(res).toEqual({ ok: false, reason: 'ambiguous_class' })
  })

  it('uses an optional Class column to disambiguate', () => {
    const res = resolveStudentImport(
      {
        full_name: 'Ada Biya',
        level_name: 'Form 1',
        department_name: 'General',
        residence_type: 'Day',
        class_name: 'Form 1 B',
      },
      structure
    )
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.class_id).toBe('c-f1-b')
  })

  it('skips when several specialized classes share the same hierarchy', () => {
    const res = resolveStudentImport(
      {
        full_name: 'Jean Nkodo',
        level_name: 'Form 4',
        department_name: 'Technical',
        specialization_name: 'Electrical',
        residence_type: 'Boarding',
      },
      structure
    )
    expect(res).toEqual({ ok: false, reason: 'ambiguous_class' })
  })

  it('falls back to a unique Class name when hierarchy is omitted', () => {
    const res = resolveStudentImport(
      {
        full_name: 'Ada Biya',
        residence_type: 'Day',
        class_name: 'Form 4 EL',
      },
      structure
    )
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.class_id).toBe('c-f4-el')
  })

  it('does not create a class when nothing matches', () => {
    const res = resolveStudentImport(
      {
        full_name: 'Ada Biya',
        level_name: 'Form 2',
        department_name: 'General',
        residence_type: 'Day',
      },
      structure
    )
    expect(res).toEqual({ ok: false, reason: 'unknown_level' })
  })

  it('skips unknown residence so boarders are not stored as day', () => {
    expect(
      resolveStudentImport(
        {
          full_name: 'Ada Biya',
          class_name: 'Form 4 EL',
          residence_type: 'hostel',
        },
        structure
      )
    ).toEqual({ ok: false, reason: 'invalid_residence' })
    expect(
      resolveStudentImport(
        {
          full_name: 'Ada Biya',
          class_name: 'Form 4 EL',
        },
        structure
      )
    ).toEqual({ ok: false, reason: 'missing_residence' })
  })

  it('summarizes skip reasons for the importer', () => {
    const summary = formatStudentImportSummary({
      imported: 2,
      skipped: 3,
      skip_reasons: tallySkipReasons([
        'ambiguous_class',
        'ambiguous_class',
        'invalid_residence',
      ]),
    })
    expect(summary).toBe(
      'Imported 2 students (3 skipped — 2 ambiguous class, 1 invalid residence type).'
    )
  })
})
