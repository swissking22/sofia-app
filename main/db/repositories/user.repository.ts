import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { User, UserRole } from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'

export class UserRepository extends BaseRepository<User> {
  constructor(db: Database.Database) {
    super(db, 'users')
  }

  create(
    input: Omit<CreateInput<User>, 'role_id'> & { role_id?: string | null }
  ): User {
    const record: User = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      email: input.email,
      password_hash: input.password_hash,
      role: input.role,
      role_id: input.role_id ?? null,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO users (id, school_id, email, password_hash, role, role_id, created_at, updated_at, deleted_at, sync_status, version)
           VALUES (@id, @school_id, @email, @password_hash, @role, @role_id, @created_at, @updated_at, @deleted_at, @sync_status, @version)`
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
