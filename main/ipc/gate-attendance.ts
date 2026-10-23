import { ipcMain } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import { localSchoolDayIso } from '../domain/gate-attendance'
import { processGateScan } from '../services/gate-attendance'
import { hasIdCardPermission } from '../domain/id-card'
import {
  getSessionPermissionNames,
  isUnrestrictedAdminSession,
} from '../rbac/session-access'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function session(): SessionData | null {
  return getSession()
}

function sid(repos: Repositories, s: SessionData): string {
  return s.schoolId || repos.schools.findLatest()?.id || ''
}

function perms(repos: Repositories, s: SessionData): string[] {
  try {
    return getSessionPermissionNames(repos, s)
  } catch {
    return []
  }
}

function allow(repos: Repositories, s: SessionData, names: string[]): boolean {
  return hasIdCardPermission(
    perms(repos, s),
    names,
    isUnrestrictedAdminSession(repos, s)
  )
}

function wrap<T>(fn: () => T, fallback: string): Result<T> {
  try {
    return { ok: true, data: fn() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : fallback }
  }
}

function audit(
  repos: Repositories,
  s: SessionData,
  schoolId: string,
  action: string,
  entityId: string,
  description: string
): void {
  try {
    repos.systemAdmin.writeAudit({
      school_id: schoolId,
      actor_user_id: s.userId,
      action,
      module_key: 'attendance',
      entity_type: 'gate_attendance',
      entity_id: entityId,
      description,
    })
  } catch {
    /* optional on older DBs */
  }
}

export function registerGateAttendanceIpc(repos: Repositories): void {
  ipcMain.handle(
    'gate-attendance:scan',
    (_e, input: { raw: string }): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['attendance.mark', 'attendance.update'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      if (!schoolId) return { ok: false, error: 'No school context.' }

      return wrap(() => {
        const result = processGateScan(repos, {
          schoolId,
          raw: input?.raw ?? '',
          userId: s.userId,
        })

        if (result.outcome === 'recorded' && result.attendance) {
          audit(
            repos,
            s,
            schoolId,
            'gate_attendance.recorded',
            result.attendance.id,
            `Gate check-in for ${result.student?.student_code || 'student'}`
          )
        } else if (result.outcome === 'duplicate' && result.attendance) {
          audit(
            repos,
            s,
            schoolId,
            'gate_attendance.duplicate',
            result.attendance.id,
            `Duplicate gate scan for ${result.student?.student_code || 'student'}`
          )
        } else if (result.outcome === 'not_found') {
          audit(
            repos,
            s,
            schoolId,
            'gate_attendance.not_found',
            schoolId,
            'Gate scan: unknown student ID'
          )
        } else if (result.outcome === 'invalid') {
          audit(
            repos,
            s,
            schoolId,
            'gate_attendance.invalid',
            schoolId,
            'Gate scan: invalid payload'
          )
        }

        return result
      }, 'Could not process scan.')
    }
  )

  ipcMain.handle('gate-attendance:today-summary', (): Result<unknown> => {
    const s = session()
    if (
      !s ||
      !allow(repos, s, [
        'attendance.read',
        'attendance.mark',
        'attendance.update',
        'reports.attendance.view',
      ])
    ) {
      return { ok: false, error: 'Access denied.' }
    }
    const schoolId = sid(repos, s)
    if (!schoolId) return { ok: false, error: 'No school context.' }
    return wrap(() => {
      const school = repos.schools.findById(schoolId)
      const summary = repos.gateAttendance.todaySummary(schoolId)
      return {
        ...summary,
        school_name: school?.name || 'SOFIA',
        clock: new Date().toISOString(),
        local_day: localSchoolDayIso(),
      }
    }, 'Could not load gate summary.')
  })
}
