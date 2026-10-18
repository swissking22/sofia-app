import { SyncBudget } from '../../main/sync/budget'

describe('SyncBudget', () => {
  it('is disabled when both caps are zero', () => {
    const b = new SyncBudget({ maxDurationMs: 0, maxItems: 0 })
    expect(b.enabled).toBe(false)
    expect(b.exhausted()).toBe(false)
  })

  it('exhausts on item cap', () => {
    const b = new SyncBudget({ maxDurationMs: 0, maxItems: 3 })
    expect(b.enabled).toBe(true)
    b.add(2)
    expect(b.exhausted()).toBe(false)
    b.add(1)
    expect(b.exhausted()).toBe(true)
    expect(b.stoppedReason).toBe('items')
  })

  it('exhausts on time cap', () => {
    const b = new SyncBudget({ maxDurationMs: 1, maxItems: 0 })
    const start = Date.now()
    while (Date.now() - start < 5) {
      /* spin */
    }
    expect(b.exhausted()).toBe(true)
    expect(b.stoppedReason).toBe('time')
  })
})
