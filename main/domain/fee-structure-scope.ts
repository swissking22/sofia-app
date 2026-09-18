import {
  structureAppliesToStudent as residenceApplies,
  type ResidenceApplies,
  type ResidenceType,
} from './boarding'

export type FeeStructureScope = {
  applies_to_residence?: ResidenceApplies | string | null
  academic_level_id?: string | null
  /** Department / stream (Academic Structure section). */
  section_id?: string | null
  class_id?: string | null
}

export type StudentFeeContext = {
  residence_type?: ResidenceType | string | null
  academic_level_id?: string | null
  /** Student's class.section_id (department). */
  section_id?: string | null
  class_id?: string | null
}

export type FeeStructureMismatch =
  | 'residence'
  | 'class'
  | 'department'
  | 'level'

/**
 * Whether a fee package applies to a student.
 * Null scope fields mean “any”. Class is most specific; then department; then level.
 * Residence (day / boarding) is always checked when the structure restricts it.
 */
export function feeStructureMismatch(
  structure: FeeStructureScope,
  student: StudentFeeContext
): FeeStructureMismatch | null {
  if (
    !residenceApplies(
      structure.applies_to_residence,
      student.residence_type
    )
  ) {
    return 'residence'
  }

  if (structure.class_id) {
    if (!student.class_id || student.class_id !== structure.class_id) {
      return 'class'
    }
  }

  if (structure.section_id) {
    if (!student.section_id || student.section_id !== structure.section_id) {
      return 'department'
    }
  }

  if (structure.academic_level_id) {
    if (
      !student.academic_level_id ||
      student.academic_level_id !== structure.academic_level_id
    ) {
      return 'level'
    }
  }

  return null
}

export function feeStructureAppliesToStudent(
  structure: FeeStructureScope,
  student: StudentFeeContext
): boolean {
  return feeStructureMismatch(structure, student) == null
}

export function feeStructureMismatchMessage(
  reason: FeeStructureMismatch
): string {
  switch (reason) {
    case 'residence':
      return 'This fee structure does not apply to the student residence type (day / boarding).'
    case 'class':
      return 'This fee structure does not apply to the student class.'
    case 'department':
      return 'This fee structure does not apply to the student department (General / Commercial / Technical).'
    case 'level':
      return 'This fee structure does not apply to the student academic level.'
  }
}
