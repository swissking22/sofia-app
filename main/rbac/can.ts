/** Simple permission checks against a user's granted permission names. */

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
