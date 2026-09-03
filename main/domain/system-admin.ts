/** System Administration domain rules (no SQL, no React). */

export type AccountStatus = 'active' | 'inactive' | 'suspended'

export interface PasswordPolicy {
  min_length: number
  require_upper: boolean
  require_digit: boolean
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  min_length: 8,
  require_upper: true,
  require_digit: true,
}

export const DEFAULT_SESSION_TIMEOUT_MINUTES = 480
export const DEFAULT_LOCKOUT_ATTEMPTS = 5
export const DEFAULT_LOCKOUT_MINUTES = 15
export const DEFAULT_TIMEZONE = 'Africa/Douala'
export const DEFAULT_CURRENCY = 'XAF'

export function isWritePermission(name: string): boolean {
  const action = name.split('.').pop() || ''
  return !['read', 'view'].includes(action)
}

export function validatePassword(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY
): string | null {
  if (!password || password.length < policy.min_length) {
    return `Password must be at least ${policy.min_length} characters.`
  }
  if (policy.require_upper && !/[A-Z]/.test(password)) {
    return 'Password must include an uppercase letter.'
  }
  if (policy.require_digit && !/\d/.test(password)) {
    return 'Password must include a number.'
  }
  return null
}

export function accountAllowsLogin(status: AccountStatus | string | null | undefined): boolean {
  return !status || status === 'active'
}

export function isLockedOut(lockedUntil: string | null | undefined, now = new Date()): boolean {
  if (!lockedUntil) return false
  const t = new Date(lockedUntil).getTime()
  return Number.isFinite(t) && t > now.getTime()
}

export function nextLockout(
  failedCount: number,
  maxAttempts: number,
  lockMinutes: number,
  now = new Date()
): { failed: number; locked_until: string | null } {
  const failed = failedCount + 1
  if (failed >= maxAttempts) {
    return {
      failed,
      locked_until: new Date(now.getTime() + lockMinutes * 60_000).toISOString(),
    }
  }
  return { failed, locked_until: null }
}

export function inferCoarseRole(permissionNames: string[]): 'admin' | 'secretary' | 'teacher' {
  if (permissionNames.some((p) => p.startsWith('system.users') || p.startsWith('system.settings'))) {
    return 'admin'
  }
  if (permissionNames.some((p) => p.startsWith('finance.') && isWritePermission(p))) {
    return 'secretary'
  }
  if (permissionNames.some((p) => p.startsWith('results.') || p.startsWith('attendance.'))) {
    return 'teacher'
  }
  if (permissionNames.every((p) => !isWritePermission(p))) {
    return 'teacher'
  }
  return 'secretary'
}

export interface MatrixCell {
  permission_id: string
  permission_name: string
  permission_label: string
  module_key: string
  module_label: string
  roles: Record<string, boolean>
}

export function buildPermissionMatrix(
  permissions: Array<{
    id: string
    name: string
    label: string
    module_key: string
    module_label: string
  }>,
  roles: Array<{ id: string; permission_ids: string[] }>
): MatrixCell[] {
  return permissions.map((p) => {
    const granted: Record<string, boolean> = {}
    for (const role of roles) {
      granted[role.id] = role.permission_ids.includes(p.id)
    }
    return {
      permission_id: p.id,
      permission_name: p.name,
      permission_label: p.label,
      module_key: p.module_key,
      module_label: p.module_label,
      roles: granted,
    }
  })
}

export function assertRestoreConfirmation(phrase: string): void {
  if (phrase.trim().toUpperCase() !== 'RESTORE') {
    throw new Error('Type RESTORE to confirm replacing the local database.')
  }
}

export function restoreWarning(): string {
  return 'Restoring this backup will replace the current local database state. A safety backup of the current database is created first. Sofia must restart to finish the restore.'
}

export function auditIsMutable(): boolean {
  return false
}

export function parseAuditPayload(raw: string | null): {
  description: string
  before: unknown
  after: unknown
  result: string
} {
  if (!raw) {
    return { description: '', before: null, after: null, result: 'success' }
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      description: String(parsed.description || parsed.message || ''),
      before: parsed.before ?? parsed.previous ?? null,
      after: parsed.after ?? parsed.next ?? parsed.payload ?? parsed,
      result: String(parsed.result || 'success'),
    }
  } catch {
    return { description: raw, before: null, after: null, result: 'success' }
  }
}

export function moduleFromAction(action: string, entityType?: string): string {
  const prefix = action.split('.')[0]
  const map: Record<string, string> = {
    auth: 'Authentication',
    user: 'Users',
    role: 'Users',
    permission: 'Permissions',
    student: 'Students',
    finance: 'Finance',
    receipt: 'Finance',
    payment: 'Finance',
    expense: 'Finance',
    deposit: 'Finance',
    structure: 'Finance',
    document: 'Documents',
    template: 'Documents',
    backup: 'System',
    sync: 'System',
    settings: 'System',
    system: 'System',
  }
  if (map[prefix]) return map[prefix]
  if (entityType && map[entityType.split('_')[0]]) return map[entityType.split('_')[0]]
  return prefix || 'System'
}
