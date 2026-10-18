/**
 * Adaptive push batch size: grow when healthy, shrink on timeouts / total failure.
 * Sequential only — does not introduce multi-row RPC or parallelism.
 */

export const ADAPTIVE_BATCH_MIN = 25
export const ADAPTIVE_BATCH_DEFAULT = 50
export const ADAPTIVE_BATCH_MAX = 100

export function clampBatchSize(n: number): number {
  if (!Number.isFinite(n)) return ADAPTIVE_BATCH_DEFAULT
  return Math.max(ADAPTIVE_BATCH_MIN, Math.min(ADAPTIVE_BATCH_MAX, Math.round(n)))
}

export function looksLikeTimeoutOrNetwork(message?: string | null): boolean {
  if (!message) return false
  const e = message.toLowerCase()
  return (
    e.includes('timeout') ||
    e.includes('timed out') ||
    e.includes('network') ||
    e.includes('fetch failed') ||
    e.includes('econnreset') ||
    e.includes('enotfound') ||
    e.includes('socket hang up') ||
    e.includes('503') ||
    e.includes('502') ||
    e.includes('504')
  )
}

/**
 * Next batch size after one push round.
 * - All failed + timeout/network → shrink ×0.5
 * - Partial failure → slight shrink
 * - Full success → grow +10 toward max
 */
export function nextAdaptiveBatchSize(
  current: number,
  batch: { successful: number; failed: number; processed: number; message?: string }
): number {
  const size = clampBatchSize(current)
  if (batch.processed <= 0) return size

  if (batch.successful === 0 && batch.failed > 0) {
    if (looksLikeTimeoutOrNetwork(batch.message)) {
      return clampBatchSize(Math.floor(size / 2))
    }
    return clampBatchSize(size - 10)
  }

  if (batch.failed > 0 && batch.successful > 0) {
    return clampBatchSize(size - 5)
  }

  if (batch.failed === 0 && batch.successful > 0) {
    return clampBatchSize(size + 10)
  }

  return size
}
