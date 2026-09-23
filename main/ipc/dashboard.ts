import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import {
  buildDashboardSummary,
  type DashboardSummary,
  type DashboardSummaryInput,
} from '../services/dashboard.service'
import { getDashboardSetupProgress, type SetupProgress } from './setup-progress'
import type { Class } from '../db/types'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/** @deprecated Prefer dashboard:summary — kept for older callers. */
export interface DashboardStats {
  totalStudents: number
  activeStudents: number
  totalClasses: number
  totalSubjects: number
  totalTeachers: number
  averageGrade: number | null
  scoresCount: number
  pendingSync: number
  schoolName: string
  studentsByClass: Array<{ label: string; value: number }>
  setupProgress: SetupProgress
}

function enrollmentLevelLabel(
  classRow: Class,
  levelName: string | undefined
): string {
  if (levelName?.trim()) return levelName.trim()
  const stripped = classRow.name
    .replace(/\s+[A-Za-z]$/, '')
    .replace(/\s+(General|Commercial|Technical)\b.*$/i, '')
    .trim()
  return stripped || classRow.name
}

function buildEnrollmentByLevel(
  repos: Repositories,
  schoolId: string | undefined,
  students: Array<{ class_id: string }>
): Array<{ label: string; value: number }> {
  const classes = schoolId
    ? repos.classes.findBySchool(schoolId)
    : repos.classes.findAll()

  const levels = schoolId
    ? repos.academicLevels.findBySchool(schoolId)
    : repos.academicLevels.findAll()

  const levelById = new Map(levels.map((l) => [l.id, l]))

  const counts = new Map<
    string,
    { label: string; value: number; sortOrder: number }
  >()

  for (const classRow of classes) {
    const level = classRow.academic_level_id
      ? levelById.get(classRow.academic_level_id)
      : undefined

    const label = enrollmentLevelLabel(classRow, level?.name)
    const key = classRow.academic_level_id
      ? `level:${classRow.academic_level_id}`
      : `name:${label.toLowerCase()}`

    const count = students.filter((s) => s.class_id === classRow.id).length
    const existing = counts.get(key)
    if (existing) {
      existing.value += count
    } else {
      counts.set(key, {
        label,
        value: count,
        sortOrder: level?.sort_order ?? 999,
      })
    }
  }

  return [...counts.values()]
    .sort((a, b) =>
      a.sortOrder !== b.sortOrder
        ? a.sortOrder - b.sortOrder
        : a.label.localeCompare(b.label)
    )
    .map(({ label, value }) => ({ label, value }))
}

function requireSession(): SessionData | null {
  return getSession()
}

/**
 * Aggregate local counts for the dashboard overview.
 * No external APIs — all data from SQLite.
 */
export function registerDashboardIpc(
  db: Database.Database,
  repos: Repositories
): void {
  ipcMain.handle(
    'dashboard:summary',
    (
      _e,
      input?: DashboardSummaryInput
    ): Result<DashboardSummary> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      try {
        return {
          ok: true,
          data: buildDashboardSummary(db, repos, session, input ?? {}),
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not load dashboard summary.',
        }
      }
    }
  )

  /** Legacy compact stats — still used by older UI paths. */
  ipcMain.handle('dashboard:stats', (): DashboardStats => {
    const students = repos.students.findAll()
    const classes = repos.classes.findAll()
    const subjects = repos.subjects.findAll()
    const scores = repos.scores.findAll()
    const teachers = repos.users
      .findAll()
      .filter((u) => u.role === 'teacher')

    let averageGrade: number | null = null
    if (scores.length > 0) {
      const total = scores.reduce(
        (sum, s) => sum + (Number(s.test_score) + Number(s.exam_score)) / 2,
        0
      )
      averageGrade = Math.round((total / scores.length) * 10) / 10
    }

    const pendingRow = db
      .prepare(
        `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'`
      )
      .get() as { count: number }

    const school = repos.schools.findLatest()

    const studentsByClass = buildEnrollmentByLevel(
      repos,
      school?.id,
      students
    )

    return {
      totalStudents: students.length,
      activeStudents: students.length,
      totalClasses: classes.length,
      totalSubjects: subjects.length,
      totalTeachers: teachers.length,
      averageGrade,
      scoresCount: scores.length,
      pendingSync: pendingRow.count,
      schoolName: school?.name ?? 'School',
      studentsByClass,
      setupProgress: getDashboardSetupProgress(db, repos),
    }
  })
}
