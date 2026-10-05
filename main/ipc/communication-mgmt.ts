import { ipcMain } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import type {
  AnnouncementAudience,
  CommunicationChannel,
  NoticeAudience,
  NoticePriority,
} from '../db/types'
import { notifyTeachers } from '../services/teacher-notifications'

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

export function registerCommunicationMgmtIpc(repos: Repositories): void {
  const cm = () => repos.communicationMgmt

  ipcMain.handle('communication-mgmt:meta', (): Result<unknown> => {
    const session = requireSession()
    if (!session || !canView(session.role)) {
      return { ok: false, error: 'Access denied.' }
    }
    const sid = schoolId(repos, session)
    const school = repos.schools.findById(sid)
    const setup = repos.communication.getSetupDto(sid, school?.name ?? '')
    const classes = repos.classes
      .findBySchool(sid)
      .map((c) => ({ id: c.id, name: c.name }))
    const levels = repos.academicLevels
      .findBySchool(sid)
      .map((l) => ({ id: l.id, name: l.name }))
    const students = repos.students
      .findBySchool(sid, 'active')
      .slice(0, 500)
      .map((s) => ({
        id: s.id,
        name: [s.first_name, s.last_name].filter(Boolean).join(' ').trim(),
        class_id: s.class_id,
        guardian_name: s.guardian_name,
        guardian_phone: s.guardian_phone,
        guardian_email: s.guardian_email,
      }))

    return {
      ok: true,
      data: {
        can_manage: canManage(session.role),
        school_id: sid,
        channels: {
          sms: setup.channel_sms,
          email: setup.channel_email,
          internal: setup.channel_internal,
        },
        sms_sender_name: setup.sms_sender_name,
        classes,
        levels,
        students,
        templates: setup.templates,
      },
    }
  })

  ipcMain.handle('communication-mgmt:announcements-list', (): Result<unknown> => {
    const session = requireSession()
    if (!session || !canView(session.role)) {
      return { ok: false, error: 'Access denied.' }
    }
    return {
      ok: true,
      data: { announcements: cm().listAnnouncements(schoolId(repos, session)) },
    }
  })

  ipcMain.handle(
    'communication-mgmt:announcements-create',
    (
      _e,
      input: {
        title: string
        body: string
        audience_type: AnnouncementAudience
        class_id?: string | null
        academic_level_id?: string | null
        channels: CommunicationChannel[]
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const sid = schoolId(repos, session)
        if (!input.title?.trim()) {
          return { ok: false, error: 'Title is required.' }
        }
        if (!input.body?.trim()) {
          return { ok: false, error: 'Message body is required.' }
        }
        if (!input.channels?.length) {
          return { ok: false, error: 'Select at least one channel.' }
        }
        if (input.audience_type === 'class' && !input.class_id) {
          return { ok: false, error: 'Select a class for this audience.' }
        }
        if (input.audience_type === 'level' && !input.academic_level_id) {
          return { ok: false, error: 'Select a level for this audience.' }
        }
        const row = cm().createAnnouncement({
          school_id: sid,
          title: input.title,
          body: input.body,
          audience_type: input.audience_type,
          class_id: input.class_id ?? null,
          academic_level_id: input.academic_level_id ?? null,
          channels: input.channels,
          created_by: session.userId,
        })
        return { ok: true, data: row }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not create announcement.',
        }
      }
    }
  )

  ipcMain.handle(
    'communication-mgmt:announcements-send',
    (_e, input: { id: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const result = cm().sendAnnouncement(
          schoolId(repos, session),
          input.id,
          session.userId
        )
        notifyTeachers({
          schoolId: schoolId(repos, session),
          event: 'announcement.published',
          title: String((result as { title?: string })?.title || 'New announcement'),
          entityType: 'announcement',
          entityId: input.id,
        })
        return { ok: true, data: result }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not send announcement.',
        }
      }
    }
  )

  ipcMain.handle(
    'communication-mgmt:announcements-delete',
    (_e, input: { id: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const ok = cm().deleteAnnouncement(schoolId(repos, session), input.id)
        if (!ok) return { ok: false, error: 'Announcement not found.' }
        return { ok: true, data: { deleted: true } }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not delete announcement.',
        }
      }
    }
  )

  ipcMain.handle(
    'communication-mgmt:sms-list',
    (_e, input?: { channel?: CommunicationChannel | 'all' }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      return {
        ok: true,
        data: {
          deliveries: cm().listDeliveries(
            schoolId(repos, session),
            input?.channel ?? 'sms'
          ),
        },
      }
    }
  )

  ipcMain.handle(
    'communication-mgmt:sms-send',
    (
      _e,
      input: {
        student_id?: string | null
        recipient_phone: string
        recipient_name?: string | null
        body: string
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const delivery = cm().sendSms({
          school_id: schoolId(repos, session),
          student_id: input.student_id ?? null,
          recipient_phone: input.recipient_phone,
          recipient_name: input.recipient_name ?? null,
          body: input.body,
          created_by: session.userId,
        })
        return { ok: true, data: delivery }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not send SMS.',
        }
      }
    }
  )

  ipcMain.handle(
    'communication-mgmt:threads-list',
    (_e, input?: { search?: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      return {
        ok: true,
        data: {
          threads: cm().listThreads(schoolId(repos, session), input?.search),
        },
      }
    }
  )

  ipcMain.handle(
    'communication-mgmt:thread-get',
    (_e, input: { thread_id: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const data = cm().getThreadMessages(
        schoolId(repos, session),
        input.thread_id
      )
      if (!data) return { ok: false, error: 'Thread not found.' }
      return { ok: true, data }
    }
  )

  ipcMain.handle(
    'communication-mgmt:message-send',
    (
      _e,
      input: {
        student_id: string
        channel: CommunicationChannel
        body: string
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const message = cm().sendParentMessage({
          school_id: schoolId(repos, session),
          student_id: input.student_id,
          channel: input.channel,
          body: input.body,
          created_by: session.userId,
        })
        return { ok: true, data: message }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not send message.',
        }
      }
    }
  )

  ipcMain.handle('communication-mgmt:notices-list', (): Result<unknown> => {
    const session = requireSession()
    if (!session || !canView(session.role)) {
      return { ok: false, error: 'Access denied.' }
    }
    return {
      ok: true,
      data: { notices: cm().listNotices(schoolId(repos, session)) },
    }
  })

  ipcMain.handle(
    'communication-mgmt:notices-create',
    (
      _e,
      input: {
        title: string
        body: string
        audience: NoticeAudience
        priority?: NoticePriority
        expires_at?: string | null
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const sid = schoolId(repos, session)
        if (!input.title?.trim()) {
          return { ok: false, error: 'Title is required.' }
        }
        if (!input.body?.trim()) {
          return { ok: false, error: 'Notice body is required.' }
        }
        const notice = cm().createNotice({
          school_id: sid,
          title: input.title,
          body: input.body,
          audience: input.audience,
          priority: input.priority ?? 'normal',
          expires_at: input.expires_at ?? null,
          created_by: session.userId,
          staffNotify: (userId, title, body, link) => {
            repos.staffNotifications.create({
              school_id: sid,
              user_id: userId,
              title,
              body,
              link,
            })
          },
        })
        return { ok: true, data: notice }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not publish notice.',
        }
      }
    }
  )
}
