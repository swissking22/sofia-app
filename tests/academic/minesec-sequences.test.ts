import {
  calculateAnnual,
  minesecCameroonSequences20,
} from '../../main/domain/results-calculation'
import {
  calculateCAAverage,
  calculateSubjectMark,
  calculateTermAverage,
  calculateSubjectResult,
  validateClassCalculation,
} from '../../main/services/results/result-calculation.service'

describe('MINESEC Cameroon sequences model', () => {
  it('averages two sequences into the subject term mark (no exam weight)', () => {
    const config = minesecCameroonSequences20()
    expect(config.ca_weight).toBe(100)
    expect(config.exam_weight).toBe(0)
    expect(config.expected_sequences).toBe(2)
    expect(config.term_plans).toHaveLength(3)
    expect(config.term_plans?.every((t) => t.sequences_count === 2 && t.exams_count === 0)).toBe(
      true
    )

    const ca = calculateCAAverage(
      [
        { name: 'Sequence 1', raw: 14, max: 20 },
        { name: 'Sequence 2', raw: 12, max: 20 },
      ],
      { targetScale: 20, method: 'simple_average' }
    )
    expect(ca.average).toBe(13)

    const mark = calculateSubjectMark(ca.average, null, 100, 0)
    expect(mark.incomplete).toBe(false)
    expect(mark.subjectMark).toBe(13)
  })

  it('matches the Ministry example for coefficient-weighted term average', () => {
    // Math 14×4, Eng 12.5×3, Hist 11×2, Fr 15×3 → 160.5 / 12 = 13.375
    const term = calculateTermAverage([
      { weightedMark: 14 * 4, coefficient: 4 },
      { weightedMark: 12.5 * 3, coefficient: 3 },
      { weightedMark: 11 * 2, coefficient: 2 },
      { weightedMark: 15 * 3, coefficient: 3 },
    ])
    expect(term.totalWeightedMarks).toBeCloseTo(160.5, 5)
    expect(term.totalCoefficients).toBe(12)
    expect(term.termAverage).toBeCloseTo(13.375, 5)
  })

  it('computes annual average as mean of three term averages', () => {
    const annual = calculateAnnual([12, 13, 14], {
      method: 'average',
      term_weights: [],
      best_n: null,
    })
    expect(annual).toBeCloseTo(13, 5)
  })

  it('subject result is complete with two sequences and no exam under MINESEC config', () => {
    const config = minesecCameroonSequences20()
    const res = calculateSubjectResult({
      subjectId: 'math',
      subjectName: 'Mathematics',
      sequences: [
        { name: 'Sequence 1', raw: 14, max: 20 },
        { name: 'Sequence 2', raw: 16, max: 20 },
      ],
      exam: null,
      coefficient: 4,
      caWeight: config.ca_weight,
      examWeight: config.exam_weight,
      passMark: config.pass_mark,
      targetScale: 20,
      sequenceMethod: 'simple_average',
      missingPolicy: 'exclude',
    })
    expect(res.incomplete).toBe(false)
    expect(res.ca_average).toBe(15)
    expect(res.subject_mark).toBe(15)
    expect(res.weighted_mark).toBe(60)
  })

  it('does not warn about missing exams when exam weight is 0', () => {
    const config = minesecCameroonSequences20()
    const validation = validateClassCalculation({
      config,
      students: [{ id: 's1' }],
      subjects: [{ id: 'math', name: 'Mathematics' }],
      coefficientsMap: new Map([['math', 4]]),
      caAssessments: [
        {
          subject_id: 'math',
          max_score: 20,
          scores: [{ student_id: 's1', score: 12 }],
        },
        {
          subject_id: 'math',
          max_score: 20,
          scores: [{ student_id: 's1', score: 14 }],
        },
      ],
      examPapers: [],
    })
    expect(
      validation.warnings.some((w) => w.code === 'NO_EXAM_PAPER')
    ).toBe(false)
  })
})
