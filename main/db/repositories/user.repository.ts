import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { User, UserRole } from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'

export class UserRepository extends BaseRepository<User> {
  constructor(db: Database.Database) {
    super(db, 'users')
  }

  create(
    input: Omit<CreateInput<User>, 'role_id'> & {
      role_id?: string | null
      /** Optional stable id (e.g. Supabase Auth user id on secondary-desk bootstrap). */
      id?: string
    }
  ): User {
    const base = this.buildBaseFields()
    const record: User = {
      ...base,
      id: input.id?.trim() || base.id,
      school_id: input.school_id,
      email: input.email,
      password_hash: input.password_hash,
      role: input.role,
      role_id: input.role_id ?? null,
      first_name: input.first_name ?? '',
      last_name: input.last_name ?? '',
      phone: input.phone ?? null,
      status: input.status ?? 'active',
      last_login_at: input.last_login_at ?? null,
      staff_id: input.staff_id ?? null,
      failed_login_count: input.failed_login_count ?? 0,
      locked_until: input.locked_until ?? null,
      must_change_password: input.must_change_password ?? 0,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO users (id, school_id, email, password_hash, role, role_id,
            first_name, last_name, phone, status, last_login_at, staff_id,
            failed_login_count, locked_until, must_change_password,
            created_at, updated_at, deleted_at, sync_status, version)
           VALUES (@id, @school_id, @email, @password_hash, @role, @role_id,
            @first_name, @last_name, @phone, @status, @last_login_at, @staff_id,
            @failed_login_count, @locked_until, @must_change_password,
            @created_at, @updated_at, @deleted_at, @sync_status, @version)`
        )
        .run(record)

      enqueueSync(this.db, this.tableName, record.id, 'INSERT', record as unknown as Record<string, unknown>)
    })

    tx()
    return record
  }

  update(id: string, input: UpdateInput<User>): User | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    const record: User = {
      ...existing,
      ...input,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE users
           SET school_id = @school_id,
               email = @email,
               password_hash = @password_hash,
               role = @role,
               role_id = @role_id,
               first_name = @first_name,
               last_name = @last_name,
               phone = @phone,
               status = @status,
               last_login_at = @last_login_at,
               staff_id = @staff_id,
               failed_login_count = @failed_login_count,
               locked_until = @locked_until,
               must_change_password = @must_change_password,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(record)

      enqueueSync(this.db, this.tableName, record.id, 'UPDATE', record as unknown as Record<string, unknown>)
    })

    tx()
    return record
  }

  /** Find active user by email (for login). */
  findByEmail(email: string): User | undefined {
    return this.db
      .prepare(
        `SELECT * FROM users WHERE email = ? AND deleted_at IS NULL`
      )
      .get(email) as User | undefined
  }

  /** Return user without password_hash for safe IPC responses. */
  toSafeUser(user: User): Omit<User, 'password_hash'> & { password_hash?: never } {
    const { password_hash: _, ...safe } = user
    return safe
  }
}

export type { UserRole }
