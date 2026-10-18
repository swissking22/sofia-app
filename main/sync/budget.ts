/**
 * Per-run sync budget: wall-clock and item caps so Sync Now stays responsive
 * while lanes (critical → operational → bulk) still drain in order.
 */

export const DEFAULT_SYNC_BUDGET_MS = 60_000
/** Successful push + pull items before pausing this run. */
export const DEFAULT_SYNC_BUDGET_ITEMS = 2_500
/** Delay before auto-continuing a budgeted run that still has backlog. */
export const SYNC_BUDGET_RESUME_DELAY_MS = 1_500

export class SyncBudget {
  readonly maxDurationMs: number
  readonly maxItems: number
  readonly startedAt: number
  items = 0
  stoppedReason: 'time' | 'items' | null = null

  constructor(options?: { maxDurationMs?: number; maxItems?: number }) {
    this.maxDurationMs = Math.max(0, options?.maxDurationMs ?? 0)
    this.maxItems = Math.max(0, options?.maxItems ?? 0)
    this.startedAt = Date.now()
  }

  get enabled(): boolean {
    return this.maxDurationMs > 0 || this.maxItems > 0
  }

  add(n: number): void {
    this.items += Math.max(0, n)
  }

  exhausted(): boolean {
    if (this.maxDurationMs > 0 && Date.now() - this.startedAt >= this.maxDurationMs) {
      this.stoppedReason = 'time'
      return true
    }
    if (this.maxItems > 0 && this.items >= this.maxItems) {
      this.stoppedReason = 'items'
      return true
    }
    return false
  }
}
