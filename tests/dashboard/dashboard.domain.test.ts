import {
  aggregateAcademicPerformance,
  aggregateDistribution,
  buildAttendanceTrend,
  buildFeeCollectionTrend,
  feePeriodStats,
  formatCompactCurrency,
  greetingForHour,
  isIncompleteStudentProfile,
  resolveAttendanceRange,
  shouldShowDepartmentDonut,
  suggestFeeGranularity,
  summarizeAttendanceMarks,
} from '../../main/domain/dashboard'

describe('dashboard domain', () => {
  describe('greetingForHour', () => {
    it('returns morning / afternoon / evening', () => {
      expect(greetingForHour(8)).toBe('Good morning')
      expect(greetingForHour(14)).toBe('Good afternoon')
      expect(greetingForHour(20)).toBe('Good evening')
    })
  })

  describe('summarizeAttendanceMarks', () => {
    it('returns recorded:false when no marks', () => {
      const s = summarizeAttendanceMarks({
        present: 0,
        late: 0,
        absent: 0,
        excused: 0,
      })
      expect(s.recorded).toBe(false)
      expect(s.rate).toBeNull()
    })

    it('counts present+late toward rate', () => {
      const s = summarizeAttendanceMarks({
        present: 90,
        late: 5,
        absent: 5,
        excused: 0,
      })
      expect(s.recorded).toBe(true)
      expect(s.rate).toBe(95)
    })
  })

  describe('buildAttendanceTrend', () => {
    it('requires at least two days', () => {
      const one = buildAttendanceTrend([
        { date: '2026-09-01', present: 10, late: 0, absent: 0, excused: 0 },
      ])
      expect(one.available).toBe(false)

      const two = buildAttendanceTrend([
        { date: '2026-09-01', present: 10, late: 0, absent: 1, excused: 0 },
        { date: '2026-09-02', present: 9, late: 1, absent: 0, excused: 0 },
      ])
      expect(two.available).toBe(true)
      expect(two.points).toHaveLength(2)
    })
  })

  describe('buildFeeCollectionTrend', () => {
    it('aggregates by day', () => {
      const trend = buildFeeCollectionTrend(
        [
          { paid_at: '2026-09-01T10:00:00', amount: 1000 },
          { paid_at: '2026-09-01T12:00:00', amount: 500 },
          { paid_at: '2026-09-02T09:00:00', amount: 2000 },
        ],
        { from: '2026-09-01', to: '2026-09-02' },
        'day'
      )
      expect(trend.available).toBe(true)
      expect(trend.points).toHaveLength(2)
      expect(trend.points[0].value).toBe(1500)
    })

    it('empty when no payments', () => {
      const trend = buildFeeCollectionTrend(
        [],
        { from: '2026-09-01', to: '2026-09-30' },
        'week'
      )
      expect(trend.available).toBe(false)
    })
  })

  describe('suggestFeeGranularity', () => {
    it('picks day / week / month by span', () => {
      expect(suggestFeeGranularity('2026-09-01', '2026-09-10')).toBe('day')
      expect(suggestFeeGranularity('2026-09-01', '2026-10-15')).toBe('week')
      expect(suggestFeeGranularity('2026-01-01', '2026-12-31')).toBe('month')
    })
  })

  describe('aggregateDistribution', () => {
    const students = [
      { id: '1', class_id: 'c1', academic_level_id: 'l1' },
      { id: '2', class_id: 'c1', academic_level_id: 'l1' },
      { id: '3', class_id: 'c2', academic_level_id: 'l2' },
    ]
    const classes = [
      {
        id: 'c1',
        name: 'Form 1 A',
        academic_level_id: 'l1',
        section_id: 'sec1',
      },
      {
        id: 'c2',
        name: 'Form 2 A',
        academic_level_id: 'l2',
        section_id: 'sec2',
      },
    ]
    const levels = [
      { id: 'l1', name: 'Form 1', sort_order: 1 },
      { id: 'l2', name: 'Form 2', sort_order: 2 },
    ]
    const sections = [
      { id: 'sec1', name: 'General' },
      { id: 'sec2', name: 'Commercial' },
    ]

    it('groups by level', () => {
      const bars = aggregateDistribution(
        students,
        classes,
        levels,
        sections,
        'level'
      )
      expect(bars).toHaveLength(2)
      expect(bars[0].label).toBe('Form 1')
      expect(bars[0].value).toBe(2)
    })

    it('groups by department (section)', () => {
      const bars = aggregateDistribution(
        students,
        classes,
        levels,
        sections,
        'department'
      )
      expect(bars.map((b) => b.label).sort()).toEqual([
        'Commercial',
        'General',
      ])
    })
  })

  describe('shouldShowDepartmentDonut', () => {
    it('only for 2–5 categories', () => {
      expect(
        shouldShowDepartmentDonut([
          { id: 'a', label: 'A', value: 1 },
          { id: 'b', label: 'B', value: 1 },
        ])
      ).toBe(true)
      expect(
        shouldShowDepartmentDonut([{ id: 'a', label: 'A', value: 1 }])
      ).toBe(false)
    })
  })

  describe('aggregateAcademicPerformance', () => {
    it('ignores empty summaries', () => {
      expect(aggregateAcademicPerformance([]).available).toBe(false)
    })

    it('averages by level and does not treat missing as zero', () => {
      const result = aggregateAcademicPerformance([
        {
          average: 70,
          class_id: 'c1',
          level_id: 'l1',
          level_name: 'Form 1',
          level_sort: 1,
        },
        {
          average: 80,
          class_id: 'c1',
          level_id: 'l1',
          level_name: 'Form 1',
          level_sort: 1,
        },
        {
          average: 60,
          class_id: 'c2',
          level_id: 'l2',
          level_name: 'Form 2',
          level_sort: 2,
        },
      ])
      expect(result.available).toBe(true)
      expect(result.bars[0].average).toBe(75)
      expect(result.bars[1].average).toBe(60)
    })
  })

  describe('isIncompleteStudentProfile', () => {
    it('flags missing gender / dob / guardian phone', () => {
      expect(
        isIncompleteStudentProfile({
          gender: 'Male',
          date_of_birth: '2010-01-01',
          guardian_phone: '670000001',
        })
      ).toBe(false)
      expect(
        isIncompleteStudentProfile({
          gender: null,
          date_of_birth: '2010-01-01',
          guardian_phone: '670000001',
        })
      ).toBe(true)
    })
  })

  describe('feePeriodStats', () => {
    it('computes percent of billed when billed > 0', () => {
      const s = feePeriodStats({ billed: 100_000, collected: 80_000 })
      expect(s.percentOfExpected).toBe(80)
    })

    it('omits percent when nothing billed', () => {
      const s = feePeriodStats({ billed: 0, collected: 500 })
      expect(s.percentOfExpected).toBeNull()
    })
  })

  describe('formatCompactCurrency', () => {
    it('formats K and M', () => {
      expect(formatCompactCurrency(18_400_000, 'XAF')).toContain('M')
      expect(formatCompactCurrency(4_700, 'XAF')).toContain('K')
    })
  })

  describe('resolveAttendanceRange', () => {
    it('uses term dates when range is term', () => {
      const r = resolveAttendanceRange('term', '2026-09-20', {
        start_date: '2026-09-01',
        end_date: '2026-12-15',
      })
      expect(r.from).toBe('2026-09-01')
      expect(r.to).toBe('2026-09-20')
    })
  })
})
