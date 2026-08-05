/** Roles setup types + IPC helpers. */

export interface RoleListItem {
  id: string
  name: string
  description: string | null
  is_system: boolean
  user_count: number
  permission_count: number
}

export interface RoleUserSummary {
  id: string
  email: string
  role: string
}

export interface RoleDetail {
  id: string
  school_id: string
  name: string
  description: string | null
  is_system: boolean
  permission_ids: string[]
  permission_names: string[]
  users: RoleUserSummary[]
  user_count: number
  permission_count: number
}

export interface PermissionCatalogGroup {
  module_key: string
  module_label: string
  permissions: Array<{
    id: string
    name: string
    label: string
  }>
}

export interface RoleWriteInput {
  name: string
  description?: string | null
  permission_ids: string[]
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function listRoles(): Promise<Result<RoleListItem[]>> {
  return (await window.ipc.invoke('roles:list')) as Result<RoleListItem[]>
}

export async function getRole(id: string): Promise<Result<RoleDetail>> {
  return (await window.ipc.invoke('roles:get', id)) as Result<RoleDetail>
}

export async function fetchPermissionCatalog(): Promise<
  Result<PermissionCatalogGroup[]>
> {
  return (await window.ipc.invoke(
    'roles:catalog'
  )) as Result<PermissionCatalogGroup[]>
}

export async function createRole(
  input: RoleWriteInput
): Promise<Result<RoleDetail>> {
  return (await window.ipc.invoke(
    'roles:create',
    input
  )) as Result<RoleDetail>
}

export async function updateRole(
  id: string,
  input: RoleWriteInput
): Promise<Result<RoleDetail>> {
  return (await window.ipc.invoke('roles:update', {
    id,
    input,
  })) as Result<RoleDetail>
}

export async function deleteRole(id: string): Promise<Result<{ id: string }>> {
  return (await window.ipc.invoke(
    'roles:delete',
    id
  )) as Result<{ id: string }>
}

export async function duplicateRole(
  id: string
): Promise<Result<RoleDetail>> {
  return (await window.ipc.invoke(
    'roles:duplicate',
    id
  )) as Result<RoleDetail>
}
