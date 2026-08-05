import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type {
  PermissionCatalogGroup,
  RoleDetail,
  RoleListItem,
  RoleWriteInput,
} from '../db/repositories/role.repository'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  return repos.schools.findLatest()?.id ?? null
}

export function registerRolesIpc(repos: Repositories): void {
  ipcMain.handle('roles:list', (): Result<RoleListItem[]> => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) {
      return { ok: false, error: 'No school found. Complete registration first.' }
    }
    return { ok: true, data: repos.roles.listBySchool(schoolId) }
  })

  ipcMain.handle(
    'roles:get',
    (_e, roleId: string): Result<RoleDetail> => {
      if (!roleId) return { ok: false, error: 'Role id is required.' }
      const detail = repos.roles.getDetail(roleId)
      if (!detail) return { ok: false, error: 'Role not found.' }
      return { ok: true, data: detail }
    }
  )

  ipcMain.handle(
    'roles:catalog',
    (): Result<PermissionCatalogGroup[]> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) {
        return { ok: false, error: 'No school found. Complete registration first.' }
      }
      repos.roles.ensureDefaults(schoolId)
      return { ok: true, data: repos.roles.getCatalogGrouped() }
    }
  )

  ipcMain.handle(
    'roles:create',
    (_e, input: RoleWriteInput): Result<RoleDetail> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      try {
        return { ok: true, data: repos.roles.createRole(schoolId, input) }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not create role.',
        }
      }
    }
  )

  ipcMain.handle(
    'roles:update',
    (
      _e,
      payload: { id: string; input: RoleWriteInput }
    ): Result<RoleDetail> => {
      if (!payload?.id) return { ok: false, error: 'Role id is required.' }
      try {
        return {
          ok: true,
          data: repos.roles.updateRole(payload.id, payload.input),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not update role.',
        }
      }
    }
  )

  ipcMain.handle(
    'roles:delete',
    (_e, roleId: string): Result<{ id: string }> => {
      if (!roleId) return { ok: false, error: 'Role id is required.' }
      try {
        repos.roles.softDeleteRole(roleId)
        return { ok: true, data: { id: roleId } }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not delete role.',
        }
      }
    }
  )

  ipcMain.handle(
    'roles:duplicate',
    (_e, roleId: string): Result<RoleDetail> => {
      if (!roleId) return { ok: false, error: 'Role id is required.' }
      try {
        return { ok: true, data: repos.roles.duplicateRole(roleId) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not duplicate role.',
        }
      }
    }
  )
}
