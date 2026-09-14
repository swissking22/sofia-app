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

export interface PushSyncOptions {
  db: import('better-sqlite3').Database
  schoolId?: string
  batchSize?: number
  client?: SupabaseSyncClientInterface
}

export interface PushSyncResult {
  ok: boolean
  processed: number
  successful: number
  failed: number
  conflicts: number
  skipped?: boolean
  message?: string
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

export interface PullSyncOptions {
  db: import('better-sqlite3').Database
  schoolId?: string
  deviceId?: string
  batchSize?: number
  client?: SupabaseSyncClientInterface
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
}

export interface SyncWorkerResult {
  ok: boolean
  processed: number
  successful: number
  failed: number
  conflicts: number
  skipped?: boolean
  message?: string
  push: PushSyncResult
  pull: PullSyncResult
}

export interface SupabaseSyncClientInterface {
  processSyncOperation(params: ProcessSyncRpcParams): Promise<ProcessSyncRpcResult>
  registerDevice(params: RegisterDeviceRpcParams): Promise<RegisterDeviceRpcResult>
  pullSyncChanges(params: PullSyncRpcParams): Promise<PullSyncRpcResult>
  updateSyncCursor(params: UpdateSyncCursorRpcParams): Promise<UpdateSyncCursorRpcResult>
}
