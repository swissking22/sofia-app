import {
  CAMEROON_20_BANDS,
  computeClassStats,
  defaultReportCardTemplate,
  extractGradingFromSnapshot,
  formatGradeRange,
  gceGradeForMark20,
  gradingScaleLegend,
  isOfferedSubjectRow,
  ordinalPosition,
  parseReportCardTemplateOverrides,
} from '../../main/domain/report-card'
import { gradeForScore } from '../../main/domain/results-calculation'

describe('Official report card domain', () => {
  it('builds default bilingual template with FR left / EN right lines', () => {
    const t = defaultReportCardTemplate()
    expect(t.bilingual_header.fr_lines[0]).toMatch(/CAMEROUN/i)
    expect(t.bilingual_header.en_lines[0]).toMatch(/CAMEROON/i)
    expect(t.title_en).toBe('STUDENT REPORT CARD')
    expect(t.title_fr).toBe('BULLETIN DE NOTES')
    expect(t.version).toBe(1)
  })

  it('parses school template overrides from document body JSON', () => {
    const overrides = parseReportCardTemplateOverrides(
      JSON.stringify({
        sofia_report_card: {
          title_en: 'TERM REPORT',
          bilingual_header: {
            fr_lines: ['RÉPUBLIQUE DU CAMEROUN', 'Custom FR'],
            en_lines: ['REPUBLIC OF CAMEROON', 'Custom EN'],
          },
          show_gce: false,
        },
      })
    )
    const t = defaultReportCardTemplate(overrides)
    expect(t.title_en).toBe('TERM REPORT')
    expect(t.show_gce).toBe(false)
    expect(t.bilingual_header.fr_lines[1]).toBe('Custom FR')
    expect(parseReportCardTemplateOverrides('<p>html</p>')).toEqual({})
    expect(parseReportCardTemplateOverrides('{not json')).toEqual({})
  })

  it('builds grading legend from configured bands (not hard-coded thresholds)', () => {
    const legend = gradingScaleLegend(CAMEROON_20_BANDS)
    expect(legend[0].grade).toBe('A')
    expect(legend[0].range_label).toBe(formatGradeRange(16, 20))
    expect(legend.find((g) => g.grade === 'F')?.remark).toBe('Fail')
  })

  it('maps /20 marks to letter grades and GCE grades via engines', () => {
    expect(gradeForScore(16, CAMEROON_20_BANDS)?.grade).toBe('A')
    expect(gradeForScore(10, CAMEROON_20_BANDS)?.remark).toMatch(/Pass/i)
    expect(gceGradeForMark20(18)).toBe('A1') // 90%
    expect(gceGradeForMark20(16)).toBe('A2') // 80%
    expect(gceGradeForMark20(null)).toBeNull()
  })

  it('treats fully blank subject rows as not offered (blank ≠ zero)', () => {
    expect(
      isOfferedSubjectRow({
        ca_score: null,
        exam_score: null,
        subject_mark: null,
        total: null,
      })
    ).toBe(false)
    expect(
      isOfferedSubjectRow({
        ca_score: 12,
        exam_score: null,
        subject_mark: null,
      })
    ).toBe(true)
    expect(
      isOfferedSubjectRow({
        ca_score: null,
        exam_score: null,
        subject_mark: 0,
      })
    ).toBe(true)
  })

  it('computes class average / high / low from result summaries', () => {
    const stats = computeClassStats([14.2, 12, null, 10.5, undefined])
    expect(stats.class_size).toBe(3)
    expect(stats.class_average).toBeCloseTo(12.23, 1)
    expect(stats.highest_average).toBe(14.2)
    expect(stats.lowest_average).toBe(10.5)
    expect(computeClassStats([]).class_average).toBeNull()
  })

  it('extracts grading bands from result-run calculation snapshots', () => {
    const bands = extractGradingFromSnapshot(
      JSON.stringify({
        label: 'Cameroon v1',
        config: { grading: CAMEROON_20_BANDS },
      })
    )
    expect(bands?.length).toBe(CAMEROON_20_BANDS.length)
    expect(extractGradingFromSnapshot(null)).toBeNull()
    expect(extractGradingFromSnapshot('{bad')).toBeNull()
  })

  it('formats ordinal positions for the summary block', () => {
    expect(ordinalPosition(1)).toBe('1st')
    expect(ordinalPosition(2)).toBe('2nd')
    expect(ordinalPosition(3)).toBe('3rd')
    expect(ordinalPosition(11)).toBe('11th')
    expect(ordinalPosition(22)).toBe('22nd')
    expect(ordinalPosition(null)).toBe('—')
  })
})
