import {
  calculateSequenceClassSheet,
  calculateSequenceStudentRow,
  sequenceNamesMatch,
} from '../../main/services/results/sequence-results.service'

describe('sequence result formula', () => {
  it('matches sequence labels flexibly', () => {
    expect(sequenceNamesMatch('Sequence 1', 'sequence 1')).toBe(true)
    expect(sequenceNamesMatch('Seq 2', 'Sequence 2')).toBe(true)
    expect(sequenceNamesMatch('Sequence 1', 'Sequence 2')).toBe(false)
  })

  it('weighted mark = mark × coefficient; average = ΣWM / Σcoeff', () => {
    // Math 14×4, Eng 12×3 → 56+36=92 / 7 ≈ 13.14
    const row = calculateSequenceStudentRow({
      studentId: 's1',
      studentName: 'Ada',
      subjects: [
        {
          subject_id: 'math',
          subject_name: 'Mathematics',
          coefficient: 4,
          score: { name: 'Sequence 1', raw: 14, max: 20 },
        },
        {
          subject_id: 'eng',
          subject_name: 'English',
          coefficient: 3,
          score: { name: 'Sequence 1', raw: 12, max: 20 },
        },
      ],
    })
    expect(row.cells[0]?.weighted_mark).toBe(56)
    expect(row.cells[1]?.weighted_mark).toBe(36)
    expect(row.total_weighted_marks).toBe(92)
    expect(row.total_coefficients).toBe(7)
    expect(row.average_rounded).toBeCloseTo(13.14, 2)
  })

  it('ranks by merit and can sort by position', () => {
    const scores = new Map([
      ['a:math', { name: 'Sequence 1', raw: 18, max: 20 }],
      ['b:math', { name: 'Sequence 1', raw: 10, max: 20 }],
      ['c:math', { name: 'Sequence 1', raw: 14, max: 20 }],
    ])
    const sheet = calculateSequenceClassSheet({
      classId: 'c1',
      className: 'Form 1 A',
      sequenceName: 'Sequence 1',
      students: [
        { id: 'a', name: 'Zoe' },
        { id: 'b', name: 'Amy' },
        { id: 'c', name: 'Ben' },
      ],
      subjects: [{ id: 'math', name: 'Mathematics', coefficient: 1 }],
      scoresLookup: scores,
      sort: 'merit',
    })
    expect(sheet.students.map((s) => s.student_id)).toEqual(['a', 'c', 'b'])
    expect(sheet.students[0]?.position).toBe(1)
    expect(sheet.students[1]?.position).toBe(2)
    expect(sheet.students[2]?.position).toBe(3)
  })
})
