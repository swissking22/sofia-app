import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export type SyncStatus = 'pending' | 'synced'

export type BaseFields = {
  id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  sync_status: SyncStatus
  version: number
}

export function baseFields(now = new Date().toISOString()): BaseFields {
  return {
    id: randomUUID(),
    created_at: now,
    updated_at: now,
    deleted_at: null,
    sync_status: 'pending',
    version: 1,
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function padNum(n: number, width = 5): string {
  return String(n).padStart(width, '0')
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function daysAgo(n: number, from = new Date()): Date {
  const d = new Date(from)
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

export function runInTransaction<T>(
  db: Database.Database,
  fn: () => T
): T {
  return db.transaction(fn)()
}
