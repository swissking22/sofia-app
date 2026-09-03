import { ipcMain } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import type { ReportFilters } from '../services/reports'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function requireSession(): SessionData | null {
  return getSession()
}

function canView(role: string): boolean {
  return role === 'admin' || role === 'secretary' || role === 'teacher'
}

function canViewFinance(role: string): boolean {
  return role === 'admin' || role === 'secretary'
}

function schoolId(repos: Repositories, session: SessionData): string {
  return session.schoolId || repos.schools.findLatest()?.id || ''
}

export function registerReportsIpc(repos: Repositories): void {
  const reports = repos.reports

  ipcMain.handle('reports:meta', (): Result<unknown> => {
    const session = requireSession()
    if (!session || !canView(session.role)) {
      return { ok: false, error: 'Access denied.' }
    }
    const sid = schoolId(repos, session)
    return {
      ok: true,
      data: {
        ...reports.meta(sid),
        can_view_finance: canViewFinance(session.role),
        can_export: canViewFinance(session.role) || session.role === 'admin',
      },
    }
  })

  ipcMain.handle(
    'reports:academic',
    (_e, input?: ReportFilters): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        return {
          ok: true,
          data: reports.academic(schoolId(repos, session), input ?? {}),
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not load academic performance.',
        }
      }
    }
  )

  ipcMain.handle(
    'reports:student',
    (
      _e,
      input: { student_id: string } & ReportFilters
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const { student_id, ...filters } = input
        return {
          ok: true,
          data: reports.student(
            schoolId(repos, session),
            student_id,
            filters
          ),
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not load student report.',
        }
      }
    }
  )

  ipcMain.handle(
    'reports:students-search',
    (
      _e,
      input?: { query?: string; class_id?: string | null }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      return {
        ok: true,
        data: {
          students: reports.searchStudents(
            schoolId(repos, session),
            input?.query || '',
            input?.class_id
          ),
        },
      }
    }
  )

  ipcMain.handle(
    'reports:financial',
    (_e, input?: ReportFilters): Result<unknown> => {
      const session = requireSession()
      if (!session || !canViewFinance(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        return {
          ok: true,
          data: reports.financial(schoolId(repos, session), input ?? {}),
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not load financial reports.',
        }
      }
    }
  )

  ipcMain.handle(
    'reports:attendance',
    (_e, input?: ReportFilters): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        return {
          ok: true,
          data: reports.attendance(schoolId(repos, session), input ?? {}),
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not load attendance analytics.',
        }
      }
    }
  )

  ipcMain.handle(
    'reports:insights',
    (_e, input?: ReportFilters): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const data = reports.insights(schoolId(repos, session), input ?? {})
        if (!canViewFinance(session.role)) {
          data.financial = {
            collection_rate: 0,
            outstanding: 0,
            revenue: 0,
            expenses: 0,
            net: 0,
            budget_utilization: 0,
          }
          data.insights = data.insights.filter(
            (i) => i.type !== 'financial' && i.type !== 'budget'
          )
        }
        return { ok: true, data }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not load school insights.',
        }
      }
    }
  )
}
