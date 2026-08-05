import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { Repositories } from '../db/repositories'
import type { Class } from '../db/types'
import { getDashboardSetupProgress, type SetupProgress } from './setup-progress'

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

/** Roll up all sections/specializations/classrooms under one academic level. */
function enrollmentLevelLabel(
  classRow: Class,
  levelName: string | undefined
): string {
  if (levelName?.trim()) return levelName.trim()
  // Legacy rows: strip stream / classroom suffixes when possible
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

/**
 * Aggregate local counts for the dashboard overview.
 * No external APIs — all data from SQLite.
 */
export function registerDashboardIpc(
  db: Database.Database,
  repos: Repositories
): void {
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
