import React from 'react'
import type { SyncProgressEvent } from '../../lib/sync-progress'

export function SyncProgressBar({
  progress,
  className = '',
}: {
  progress: SyncProgressEvent | null
  className?: string
}) {
  if (!progress) return null
  const indeterminate = Boolean(progress.indeterminate)
  const pct = Math.max(0, Math.min(100, progress.percent))

  return (
    <div className={`w-full ${className}`} role="status" aria-live="polite">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium text-slate-700">
          {progress.message}
        </span>
        {!indeterminate ? (
          <span className="shrink-0 tabular-nums font-semibold text-slate-600">
            {pct}%
          </span>
        ) : null}
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-200">
        {indeterminate ? (
          <div className="sofia-sync-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-(--sofia-primary)" />
        ) : (
          <div
            className="h-full rounded-full bg-(--sofia-primary) transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  )
}
