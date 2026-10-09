import type { SyncOperation } from '../db/types'

export type SyncErrorType = 'network' | 'validation' | 'conflict' | 'unknown'

export interface ProcessSyncRpcParams {
  id: string
  schoolId: string
  deviceId: string | null
  tableName: string
  recordId: string
  operation: SyncOperation | string
  payload: Record<string, unknown>
}

export interface RegisterDeviceRpcParams {
  id: string
  schoolId: string
  deviceName: string
  deviceFingerprint?: string | null
}

export interface ProcessSyncRpcSuccess {
  ok: true
  duplicate: boolean
  changeId?: number | string
  status?: string
}

export interface ProcessSyncRpcError {
  ok: false
  errorType: SyncErrorType
  error: string
  conflict?: boolean
  cloudVersion?: number
  incomingVersion?: number
}

export type ProcessSyncRpcResult = ProcessSyncRpcSuccess | ProcessSyncRpcError

export interface RegisterDeviceRpcResult {
  ok: boolean
  error?: string
}

export interface BootstrapSchoolTenantParams {
  id: string
  name: string
  shortCode?: string | null
  schoolCode?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
}

export interface BootstrapSchoolTenantResult {
  ok: boolean
  error?: string
}

export interface PushSyncOptions {
  db: import('better-sqlite3').Database
  schoolId?: string
  batchSize?: number
  client?: SupabaseSyncClientInterface
  /** Optional hook after a queue item is successfully acknowledged by cloud. */
  onSynced?: (item: {
    id: string
    table_name: string
    record_id: string
    payload: string
  }) => Promise<void> | void
}

export interface PushSyncResult {
  ok: boolean
  processed: number
  successful: number
  failed: number
  conflicts: number
  skipped?: boolean
  message?: string
  /** True when more ready pending items remain (batch limit or backoff). */
  hasMore?: boolean
}

// ----------------------------------------------------------------------------
// Phase 2: Pull Sync Interfaces
// ----------------------------------------------------------------------------

export interface SyncChange {
  id: number
  school_id: string
  table_name: string
  record_id: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | string
  payload: Record<string, unknown>
  version: number
  created_at: string
}

export interface PullSyncRpcParams {
  schoolId: string
  deviceId: string
  cursor: number
  limit?: number
}

export interface PullSyncRpcResult {
  ok: boolean
  changes: SyncChange[]
  count: number
  currentCursor: number
  newCursor: number
  hasMore: boolean
  error?: string
}

export interface UpdateSyncCursorRpcParams {
  schoolId: string
  deviceId: string
  cursor: number
}

export interface UpdateSyncCursorRpcResult {
  ok: boolean
  cursor?: number
  error?: string
}

export interface CountPendingSyncChangesParams {
  schoolId: string
  cursor: number
}

export interface CountPendingSyncChangesResult {
  ok: boolean
  count: number
  error?: string
}

export interface PullSyncOptions {
  db: import('better-sqlite3').Database
  schoolId?: string
  deviceId?: string
  /**
   * Changes per `pull_sync_changes` RPC (default 500 = cloud max).
   * Larger pages = fewer round-trips when hydrating a second desk.
   */
  batchSize?: number
  /**
   * Max RPC batches inside one `pullRemoteChanges` call (default 50).
   * When the cap is hit and the cloud still has pages, `hasMore` stays true
   * so Join / Sync Now can continue draining.
   */
  maxIterations?: number
  /**
   * Ack cloud `update_sync_cursor` every N successfully applied pages
   * (default 5), plus always at end of the call / on pause. Local SQLite
   * cursor still advances every page — this only reduces network chatter.
   */
  cursorAckEveryPages?: number
  client?: SupabaseSyncClientInterface
  /** Fired after each successful RPC page is applied (for live %). */
  onPageApplied?: (appliedDelta: number, hasMore: boolean) => void
}

export interface PullSyncResult {
  ok: boolean
  processed: number
  applied: number
  conflicts: number
  failed: number
  newCursor: number
  hasMore: boolean
  skipped?: boolean
  message?: string
}

export interface SyncWorkerOptions {
  schoolId?: string
  client?: SupabaseSyncClientInterface
  skipPush?: boolean
  skipPull?: boolean
  /** Items per push RPC batch (default 50). */
  batchSize?: number
  /**
   * Items per pull RPC batch (default 500 = cloud max). Prefer larger pages
   * when hydrating a second desk so Sync Now uses fewer round-trips.
   */
  pullBatchSize?: number
  /**
   * Keep pushing batches until the ready outbox is empty (default true).
   * Caps via maxPushBatches to avoid unbounded runs.
   */
  drainPush?: boolean
  /** Max push batches per Sync Now (default 200 ≈ 10 000 items). */
  maxPushBatches?: number
  /** Keep pulling while hasMore (default true). */
  drainPull?: boolean
  /** Max outer pull pages per Sync Now (default 100). */
  maxPullBatches?: number
  /** Max RPC batches inside each pullRemoteChanges call (default 50). */
  pullMaxIterations?: number
  /**
   * Live Sync Now progress (percent + phase). Used by IPC to push
   * `sync:progress` events to the renderer.
   */
  onProgress?: import('./progress').SyncProgressListener
  /** Pre-measured totals for multi-round drain (optional). */
  progressTracker?: import('./progress').SyncProgressTracker
}

export interface SyncWorkerResult {
  ok: boolean
  processed: number
  successful: number
  failed: number
  conflicts: number
  skipped?: boolean
  /** True when push or pull still has backlog after this run. */
  hasMore?: boolean
  message?: string
  /** Final progress snapshot when onProgress / tracker was used. */
  progress?: import('./progress').SyncProgressEvent
  push: PushSyncResult
  pull: PullSyncResult
  /** Set by runSyncWorkerUntilCaughtUp. */
  rounds?: number
}

export interface CloudSchoolSummary {
  id: string
  name: string
  school_code: string | null
  short_code: string | null
  email: string | null
  phone: string | null
  address: string | null
  version?: number
}

export interface LookupSchoolByCodeResult {
  ok: boolean
  school?: CloudSchoolSummary
  error?: string
}

export interface SupabaseSyncClientInterface {
  processSyncOperation(params: ProcessSyncRpcParams): Promise<ProcessSyncRpcResult>
  registerDevice(params: RegisterDeviceRpcParams): Promise<RegisterDeviceRpcResult>
  bootstrapSchoolTenant?(
    params: BootstrapSchoolTenantParams
  ): Promise<BootstrapSchoolTenantResult>
  pullSyncChanges(params: PullSyncRpcParams): Promise<PullSyncRpcResult>
  updateSyncCursor(params: UpdateSyncCursorRpcParams): Promise<UpdateSyncCursorRpcResult>
  /** Optional: remaining remote changes ahead of cursor (Sync Now %). */
  countPendingSyncChanges?(
    params: CountPendingSyncChangesParams
  ): Promise<CountPendingSyncChangesResult>
  lookupSchoolByCode?(code: string): Promise<LookupSchoolByCodeResult>
  uploadAsset?(
    objectKey: string,
    data: Buffer,
    contentType: string
  ): Promise<{ ok: boolean; error?: string }>
  downloadAsset?(
    objectKey: string
  ): Promise<{ ok: boolean; data?: Buffer; error?: string }>
}

/** Minimal Storage surface used by asset sync (injectable in tests). */
export interface AssetStorageClient {
  uploadAsset(
    objectKey: string,
    data: Buffer,
    contentType: string
  ): Promise<{ ok: boolean; error?: string }>
  downloadAsset(
    objectKey: string
  ): Promise<{ ok: boolean; data?: Buffer; error?: string }>
}
