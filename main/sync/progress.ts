/**
 * Sync Now progress: push uses local outbox totals; pull uses cloud
 * count_pending_sync_changes when available.
 */

import type { SyncLane, SyncLaneCounts } from './lanes'
import { emptyLaneCounts } from './lanes'

export type SyncProgressPhase =
  | 'starting'
  | 'push'
  | 'pull'
  | 'assets'
  | 'done'

export interface SyncProgressEvent {
  phase: SyncProgressPhase
  /** 0–100 overall progress across push + pull. */
  percent: number
  message: string
  pushTotal: number
  pushDone: number
  pullTotal: number
  pullDone: number
  /**
   * True when pull remaining count is unknown — UI may show an animated bar
   * with counts instead of a precise percentage.
   */
  indeterminate?: boolean
  /** Current push lane (critical → operational → bulk). */
  lane?: SyncLane
  /** Critical outbox empty — mobile-critical data has been pushed. */
  criticalReady?: boolean
  /** Remaining ready outbox by lane (snapshot at last report). */
  laneCounts?: SyncLaneCounts
}

export type SyncProgressListener = (event: SyncProgressEvent) => void

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function computeSyncPercent(
  pushDone: number,
  pushTotal: number,
  pullDone: number,
  pullTotal: number
): number {
  const pTotal = Math.max(0, pushTotal)
  const lTotal = Math.max(0, pullTotal)
  const total = pTotal + lTotal
  if (total <= 0) return 100
  const done =
    Math.min(Math.max(0, pushDone), pTotal) +
    Math.min(Math.max(0, pullDone), lTotal)
  return clampPercent((100 * done) / total)
}

export class SyncProgressTracker {
  pushTotal: number
  pullTotal: number
  pushDone = 0
  pullDone = 0
  pullCountKnown: boolean
  laneCounts: SyncLaneCounts = emptyLaneCounts()
  private readonly onProgress?: SyncProgressListener

  constructor(options: {
    pushTotal: number
    pullTotal: number
    pullCountKnown?: boolean
    onProgress?: SyncProgressListener
    laneCounts?: SyncLaneCounts
  }) {
    this.pushTotal = Math.max(0, options.pushTotal)
    this.pullTotal = Math.max(0, options.pullTotal)
    this.pullCountKnown = options.pullCountKnown !== false
    this.onProgress = options.onProgress
    if (options.laneCounts) this.laneCounts = { ...options.laneCounts }
  }

  setLaneCounts(counts: SyncLaneCounts): void {
    this.laneCounts = { ...counts }
  }

  addPush(n: number): void {
    this.pushDone += Math.max(0, n)
  }

  addPull(n: number): void {
    this.pullDone += Math.max(0, n)
    // If we did not know the total, grow an estimate so the bar can move.
    if (!this.pullCountKnown && this.pullDone > this.pullTotal) {
      this.pullTotal = this.pullDone
    }
  }

  /** When pull reports hasMore but count was unknown, leave headroom. */
  notePullHasMore(batchHint = 100): void {
    if (!this.pullCountKnown) {
      this.pullTotal = Math.max(this.pullTotal, this.pullDone + batchHint)
    }
  }

  report(
    phase: SyncProgressPhase,
    message?: string,
    extras?: { lane?: SyncLane; criticalReady?: boolean }
  ): SyncProgressEvent {
    const indeterminate =
      phase === 'pull' && !this.pullCountKnown && this.pullTotal === 0
    const totalWork = this.pushTotal + this.pullTotal
    let percent = computeSyncPercent(
      this.pushDone,
      this.pushTotal,
      this.pullDone,
      this.pullTotal
    )
    if (phase === 'done') percent = 100
    else if (totalWork <= 0) percent = phase === 'starting' ? 0 : 5
    else if (percent >= 100) percent = 99

    const criticalReady =
      extras?.criticalReady ?? this.laneCounts.critical <= 0
    const lane =
      extras?.lane ??
      (this.laneCounts.critical > 0
        ? 'critical'
        : this.laneCounts.operational > 0
          ? 'operational'
          : 'bulk')

    const event: SyncProgressEvent = {
      phase,
      percent,
      message:
        message ||
        defaultMessage(
          phase,
          percent,
          this.pushDone,
          this.pushTotal,
          this.pullDone,
          this.pullTotal,
          indeterminate
        ),
      pushTotal: this.pushTotal,
      pushDone: this.pushDone,
      pullTotal: this.pullTotal,
      pullDone: this.pullDone,
      indeterminate: indeterminate || undefined,
      lane,
      criticalReady,
      laneCounts: { ...this.laneCounts },
    }
    this.onProgress?.(event)
    return event
  }
}

function defaultMessage(
  phase: SyncProgressPhase,
  percent: number,
  pushDone: number,
  pushTotal: number,
  pullDone: number,
  pullTotal: number,
  indeterminate: boolean
): string {
  if (phase === 'starting') return 'Starting sync…'
  if (phase === 'done') return 'Sync finished.'
  if (phase === 'assets') return `Finishing files… ${percent}%`
  if (phase === 'push') {
    return pushTotal > 0
      ? `Uploading ${pushDone} of ${pushTotal}… ${percent}%`
      : `Uploading… ${percent}%`
  }
  if (indeterminate) {
    return pullDone > 0
      ? `Downloading… ${pullDone} applied`
      : 'Downloading from cloud…'
  }
  return pullTotal > 0
    ? `Downloading ${pullDone} of ${pullTotal}… ${percent}%`
    : `Downloading… ${percent}%`
}
