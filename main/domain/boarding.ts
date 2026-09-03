export type ResidenceType = 'day' | 'boarding'
export type ResidenceApplies = 'all' | 'day' | 'boarding'

export function structureAppliesToStudent(
  appliesTo: ResidenceApplies | string | null | undefined,
  residence: ResidenceType | string | null | undefined
): boolean {
  const scope = (appliesTo || 'all') as ResidenceApplies
  const student = (residence || 'day') as ResidenceType
  if (scope === 'all') return true
  return scope === student
}
