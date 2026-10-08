import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  PERMISSION_CATALOG,
  SYSTEM_ROLE_SEEDS,
} from '../../rbac/catalog'
import type { Permission, Role, RolePermission, User } from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'

export interface PermissionCatalogGroup {
  module_key: string
  module_label: string
  permissions: Array<{
    id: string
    name: string
    label: string
  }>
}

export interface RoleListItem {
  id: string
  name: string
  description: string | null
  is_system: boolean
  is_enabled?: boolean
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

export interface RoleWriteInput {
  name: string
  description?: string | null
  permission_ids: string[]
}

export class RoleRepository extends BaseRepository<Role> {
  constructor(db: Database.Database) {
    super(db, 'roles')
  }

  /** Seed global permission catalog + system roles for a school. */
  ensureDefaults(schoolId: string): void {
    const tx = this.db.transaction(() => {
      this.seedPermissionCatalog()
      this.seedSystemRoles(schoolId)
    })
    tx()
  }

  private seedPermissionCatalog(): void {
    for (const seed of PERMISSION_CATALOG) {
      const existing = this.db
        .prepare(
          `SELECT id FROM permissions WHERE name = ? AND deleted_at IS NULL`
        )
        .get(seed.name) as { id: string } | undefined
      if (existing) continue

      const record: Permission = {
        ...this.buildBaseFields(),
        name: seed.name,
        label: seed.label,
        module_key: seed.module_key,
        module_label: seed.module_label,
      }
      this.db
        .prepare(
          `INSERT INTO permissions (
            id, name, label, module_key, module_label,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @name, @label, @module_key, @module_label,
            @created_at, @updated_at, @deleted_at, @sync_status, @version
          )`
        )
        .run(record)
      enqueueSync(
        this.db,
        'permissions',
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
    }
  }

  private permissionIdsForSeed(
    seed: (typeof SYSTEM_ROLE_SEEDS)[number],
    allPerms: Permission[],
    byName: Map<string, string>
  ): string[] {
    return seed.permissions === 'all'
      ? allPerms.map((p) => p.id)
      : seed.permissions
          .map((n) => byName.get(n))
          .filter((id): id is string => Boolean(id))
  }

  private seedSystemRoles(schoolId: string): void {
    const allPerms = this.listAllPermissions()
    const byName = new Map(allPerms.map((p) => [p.name, p.id]))

    // Repair / create every seeded system role (Principal, Vice Principal,
    // Teacher, Bursar, Secretary, Registrar, Read Only, …) — not just Admin.
    for (const seed of SYSTEM_ROLE_SEEDS) {
      const existing = this.db
        .prepare(
          `SELECT id FROM roles
           WHERE school_id = ? AND name = ? AND deleted_at IS NULL`
        )
        .get(schoolId, seed.name) as { id: string } | undefined
      const permIds = this.permissionIdsForSeed(seed, allPerms, byName)

      if (existing) {
        this.replaceRolePermissions(existing.id, permIds)
        continue
      }

      const role: Role = {
        ...this.buildBaseFields(),
        school_id: schoolId,
        name: seed.name,
        description: seed.description,
        is_system: 1,
      }
      this.db
        .prepare(
          `INSERT INTO roles (
            id, school_id, name, description, is_system,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @school_id, @name, @description, @is_system,
            @created_at, @updated_at, @deleted_at, @sync_status, @version
          )`
        )
        .run(role)
      enqueueSync(
        this.db,
        'roles',
        role.id,
        'INSERT',
        role as unknown as Record<string, unknown>
      )

      this.replaceRolePermissions(role.id, permIds)
    }

    // Also repair empty custom roles that share a seed name (e.g. "bursar"
    // created before the catalog filled) — only when they currently have
    // zero active permissions, so intentional custom sets are left alone.
    this.repairEmptyRolesMatchingSeeds(schoolId, allPerms, byName)
  }

  private repairEmptyRolesMatchingSeeds(
    schoolId: string,
    allPerms: Permission[],
    byName: Map<string, string>
  ): void {
    const seedByLower = new Map(
      SYSTEM_ROLE_SEEDS.map((s) => [s.name.toLowerCase(), s] as const)
    )
    const emptyRoles = this.db
      .prepare(
        `SELECT r.id, r.name FROM roles r
         WHERE r.school_id = ?
           AND r.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM role_permissions rp
             WHERE rp.role_id = r.id AND rp.deleted_at IS NULL
           )`
      )
      .all(schoolId) as Array<{ id: string; name: string }>

    for (const row of emptyRoles) {
      const seed = seedByLower.get(String(row.name || '').trim().toLowerCase())
      if (!seed) continue
      const permIds = this.permissionIdsForSeed(seed, allPerms, byName)
      if (permIds.length === 0) continue
      this.replaceRolePermissions(row.id, permIds)
    }
  }

  listAllPermissions(): Permission[] {
    return this.db
      .prepare(
        `SELECT * FROM permissions
         WHERE deleted_at IS NULL
         ORDER BY module_label ASC, label ASC`
      )
      .all() as Permission[]
  }

  getCatalogGrouped(): PermissionCatalogGroup[] {
    const perms = this.listAllPermissions()
    const map = new Map<string, PermissionCatalogGroup>()
    for (const p of perms) {
      let group = map.get(p.module_key)
      if (!group) {
        group = {
          module_key: p.module_key,
          module_label: p.module_label,
          permissions: [],
        }
        map.set(p.module_key, group)
      }
      group.permissions.push({
        id: p.id,
        name: p.name,
        label: p.label,
      })
    }
    return Array.from(map.values())
  }

  listBySchool(schoolId: string): RoleListItem[] {
    this.ensureDefaults(schoolId)
    const roles = this.db
      .prepare(
        `SELECT * FROM roles
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY is_system DESC, name ASC`
      )
      .all(schoolId) as Role[]

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      is_system: role.is_system === 1,
      is_enabled: role.is_enabled !== 0,
      user_count: this.countUsersForRole(role.id),
      permission_count: this.countPermissionsForRole(role.id),
    }))
  }

  getDetail(roleId: string): RoleDetail | undefined {
    const role = this.findById(roleId)
    if (!role) return undefined

    const permissionIds = this.getPermissionIds(roleId)
    const permissionNames = this.getPermissionNames(roleId)
    const users = this.listUsersForRole(roleId)

    return {
      id: role.id,
      school_id: role.school_id,
      name: role.name,
      description: role.description,
      is_system: role.is_system === 1,
      permission_ids: permissionIds,
      permission_names: permissionNames,
      users,
      user_count: users.length,
      permission_count: permissionIds.length,
    }
  }

  createRole(schoolId: string, input: RoleWriteInput): RoleDetail {
    const name = input.name.trim()
    if (!name) throw new Error('Role name is required.')
    this.assertUniqueName(schoolId, name)
    const permissionIds = [...new Set(input.permission_ids ?? [])]
    if (permissionIds.length === 0) {
      throw new Error(
        'Assign at least one permission before saving this role. Users with an empty role only see Dashboard and Help.'
      )
    }

    const role: Role = {
      ...this.buildBaseFields(),
      school_id: schoolId,
      name,
      description: input.description?.trim() || null,
      is_system: 0,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO roles (
            id, school_id, name, description, is_system,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @school_id, @name, @description, @is_system,
            @created_at, @updated_at, @deleted_at, @sync_status, @version
          )`
        )
        .run(role)
      enqueueSync(
        this.db,
        'roles',
        role.id,
        'INSERT',
        role as unknown as Record<string, unknown>
      )
      this.replaceRolePermissions(role.id, permissionIds)
    })
    tx()

    const detail = this.getDetail(role.id)
    if (!detail) throw new Error('Failed to create role.')
    return detail
  }

  updateRole(roleId: string, input: RoleWriteInput): RoleDetail {
    const existing = this.findById(roleId)
    if (!existing) throw new Error('Role not found.')

    const name = input.name.trim()
    if (!name) throw new Error('Role name is required.')
    this.assertUniqueName(existing.school_id, name, roleId)

    const isSystem = existing.is_system === 1
    const permissionIds = [...new Set(input.permission_ids ?? [])]
    if (!isSystem && permissionIds.length === 0) {
      throw new Error(
        'Assign at least one permission before saving this role. Users with an empty role only see Dashboard and Help.'
      )
    }

    const record: Role = {
      ...existing,
      name: isSystem ? existing.name : name,
      description: isSystem
        ? existing.description
        : input.description?.trim() || null,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE roles
           SET name = @name,
               description = @description,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(record)
      enqueueSync(
        this.db,
        'roles',
        record.id,
        'UPDATE',
        record as unknown as Record<string, unknown>
      )

      // System roles: permissions locked (catalog re-applied via ensureDefaults)
      if (!isSystem) {
        this.replaceRolePermissions(roleId, permissionIds)
      }
    })
    tx()

    const detail = this.getDetail(roleId)
    if (!detail) throw new Error('Failed to update role.')
    return detail
  }

  softDeleteRole(roleId: string): void {
    const existing = this.findById(roleId)
    if (!existing) throw new Error('Role not found.')
    if (existing.is_system === 1) {
      throw new Error('System roles cannot be deleted.')
    }
    const users = this.countUsersForRole(roleId)
    if (users > 0) {
      throw new Error(
        `Cannot delete role while ${users} user(s) are assigned. Reassign them first.`
      )
    }
    this.delete(roleId)
  }

  setEnabled(roleId: string, enabled: boolean): RoleDetail {
    const existing = this.findById(roleId)
    if (!existing) throw new Error('Role not found.')
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE roles SET is_enabled = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
         WHERE id = ?`
      )
      .run(enabled ? 1 : 0, now, roleId)
    const detail = this.getDetail(roleId)
    if (!detail) throw new Error('Role not found.')
    return detail
  }

  duplicateRole(roleId: string): RoleDetail {
    const source = this.getDetail(roleId)
    if (!source) throw new Error('Role not found.')

    let baseName = `${source.name} (Copy)`
    let name = baseName
    let n = 2
    while (this.findByName(source.school_id, name)) {
      name = `${baseName} ${n}`
      n += 1
    }

    return this.createRole(source.school_id, {
      name,
      description: source.description,
      permission_ids: source.permission_ids,
    })
  }

  /** Permission names for a user via users.role_id. */
  getPermissionNamesForUser(userId: string): string[] {
    const user = this.db
      .prepare(
        `SELECT role_id FROM users WHERE id = ? AND deleted_at IS NULL`
      )
      .get(userId) as { role_id: string | null } | undefined
    if (!user?.role_id) return []
    return this.getPermissionNames(user.role_id)
  }

  private findByName(schoolId: string, name: string): Role | undefined {
    return this.db
      .prepare(
        `SELECT * FROM roles
         WHERE school_id = ? AND name = ? AND deleted_at IS NULL`
      )
      .get(schoolId, name) as Role | undefined
  }

  private assertUniqueName(
    schoolId: string,
    name: string,
    excludeId?: string
  ): void {
    const row = this.findByName(schoolId, name)
    if (row && row.id !== excludeId) {
      throw new Error(`A role named “${name}” already exists.`)
    }
  }

  private countUsersForRole(roleId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM users
         WHERE role_id = ? AND deleted_at IS NULL`
      )
      .get(roleId) as { c: number }
    return row.c
  }

  private countPermissionsForRole(roleId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM role_permissions
         WHERE role_id = ? AND deleted_at IS NULL`
      )
      .get(roleId) as { c: number }
    return row.c
  }

  private getPermissionIds(roleId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT permission_id FROM role_permissions
         WHERE role_id = ? AND deleted_at IS NULL`
      )
      .all(roleId) as Array<{ permission_id: string }>
    return rows.map((r) => r.permission_id)
  }

  private getPermissionNames(roleId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT p.name FROM role_permissions rp
         INNER JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = ?
           AND rp.deleted_at IS NULL
           AND p.deleted_at IS NULL`
      )
      .all(roleId) as Array<{ name: string }>
    return rows.map((r) => r.name)
  }

  private listUsersForRole(roleId: string): RoleUserSummary[] {
    return this.db
      .prepare(
        `SELECT id, email, role FROM users
         WHERE role_id = ? AND deleted_at IS NULL
         ORDER BY email ASC`
      )
      .all(roleId) as RoleUserSummary[]
  }

  private replaceRolePermissions(
    roleId: string,
    permissionIds: string[]
  ): void {
    const unique = Array.from(new Set(permissionIds))
    const existing = this.db
      .prepare(
        `SELECT * FROM role_permissions
         WHERE role_id = ? AND deleted_at IS NULL`
      )
      .all(roleId) as RolePermission[]

    const keep = new Set(unique)
    for (const row of existing) {
      if (!keep.has(row.permission_id)) {
        const now = new Date().toISOString()
        const updated: RolePermission = {
          ...row,
          deleted_at: now,
          updated_at: now,
          version: row.version + 1,
          sync_status: 'pending',
        }
        this.db
          .prepare(
            `UPDATE role_permissions
             SET deleted_at = @deleted_at,
                 updated_at = @updated_at,
                 version = @version,
                 sync_status = @sync_status
             WHERE id = @id`
          )
          .run(updated)
        enqueueSync(
          this.db,
          'role_permissions',
          updated.id,
          'DELETE',
          updated as unknown as Record<string, unknown>
        )
      }
    }

    const existingIds = new Set(existing.map((r) => r.permission_id))
    for (const permissionId of unique) {
      if (existingIds.has(permissionId)) continue
      const record: RolePermission = {
        ...this.buildBaseFields(),
        role_id: roleId,
        permission_id: permissionId,
      }
      this.db
        .prepare(
          `INSERT INTO role_permissions (
            id, role_id, permission_id,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @role_id, @permission_id,
            @created_at, @updated_at, @deleted_at, @sync_status, @version
          )`
        )
        .run(record)
      enqueueSync(
        this.db,
        'role_permissions',
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
    }
  }
}

/** Unused CreateInput helper types kept for consistency. */
export type RoleCreateInput = CreateInput<Role>
export type RoleUpdateInput = UpdateInput<Role>
export type { User }
