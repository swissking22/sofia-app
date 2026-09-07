/**
 * Canonical subject titles so near-duplicates (e.g. Sports vs Sports and
 * Physical Education) resolve to one shared subject at a level.
 */

const SUBJECT_ALIASES: Record<string, string> = {
  Sports: 'Sports and Physical Education',
  PE: 'Sports and Physical Education',
  'Physical Education': 'Sports and Physical Education',
}

/** Normalize a subject display name to its canonical form. */
export function normalizeSubjectName(name: string): string {
  const trimmed = name.trim()
  return SUBJECT_ALIASES[trimmed] ?? trimmed
}

/**
 * Identity for a subject offering: one subject per academic level + name,
 * shared across General / Commercial / Technical classes at that level.
 */
export function subjectIdentityKey(level: string, name: string): string {
  return `${level}::${normalizeSubjectName(name)}`
}
