import {
  normalizeSubjectName,
  subjectIdentityKey,
} from '../../main/domain/subject-names'

describe('subject name identity (shared across streams)', () => {
  it('normalizes Sports aliases to Sports and Physical Education', () => {
    expect(normalizeSubjectName('Sports')).toBe(
      'Sports and Physical Education'
    )
    expect(normalizeSubjectName('PE')).toBe('Sports and Physical Education')
    expect(normalizeSubjectName('Physical Education')).toBe(
      'Sports and Physical Education'
    )
    expect(normalizeSubjectName('Mathematics')).toBe('Mathematics')
  })

  it('keys subjects by level + canonical name so streams share one subject', () => {
    expect(subjectIdentityKey('Form 1', 'Mathematics')).toBe(
      'Form 1::Mathematics'
    )
    expect(subjectIdentityKey('Form 1', 'Sports')).toBe(
      subjectIdentityKey('Form 1', 'Sports and Physical Education')
    )
    expect(subjectIdentityKey('Form 1', 'Mathematics')).not.toBe(
      subjectIdentityKey('Form 2', 'Mathematics')
    )
  })
})
