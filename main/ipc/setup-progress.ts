import type Database from 'better-sqlite3'
import type { Repositories } from '../db/repositories'
import { getSetupProgress, type SetupProgress } from './setup'

/**
 * Dashboard checklist — delegates to stored setup_steps status.
 * Kept as a thin wrapper so dashboard IPC stays stable.
 */
export function getDashboardSetupProgress(
  _db: Database.Database,
  repos: Repositories
): SetupProgress {
  return getSetupProgress(repos)
}

// Re-export types used by dashboard IPC consumers
export type { SetupProgress, SetupProgressStep } from './setup'
