import {
  describeTeacherClash,
  fanOutClassIds,
  findTeacherClashes,
  isCommonSubjectAtLevel,
} from '../../main/domain/timetable'

describe('timetable common subjects and clashes', () => {
  const classes = [
    { id: 'f1a', academic_level_id: 'form1' },
    { id: 'f1b', academic_level_id: 'form1' },
    { id: 'f1c', academic_level_id: 'form1' },
    { id: 'f2a', academic_level_id: 'form2' },
  ]

  const math = { id: 'math', class_ids: ['f1a', 'f1b', 'f1c'] }
  const art = { id: 'art', class_ids: ['f1a'] }

  it('detects a subject offered to every class at a level as common', () => {
    expect(isCommonSubjectAtLevel(math, 'f1a', classes)).toBe(true)
    expect(isCommonSubjectAtLevel(art, 'f1a', classes)).toBe(false)
  })

  it('fans out common subjects to all level classes', () => {
    expect(fanOutClassIds(math, 'f1a', classes).sort()).toEqual([
      'f1a',
      'f1b',
      'f1c',
    ])
    expect(fanOutClassIds(art, 'f1a', classes)).toEqual(['f1a'])
  })

  it('flags a teacher clash with a different subject', () => {
    const clashes = findTeacherClashes({
      staffId: 't1',
      day_of_week: 1,
      period_number: 2,
      subject_id: 'math',
      target_class_ids: ['f1a', 'f1b', 'f1c'],
      existing: [
        {
          id: 's1',
          class_id: 'f2a',
          subject_id: 'eng',
          staff_id: 't1',
          day_of_week: 1,
          period_number: 2,
        },
      ],
    })
    expect(clashes).toHaveLength(1)
    expect(clashes[0].class_id).toBe('f2a')
  })

  it('does not treat same common subject on another class as a clash', () => {
    const clashes = findTeacherClashes({
      staffId: 't1',
      day_of_week: 1,
      period_number: 2,
      subject_id: 'math',
      target_class_ids: ['f1a'],
      existing: [
        {
          id: 's1',
          class_id: 'f1b',
          subject_id: 'math',
          staff_id: 't1',
          day_of_week: 1,
          period_number: 2,
        },
      ],
    })
    expect(clashes).toHaveLength(0)
  })

  it('describes a clash for the UI', () => {
    const msg = describeTeacherClash(
      {
        staff_id: 't1',
        day_of_week: 1,
        period_number: 3,
        class_id: 'f2a',
        subject_id: 'eng',
      },
      {
        teacher: 'Ada Lovelace',
        class_name: 'Form 2A',
        subject_name: 'English',
        day_label: 'Monday',
      }
    )
    expect(msg).toMatch(/Ada Lovelace/)
    expect(msg).toMatch(/English/)
    expect(msg).toMatch(/Form 2A/)
  })
})
