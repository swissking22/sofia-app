/** Client-side RBAC helpers (mirrors main/rbac/can.ts). */

export function can(
  userPermissions: string[],
  permission: string
): boolean {
  return userPermissions.includes(permission)
}

export function canAny(
  userPermissions: string[],
  permissions: string[]
): boolean {
  return permissions.some((p) => userPermissions.includes(p))
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/** Load permission names for the current session user. */
export async function fetchMyPermissions(): Promise<
  Result<{ permissions: string[]; unrestricted?: boolean }>
> {
  return (await window.ipc.invoke('auth:get-permissions')) as Result<{
    permissions: string[]
    unrestricted?: boolean
  }>
}
