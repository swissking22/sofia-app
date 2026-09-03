import {
  assertSchoolScope,
  assertUnlocked,
  calculateAnnual,
  calculateGpa,
  calculateOverall,
  calculateSubjectScore,
  canActivateProfile,
  demoStandard4060,
  demoUpperSecondary,
  evaluatePromotion,
  gradeForScore,
  hasPermission,
  hashConfig,
  mapComponentInputs,
  rankStudents,
  roundValue,
  validateWeights,
  type CalculationConfig,
} from '../../main/domain/results-calculation'
import { calculateClass } from '../../main/services/results/calculation-engine'

function scores(
  config: CalculationConfig,
  map: Record<string, { raw: number | null; max?: number; status?: 'recorded' | 'missing' | 'absent' }>
) {
  return config.components.map((c) => ({
    componentId: c.id,
    raw: map[c.id]?.raw ?? null,
    max: map[c.id]?.max ?? c.max_score,
    status: map[c.id]?.status,
  }))
}

describe('weighted subject calculation', () => {
  it('calculates 40/60 from 15/20 and 70/100 as 72%', () => {
    const config = demoStandard4060()
    const result = calculateSubjectScore(
      config,
      scores(config, { ca: { raw: 15, max: 20 }, exam: { raw: 70, max: 100 } })
    )
    expect(result.score).toBe(72)
    expect(result.grade).toBe('B')
    expect(result.passed).toBe(true)
  })

  it('calculates 30/70 weighted', () => {
    const config = demoStandard4060()
    config.components[0].weight_percent = 30
    config.components[1].weight_percent = 70
    const result = calculateSubjectScore(
      config,
      scores(config, { ca: { raw: 80, max: 100 }, exam: { raw: 60, max: 100 } })
    )
    expect(result.score).toBe(66)
  })

  it('supports multiple assessment components', () => {
    const config = demoUpperSecondary()
    const result = calculateSubjectScore(
      config,
      scores(config, {
        t1: { raw: 15, max: 20 },
        t2: { raw: 17, max: 20 },
        asg: { raw: 16, max: 20 },
        cw: { raw: 18, max: 20 },
        exam: { raw: 70, max: 100 },
      })
    )
    expect(result.score).toBeCloseTo(75, 0)
  })
})

describe('nested groups and methods', () => {
  const nested: CalculationConfig = {
    ...demoStandard4060(),
    groups: [
      { id: 'ca_g', name: 'Continuous Assessment', weight_percent: 40, method: 'weighted', best_n: null, order: 1 },
      { id: 'ex_g', name: 'Examination', weight_percent: 60, method: 'weighted', best_n: null, order: 2 },
    ],
    components: [
      { id: 't1', name: 'Test 1', code: 'T1', type: 'test', source: 'named', max_score: 20, weight_percent: 20, order: 1, required: true, group_id: 'ca_g' },
      { id: 't2', name: 'Test 2', code: 'T2', type: 'test', source: 'named', max_score: 20, weight_percent: 30, order: 2, required: true, group_id: 'ca_g' },
      { id: 'asg', name: 'Assignment', code: 'ASG', type: 'assignment', source: 'named', max_score: 20, weight_percent: 50, order: 3, required: true, group_id: 'ca_g' },
      { id: 'exam', name: 'Final Exam', code: 'EXAM', type: 'final_exam', source: 'exam', max_score: 100, weight_percent: 100, order: 4, required: true, group_id: 'ex_g' },
    ],
  }

  it('nests tests into CA then combines with exam', () => {
    const result = calculateSubjectScore(nested, [
      { componentId: 't1', raw: 20, max: 20 },
      { componentId: 't2', raw: 10, max: 20 },
      { componentId: 'asg', raw: 10, max: 20 },
      { componentId: 'exam', raw: 80, max: 100 },
    ])
    expect(result.score).toBeGreaterThan(60)
    expect(result.score).toBeLessThan(80)
  })

  it('takes best N of 3 tests', () => {
    const config: CalculationConfig = {
      ...demoStandard4060(),
      method: 'best_n',
      best_n: 2,
      components: [
        { id: 'a', name: 'T1', code: 'A', type: 'test', source: 'named', max_score: 100, weight_percent: 0, order: 1, required: false, group_id: null },
        { id: 'b', name: 'T2', code: 'B', type: 'test', source: 'named', max_score: 100, weight_percent: 0, order: 2, required: false, group_id: null },
        { id: 'c', name: 'T3', code: 'C', type: 'test', source: 'named', max_score: 100, weight_percent: 0, order: 3, required: false, group_id: null },
      ],
    }
    const result = calculateSubjectScore(config, [
      { componentId: 'a', raw: 40 },
      { componentId: 'b', raw: 90 },
      { componentId: 'c', raw: 80 },
    ])
    expect(result.score).toBe(85)
  })

  it('uses a simple average', () => {
    const config: CalculationConfig = {
      ...demoStandard4060(),
      method: 'simple_average',
      components: [
        { id: 'a', name: 'T1', code: 'A', type: 'test', source: 'named', max_score: 100, weight_percent: 50, order: 1, required: true, group_id: null },
        { id: 'b', name: 'T2', code: 'B', type: 'test', source: 'named', max_score: 100, weight_percent: 50, order: 2, required: true, group_id: null },
      ],
    }
    const result = calculateSubjectScore(config, [
      { componentId: 'a', raw: 60 },
      { componentId: 'b', raw: 80 },
    ])
    expect(result.score).toBe(70)
  })
})

describe('overrides, grades, GPA, rounding', () => {
  it('applies a subject-specific pass mark and components', () => {
    const config = demoStandard4060()
    config.subject_overrides = [
      {
        subject_id: 'math',
        pass_mark: 40,
        credit: 2,
        optional: false,
        include_in_average: true,
      },
    ]
    const result = calculateSubjectScore(
      config,
      scores(config, { ca: { raw: 40 }, exam: { raw: 40 } }),
      'math'
    )
    expect(result.score).toBe(40)
    expect(result.passed).toBe(true)
  })

  it('uses a different grading scale', () => {
    const config = demoUpperSecondary()
    const band = gradeForScore(85, config.grading)
    expect(band?.grade).toBe('A2')
    const fail = gradeForScore(45, config.grading)
    expect(fail?.grade).toBe('F')
    expect(fail?.is_pass).toBe(false)
  })

  it('calculates GPA from grade points and credits', () => {
    const gpa = calculateGpa([
      { grade_point: 4, gpa_credits: 2, incomplete: false, include_in_average: true },
      { grade_point: 2, gpa_credits: 1, incomplete: false, include_in_average: true },
    ])
    expect(gpa).toBeCloseTo(10 / 3, 5)
  })

  it('rounds half up, half down, and to 2 decimal places', () => {
    expect(roundValue(72.45, { places: 1, half: 'up' })).toBe(72.5)
    expect(roundValue(72.45, { places: 1, half: 'down' })).toBe(72.4)
    expect(roundValue(72.456, { places: 2, half: 'standard' })).toBe(72.46)
    expect(roundValue(72.4, { places: 'none', half: 'standard' })).toBe(72.4)
  })
})

describe('missing and absent scores', () => {
  it('does not treat missing as zero by default', () => {
    const config = demoStandard4060()
    const result = calculateSubjectScore(config, [
      { componentId: 'ca', raw: null, status: 'missing' },
      { componentId: 'exam', raw: 80 },
    ])
    expect(result.incomplete).toBe(true)
    expect(result.score).toBeNull()
  })

  it('treats absent as zero only when configured', () => {
    const config = demoStandard4060()
    config.absent_policy = 'zero'
    const result = calculateSubjectScore(config, [
      { componentId: 'ca', raw: null, status: 'absent' },
      { componentId: 'exam', raw: 80, max: 100 },
    ])
    expect(result.incomplete).toBe(false)
    expect(result.score).toBe(48)
  })
})

describe('overall average, optional subjects, ranking, promotion', () => {
  it('weights subjects and can exclude optional ones', () => {
    const avg = calculateOverall('credit', [
      { score: 80, incomplete: false, include_in_average: true, optional: false, gpa_credits: 2 },
      { score: 40, incomplete: false, include_in_average: true, optional: false, gpa_credits: 1 },
      { score: 100, incomplete: false, include_in_average: false, optional: true, gpa_credits: 1 },
    ])
    expect(avg).toBeCloseTo(200 / 3, 5)
  })

  it('ranks ties with competition and dense methods', () => {
    const rows = [
      { id: 'a', value: 85 },
      { id: 'b', value: 85 },
      { id: 'c', value: 80 },
    ]
    const competition = rankStudents(rows, 'competition')
    expect(competition.map((r) => r.rank)).toEqual([1, 1, 3])
    const dense = rankStudents(rows, 'dense')
    expect(dense.map((r) => r.rank)).toEqual([1, 1, 2])
  })

  it('evaluates promotion rules without auto-promoting', () => {
    const config = demoStandard4060().promotion
    const pending = evaluatePromotion(config, {
      average: 55,
      failed_subjects: 1,
      passed_subjects: 8,
      required_failed: false,
    })
    expect(pending.outcome).toBe('pending_review')
    const fail = evaluatePromotion(config, {
      average: 40,
      failed_subjects: 3,
      passed_subjects: 5,
      required_failed: false,
    })
    expect(fail.outcome).toBe('not_promoted')
  })

  it('averages or weights terms for an annual result', () => {
    expect(calculateAnnual([60, 70, 80], { method: 'average', term_weights: [], best_n: null })).toBe(70)
    expect(
      calculateAnnual([60, 70, 80], {
        method: 'weighted',
        term_weights: [
          { term_number: 1, weight_percent: 30 },
          { term_number: 2, weight_percent: 30 },
          { term_number: 3, weight_percent: 40 },
        ],
        best_n: null,
      })
    ).toBe(71)
    expect(calculateAnnual([40, 90, 70], { method: 'best_n', term_weights: [], best_n: 2 })).toBe(80)
  })
})

describe('snapshots, isolation, permissions, weights, locks', () => {
  it('hashes a configuration for historical snapshots', () => {
    const a = hashConfig(demoStandard4060())
    const b = hashConfig(demoStandard4060())
    const c = hashConfig(demoUpperSecondary())
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toHaveLength(64)
  })

  it('isolates school records', () => {
    expect(() => assertSchoolScope('school-a', 'school-b')).toThrow(/another school/)
    expect(() => assertSchoolScope('school-a', 'school-a')).not.toThrow()
  })

  it('enforces permissions server-side', () => {
    expect(hasPermission(['results.read'], ['results.calculate'], false)).toBe(false)
    expect(hasPermission(['results.calculate'], ['results.calculate'], false)).toBe(true)
    expect(hasPermission([], ['results.lock'], true)).toBe(true)
  })

  it('rejects invalid weight totals before activation', () => {
    const config = demoStandard4060()
    config.components[1].weight_percent = 50
    const check = validateWeights(config)
    expect(check.ok).toBe(false)
    expect(check.error).toMatch(/90%/)
    expect(canActivateProfile(config).ok).toBe(false)
  })

  it('protects locked results', () => {
    expect(() => assertUnlocked('locked')).toThrow(/locked/)
    expect(() => assertUnlocked('computed')).not.toThrow()
  })
})

describe('class calculation engine', () => {
  it('applies class profile consistently across students', () => {
    const config = demoStandard4060()
    const out = calculateClass(
      config,
      [{ id: 's1' }, { id: 's2' }],
      [{ id: 'math', name: 'Mathematics' }],
      [
        {
          studentId: 's1',
          subjectId: 'math',
          ca: [{ name: 'Continuous Assessment', max: 20, score: 15 }],
          exam: { name: 'Exam', max: 100, score: 70 },
        },
        {
          studentId: 's2',
          subjectId: 'math',
          ca: [{ name: 'Continuous Assessment', max: 20, score: 10 }],
          exam: { name: 'Exam', max: 100, score: 50 },
        },
      ]
    )
    expect(out.summaries[0].position).toBe(1)
    expect(out.hash).toBe(hashConfig(config))
    expect(out.subject_rows).toHaveLength(2)
  })

  it('maps named CA assessments onto components', () => {
    const mapped = mapComponentInputs(
      demoUpperSecondary().components,
      [
        { name: 'Test 1', max: 20, score: 15 },
        { name: 'Test 2', max: 20, score: 17 },
      ],
      { name: 'Exam', max: 100, score: 70 }
    )
    expect(mapped.find((m) => m.componentId === 't1')?.raw).toBe(15)
    expect(mapped.find((m) => m.componentId === 'exam')?.raw).toBe(70)
  })
})
