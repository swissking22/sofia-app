import {
  computeSyncPercent,
  SyncProgressTracker,
} from '../../main/sync/progress'

describe('Sync progress percent', () => {
  test('computeSyncPercent weights push and pull totals', () => {
    expect(computeSyncPercent(0, 0, 0, 0)).toBe(100)
    expect(computeSyncPercent(50, 100, 0, 100)).toBe(25)
    expect(computeSyncPercent(100, 100, 50, 100)).toBe(75)
    expect(computeSyncPercent(100, 100, 100, 100)).toBe(100)
  })

  test('tracker reports push then pull percentages', () => {
    const events: Array<{ percent: number; phase: string; message: string }> =
      []
    const tracker = new SyncProgressTracker({
      pushTotal: 100,
      pullTotal: 100,
      pullCountKnown: true,
      onProgress: (e) => events.push(e),
    })

    tracker.report('starting')
    tracker.addPush(50)
    tracker.report('push')
    tracker.addPull(50)
    tracker.report('pull')
    tracker.addPush(50)
    tracker.addPull(50)
    tracker.report('done')

    expect(events[0].phase).toBe('starting')
    expect(events[0].percent).toBe(0)
    expect(events[1].percent).toBe(25)
    expect(events[1].message).toMatch(/Uploading 50 of 100/)
    expect(events[2].percent).toBe(50)
    expect(events[2].message).toMatch(/Downloading 50 of 100/)
    expect(events[events.length - 1].percent).toBe(100)
    expect(events[events.length - 1].phase).toBe('done')
  })

  test('unknown pull count uses indeterminate until work appears', () => {
    const events: Array<{ indeterminate?: boolean; percent: number }> = []
    const tracker = new SyncProgressTracker({
      pushTotal: 0,
      pullTotal: 0,
      pullCountKnown: false,
      onProgress: (e) => events.push(e),
    })
    tracker.report('pull')
    expect(events[0].indeterminate).toBe(true)
    tracker.addPull(10)
    tracker.notePullHasMore(100)
    tracker.report('pull')
    expect(events[1].indeterminate).toBeFalsy()
    expect(events[1].percent).toBeGreaterThan(0)
  })
})
