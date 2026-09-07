/** Canonical ordering for classes and sections in lists/dropdowns. */

const SECTION_RANK: Record<string, number> = {
  general: 0,
  commercial: 1,
  technical: 2,
}

/** General → Commercial → Technical → other (A–Z). */
export function sectionSortRank(name: string | null | undefined): number {
  if (!name?.trim()) return 99
  return SECTION_RANK[name.trim().toLowerCase()] ?? 50
}

export type ClassStructureSortKey = {
  level_sort_order?: number | null
  section_name?: string | null
  name: string
}

/**
 * Form 1 → Form 2 → … (by level sort_order), then
 * General → Commercial → Technical within a level, then class name.
 */
export function compareClassesByStructure(
  a: ClassStructureSortKey,
  b: ClassStructureSortKey
): number {
  const levelA = a.level_sort_order ?? 9999
  const levelB = b.level_sort_order ?? 9999
  if (levelA !== levelB) return levelA - levelB

  const sectionA = sectionSortRank(a.section_name)
  const sectionB = sectionSortRank(b.section_name)
  if (sectionA !== sectionB) return sectionA - sectionB

  const sectionNameA = (a.section_name ?? '').localeCompare(
    b.section_name ?? '',
    undefined,
    { sensitivity: 'base' }
  )
  if (sectionNameA !== 0) return sectionNameA

  return a.name.localeCompare(b.name, undefined, {
    sensitivity: 'base',
    numeric: true,
  })
}

export function sortClassesByStructure<T extends ClassStructureSortKey>(
  classes: T[]
): T[] {
  return [...classes].sort(compareClassesByStructure)
}

/** SQL CASE fragment for section name ranking (alias `sec`). */
export const SQL_SECTION_SORT_CASE = `
  CASE LOWER(IFNULL(sec.name, ''))
    WHEN 'general' THEN 0
    WHEN 'commercial' THEN 1
    WHEN 'technical' THEN 2
    ELSE 50
  END
`.trim()
