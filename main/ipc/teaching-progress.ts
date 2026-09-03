import { ipcMain } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import type { TeachingLogStatus } from '../db/types'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function requireSession(): SessionData | null {
  return getSession()
}

function canManage(role: string): boolean {
  return role === 'admin' || role === 'secretary'
}

function canView(role: string): boolean {
  return canManage(role) || role === 'teacher'
}

function schoolId(repos: Repositories, session: SessionData): string {
  return session.schoolId || repos.schools.findLatest()?.id || ''
}

export function registerTeachingProgressIpc(repos: Repositories): void {
  ipcMain.handle('academic:teaching-meta', (): Result<unknown> => {
    const session = requireSession()
    if (!session || !canView(session.role)) {
      return { ok: false, error: 'Access denied.' }
    }
    const sid = schoolId(repos, session)
    const selfStaff = repos.staff.findByUserId(session.userId)
    return {
      ok: true,
      data: {
        can_manage: canManage(session.role),
        self_staff_id: selfStaff?.id ?? null,
        classes: repos.classes.findBySchool(sid).map((c) => ({
          id: c.id,
          name: c.name,
        })),
        subjects: repos.subjects.findBySchool(sid).map((s) => ({
          id: s.id,
          name: s.name,
        })),
        teachers: repos.staff.findBySchool(sid).map((t) => ({
          id: t.id,
          name: t.full_name,
        })),
        years: repos.academicYears
          .findAll()
          .filter((y) => y.school_id === sid)
          .map((y) => ({
            id: y.id,
            name: y.name,
            is_current: y.is_current,
          })),
        levels: repos.academicLevels.findBySchool(sid).map((l) => ({
          id: l.id,
          name: l.name,
        })),
      },
    }
  })

  ipcMain.handle(
    'academic:syllabi-list',
    (_e, input?: { academic_year_id?: string | null }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      return {
        ok: true,
        data: {
          syllabi: repos.teachingProgress.listSyllabi(
            schoolId(repos, session),
            input?.academic_year_id
          ),
        },
      }
    }
  )

  ipcMain.handle(
    'academic:syllabi-create',
    (
      _e,
      input: {
        subject_id: string
        academic_year_id: string
        academic_level_id?: string | null
        class_id?: string | null
        title: string
        term_weeks?: number
        topics: Array<{ title: string; objectives?: string; subtopics?: string[] }>
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        return {
          ok: true,
          data: repos.teachingProgress.createSyllabus({
            ...input,
            school_id: schoolId(repos, session),
            created_by: session.userId,
          }),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not save syllabus.',
        }
      }
    }
  )

  ipcMain.handle(
    'academic:syllabi-topics',
    (_e, input: { syllabus_id: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        return {
          ok: true,
          data: repos.teachingProgress.dashboard(
            schoolId(repos, session),
            input.syllabus_id
          ),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Not found.',
        }
      }
    }
  )

  ipcMain.handle(
    'academic:teaching-logs',
    (
      _e,
      input?: {
        staff_id?: string | null
        class_id?: string | null
        subject_id?: string | null
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      return {
        ok: true,
        data: {
          logs: repos.teachingProgress.listLogs(schoolId(repos, session), input),
        },
      }
    }
  )

  ipcMain.handle(
    'academic:teaching-log-create',
    (
      _e,
      input: {
        staff_id?: string | null
        class_id: string
        subject_id: string
        topic_id?: string | null
        syllabus_id?: string | null
        academic_year_id?: string | null
        lesson_date: string
        description?: string | null
        status: TeachingLogStatus
        remarks?: string | null
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session) return { ok: false, error: 'Not signed in.' }
      if (!canView(session.role)) return { ok: false, error: 'Access denied.' }
      const self = repos.staff.findByUserId(session.userId)
      const staffId = canManage(session.role)
        ? input.staff_id || self?.id
        : self?.id
      if (!staffId) return { ok: false, error: 'No teacher profile is linked to this user.' }
      try {
        return {
          ok: true,
          data: repos.teachingProgress.recordLog({
            school_id: schoolId(repos, session),
            staff_id: staffId,
            class_id: input.class_id,
            subject_id: input.subject_id,
            topic_id: input.topic_id,
            syllabus_id: input.syllabus_id,
            academic_year_id: input.academic_year_id,
            lesson_date: input.lesson_date,
            description: input.description,
            status: input.status,
            remarks: input.remarks,
            created_by: session.userId,
          }),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not record lesson.',
        }
      }
    }
  )
}
