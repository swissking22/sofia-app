import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isGenericSyncTable } from './tables'
import { SCHOOL_ASSETS_BUCKET } from './assets'
import type {
  ProcessSyncRpcParams,
  ProcessSyncRpcResult,
  PullSyncRpcParams,
  PullSyncRpcResult,
  RegisterDeviceRpcParams,
  RegisterDeviceRpcResult,
  LookupSchoolByCodeResult,
  SupabaseSyncClientInterface,
  UpdateSyncCursorRpcParams,
  UpdateSyncCursorRpcResult,
} from './types'

export interface SupabaseClientConfig {
  supabaseUrl?: string
  supabaseAnonKey?: string
  /** Optional fetch override (tests / timeout wrapping). */
  fetchFn?: typeof fetch
  timeoutMs?: number
  /** Injected client for unit tests — skips createClient when set. */
  supabase?: SupabaseClient
}

const DEFAULT_TIMEOUT_MS = 15000
const PRODUCTION_CONFIG_ERROR =
  'Supabase production configuration is missing or invalid.'
const DEV_LOCAL_URL = 'http://127.0.0.1:54321'
const DEV_LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM0MTI4MDB9.CRX1A_dummy_local_key'

/** Test-only overrides for packaged vs development resolution. */
let packagingOverridesForTests: {
  isPackaged?: boolean
  resourcesPath?: string
} | null = null

export function setSupabasePackagingOverridesForTests(overrides: {
  isPackaged?: boolean
  resourcesPath?: string
} | null): void {
  packagingOverridesForTests = overrides
}

export function isSofiaAppPackaged(): boolean {
  if (packagingOverridesForTests?.isPackaged !== undefined) {
    return packagingOverridesForTests.isPackaged
  }
  try {
    return app.isPackaged === true
  } catch {
    return false
  }
}

export function resolvePackagedCloudConfigPath(
  resourcesPath = packagingOverridesForTests?.resourcesPath ??
    process.resourcesPath
): string {
  return path.join(resourcesPath, 'cloud-config.json')
}

/**
 * Load public hosted config from Electron resources (packaged builds only).
 * Never uses process.cwd().
 */
export function loadPackagedCloudConfig(
  resourcesPath = packagingOverridesForTests?.resourcesPath ??
    process.resourcesPath
): { url: string; anonKey: string } {
  const configPath = resolvePackagedCloudConfigPath(resourcesPath)
  if (!fs.existsSync(configPath)) {
    throw new Error(PRODUCTION_CONFIG_ERROR)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    throw new Error(PRODUCTION_CONFIG_ERROR)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(PRODUCTION_CONFIG_ERROR)
  }

  const record = parsed as Record<string, unknown>
  const rawUrl = record.supabaseUrl
  const rawKey = record.supabaseAnonKey

  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error(PRODUCTION_CONFIG_ERROR)
  }
  if (typeof rawKey !== 'string' || !rawKey.trim()) {
    throw new Error(PRODUCTION_CONFIG_ERROR)
  }

  return {
    url: normalizeSupabaseUrl(rawUrl.trim()),
    anonKey: rawKey.trim(),
  }
}

function readEnvSupabasePair(): { url: string; anonKey: string } | null {
  const rawUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!rawUrl?.trim() || !anonKey?.trim()) return null
  return {
    url: normalizeSupabaseUrl(rawUrl.trim()),
    anonKey: anonKey.trim(),
  }
}

/**
 * Ensures environment variables from project `.env` are loaded into process.env
 * when not already set. Development only — never used for packaged production.
 */
export function ensureEnvLoaded(): void {
  if (isSofiaAppPackaged()) return

  if (
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    return
  }

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

/** Strip trailing slashes and accidental `/rest/v1` — createClient expects the project root URL. */
export function normalizeSupabaseUrl(rawUrl: string): string {
  return rawUrl.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '')
}

export function toFiniteNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined) return fallback
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

/**
 * Resolve Supabase URL + anon/publishable key for the Electron main process.
 *
 * Dev (unpackaged): process.env → project `.env` → localhost fallback.
 * Packaged: explicit process.env override → resources/cloud-config.json (never localhost).
 */
export function getSupabaseConfig(): { url: string; anonKey: string } {
  const packaged = isSofiaAppPackaged()

  if (packaged) {
    const fromEnv = readEnvSupabasePair()
    if (fromEnv) return fromEnv
    return loadPackagedCloudConfig()
  }

  ensureEnvLoaded()
  const fromEnv = readEnvSupabasePair()
  if (fromEnv) return fromEnv

  return {
    url: normalizeSupabaseUrl(DEV_LOCAL_URL),
    anonKey: DEV_LOCAL_ANON_KEY,
  }
}

function createTimeoutFetch(
  timeoutMs: number,
  fetchFn: typeof fetch
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const parentSignal = init?.signal
    if (parentSignal) {
      if (parentSignal.aborted) {
        controller.abort()
      } else {
        parentSignal.addEventListener('abort', () => controller.abort(), {
          once: true,
        })
      }
    }

    try {
      return await fetchFn(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; message?: string }
  return (
    e.name === 'AbortError' ||
    (typeof e.message === 'string' &&
      (e.message.includes('aborted') || e.message.includes('AbortError')))
  )
}

function isNetworkLikeError(err: unknown): boolean {
  if (isAbortError(err)) return true
  if (!err || typeof err !== 'object') return false
  const e = err as { message?: string; code?: string; status?: number }
  const msg = (e.message || '').toLowerCase()
  if (e.status && e.status >= 500) return true
  return (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    e.code === 'ECONNREFUSED' ||
    e.code === 'ENOTFOUND' ||
    e.code === 'ETIMEDOUT'
  )
}

function rpcErrorMessage(error: {
  message?: string
  details?: string
  hint?: string
  code?: string
}): string {
  return (
    error.message ||
    error.details ||
    error.hint ||
    error.code ||
    'Supabase RPC error'
  )
}

/**
 * Lazy singleton underlying @supabase/supabase-js client for the Electron main process.
 * Auth session persistence is disabled — sync uses the anon key only via RPCs.
 */
let sharedJsClient: SupabaseClient | null = null
let sharedJsClientKey: string | null = null

export function createSupabaseJsClient(
  config?: SupabaseClientConfig
): SupabaseClient {
  if (config?.supabase) return config.supabase

  const defaults = getSupabaseConfig()
  const url = normalizeSupabaseUrl(config?.supabaseUrl || defaults.url)
  const anonKey = config?.supabaseAnonKey || defaults.anonKey
  const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const baseFetch = config?.fetchFn || globalThis.fetch
  const fetchWithTimeout = createTimeoutFetch(timeoutMs, baseFetch)

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: fetchWithTimeout as typeof fetch,
    },
  })
}

function getSharedJsClient(): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig()
  const key = `${url}::${anonKey}`
  if (!sharedJsClient || sharedJsClientKey !== key) {
    sharedJsClient = createSupabaseJsClient()
    sharedJsClientKey = key
  }
  return sharedJsClient
}

export class SupabaseSyncClient implements SupabaseSyncClientInterface {
  private supabase: SupabaseClient

  constructor(config?: SupabaseClientConfig) {
    if (config?.supabase) {
      this.supabase = config.supabase
    } else if (
      config?.supabaseUrl ||
      config?.supabaseAnonKey ||
      config?.fetchFn ||
      config?.timeoutMs
    ) {
      this.supabase = createSupabaseJsClient(config)
    } else {
      this.supabase = getSharedJsClient()
    }
  }

  async registerDevice(
    params: RegisterDeviceRpcParams
  ): Promise<RegisterDeviceRpcResult> {
    try {
      const { data, error } = await this.supabase.rpc('register_device', {
        p_id: params.id,
        p_school_id: params.schoolId,
        p_device_name: params.deviceName,
        p_device_fingerprint: params.deviceFingerprint ?? null,
      })

      if (error) {
        return {
          ok: false,
          error: rpcErrorMessage(error),
        }
      }

      if (data && typeof data === 'object' && (data as any).success === false) {
        return {
          ok: false,
          error: (data as any).error || 'Device registration rejected',
        }
      }

      return { ok: true }
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Device registration network failure',
      }
    }
  }

  async processSyncOperation(
    params: ProcessSyncRpcParams
  ): Promise<ProcessSyncRpcResult> {
    try {
      const rpcName = isGenericSyncTable(params.tableName)
        ? 'process_synced_entity'
        : 'process_sync_operation'

      const { data, error } = await this.supabase.rpc(rpcName, {
        p_id: params.id,
        p_school_id: params.schoolId,
        p_device_id: params.deviceId,
        p_table_name: params.tableName,
        p_record_id: params.recordId,
        p_operation: params.operation,
        p_payload: params.payload,
      })

      if (error) {
        const message = rpcErrorMessage(error)
        const status = (error as unknown as { status?: number }).status

        if (
          (typeof status === 'number' && status >= 500) ||
          isNetworkLikeError(error)
        ) {
          return {
            ok: false,
            errorType: 'network',
            error: typeof status === 'number'
              ? `Server error (${status}): ${message}`
              : message,
          }
        }

        return {
          ok: false,
          errorType: 'validation',
          error:
            typeof status === 'number'
              ? `RPC error (${status}): ${message}`
              : message,
        }
      }

      const result = data as Record<string, unknown> | null

      if (!result || typeof result !== 'object') {
        return {
          ok: false,
          errorType: 'validation',
          error: 'Invalid response received from RPC',
        }
      }

      if (result.conflict) {
        return {
          ok: false,
          errorType: 'conflict',
          conflict: true,
          cloudVersion: result.cloud_version as number | undefined,
          incomingVersion: result.incoming_version as number | undefined,
          error: (result.error as string) || 'Version conflict detected',
        }
      }

      if (result.success === false) {
        return {
          ok: false,
          errorType: 'validation',
          error:
            (result.error as string) || 'Operation failed in cloud database',
        }
      }

      return {
        ok: true,
        duplicate: Boolean(result.duplicate),
        changeId: result.change_id as number | string | undefined,
        status: result.status as string | undefined,
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
    try {
      const { data, error } = await this.supabase.rpc('pull_sync_changes', {
        p_school_id: params.schoolId,
        p_device_id: params.deviceId,
        p_cursor: params.cursor,
        p_limit: params.limit ?? 100,
      })

      if (error) {
        return {
          ok: false,
          changes: [],
          count: 0,
          currentCursor: params.cursor,
          newCursor: params.cursor,
          hasMore: false,
          error: rpcErrorMessage(error),
        }
      }

      const result = data as Record<string, unknown> | null
      if (!result || typeof result !== 'object' || result.success === false) {
        return {
          ok: false,
          changes: [],
          count: 0,
          currentCursor: params.cursor,
          newCursor: params.cursor,
          hasMore: false,
          error:
            (result?.error as string) || 'Invalid pull response from RPC',
        }
      }

      return {
        ok: true,
        changes: Array.isArray(result.changes)
          ? (result.changes as PullSyncRpcResult['changes'])
          : [],
        count: toFiniteNumber(result.count, 0),
        currentCursor: toFiniteNumber(result.current_cursor, params.cursor),
        newCursor: toFiniteNumber(result.new_cursor, params.cursor),
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
    try {
      const { data, error } = await this.supabase.rpc('update_sync_cursor', {
        p_school_id: params.schoolId,
        p_device_id: params.deviceId,
        p_cursor: params.cursor,
      })

      if (error) {
        return { ok: false, error: rpcErrorMessage(error) }
      }

      const result = data as Record<string, unknown> | null
      if (!result || typeof result !== 'object' || result.success === false) {
        return {
          ok: false,
          error: (result?.error as string) || 'Failed to update sync cursor',
        }
      }

      return {
        ok: true,
        cursor: toFiniteNumber(result.cursor, params.cursor),
      }
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Network failure while updating sync cursor',
      }
    }
  }

  async lookupSchoolByCode(code: string): Promise<LookupSchoolByCodeResult> {
    try {
      const { data, error } = await this.supabase.rpc('lookup_school_by_code', {
        p_code: code,
      })

      if (error) {
        return { ok: false, error: rpcErrorMessage(error) }
      }

      const result = data as Record<string, unknown> | null
      if (!result || typeof result !== 'object') {
        return { ok: false, error: 'Invalid school lookup response' }
      }

      if (result.success === false) {
        return {
          ok: false,
          error: (result.error as string) || 'School not found',
        }
      }

      const school = result.school as Record<string, unknown> | undefined
      if (!school?.id || !school?.name) {
        return { ok: false, error: 'School not found' }
      }

      return {
        ok: true,
        school: {
          id: String(school.id),
          name: String(school.name),
          school_code: school.school_code != null ? String(school.school_code) : null,
          short_code: school.short_code != null ? String(school.short_code) : null,
          email: school.email != null ? String(school.email) : null,
          phone: school.phone != null ? String(school.phone) : null,
          address: school.address != null ? String(school.address) : null,
          version: toFiniteNumber(school.version, 1),
        },
      }
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Network failure while looking up school',
      }
    }
  }

  async uploadAsset(
    objectKey: string,
    data: Buffer,
    contentType: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.storage
        .from(SCHOOL_ASSETS_BUCKET)
        .upload(objectKey, data, {
          contentType,
          upsert: true,
        })
      if (error) {
        return { ok: false, error: error.message }
      }
      return { ok: true }
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Network failure while uploading asset',
      }
    }
  }

  async downloadAsset(
    objectKey: string
  ): Promise<{ ok: boolean; data?: Buffer; error?: string }> {
    try {
      const { data, error } = await this.supabase.storage
        .from(SCHOOL_ASSETS_BUCKET)
        .download(objectKey)
      if (error) {
        return { ok: false, error: error.message }
      }
      if (!data) {
        return { ok: false, error: 'Empty asset download' }
      }
      const ab = await data.arrayBuffer()
      return { ok: true, data: Buffer.from(ab) }
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Network failure while downloading asset',
      }
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

/** Test helper: clear lazy singletons between cases. */
export function resetSupabaseSyncClientForTests(): void {
  defaultClient = null
  sharedJsClient = null
  sharedJsClientKey = null
  packagingOverridesForTests = null
}
