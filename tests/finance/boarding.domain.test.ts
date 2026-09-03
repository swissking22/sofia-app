import { structureAppliesToStudent } from '../../main/domain/boarding'

describe('boarding fee applicability', () => {
  it('applies a generic structure to day and boarding students', () => {
    expect(structureAppliesToStudent('all', 'day')).toBe(true)
    expect(structureAppliesToStudent('all', 'boarding')).toBe(true)
  })

  it('restricts boarding-only structures to boarding students', () => {
    expect(structureAppliesToStudent('boarding', 'boarding')).toBe(true)
    expect(structureAppliesToStudent('boarding', 'day')).toBe(false)
    expect(structureAppliesToStudent('day', 'boarding')).toBe(false)
  })
})
