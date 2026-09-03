import {
  expandLegacyTeachingAssignments,
  normalizeTeachingAssignments,
  teachingAssignmentKey,
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
})
