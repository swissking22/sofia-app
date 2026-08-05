/** Default academic structure seeds for guided setup. */

export type LevelCategory = 'lower_secondary' | 'upper_secondary'

/** Kept for the later Subjects step (department seeding). */
export const DEFAULT_DEPARTMENTS = [
  'Science',
  'Arts',
  'Commercial',
  'Technical',
] as const

export const DEFAULT_LEVELS: Array<{
  name: string
  category: LevelCategory
  sort_order: number
}> = [
  { name: 'Form 1', category: 'lower_secondary', sort_order: 1 },
  { name: 'Form 2', category: 'lower_secondary', sort_order: 2 },
  { name: 'Form 3', category: 'lower_secondary', sort_order: 3 },
  { name: 'Form 4', category: 'lower_secondary', sort_order: 4 },
  { name: 'Form 5', category: 'lower_secondary', sort_order: 5 },
  { name: 'Lower Sixth', category: 'upper_secondary', sort_order: 6 },
  { name: 'Upper Sixth', category: 'upper_secondary', sort_order: 7 },
]

export const DEFAULT_SECTIONS: Array<{ name: string; description: string }> = [
  { name: 'General', description: 'General academic stream' },
  { name: 'Commercial', description: 'Business and commercial studies' },
  { name: 'Technical', description: 'Technical and vocational studies' },
]

export function suggestClassNames(input: {
  levelName: string
  sectionName: string
  /** Abbreviation of the specialization (preferred for class names) */
  specializationAbbreviation?: string | null
}): string[] {
  const { levelName, sectionName, specializationAbbreviation } = input
  const abbr = specializationAbbreviation?.trim()
  const base = abbr
    ? `${levelName} ${abbr}`
    : sectionName.toLowerCase() === 'general'
      ? levelName
      : `${levelName} ${sectionName}`

  return [`${base} A`, `${base} B`, `${base} C`, base]
}
