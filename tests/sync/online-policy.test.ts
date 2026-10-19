import { resolveSyncOnlinePolicy } from '../../main/sync/online-policy'

const okResponse = { ok: true, status: 200 } as Response

describe('sync online policy', () => {
  it('allows full drain when RTT is healthy', async () => {
    const fetchFn = (async () => okResponse) as unknown as typeof fetch

    const policy = await resolveSyncOnlinePolicy({
      fetchFn,
      supabaseUrl: 'https://example.supabase.co',
      slowRttMs: 2500,
    })
    expect(policy.maxLane).toBeUndefined()
    expect(policy.parallelPushConcurrency).toBe(3)
    expect(policy.batchSizeCap).toBe(100)
    expect(policy.reason).toMatch(/^ok-rtt:/)
  })

  it('restricts to critical when RTT is slow', async () => {
    const fetchFn = (async () => {
      await new Promise((r) => setTimeout(r, 30))
      return okResponse
    }) as unknown as typeof fetch

    const policy = await resolveSyncOnlinePolicy({
      fetchFn,
      supabaseUrl: 'https://example.supabase.co',
      slowRttMs: 10,
    })
    expect(policy.maxLane).toBe('critical')
    expect(policy.parallelPushConcurrency).toBe(1)
    expect(policy.batchSizeCap).toBe(40)
    expect(policy.reason).toMatch(/^slow-rtt:/)
  })

  it('restricts to critical when the probe fails', async () => {
    const fetchFn = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch

    const policy = await resolveSyncOnlinePolicy({
      fetchFn,
      supabaseUrl: 'https://example.supabase.co',
    })
    expect(policy.maxLane).toBe('critical')
    expect(policy.parallelPushConcurrency).toBe(1)
    expect(policy.batchSizeCap).toBe(25)
    expect(policy.reason).toBe('probe-failed')
  })

  it('stays open when no Supabase URL is configured', async () => {
    const policy = await resolveSyncOnlinePolicy({
      supabaseUrl: null,
    })
    expect(policy.maxLane).toBeUndefined()
    expect(policy.parallelPushConcurrency).toBe(3)
    expect(policy.reason).toBe('no-url')
  })
})
