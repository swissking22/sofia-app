import { randomUUID } from 'crypto'
import path from 'path'
import { BrowserWindow, dialog, ipcMain, app } from 'electron'
import { getSession, type SessionData, hashPassword } from '../auth'
import { getDatabasePath, queueDatabaseRestore } from '../db'
import type { Repositories } from '../db/repositories'
import { SystemAdminService } from '../services/system-admin'
import { tryProvisionStaffAuth, type CloudAuthRole } from '../services/cloud-auth'
import { prepareTeacherForMobile } from '../services/prepare-teacher-mobile'
import {
  assertUserDeletable,
  buildPermissionMatrix,
  restoreWarning,
} from '../domain/system-admin'
import {
  stageRestoreSource,
  verifySqliteBackup,
} from '../db/sqlite-backup'
import { scheduleTeacherReadySync } from '../sync/auto-sync'
import { runSyncWorker } from '../sync/worker'
import type { RoleWriteInput } from '../db/repositories/role.repository'
import type { UserRole } from '../db/types'

type Result<T> = { ok: true; data: T; warning?: string } | { ok: false; error: string }

function session(): SessionData | null {
  return getSession()
}

function sid(repos: Repositories, s: SessionData): string {
  return s.schoolId || repos.schools.findLatest()?.id || ''
}

function perms(repos: Repositories, s: SessionData): string[] {
  try {
    return repos.roles.getPermissionNamesForUser(s.userId)
  } catch {
    return []
  }
}

function allow(repos: Repositories, s: SessionData, names: string[]): boolean {
  if (s.role === 'admin') return true
  const p = perms(repos, s)
  return names.some((n) => p.includes(n))
}

function wrap<T>(fn: () => T, fallback: string): Result<T> {
  try {
    return { ok: true, data: fn() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : fallback }
  }
}

export function registerSystemAdminIpc(repos: Repositories): void {
  const admin = () => repos.systemAdmin
  const svc = new SystemAdminService()

  ipcMain.handle('system-admin:overview', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.health.view', 'system.users.view', 'system.settings.view'])) {
      return { ok: false, error: 'Access denied.' }
    }
    const schoolId = sid(repos, s)
    repos.roles.ensureDefaults(schoolId)
    const overview = admin().overview(schoolId)
    return {
      ok: true,
      data: {
        ...overview,
        health: {
          ...overview.health,
          version: app.getVersion(),
        },
        can: permissionFlags(repos, s),
      },
    }
  })

  ipcMain.handle(
    'system-admin:users-list',
    (_e, input?: Record<string, unknown>): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['system.users.view'])) return { ok: false, error: 'Access denied.' }
      return {
        ok: true,
        data: admin().listUsers(sid(repos, s), {
          query: input?.query as string,
          role_id: input?.role_id as string,
          status: input?.status as string,
          page: input?.page as number,
          page_size: input?.page_size as number,
        }),
      }
    }
  )

  ipcMain.handle('system-admin:users-get', (_e, input: { id: string }): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.users.view'])) return { ok: false, error: 'Access denied.' }
    const data = admin().getUser(sid(repos, s), input.id)
    if (!data) return { ok: false, error: 'User not found.' }
    const names = data.user.role_id
      ? repos.roles.getDetail(data.user.role_id)?.permission_names ?? []
      : []
    return { ok: true, data: { ...data, permissions: names } }
  })

  ipcMain.handle(
    'system-admin:users-create',
    async (
      _e,
      input: {
        first_name: string
        last_name: string
        email: string
        phone?: string
        role_id: string
        password: string
        staff_id?: string | null
      }
    ): Promise<Result<unknown>> => {
      const s = session()
      if (!s || !allow(repos, s, ['system.users.create'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      repos.roles.ensureDefaults(schoolId)
      const role = repos.roles.getDetail(input.role_id)
      if (!role || role.school_id !== schoolId) return { ok: false, error: 'Role not found.' }
      if (!role.permission_names.length) {
        return {
          ok: false,
          error:
            'That role has no permissions assigned. Open Roles, grant the needed access (or use the system Bursar role), then try again.',
        }
      }
      const settings = admin().ensureSettings(schoolId) as {
        password_min_length: number
        password_require_upper: number
        password_require_digit: number
      }
      try {
        const shaped = svc.createUser({
          email: input.email,
          first_name: input.first_name,
          last_name: input.last_name,
          role_id: input.role_id,
          school_id: schoolId,
          permission_names: role.permission_names,
          password: input.password,
          policy: {
            min_length: Number(settings.password_min_length) || 8,
            require_upper: settings.password_require_upper === 1,
            require_digit: settings.password_require_digit === 1,
          },
        })
        if (repos.users.findByEmail(shaped.email)) {
          return { ok: false, error: 'An account with this email already exists.' }
        }
        // Teaching staff should be created under Staff → Teachers (mobile), not as desktop users.
        if (shaped.role === 'teacher' && !input.staff_id) {
          return {
            ok: false,
            error:
              'Teachers are mobile staff accounts. Create them under Staff → Teachers (with email + assignments) instead of Administration → Users.',
          }
        }
        if (input.staff_id) {
          const staff = repos.staff.findById(input.staff_id)
          if (!staff || staff.school_id !== schoolId) {
            return { ok: false, error: 'Linked staff member not found.' }
          }
        }
        const id = randomUUID()
        admin().insertUser({
          id,
          school_id: schoolId,
          email: shaped.email,
          password_hash: await hashPassword(input.password),
          role: shaped.role,
          role_id: input.role_id,
          first_name: input.first_name.trim(),
          last_name: input.last_name.trim(),
          phone: input.phone?.trim() || null,
          status: 'active',
          staff_id: input.staff_id || null,
          must_change_password: 1,
        })
        admin().writeAudit({
          school_id: schoolId,
          actor_user_id: s.userId,
          action: 'user.create',
          entity_type: 'user',
          entity_id: id,
          description: `Created user ${shaped.email}`,
          after: { email: shaped.email, role_id: input.role_id, staff_id: input.staff_id },
        })
        let warning: string | null = null
        if (shaped.role === 'teacher' && input.staff_id) {
          warning = await prepareTeacherForMobile({
            schoolId,
            staffId: input.staff_id,
            email: shaped.email,
            displayName: `${input.first_name.trim()} ${input.last_name.trim()}`.trim(),
            schoolName: repos.schools.findById(schoolId)?.name ?? null,
            resetPassword: true,
            password: input.password,
          })
        } else {
          const cloudRole: CloudAuthRole =
            shaped.role === 'secretary' ? 'secretary' : 'admin'
          warning = await tryProvisionStaffAuth({
            email: shaped.email,
            password: input.password,
            role: cloudRole,
            schoolId,
            staffId: input.staff_id || null,
            schoolName: repos.schools.findById(schoolId)?.name ?? null,
            displayName: `${input.first_name.trim()} ${input.last_name.trim()}`.trim(),
            resetPassword: true,
          })
          scheduleTeacherReadySync(schoolId)
        }
        return {
          ok: true,
          data: admin().getUser(schoolId, id),
          ...(warning ? { warning } : {}),
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not create user.' }
      }
    }
  )

  ipcMain.handle(
    'system-admin:users-update',
    (
      _e,
      input: {
        id: string
        first_name?: string
        last_name?: string
        phone?: string | null
        role_id?: string
        status?: string
        staff_id?: string | null
      }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['system.users.edit'])) return { ok: false, error: 'Access denied.' }
      const schoolId = sid(repos, s)
      const before = admin().getUser(schoolId, input.id)
      if (!before) return { ok: false, error: 'User not found.' }
      if (input.status && input.status !== 'active' && !allow(repos, s, ['system.users.deactivate'])) {
        return { ok: false, error: 'Access denied.' }
      }
      let coarse: UserRole | undefined
      if (input.role_id) {
        const role = repos.roles.getDetail(input.role_id)
        if (!role || role.school_id !== schoolId) return { ok: false, error: 'Role not found.' }
        coarse = svc.createUser({
          email: before.user.email,
          first_name: input.first_name || before.user.first_name || 'User',
          last_name: input.last_name || before.user.last_name || 'Account',
          role_id: input.role_id,
          school_id: schoolId,
          permission_names: role.permission_names,
          password: 'Sofia@Temp1',
        }).role
      }
      return wrap(() => {
        admin().patchUser(schoolId, input.id, {
          first_name: input.first_name,
          last_name: input.last_name,
          phone: input.phone,
          role_id: input.role_id,
          role: coarse,
          status: input.status,
          staff_id: input.staff_id,
        })
        admin().writeAudit({
          school_id: schoolId,
          actor_user_id: s.userId,
          action: input.status && input.status !== before.user.status ? 'user.status' : 'user.edit',
          entity_type: 'user',
          entity_id: input.id,
          before: { role_id: before.user.role_id, status: before.user.status },
          after: { role_id: input.role_id, status: input.status },
        })
        return admin().getUser(schoolId, input.id)
      }, 'Could not update user.')
    }
  )

  ipcMain.handle(
    'system-admin:users-delete',
    (_e, input: { id: string }): Result<{ id: string }> => {
      const s = session()
      if (!s || !allow(repos, s, ['system.users.delete'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      const before = admin().getUser(schoolId, input.id)
      if (!before) return { ok: false, error: 'User not found.' }
      return wrap(() => {
        const remainingAdmins =
          before.user.role === 'admin'
            ? admin().countActiveAdmins(schoolId, input.id)
            : 1
        assertUserDeletable({
          actorUserId: s.userId,
          targetUserId: input.id,
          targetRole: before.user.role,
          remainingActiveAdminsIfDeleted: remainingAdmins,
        })
        admin().softDeleteUser(schoolId, input.id)
        admin().writeAudit({
          school_id: schoolId,
          actor_user_id: s.userId,
          action: 'user.delete',
          entity_type: 'user',
          entity_id: input.id,
          description: `Deleted user ${before.user.email}`,
          before: {
            email: before.user.email,
            role: before.user.role,
            status: before.user.status,
          },
        })
        return { id: input.id }
      }, 'Could not delete user.')
    }
  )

  ipcMain.handle(
    'system-admin:users-reset-password',
    async (_e, input: { id: string; password: string }): Promise<Result<unknown>> => {
      const s = session()
      if (!s || !allow(repos, s, ['system.users.edit'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      const user = admin().getUser(schoolId, input.id)
      if (!user) return { ok: false, error: 'User not found.' }
      try {
        svc.createUser({
          email: user.user.email,
          first_name: user.user.first_name || 'User',
          last_name: user.user.last_name || 'Account',
          role_id: user.user.role_id || 'x',
          school_id: schoolId,
          permission_names: [],
          password: input.password,
        })
        admin().patchUser(schoolId, input.id, {
          password_hash: await hashPassword(input.password),
          must_change_password: 1,
        })
        admin().revokeSessions(schoolId, input.id)
        admin().writeAudit({
          school_id: schoolId,
          actor_user_id: s.userId,
          action: 'auth.password_reset',
          entity_type: 'user',
          entity_id: input.id,
          description: 'Password reset by administrator',
        })
        const cloudRole: CloudAuthRole =
          user.user.role === 'teacher'
            ? 'teacher'
            : user.user.role === 'secretary'
              ? 'secretary'
              : 'admin'
        let warning: string | null = null
        if (cloudRole === 'teacher' && user.user.staff_id) {
          warning = await prepareTeacherForMobile({
            schoolId,
            staffId: user.user.staff_id,
            email: user.user.email,
            displayName:
              `${user.user.first_name || ''} ${user.user.last_name || ''}`.trim() ||
              user.user.email,
            schoolName: repos.schools.findById(schoolId)?.name ?? null,
            resetPassword: true,
            password: input.password,
          })
        } else {
          warning = await tryProvisionStaffAuth({
            email: user.user.email,
            password: input.password,
            role: cloudRole,
            schoolId,
            staffId: user.user.staff_id || null,
            schoolName: repos.schools.findById(schoolId)?.name ?? null,
            displayName:
              `${user.user.first_name || ''} ${user.user.last_name || ''}`.trim() ||
              null,
            resetPassword: true,
          })
          scheduleTeacherReadySync(schoolId)
        }
        return {
          ok: true,
          data: { id: input.id },
          ...(warning ? { warning } : {}),
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not reset password.' }
      }
    }
  )

  ipcMain.handle('system-admin:users-revoke-sessions', (_e, input: { id: string }): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.users.edit'])) return { ok: false, error: 'Access denied.' }
    const schoolId = sid(repos, s)
    if (!admin().getUser(schoolId, input.id)) return { ok: false, error: 'User not found.' }
    admin().revokeSessions(schoolId, input.id)
    admin().writeAudit({
      school_id: schoolId,
      actor_user_id: s.userId,
      action: 'user.revoke_sessions',
      entity_type: 'user',
      entity_id: input.id,
    })
    return { ok: true, data: { id: input.id } }
  })

  ipcMain.handle('system-admin:roles-list', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.roles.view', 'system.users.view'])) {
      return { ok: false, error: 'Access denied.' }
    }
    return { ok: true, data: { roles: repos.roles.listBySchool(sid(repos, s)) } }
  })

  ipcMain.handle('system-admin:roles-get', (_e, input: { id: string }): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.roles.view'])) return { ok: false, error: 'Access denied.' }
    const detail = repos.roles.getDetail(input.id)
    if (!detail || detail.school_id !== sid(repos, s)) return { ok: false, error: 'Role not found.' }
    return { ok: true, data: { role: detail } }
  })

  ipcMain.handle('system-admin:roles-save', (_e, input: RoleWriteInput & { id?: string }): Result<unknown> => {
    const s = session()
    const schoolId = s ? sid(repos, s) : ''
    if (!s || !allow(repos, s, [input.id ? 'system.roles.edit' : 'system.roles.create'])) {
      return { ok: false, error: 'Access denied.' }
    }
    return wrap(() => {
      const role = input.id
        ? (() => {
            const existing = repos.roles.getDetail(input.id!)
            if (!existing || existing.school_id !== schoolId) throw new Error('Role not found.')
            return repos.roles.updateRole(input.id!, input)
          })()
        : repos.roles.createRole(schoolId, input)
      admin().writeAudit({
        school_id: schoolId,
        actor_user_id: s.userId,
        action: input.id ? 'role.update' : 'role.create',
        entity_type: 'role',
        entity_id: role.id,
        after: { name: role.name, permission_ids: role.permission_ids },
      })
      return role
    }, 'Could not save role.')
  })

  ipcMain.handle('system-admin:roles-duplicate', (_e, input: { id: string }): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.roles.create'])) return { ok: false, error: 'Access denied.' }
    const existing = repos.roles.getDetail(input.id)
    if (!existing || existing.school_id !== sid(repos, s)) return { ok: false, error: 'Role not found.' }
    return wrap(() => repos.roles.duplicateRole(input.id), 'Could not duplicate role.')
  })

  ipcMain.handle(
    'system-admin:roles-set-enabled',
    (_e, input: { id: string; enabled: boolean }): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['system.roles.manage'])) return { ok: false, error: 'Access denied.' }
      const existing = repos.roles.getDetail(input.id)
      if (!existing || existing.school_id !== sid(repos, s)) return { ok: false, error: 'Role not found.' }
      return wrap(
        () => repos.roles.setEnabled(input.id, input.enabled),
        'Could not update role.'
      )
    }
  )

  ipcMain.handle('system-admin:permissions-matrix', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.permissions.view', 'system.roles.view'])) {
      return { ok: false, error: 'Access denied.' }
    }
    const schoolId = sid(repos, s)
    repos.roles.ensureDefaults(schoolId)
    const roles = repos.roles.listBySchool(schoolId)
    const details = roles.map((r) => repos.roles.getDetail(r.id)!).filter(Boolean)
    const permsList = repos.roles.listAllPermissions()
    return {
      ok: true,
      data: {
        roles,
        matrix: buildPermissionMatrix(permsList, details),
        catalog: repos.roles.getCatalogGrouped(),
      },
    }
  })

  ipcMain.handle(
    'system-admin:audit-list',
    (_e, input?: Record<string, unknown>): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['system.audit.view'])) return { ok: false, error: 'Access denied.' }
      return {
        ok: true,
        data: admin().listAudit(sid(repos, s), {
          query: input?.query as string,
          module: input?.module as string,
          action: input?.action as string,
          user_id: input?.user_id as string,
          from: input?.from as string,
          to: input?.to as string,
          page: input?.page as number,
          page_size: input?.page_size as number,
        }),
      }
    }
  )

  ipcMain.handle('system-admin:audit-get', (_e, input: { id: string }): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.audit.view'])) return { ok: false, error: 'Access denied.' }
    const event = admin().getAudit(sid(repos, s), input.id)
    if (!event) return { ok: false, error: 'Event not found.' }
    return { ok: true, data: { event } }
  })

  ipcMain.handle('system-admin:backup-list', (_e, input?: { page?: number }): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.backup.view'])) return { ok: false, error: 'Access denied.' }
    return { ok: true, data: admin().listBackups(sid(repos, s), input?.page || 1) }
  })

  ipcMain.handle('system-admin:backup-now', async (): Promise<Result<unknown>> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.backup.create'])) {
      return { ok: false, error: 'Access denied.' }
    }
    const schoolId = sid(repos, s)
    try {
      const file = await repos.backupSync.createLocalBackup(schoolId)
      const rec = admin().recordBackup({
        school_id: schoolId,
        file_path: file,
        backup_type: 'manual',
        created_by: s.userId,
      })
      admin().writeAudit({
        school_id: schoolId,
        actor_user_id: s.userId,
        action: 'backup.create',
        entity_type: 'backup',
        entity_id: (rec as { id: string }).id,
        description: file,
      })
      return { ok: true, data: rec }
    } catch (err) {
      admin().recordBackup({
        school_id: schoolId,
        file_path: '',
        backup_type: 'manual',
        created_by: s.userId,
        status: 'failed',
        notes: err instanceof Error ? err.message : 'Backup failed',
      })
      return { ok: false, error: err instanceof Error ? err.message : 'Backup failed.' }
    }
  })

  ipcMain.handle(
    'system-admin:backup-restore',
    async (_e, input: { id: string; confirmation: string }): Promise<Result<unknown>> => {
      const s = session()
      if (!s || !allow(repos, s, ['system.backup.restore'])) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        svc.confirmRestore(input.confirmation)
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Confirmation required.' }
      }
      const schoolId = sid(repos, s)
      const rec = admin().getBackup(schoolId, input.id)
      if (!rec) return { ok: false, error: 'Backup not found.' }
      try {
        const verification = verifySqliteBackup(rec.file_path)
        if (!verification.ok) {
          return {
            ok: false,
            error:
              verification.error ||
              'This backup file is missing or failed the SQLite integrity check.',
          }
        }
        const safety = await repos.backupSync.createLocalBackup(schoolId)
        admin().recordBackup({
          school_id: schoolId,
          file_path: safety,
          backup_type: 'automatic',
          created_by: s.userId,
          notes: 'Safety copy before restore',
        })
        queueDatabaseRestore(rec.file_path)
        admin().writeAudit({
          school_id: schoolId,
          actor_user_id: s.userId,
          action: 'backup.restore',
          entity_type: 'backup',
          entity_id: rec.id,
          description: restoreWarning(),
        })
        return {
          ok: true,
          data: { requires_restart: true, warning: restoreWarning() },
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Restore failed.' }
      }
    }
  )

  ipcMain.handle(
    'system-admin:backup-pick-restore-file',
    async (): Promise<Result<{ path: string; fileName: string; fileSize: number }>> => {
      const s = session()
      if (!s || !allow(repos, s, ['system.backup.restore'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showOpenDialog(win ?? undefined, {
        title: 'Choose Sofia backup file',
        properties: ['openFile'],
        filters: [
          { name: 'Sofia backup', extensions: ['db', 'sqlite'] },
          { name: 'All files', extensions: ['*'] },
        ],
      })
      if (result.canceled || !result.filePaths[0]) {
        return { ok: false, error: 'No file selected.' }
      }
      const filePath = result.filePaths[0]
      const verification = verifySqliteBackup(filePath)
      if (!verification.ok) {
        return {
          ok: false,
          error:
            verification.error ||
            'The selected file is not a valid Sofia SQLite backup.',
        }
      }
      return {
        ok: true,
        data: {
          path: filePath,
          fileName: path.basename(filePath),
          fileSize: verification.fileSize,
        },
      }
    }
  )

  ipcMain.handle(
    'system-admin:backup-restore-from-file',
    async (
      _e,
      input: { path: string; confirmation: string }
    ): Promise<Result<{ requires_restart?: boolean; warning?: string }>> => {
      const s = session()
      if (!s || !allow(repos, s, ['system.backup.restore'])) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        svc.confirmRestore(input.confirmation)
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Confirmation required.',
        }
      }
      if (!input.path?.trim()) {
        return { ok: false, error: 'No backup file selected.' }
      }
      const schoolId = sid(repos, s)
      try {
        const verification = verifySqliteBackup(input.path)
        if (!verification.ok) {
          return {
            ok: false,
            error:
              verification.error ||
              'The selected file is not a valid Sofia SQLite backup.',
          }
        }
        const staged = stageRestoreSource(app.getPath('userData'), input.path)
        if (!staged.ok) {
          return { ok: false, error: staged.error }
        }
        const safety = await repos.backupSync.createLocalBackup(schoolId)
        admin().recordBackup({
          school_id: schoolId,
          file_path: safety,
          backup_type: 'automatic',
          created_by: s.userId,
          notes: 'Safety copy before restore from file',
        })
        queueDatabaseRestore(staged.stagedPath)
        admin().writeAudit({
          school_id: schoolId,
          actor_user_id: s.userId,
          action: 'backup.restore_file',
          entity_type: 'backup',
          description: `Restore from file: ${path.basename(input.path)}`,
          after: { source: input.path, staged: staged.stagedPath },
        })
        return {
          ok: true,
          data: { requires_restart: true, warning: restoreWarning() },
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Restore failed.',
        }
      }
    }
  )

  ipcMain.handle('system-admin:sync-dashboard', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.sync.view', 'system.backup.view'])) {
      return { ok: false, error: 'Access denied.' }
    }
    const schoolId = sid(repos, s)
    const setup = repos.backupSync.getSetupDto(
      schoolId,
      s.schoolName,
      repos.schools.findById(schoolId)?.school_code || schoolId,
      getDatabasePath()
    )
    return {
      ok: true,
      data: {
        setup,
        dashboard: admin().syncDashboard(schoolId),
        runs: admin().listSyncRuns(schoolId),
        conflicts: admin().listConflicts(schoolId),
      },
    }
  })

  ipcMain.handle('system-admin:sync-now', async (): Promise<Result<unknown>> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.sync.run'])) return { ok: false, error: 'Access denied.' }
    const schoolId = sid(repos, s)
    const started = Date.now()
    try {
      const { getDatabase } = await import('../db')
      const result = await runSyncWorker(getDatabase(), { schoolId })
      repos.backupSync.markSyncResult(schoolId, result)
      const hasMore = Boolean(
        result.hasMore || result.push?.hasMore || result.pull?.hasMore
      )
      admin().recordSyncRun({
        school_id: schoolId,
        processed: result.processed,
        successful: result.successful,
        failed: result.failed,
        conflicts: result.conflicts,
        duration_ms: Date.now() - started,
        status: result.failed ? 'failed' : 'successful',
      })
      admin().writeAudit({
        school_id: schoolId,
        actor_user_id: s.userId,
        action: result.failed ? 'sync.failed' : 'sync.completed',
        description: `${result.processed} processed, ${result.failed} failed, ${result.conflicts} conflicts${
          hasMore ? ' (more remain)' : ''
        }`,
        result: result.failed ? 'failure' : 'success',
      })
      return {
        ok: true,
        data: {
          ...result,
          has_more: hasMore,
          hasMore,
        },
      }
    } catch (err) {
      admin().writeAudit({
        school_id: schoolId,
        actor_user_id: s.userId,
        action: 'sync.failed',
        result: 'failure',
        description: err instanceof Error ? err.message : 'Sync failed',
      })
      return { ok: false, error: err instanceof Error ? err.message : 'Sync failed.' }
    }
  })

  ipcMain.handle('system-admin:sync-retry', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.sync.run'])) return { ok: false, error: 'Access denied.' }
    const n = admin().retryFailedSync()
    admin().writeAudit({
      school_id: sid(repos, s),
      actor_user_id: s.userId,
      action: 'sync.retry',
      description: `Queued ${n} failed item(s)`,
    })
    return { ok: true, data: { retried: n } }
  })

  ipcMain.handle(
    'system-admin:sync-resolve',
    (_e, input: { id: string; resolution: 'local' | 'remote' }): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['system.sync.resolve'])) {
        return { ok: false, error: 'Access denied.' }
      }
      return wrap(() => {
        const resolved = admin().resolveConflict(
          sid(repos, s),
          input.id,
          input.resolution,
          s.userId
        )
        admin().writeAudit({
          school_id: sid(repos, s),
          actor_user_id: s.userId,
          action: 'sync.conflict_resolve',
          entity_id: input.id,
          after: {
            resolution: input.resolution,
            resolvedCount: resolved.resolvedCount,
          },
        })
        return resolved
      }, 'Could not resolve conflict.')
    }
  )

  ipcMain.handle('system-admin:settings-get', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['system.settings.view'])) return { ok: false, error: 'Access denied.' }
    const schoolId = sid(repos, s)
    const school = repos.schools.findById(schoolId)
    let finance: { currency: string; receipt_prefix?: string; payment_prefix?: string } = {
      currency: 'XAF',
    }
    try {
      const fs = repos.financeMgmt.getSettings(schoolId)
      finance = {
        currency: fs.currency,
        receipt_prefix: fs.receipt_prefix,
        payment_prefix: fs.payment_prefix,
      }
    } catch {
      /* finance not initialised */
    }
    return {
      ok: true,
      data: {
        system: admin().ensureSettings(schoolId),
        school,
        finance: {
          currency: finance.currency,
          receipt_prefix: finance.receipt_prefix,
          payment_prefix: finance.payment_prefix,
        },
        backup: repos.backupSync.getSetupDto(
          schoolId,
          school?.name || s.schoolName,
          school?.school_code || schoolId,
          getDatabasePath()
        ).backup,
        app_version: app.getVersion(),
      },
    }
  })

  ipcMain.handle(
    'system-admin:settings-save',
    (_e, input: Record<string, unknown>): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['system.settings.manage'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      const before = admin().ensureSettings(schoolId)
      const saved = admin().saveSettings(schoolId, input)
      admin().writeAudit({
        school_id: schoolId,
        actor_user_id: s.userId,
        action: 'settings.update',
        entity_type: 'system_settings',
        before,
        after: saved,
      })
      return { ok: true, data: saved }
    }
  )

  ipcMain.handle('system-admin:meta', (): Result<unknown> => {
    const s = session()
    if (!s) return { ok: false, error: 'Access denied.' }
    const schoolId = sid(repos, s)
    repos.roles.ensureDefaults(schoolId)
    return {
      ok: true,
      data: {
        roles: repos.roles.listBySchool(schoolId),
        staff: repos.staff.findBySchool(schoolId).map((st) => ({
          id: st.id,
          name: st.name,
        })),
        can: permissionFlags(repos, s),
      },
    }
  })
}

function permissionFlags(repos: Repositories, s: SessionData) {
  const p = (name: string) => allow(repos, s, [name])
  return {
    users_view: p('system.users.view'),
    users_create: p('system.users.create'),
    users_edit: p('system.users.edit'),
    users_deactivate: p('system.users.deactivate'),
    users_delete: p('system.users.delete'),
    roles_manage: p('system.roles.manage') || p('system.roles.edit'),
    roles_create: p('system.roles.create'),
    permissions_view: p('system.permissions.view'),
    audit_view: p('system.audit.view'),
    backup_create: p('system.backup.create'),
    backup_restore: p('system.backup.restore'),
    sync_run: p('system.sync.run'),
    settings_manage: p('system.settings.manage'),
  }
}
