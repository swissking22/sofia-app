import { TeachingProgressService } from '../../main/services/teaching-progress'

describe('TeachingProgressService', () => {
  it('creates coverage from leaf topics and advances it from logs', () => {
    const service = new TeachingProgressService([
      { id: 'alg', parent_id: null, coverage_status: 'not_started' },
      { id: 'lin', parent_id: 'alg', coverage_status: 'not_started' },
      { id: 'sim', parent_id: 'alg', coverage_status: 'not_started' },
      { id: 'geo', parent_id: null, coverage_status: 'not_started' },
    ])

    service.recordLog('lin', 'completed')
    service.recordLog('sim', 'taught')

    const snap = service.snapshot('2026-09-01', '2027-06-30', '2026-09-01')
    expect(snap.total).toBe(3)
    expect(snap.completed).toBe(1)
    expect(snap.in_progress).toBe(1)
    expect(snap.not_started).toBe(1)
    expect(snap.percent).toBeCloseTo(33.3, 0)
  })

  it('does not let planned lessons mark a topic as covered', () => {
    const service = new TeachingProgressService([
      { id: 't1', parent_id: null, coverage_status: 'not_started' },
    ])
    service.recordLog('t1', 'planned')
    expect(service.topics[0].coverage_status).toBe('not_started')
  })

  it('compares expected calendar progress with actual coverage', () => {
    const service = new TeachingProgressService([
      { id: 'a', parent_id: null, coverage_status: 'completed' },
      { id: 'b', parent_id: null, coverage_status: 'completed' },
      { id: 'c', parent_id: null, coverage_status: 'not_started' },
      { id: 'd', parent_id: null, coverage_status: 'not_started' },
    ])
    const mid = service.snapshot('2026-01-01', '2026-12-31', '2026-07-01')
    expect(mid.percent).toBe(50)
    expect(mid.expected).toBeGreaterThan(40)
    expect(['behind', 'on_track', 'ahead']).toContain(mid.schedule)
  })
})
