import {
  buildOfferedBySubjectMap,
  copySubjectsToClasses,
  expandLegacyTeachingAssignments,
  groupAssignmentsByClass,
  normalizeTeachingAssignments,
  summarizeTeachingAssignments,
  teachingAssignmentKey,
  upsertClassAssignment,
} from '../../main/domain/staff'

describe('teaching assignments', () => {
  const offered = new Map<string, string[]>([
    ['math', ['c1', 'c2']],
    ['eng', ['c1']],
  ])

  it('keeps class+subject pairs and drops duplicates', () => {
    const pairs = normalizeTeachingAssignments(
      [
        { class_id: 'c1', subject_id: 'math' },
        { class_id: 'c1', subject_id: 'math' },
        { class_id: 'c2', subject_id: 'math' },
      ],
      offered
    )
    expect(pairs).toEqual([
      { class_id: 'c1', subject_id: 'math' },
      { class_id: 'c2', subject_id: 'math' },
    ])
  })

  it('rejects a subject that is not offered in that class', () => {
    const pairs = normalizeTeachingAssignments(
      [{ class_id: 'c2', subject_id: 'eng' }],
      offered
    )
    expect(pairs).toEqual([])
  })

  it('expands legacy subject and class lists into pairs', () => {
    const pairs = expandLegacyTeachingAssignments(
      ['math', 'eng'],
      ['c1', 'c2'],
      offered
    )
    expect(pairs.map(teachingAssignmentKey).sort()).toEqual([
      'c1::eng',
      'c1::math',
      'c2::math',
    ])
  })

  it('allows one teacher to cover multiple classes and subjects', () => {
    const pairs = normalizeTeachingAssignments(
      [
        { class_id: 'c1', subject_id: 'math' },
        { class_id: 'c2', subject_id: 'math' },
        { class_id: 'c1', subject_id: 'eng' },
      ],
      offered
    )
    expect(pairs).toHaveLength(3)
  })

  it('groups pairs by class for assignment cards', () => {
    const groups = groupAssignmentsByClass([
      { class_id: 'c1', subject_id: 'math' },
      { class_id: 'c1', subject_id: 'eng' },
      { class_id: 'c2', subject_id: 'math' },
    ])
    expect(groups).toEqual([
      { class_id: 'c1', subject_ids: ['math', 'eng'] },
      { class_id: 'c2', subject_ids: ['math'] },
    ])
  })

  it('summarizes unique classes, subjects, and pair count', () => {
    expect(
      summarizeTeachingAssignments([
        { class_id: 'c1', subject_id: 'math' },
        { class_id: 'c1', subject_id: 'eng' },
        { class_id: 'c2', subject_id: 'math' },
      ])
    ).toEqual({ classes: 2, subjects: 2, assignments: 3 })
  })

  it('upserts a class card without duplicating pairs', () => {
    const next = upsertClassAssignment(
      [
        { class_id: 'c1', subject_id: 'math' },
        { class_id: 'c2', subject_id: 'math' },
      ],
      'c1',
      { class_id: 'c1', subject_ids: ['math', 'eng'] },
      offered
    )
    expect(next.map(teachingAssignmentKey).sort()).toEqual([
      'c1::eng',
      'c1::math',
      'c2::math',
    ])
  })

  it('copies subjects onto other classes and skips invalid offerings', () => {
    const next = copySubjectsToClasses(
      [{ class_id: 'c1', subject_id: 'math' }],
      ['math', 'eng'],
      ['c2'],
      offered
    )
    expect(next.map(teachingAssignmentKey).sort()).toEqual([
      'c1::math',
      'c2::math',
    ])
  })

  it('builds offered-by-subject map from subject class_ids', () => {
    const map = buildOfferedBySubjectMap([
      { id: 'math', class_ids: ['c1', 'c2'] },
      { id: 'eng', class_ids: ['c1'] },
    ])
    expect(map.get('math')).toEqual(['c1', 'c2'])
  })
})
