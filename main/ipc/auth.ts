import { ipcMain } from 'electron'
import type { Repositories } from '../db/repositories'
import {
  getSession,
  getSetupState,
  login,
  logout,
  registerAdmin,
  registerSchool,
  type LoginInput,
  type RegisterAdminInput,
  type RegisterSchoolInput,
} from '../auth'
import { joinSchoolByCode } from '../services/join-school'
import { PERMISSION_CATALOG } from '../rbac/catalog'

/**
 * Register all auth IPC handlers.
 * Renderer talks only through these channels — never touches SQLite.
 */
export function registerAuthIpc(repos: Repositories): void {
  ipcMain.handle('auth:needs-setup', () => {
    return getSetupState(repos)
  })

  ipcMain.handle('auth:session', () => {
    return { session: getSession() }
  })

  // Step 1–2: create school (details + logo)
  ipcMain.handle(
    'auth:register-school',
    (_event, input: RegisterSchoolInput) => {
      return registerSchool(repos, input)
    }
  )

  // Step 3: create admin for that school
  ipcMain.handle(
    'auth:register-admin',
    async (_event, input: RegisterAdminInput) => {
      return registerAdmin(repos, input)
    }
  )

  /** Secondary desk: join existing school by code, pull users, then login. */
  ipcMain.handle(
    'auth:join-school',
    async (_event, input: { schoolCode?: string }) => {
      return joinSchoolByCode(repos, String(input?.schoolCode || ''))
    }
  )

  ipcMain.handle('auth:login', async (_event, input: LoginInput) => {
    return login(repos, input)
  })

  ipcMain.handle('auth:logout', () => {
    logout(repos)
    return { ok: true }
  })

  ipcMain.handle('auth:get-permissions', () => {
    const session = getSession()
    if (!session?.userId) {
      return { ok: false as const, error: 'Not authenticated.' }
    }
    // School owner (session role admin) sees every module regardless of role_id.
    if (session.role === 'admin') {
      return {
        ok: true as const,
        data: { permissions: PERMISSION_CATALOG.map((p) => p.name) },
      }
    }
    // Repair every seeded system role (and empty name-matched custom roles).
    try {
      if (session.schoolId) repos.roles.ensureDefaults(session.schoolId)
    } catch {
      /* non-fatal */
    }
    const permissions = repos.roles.getPermissionNamesForUser(session.userId)
    return { ok: true as const, data: { permissions } }
  })
}
