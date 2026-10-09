/** System Administration IPC client. */

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchAdminOverview() {
  return (await window.ipc.invoke('system-admin:overview')) as Result<Record<string, unknown>>
}

export async function fetchAdminMeta() {
  return (await window.ipc.invoke('system-admin:meta')) as Result<{
    roles: Array<{ id: string; name: string; is_system: boolean; user_count: number; is_enabled?: boolean }>
    staff: Array<{ id: string; name: string }>
    can: Record<string, boolean>
  }>
}

export async function fetchAdminUsers(filters: Record<string, unknown>) {
  return (await window.ipc.invoke('system-admin:users-list', filters)) as Result<{
    users: Array<Record<string, unknown>>
    total: number
    page: number
    page_size: number
  }>
}

export async function fetchAdminUser(id: string) {
  return (await window.ipc.invoke('system-admin:users-get', { id })) as Result<Record<string, unknown>>
}

export async function createAdminUser(input: Record<string, unknown>) {
  return (await window.ipc.invoke('system-admin:users-create', input)) as Result<unknown>
}

export async function updateAdminUser(input: Record<string, unknown>) {
  return (await window.ipc.invoke('system-admin:users-update', input)) as Result<unknown>
}

export async function deleteAdminUser(id: string) {
  return (await window.ipc.invoke('system-admin:users-delete', { id })) as Result<{ id: string }>
}

export async function resetAdminPassword(id: string, password: string) {
  return (await window.ipc.invoke('system-admin:users-reset-password', { id, password })) as Result<unknown>
}

export async function revokeAdminSessions(id: string) {
  return (await window.ipc.invoke('system-admin:users-revoke-sessions', { id })) as Result<unknown>
}

export async function fetchAdminRoles() {
  return (await window.ipc.invoke('system-admin:roles-list')) as Result<{
    roles: Array<{
      id: string
      name: string
      description: string | null
      is_system: boolean
      is_enabled?: boolean
      user_count: number
      permission_count: number
    }>
  }>
}

export async function fetchAdminRole(id: string) {
  return (await window.ipc.invoke('system-admin:roles-get', { id })) as Result<{ role: Record<string, unknown> }>
}

export async function saveAdminRole(input: Record<string, unknown>) {
  return (await window.ipc.invoke('system-admin:roles-save', input)) as Result<unknown>
}

export async function duplicateAdminRole(id: string) {
  return (await window.ipc.invoke('system-admin:roles-duplicate', { id })) as Result<unknown>
}

export async function setAdminRoleEnabled(id: string, enabled: boolean) {
  return (await window.ipc.invoke('system-admin:roles-set-enabled', { id, enabled })) as Result<unknown>
}

export async function fetchPermissionMatrix() {
  return (await window.ipc.invoke('system-admin:permissions-matrix')) as Result<{
    roles: Array<{ id: string; name: string }>
    matrix: Array<{
      permission_id: string
      permission_name: string
      permission_label: string
      module_key: string
      module_label: string
      roles: Record<string, boolean>
    }>
    catalog: unknown
  }>
}

export async function fetchAuditLogs(filters: Record<string, unknown>) {
  return (await window.ipc.invoke('system-admin:audit-list', filters)) as Result<{
    events: Array<Record<string, unknown>>
    total: number
    page: number
    page_size: number
  }>
}

export async function fetchAuditEvent(id: string) {
  return (await window.ipc.invoke('system-admin:audit-get', { id })) as Result<{ event: Record<string, unknown> }>
}

export async function fetchBackups(page = 1) {
  return (await window.ipc.invoke('system-admin:backup-list', { page })) as Result<{
    backups: Array<Record<string, unknown>>
    total: number
  }>
}

export async function runBackupNow() {
  return (await window.ipc.invoke('system-admin:backup-now')) as Result<unknown>
}

export async function restoreBackup(id: string, confirmation: string) {
  return (await window.ipc.invoke('system-admin:backup-restore', {
    id,
    confirmation,
  })) as Result<{ requires_restart?: boolean; warning?: string }>
}

export async function pickRestoreBackupFile() {
  return (await window.ipc.invoke(
    'system-admin:backup-pick-restore-file'
  )) as Result<{ path: string; fileName: string; fileSize: number }>
}

export async function restoreBackupFromFile(
  filePath: string,
  confirmation: string
) {
  return (await window.ipc.invoke('system-admin:backup-restore-from-file', {
    path: filePath,
    confirmation,
  })) as Result<{ requires_restart?: boolean; warning?: string }>
}

export async function fetchSyncDashboard() {
  return (await window.ipc.invoke('system-admin:sync-dashboard')) as Result<Record<string, unknown>>
}

export type AdminSyncResult = {
  processed?: number
  successful?: number
  failed?: number
  conflicts?: number
  message?: string | null
  has_more?: boolean
  hasMore?: boolean
  rounds?: number
  progress?: {
    percent: number
    message: string
    phase: string
    indeterminate?: boolean
  }
  push?: { hasMore?: boolean; successful?: number }
  pull?: { hasMore?: boolean; applied?: number }
}

export function adminSyncHasMore(data: AdminSyncResult): boolean {
  return Boolean(
    data.has_more ||
      data.hasMore ||
      data.push?.hasMore ||
      data.pull?.hasMore
  )
}

export async function runAdminSync() {
  return (await window.ipc.invoke('system-admin:sync-now')) as Result<AdminSyncResult>
}

/**
 * Sync Now with live percent progress. Main drains until caught up (or safety cap).
 */
export async function runAdminSyncUntilCaughtUp(options?: {
  onProgress?: (event: {
    percent: number
    message: string
    phase: string
    indeterminate?: boolean
    pushTotal?: number
    pushDone?: number
    pullTotal?: number
    pullDone?: number
  }) => void
}): Promise<Result<AdminSyncResult>> {
  const { subscribeSyncProgress } = await import('./sync-progress')
  const unsub = options?.onProgress
    ? subscribeSyncProgress(options.onProgress)
    : () => undefined
  try {
    return await runAdminSync()
  } finally {
    unsub()
  }
}

export async function retryAdminSync() {
  return (await window.ipc.invoke('system-admin:sync-retry')) as Result<{ retried: number }>
}

export async function resolveAdminConflict(id: string, resolution: 'local' | 'remote') {
  return (await window.ipc.invoke('system-admin:sync-resolve', { id, resolution })) as Result<unknown>
}

export async function fetchSystemSettings() {
  return (await window.ipc.invoke('system-admin:settings-get')) as Result<Record<string, unknown>>
}

export async function saveSystemSettings(input: Record<string, unknown>) {
  return (await window.ipc.invoke('system-admin:settings-save', input)) as Result<unknown>
}

export async function fetchPermissionCatalog() {
  return (await window.ipc.invoke('roles:catalog')) as Result<
    Array<{ module_key: string; module_label: string; permissions: Array<{ id: string; name: string; label: string }> }>
  >
}
