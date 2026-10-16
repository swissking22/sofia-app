import {
  availableOptionalStructureLines,
  isMandatoryFeeLine,
  mandatoryFeeLines,
  optionalFeeLines,
} from '../../main/domain/finance'

describe('mandatory vs optional fee lines', () => {
  const lines = [
    { id: '1', name: 'Tuition', amount: 100_000, is_mandatory: 1 },
    { id: '2', name: 'Uniform', amount: 25_000, is_mandatory: 0 },
    { id: '3', name: 'PTA', amount: 5_000, is_mandatory: 0 },
    { id: '4', name: 'Lab', amount: 10_000, is_mandatory: 1 },
  ]

  it('treats is_mandatory=1 as mandatory', () => {
    expect(isMandatoryFeeLine({ is_mandatory: 1 })).toBe(true)
    expect(isMandatoryFeeLine({ is_mandatory: 0 })).toBe(false)
    expect(isMandatoryFeeLine({ is_mandatory: true })).toBe(true)
  })

  it('splits mandatory and optional lines for invoice generation', () => {
    expect(mandatoryFeeLines(lines).map((l) => l.name)).toEqual([
      'Tuition',
      'Lab',
    ])
    expect(optionalFeeLines(lines).map((l) => l.name)).toEqual([
      'Uniform',
      'PTA',
    ])
  })

  it('lists optional structure lines not already on the invoice', () => {
    const available = availableOptionalStructureLines(lines, ['Tuition', 'Uniform'])
    expect(available.map((l) => l.name)).toEqual(['PTA'])
  })

  it('matches optional names case-insensitively', () => {
    const available = availableOptionalStructureLines(lines, ['uniform', 'pta'])
    expect(available).toHaveLength(0)
  })
})
