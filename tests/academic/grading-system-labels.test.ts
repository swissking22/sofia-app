import {
  GRADE_LABEL_MAX_LENGTH,
  isValidGradeLabel,
  normalizeGradeLabel,
  validateGradingSetup,
} from '../../main/db/repositories/grading-system.repository'

describe('grade labels (setup grading system)', () => {
  it('normalizes to uppercase alphanumeric without spaces, max 5', () => {
    expect(GRADE_LABEL_MAX_LENGTH).toBe(5)
    expect(normalizeGradeLabel('a')).toBe('A')
    expect(normalizeGradeLabel('a1')).toBe('A1')
    expect(normalizeGradeLabel('Dis t')).toBe('DIST')
    expect(normalizeGradeLabel('EXCELLENT')).toBe('EXCEL')
    expect(normalizeGradeLabel('A-1')).toBe('A1')
    expect(normalizeGradeLabel('  b 2  ')).toBe('B2')
  })

  it('accepts 1–5 letter/digit labels and rejects empty or spaced-only input', () => {
    expect(isValidGradeLabel('A')).toBe(true)
    expect(isValidGradeLabel('A1')).toBe(true)
    expect(isValidGradeLabel('DIST')).toBe(true)
    expect(isValidGradeLabel('PASS1')).toBe(true)
    expect(isValidGradeLabel('')).toBe(false)
    expect(isValidGradeLabel('   ')).toBe(false)
  })

  it('validateGradingSetup accepts five-character grade labels', () => {
    const err = validateGradingSetup({
      enable_ranking: true,
      show_class_average: true,
      show_teacher_remarks: true,
      assessment_types: [
        { name: 'CA', weight_percent: 30 },
        { name: 'Exam', weight_percent: 70 },
      ],
      grade_bands: [
        { grade: 'DIST', min_score: 80, max_score: 100 },
        { grade: 'CRED', min_score: 50, max_score: 79 },
        { grade: 'PASS1', min_score: 40, max_score: 49 },
        { grade: 'F', min_score: 0, max_score: 39 },
      ],
    })
    expect(err).toBeNull()
  })

  it('validateGradingSetup rejects labels that become empty after stripping spaces', () => {
    const err = validateGradingSetup({
      enable_ranking: true,
      show_class_average: true,
      show_teacher_remarks: true,
      assessment_types: [
        { name: 'CA', weight_percent: 30 },
        { name: 'Exam', weight_percent: 70 },
      ],
      grade_bands: [
        { grade: '   ', min_score: 50, max_score: 100 },
        { grade: 'F', min_score: 0, max_score: 49 },
      ],
    })
    expect(err).toMatch(/grade label/i)
  })
})
