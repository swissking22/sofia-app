/**
 * Timetable helpers: common (level-wide) subjects and teacher clash detection.
 */

export type TimetableClassRef = {
  id: string
  academic_level_id: string | null
}

export type TimetableSubjectRef = {
  id: string
  class_ids: string[]
}

export type TimetableSlotRef = {
  id: string
  class_id: string
  subject_id: string | null
  staff_id: string | null
  day_of_week: number
  period_number: number
}

/** Active classes at the same academic level as the given class. */
export function classesAtSameLevel(
  classId: string,
  classes: TimetableClassRef[]
): string[] {
  const current = classes.find((c) => c.id === classId)
  if (!current?.academic_level_id) return [classId]
  return classes
    .filter((c) => c.academic_level_id === current.academic_level_id)
    .map((c) => c.id)
}

/**
 * A subject is common at a level when it is offered to every active class
 * at that level (at least two classes). Example: Mathematics for all Form 1.
 */
export function isCommonSubjectAtLevel(
  subject: TimetableSubjectRef,
  classId: string,
  classes: TimetableClassRef[]
): boolean {
  const levelClassIds = classesAtSameLevel(classId, classes)
  if (levelClassIds.length < 2) return false
  const offered = new Set(subject.class_ids)
  return levelClassIds.every((id) => offered.has(id))
}

/** Classes that should receive this subject when placing it on a slot. */
export function fanOutClassIds(
  subject: TimetableSubjectRef,
  classId: string,
  classes: TimetableClassRef[]
): string[] {
  if (!isCommonSubjectAtLevel(subject, classId, classes)) return [classId]
  return classesAtSameLevel(classId, classes).filter((id) =>
    subject.class_ids.includes(id)
  )
}

export type TeacherClash = {
  staff_id: string
  day_of_week: number
  period_number: number
  class_id: string
  subject_id: string | null
}

/**
 * A clash is another slot for the same teacher at the same day/period that is
 * NOT the same subject being fan-out synchronized (common subject across classes).
 */
export function findTeacherClashes(input: {
  staffId: string
  day_of_week: number
  period_number: number
  subject_id: string | null
  /** Class cells we are writing (fan-out targets); existing same-cell slots are overwritten. */
  target_class_ids: string[]
  existing: TimetableSlotRef[]
}): TeacherClash[] {
  const target = new Set(input.target_class_ids)
  const clashes: TeacherClash[] = []
  for (const slot of input.existing) {
    if (slot.staff_id !== input.staffId) continue
    if (slot.day_of_week !== input.day_of_week) continue
    if (slot.period_number !== input.period_number) continue
    if (target.has(slot.class_id)) continue
    if (
      input.subject_id &&
      slot.subject_id === input.subject_id
    ) {
      // Same common subject already synced elsewhere — not a clash.
      continue
    }
    clashes.push({
      staff_id: input.staffId,
      day_of_week: slot.day_of_week,
      period_number: slot.period_number,
      class_id: slot.class_id,
      subject_id: slot.subject_id,
    })
  }
  return clashes
}

export function describeTeacherClash(
  clash: TeacherClash,
  names: {
    teacher?: string | null
    class_name?: string | null
    subject_name?: string | null
    day_label?: string | null
  }
): string {
  const teacher = names.teacher?.trim() || 'This teacher'
  const day = names.day_label || `day ${clash.day_of_week}`
  const period = `period ${clash.period_number}`
  const otherClass = names.class_name || 'another class'
  const otherSubject = names.subject_name || 'another subject'
  return `${teacher} already teaches ${otherSubject} in ${otherClass} on ${day} ${period}. Move or clear that slot first.`
}
