import fs from 'fs'
import path from 'path'
import type {
  ProcessSyncRpcParams,
  ProcessSyncRpcResult,
  PullSyncRpcParams,
  PullSyncRpcResult,
  RegisterDeviceRpcParams,
  RegisterDeviceRpcResult,
  SupabaseSyncClientInterface,
  UpdateSyncCursorRpcParams,
  UpdateSyncCursorRpcResult,
} from './types'

export interface SupabaseClientConfig {
  supabaseUrl?: string
  supabaseAnonKey?: string
  fetchFn?: typeof fetch
  timeoutMs?: number
}

/**
 * Ensures environment variables from .env are loaded into process.env if not already set.
 */
function ensureEnvLoaded(): void {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return

  if (typeof (process as any).loadEnvFile === 'function') {
    try {
      ;(process as any).loadEnvFile()
      if (process.env.SUPABASE_URL) return
    } catch {
      // .env file might not exist or already loaded
    }
  }

  try {
    const envPath = path.resolve(process.cwd(), '.env')
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim()
          let val = trimmed.slice(eqIdx + 1).trim()
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1)
          }
          if (!process.env[key]) {
            process.env[key] = val
          }
        }
      }
    }
  } catch {
    // Ignore error
  }
}

export function getSupabaseConfig(): { url: string; anonKey: string } {
  ensureEnvLoaded()

  const rawUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'http://127.0.0.1:54321'

  const url = rawUrl.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '')

  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    // Default local Supabase anon key for development
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM0MTI4MDB9.CRX1A_dummy_local_key'

  return { url, anonKey }
}

export class SupabaseSyncClient implements SupabaseSyncClientInterface {
  private url: string
  private anonKey: string
  private fetchFn: typeof fetch
  private timeoutMs: number

  constructor(config?: SupabaseClientConfig) {
    const defaults = getSupabaseConfig()
    this.url = (config?.supabaseUrl || defaults.url)
      .replace(/\/+$/, '')
      .replace(/\/rest\/v1\/?$/, '')
    this.anonKey = config?.supabaseAnonKey || defaults.anonKey
    this.fetchFn = config?.fetchFn || globalThis.fetch
    this.timeoutMs = config?.timeoutMs || 15000
  }

  async registerDevice(
    params: RegisterDeviceRpcParams
  ): Promise<RegisterDeviceRpcResult> {
    const endpoint = `${this.url}/rest/v1/rpc/register_device`
    const body = {
      p_id: params.id,
      p_school_id: params.schoolId,
      p_device_name: params.deviceName,
      p_device_fingerprint: params.deviceFingerprint ?? null,
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)

      const res = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          Prefer: 'return=representation',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        return { ok: false, error: `HTTP ${res.status}: ${errText}` }
      }

      const data = await res.json()
      if (data && typeof data === 'object' && (data as any).success === false) {
        return { ok: false, error: (data as any).error || 'Device registration rejected' }
      }

      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Device registration network failure' }
    }
  }

  async processSyncOperation(
    params: ProcessSyncRpcParams
  ): Promise<ProcessSyncRpcResult> {
    const endpoint = `${this.url}/rest/v1/rpc/process_sync_operation`
    const body = {
      p_id: params.id,
      p_school_id: params.schoolId,
      p_device_id: params.deviceId,
      p_table_name: params.tableName,
      p_record_id: params.recordId,
      p_operation: params.operation,
      p_payload: params.payload,
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)

      let res: Response
      try {
        res = await this.fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.anonKey,
            Authorization: `Bearer ${this.anonKey}`,
            Prefer: 'return=representation',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      if (!res.ok) {
        let errMessage = ''
        try {
          const json = await res.json()
          errMessage = json.message || json.error || JSON.stringify(json)
        } catch {
          errMessage = await res.text().catch(() => `HTTP ${res.status}`)
        }

        if (res.status >= 500) {
          return {
            ok: false,
            errorType: 'network',
            error: `Server error (${res.status}): ${errMessage}`,
          }
        }

        return {
          ok: false,
          errorType: 'validation',
          error: `RPC error (${res.status}): ${errMessage}`,
        }
      }

      const result = await res.json()

      if (!result || typeof result !== 'object') {
        return {
          ok: false,
          errorType: 'validation',
          error: 'Invalid response received from RPC',
        }
      }

      // Check conflict
      if (result.conflict) {
        return {
          ok: false,
          errorType: 'conflict',
          conflict: true,
          cloudVersion: result.cloud_version,
          incomingVersion: result.incoming_version,
          error: result.error || 'Version conflict detected',
        }
      }

      // Check failure inside RPC response
      if (result.success === false) {
        return {
          ok: false,
          errorType: 'validation',
          error: result.error || 'Operation failed in cloud database',
        }
      }

      // Success (including duplicate)
      return {
        ok: true,
        duplicate: Boolean(result.duplicate),
        changeId: result.change_id,
        status: result.status,
      }
    } catch (err: any) {
      const message = err?.message || 'Network error during sync RPC'
      return {
        ok: false,
        errorType: 'network',
        error: message,
      }
    }
  }

  async pullSyncChanges(
    params: PullSyncRpcParams
  ): Promise<PullSyncRpcResult> {
    const endpoint = `${this.url}/rest/v1/rpc/pull_sync_changes`
    const body = {
      p_school_id: params.schoolId,
      p_device_id: params.deviceId,
      p_cursor: params.cursor,
      p_limit: params.limit ?? 100,
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)

      let res: Response
      try {
        res = await this.fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.anonKey,
            Authorization: `Bearer ${this.anonKey}`,
            Prefer: 'return=representation',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        return {
          ok: false,
          changes: [],
          count: 0,
          currentCursor: params.cursor,
          newCursor: params.cursor,
          hasMore: false,
          error: `HTTP ${res.status}: ${errText}`,
        }
      }

      const result = await res.json()
      if (!result || typeof result !== 'object' || result.success === false) {
        return {
          ok: false,
          changes: [],
          count: 0,
          currentCursor: params.cursor,
          newCursor: params.cursor,
          hasMore: false,
          error: result?.error || 'Invalid pull response from RPC',
        }
      }

      return {
        ok: true,
        changes: Array.isArray(result.changes) ? result.changes : [],
        count: Number(result.count) || 0,
        currentCursor: Number(result.current_cursor) ?? params.cursor,
        newCursor: Number(result.new_cursor) ?? params.cursor,
        hasMore: Boolean(result.has_more),
      }
    } catch (err: any) {
      return {
        ok: false,
        changes: [],
        count: 0,
        currentCursor: params.cursor,
        newCursor: params.cursor,
        hasMore: false,
        error: err?.message || 'Network failure while pulling changes',
      }
    }
  }

  async updateSyncCursor(
    params: UpdateSyncCursorRpcParams
  ): Promise<UpdateSyncCursorRpcResult> {
    const endpoint = `${this.url}/rest/v1/rpc/update_sync_cursor`
    const body = {
      p_school_id: params.schoolId,
      p_device_id: params.deviceId,
      p_cursor: params.cursor,
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)

      let res: Response
      try {
        res = await this.fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.anonKey,
            Authorization: `Bearer ${this.anonKey}`,
            Prefer: 'return=representation',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        return { ok: false, error: `HTTP ${res.status}: ${errText}` }
      }

      const result = await res.json()
      if (!result || typeof result !== 'object' || result.success === false) {
        return { ok: false, error: result?.error || 'Failed to update sync cursor' }
      }

      return { ok: true, cursor: Number(result.cursor) ?? params.cursor }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Network failure while updating sync cursor' }
    }
  }
}

let defaultClient: SupabaseSyncClient | null = null

export function getSupabaseSyncClient(): SupabaseSyncClient {
  if (!defaultClient) {
    defaultClient = new SupabaseSyncClient()
  }
  return defaultClient
}
