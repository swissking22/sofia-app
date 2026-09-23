/**
 * Teaching assignment builder helpers (mirrors main/domain/staff.ts for the renderer).
 */

export type TeachingAssignment = { class_id: string; subject_id: string }

export type ClassAssignmentGroup = {
  class_id: string
  subject_ids: string[]
}

export function teachingAssignmentKey(a: TeachingAssignment): string {
  return `${a.class_id}::${a.subject_id}`
}

export function normalizeTeachingAssignments(
  pairs: TeachingAssignment[],
  offeredBySubject: Map<string, string[]>
): TeachingAssignment[] {
  const seen = new Set<string>()
  const out: TeachingAssignment[] = []
  for (const pair of pairs) {
    const class_id = pair.class_id?.trim()
    const subject_id = pair.subject_id?.trim()
    if (!class_id || !subject_id) continue
    const offered = offeredBySubject.get(subject_id)
    if (offered && offered.length > 0 && !offered.includes(class_id)) continue
    const key = teachingAssignmentKey({ class_id, subject_id })
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ class_id, subject_id })
  }
  return out
}

export function groupAssignmentsByClass(
  pairs: TeachingAssignment[]
): ClassAssignmentGroup[] {
  const map = new Map<string, string[]>()
  for (const pair of pairs) {
    const class_id = pair.class_id?.trim()
    const subject_id = pair.subject_id?.trim()
    if (!class_id || !subject_id) continue
    const list = map.get(class_id) ?? []
    if (!list.includes(subject_id)) list.push(subject_id)
    map.set(class_id, list)
  }
  return [...map.entries()].map(([class_id, subject_ids]) => ({
    class_id,
    subject_ids,
  }))
}

export function summarizeTeachingAssignments(pairs: TeachingAssignment[]): {
  classes: number
  subjects: number
  assignments: number
} {
  const classIds = new Set<string>()
  const subjectIds = new Set<string>()
  for (const p of pairs) {
    if (p.class_id) classIds.add(p.class_id)
    if (p.subject_id) subjectIds.add(p.subject_id)
  }
  return {
    classes: classIds.size,
    subjects: subjectIds.size,
    assignments: pairs.length,
  }
}

export function subjectsOfferedInClass<
  T extends { id: string; class_ids: string[] }
>(classId: string, subjects: T[]): T[] {
  if (!classId) return []
  return subjects.filter((s) => s.class_ids.includes(classId))
}

export function upsertClassAssignment(
  existing: TeachingAssignment[],
  previousClassId: string | null,
  next: { class_id: string; subject_ids: string[] },
  offeredBySubject: Map<string, string[]>
): TeachingAssignment[] {
  const kept =
    previousClassId != null
      ? existing.filter((p) => p.class_id !== previousClassId)
      : existing.filter((p) => p.class_id !== next.class_id)
  const added = next.subject_ids.map((subject_id) => ({
    class_id: next.class_id,
    subject_id,
  }))
  return normalizeTeachingAssignments([...kept, ...added], offeredBySubject)
}

export function copySubjectsToClasses(
  existing: TeachingAssignment[],
  subjectIds: string[],
  targetClassIds: string[],
  offeredBySubject: Map<string, string[]>
): TeachingAssignment[] {
  const additions: TeachingAssignment[] = []
  for (const class_id of targetClassIds) {
    for (const subject_id of subjectIds) {
      additions.push({ class_id, subject_id })
    }
  }
  return normalizeTeachingAssignments(
    [...existing, ...additions],
    offeredBySubject
  )
}

export function buildOfferedBySubjectMap(
  subjects: Array<{ id: string; class_ids: string[] }>
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const s of subjects) {
    map.set(s.id, s.class_ids ?? [])
  }
  return map
}

const SECTION_RANK: Record<string, number> = {
  general: 0,
  commercial: 1,
  technical: 2,
}

export function sectionSortRank(name: string | null | undefined): number {
  if (!name?.trim()) return 99
  return SECTION_RANK[name.trim().toLowerCase()] ?? 50
}
