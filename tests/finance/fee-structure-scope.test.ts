import {
  feeStructureAppliesToStudent,
  feeStructureMismatch,
  feeStructureMismatchMessage,
  type FeeStructureScope,
  type StudentFeeContext,
} from '../../main/domain/fee-structure-scope'

describe('fee structure department / scope matching', () => {
  const baseStructure: FeeStructureScope = {
    applies_to_residence: 'all',
    academic_level_id: null,
    section_id: null,
    class_id: null,
  }

  const dayGeneral: StudentFeeContext = {
    residence_type: 'day',
    academic_level_id: 'l1',
    section_id: 's-gen',
    class_id: 'c-f1-gen',
  }

  const dayTech: StudentFeeContext = {
    residence_type: 'day',
    academic_level_id: 'l1',
    section_id: 's-tech',
    class_id: 'c-f1-tech',
  }

  it('allows a school-wide structure for any department', () => {
    expect(feeStructureAppliesToStudent(baseStructure, dayGeneral)).toBe(true)
    expect(feeStructureAppliesToStudent(baseStructure, dayTech)).toBe(true)
  })

  it('restricts structures to a department (section)', () => {
    const techOnly: FeeStructureScope = {
      ...baseStructure,
      academic_level_id: 'l1',
      section_id: 's-tech',
    }
    expect(feeStructureAppliesToStudent(techOnly, dayTech)).toBe(true)
    expect(feeStructureAppliesToStudent(techOnly, dayGeneral)).toBe(false)
    expect(feeStructureMismatch(techOnly, dayGeneral)).toBe('department')
  })

  it('lets General and Commercial share a structure while excluding Technical', () => {
    const genCom: FeeStructureScope = {
      ...baseStructure,
      section_id: 's-gen',
    }
    expect(feeStructureAppliesToStudent(genCom, dayGeneral)).toBe(true)
    expect(feeStructureAppliesToStudent(genCom, dayTech)).toBe(false)
  })

  it('still enforces residence when department matches', () => {
    const boarderTech: FeeStructureScope = {
      applies_to_residence: 'boarding',
      academic_level_id: 'l1',
      section_id: 's-tech',
      class_id: null,
    }
    expect(
      feeStructureAppliesToStudent(boarderTech, {
        ...dayTech,
        residence_type: 'boarding',
      })
    ).toBe(true)
    expect(feeStructureMismatch(boarderTech, dayTech)).toBe('residence')
    expect(feeStructureMismatchMessage('residence')).toMatch(/residence type/i)
  })

  it('class scope takes precedence over department', () => {
    const specific: FeeStructureScope = {
      applies_to_residence: 'all',
      academic_level_id: 'l1',
      section_id: 's-tech',
      class_id: 'c-f1-tech',
    }
    expect(feeStructureAppliesToStudent(specific, dayTech)).toBe(true)
    expect(
      feeStructureMismatch(specific, {
        ...dayTech,
        class_id: 'c-other-tech',
      })
    ).toBe('class')
  })
})
