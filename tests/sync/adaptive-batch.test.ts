import {
  clampBatchSize,
  looksLikeTimeoutOrNetwork,
  nextAdaptiveBatchSize,
} from '../../main/sync/adaptive-batch'
import { leanSyncPayload } from '../../main/sync/lean-payload'

describe('adaptive batch size', () => {
  it('grows on full success and shrinks on timeout failure', () => {
    expect(
      nextAdaptiveBatchSize(50, {
        successful: 50,
        failed: 0,
        processed: 50,
      })
    ).toBe(60)

    expect(
      nextAdaptiveBatchSize(80, {
        successful: 0,
        failed: 80,
        processed: 80,
        message: 'Request timed out',
      })
    ).toBe(40)
  })

  it('clamps to min/max', () => {
    expect(clampBatchSize(5)).toBe(25)
    expect(clampBatchSize(500)).toBe(100)
    expect(looksLikeTimeoutOrNetwork('fetch failed')).toBe(true)
  })
})

describe('lean sync payload', () => {
  it('strips nulls, secrets, and blob keys', () => {
    const lean = leanSyncPayload('users', {
      id: 'u1',
      email: 'a@b.c',
      password_hash: 'secret',
      photo_blob: 'xxx',
      nickname: null,
      role_id: 'r1',
    })
    expect(lean).toEqual({
      id: 'u1',
      email: 'a@b.c',
      role_id: 'r1',
    })
  })
})
