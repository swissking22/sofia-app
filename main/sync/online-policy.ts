/**
 * Network-aware sync policy: slow or flaky links stay on the critical lane
 * with smaller batches; healthy links allow full drain + parallel push.
 */
import type { SyncLane } from './lanes'

export type SyncOnlinePolicy = {
  /** Restrict push to this lane (and earlier). */
  maxLane?: SyncLane
  /** Cap adaptive batch size. */
  batchSizeCap?: number
  /** Parallel table concurrency (1 = sequential). */
  parallelPushConcurrency: number
  /** Human label for logs / progress. */
  reason: string
}

const SLOW_RTT_MS = 2500
const PROBE_TIMEOUT_MS = 4000

function supabaseRestRoot(): string | null {
  try {
    const raw = (process.env.SUPABASE_URL || '')
      .replace(/\/+$/, '')
      .replace(/\/rest\/v1\/?$/, '')
    return raw || null
  } catch {
    return null
  }
}

/**
 * Probe cloud latency with a cheap HEAD/GET. Offline → critical-only.
 * Slow RTT → critical + small batches + no parallel.
 */
export async function resolveSyncOnlinePolicy(options?: {
  fetchFn?: typeof fetch
  supabaseUrl?: string | null
  /** Override slow threshold (ms); tests only. */
  slowRttMs?: number
  /** Override probe timeout (ms); tests only. */
  probeTimeoutMs?: number
}): Promise<SyncOnlinePolicy> {
  const fetchFn = options?.fetchFn || fetch
  const base = options?.supabaseUrl ?? supabaseRestRoot()
  const slowMs = options?.slowRttMs ?? SLOW_RTT_MS
  const timeoutMs = options?.probeTimeoutMs ?? PROBE_TIMEOUT_MS

  if (!base) {
    return {
      maxLane: undefined,
      parallelPushConcurrency: 3,
      reason: 'no-url',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    await fetchFn(`${base}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const rtt = Date.now() - started
    if (rtt >= slowMs) {
      return {
        maxLane: 'critical',
        batchSizeCap: 40,
        parallelPushConcurrency: 1,
        reason: `slow-rtt:${rtt}ms`,
      }
    }
    return {
      maxLane: undefined,
      batchSizeCap: 100,
      parallelPushConcurrency: 3,
      reason: `ok-rtt:${rtt}ms`,
    }
  } catch {
    // Abort / network error — still try sync (queue may work) but stay conservative.
    return {
      maxLane: 'critical',
      batchSizeCap: 25,
      parallelPushConcurrency: 1,
      reason: 'probe-failed',
    }
  } finally {
    clearTimeout(timer)
  }
}
