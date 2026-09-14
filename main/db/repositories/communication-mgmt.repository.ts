import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import { renderTemplate } from '../../helpers/communication-templates'
import type {
  Announcement,
  AnnouncementAudience,
  CommunicationChannel,
  CommunicationDelivery,
  CommunicationSettings,
  DeliveryStatus,
  InternalNotice,
  MessageDirection,
  NoticeAudience,
  NoticePriority,
  ParentMessage,
  ParentMessageThread,
  Student,
} from '../types'
import { BaseRepository } from './base'

type StudentRecipient = Student & { class_name: string | null }

export interface AnnouncementDto {
  id: string
  title: string
  body: string
  audience_type: AnnouncementAudience
  class_id: string | null
  class_name: string | null
  academic_level_id: string | null
  level_name: string | null
  status: 'draft' | 'sent'
  channels: CommunicationChannel[]
  recipient_count: number
  sent_at: string | null
  created_at: string
}

export interface DeliveryDto {
  id: string
  channel: CommunicationChannel
  recipient_name: string | null
  recipient_contact: string | null
  student_id: string | null
  student_name: string | null
  class_name: string | null
  subject: string | null
  body: string
  status: DeliveryStatus
  sent_at: string | null
  error_message: string | null
  created_at: string
}

export interface ThreadDto {
  id: string
  student_id: string
  student_name: string
  class_name: string | null
  guardian_name: string | null
  guardian_phone: string | null
  guardian_email: string | null
  last_message_at: string
  last_message_preview: string | null
  unread_count: number
}

export interface ThreadMessageDto {
  id: string
  direction: MessageDirection
  channel: CommunicationChannel
  body: string
  status: DeliveryStatus
  sent_at: string | null
  created_at: string
}

export interface NoticeDto {
  id: string
  title: string
  body: string
  audience: NoticeAudience
  priority: NoticePriority
  expires_at: string | null
  sent_at: string | null
  recipient_count: number
  created_at: string
}

export class CommunicationMgmtRepository extends BaseRepository<Announcement> {
  constructor(db: Database.Database) {
    super(db, 'announcements')
  }

  private settings(schoolId: string): CommunicationSettings {
    const row = this.db
      .prepare(
        `SELECT * FROM communication_settings
         WHERE school_id = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(schoolId) as CommunicationSettings | undefined
    if (!row) {
      return {
        ...this.buildBaseFields(),
        school_id: schoolId,
        sms_provider: '',
        sms_api_key: '',
        sms_sender_name: '',
        channel_sms: 0,
        channel_email: 1,
        channel_internal: 1,
      }
    }
    return row
  }

  private insertRow(table: string, record: object): void {
    const row = record as Record<string, unknown>
    const keys = Object.keys(row)
    const cols = keys.join(', ')
    const params = keys.map((k) => `@${k}`).join(', ')
    this.db
      .prepare(`INSERT INTO ${table} (${cols}) VALUES (${params})`)
      .run(row)
    enqueueSync(this.db, table, String(row.id), 'INSERT', row)
  }

  private updateRow(table: string, record: object, id: string): void {
    const row = record as Record<string, unknown>
    const keys = Object.keys(row).filter((k) => k !== 'id')
    const sets = keys.map((k) => `${k} = @${k}`).join(', ')
    this.db.prepare(`UPDATE ${table} SET ${sets} WHERE id = @id`).run({
      ...row,
      id,
    })
    enqueueSync(this.db, table, id, 'UPDATE', row)
  }

  private resolveStudents(
    schoolId: string,
    audience: AnnouncementAudience,
    classId: string | null,
    levelId: string | null
  ): StudentRecipient[] {
    let sql = `
      SELECT s.*, c.name AS class_name
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id AND c.deleted_at IS NULL
      WHERE s.school_id = ? AND s.deleted_at IS NULL AND s.status = 'active'
    `
    const params: string[] = [schoolId]
    if (audience === 'class' && classId) {
      sql += ` AND s.class_id = ?`
      params.push(classId)
    } else if (audience === 'level' && levelId) {
      sql += ` AND c.academic_level_id = ?`
      params.push(levelId)
    }
    sql += ` ORDER BY s.name`
    return this.db.prepare(sql).all(...params) as StudentRecipient[]
  }

  private studentName(s: Student): string {
    return (s.name || '').trim()
  }

  private queueDelivery(input: {
    school_id: string
    announcement_id?: string | null
    student_id?: string | null
    thread_id?: string | null
    channel: CommunicationChannel
    recipient_name?: string | null
    recipient_contact?: string | null
    subject?: string | null
    body: string
    status: DeliveryStatus
    error_message?: string | null
    created_by?: string | null
  }): CommunicationDelivery {
    const now = new Date().toISOString()
    const record: CommunicationDelivery = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      announcement_id: input.announcement_id ?? null,
      student_id: input.student_id ?? null,
      thread_id: input.thread_id ?? null,
      channel: input.channel,
      recipient_name: input.recipient_name ?? null,
      recipient_contact: input.recipient_contact ?? null,
      subject: input.subject ?? null,
      body: input.body,
      status: input.status,
      sent_at: input.status === 'sent' ? now : null,
      error_message: input.error_message ?? null,
      created_by: input.created_by ?? null,
    }
    this.insertRow('communication_deliveries', record)
    return record
  }

  listAnnouncements(schoolId: string): AnnouncementDto[] {
    const rows = this.db
      .prepare(
        `SELECT a.*, c.name AS class_name, l.name AS level_name
         FROM announcements a
         LEFT JOIN classes c ON c.id = a.class_id
         LEFT JOIN academic_levels l ON l.id = a.academic_level_id
         WHERE a.school_id = ? AND a.deleted_at IS NULL
         ORDER BY a.created_at DESC`
      )
      .all(schoolId) as Array<
      Announcement & { class_name: string | null; level_name: string | null }
    >
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      audience_type: r.audience_type as AnnouncementAudience,
      class_id: r.class_id,
      class_name: r.class_name,
      academic_level_id: r.academic_level_id,
      level_name: r.level_name,
      status: r.status as 'draft' | 'sent',
      channels: JSON.parse(r.channels_json || '[]') as CommunicationChannel[],
      recipient_count: r.recipient_count,
      sent_at: r.sent_at,
      created_at: r.created_at,
    }))
  }

  createAnnouncement(input: {
    school_id: string
    title: string
    body: string
    audience_type: AnnouncementAudience
    class_id?: string | null
    academic_level_id?: string | null
    channels: CommunicationChannel[]
    created_by?: string | null
  }): AnnouncementDto {
    const record: Announcement = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      title: input.title.trim(),
      body: input.body.trim(),
      audience_type: input.audience_type,
      class_id: input.class_id ?? null,
      academic_level_id: input.academic_level_id ?? null,
      status: 'draft',
      channels_json: JSON.stringify(input.channels),
      recipient_count: 0,
      sent_at: null,
      created_by: input.created_by ?? null,
    }
    this.insertRow('announcements', record)
    return this.listAnnouncements(input.school_id).find(
      (a) => a.id === record.id
    )!
  }

  sendAnnouncement(
    schoolId: string,
    announcementId: string,
    userId: string | null
  ): { recipient_count: number } {
    const row = this.findById(announcementId)
    if (!row || row.school_id !== schoolId) {
      throw new Error('Announcement not found.')
    }
    if (row.status === 'sent') {
      throw new Error('Announcement was already sent.')
    }

    const channels = JSON.parse(
      row.channels_json || '[]'
    ) as CommunicationChannel[]
    if (!channels.length) {
      throw new Error('Select at least one channel.')
    }

    const settings = this.settings(schoolId)
    const students = this.resolveStudents(
      schoolId,
      row.audience_type as AnnouncementAudience,
      row.class_id,
      row.academic_level_id
    )

    const school = this.db
      .prepare(`SELECT name FROM schools WHERE id = ?`)
      .get(schoolId) as { name: string } | undefined
    const schoolName = school?.name ?? 'School'

    let deliveryCount = 0
    for (const student of students) {
      const vars = {
        parent_name: student.guardian_name || 'Parent',
        student_name: this.studentName(student),
        class_name: student.class_name || '',
        school_name: schoolName,
        message: row.body,
      }
      const body = renderTemplate(row.body, vars)
      const subject = renderTemplate(row.title, vars)

      if (channels.includes('sms')) {
        if (!settings.channel_sms) {
          this.queueDelivery({
            school_id: schoolId,
            announcement_id: row.id,
            student_id: student.id,
            channel: 'sms',
            recipient_name: student.guardian_name,
            recipient_contact: student.guardian_phone,
            subject,
            body,
            status: 'failed',
            error_message: 'SMS channel is disabled in setup.',
            created_by: userId,
          })
        } else if (!student.guardian_phone?.trim()) {
          this.queueDelivery({
            school_id: schoolId,
            announcement_id: row.id,
            student_id: student.id,
            channel: 'sms',
            recipient_name: student.guardian_name,
            recipient_contact: null,
            subject,
            body,
            status: 'failed',
            error_message: 'No guardian phone on file.',
            created_by: userId,
          })
        } else {
          this.queueDelivery({
            school_id: schoolId,
            announcement_id: row.id,
            student_id: student.id,
            channel: 'sms',
            recipient_name: student.guardian_name,
            recipient_contact: student.guardian_phone,
            subject,
            body,
            status: 'queued',
            created_by: userId,
          })
          deliveryCount += 1
        }
      }

      if (channels.includes('email')) {
        if (!settings.channel_email) {
          this.queueDelivery({
            school_id: schoolId,
            announcement_id: row.id,
            student_id: student.id,
            channel: 'email',
            recipient_name: student.guardian_name,
            recipient_contact: student.guardian_email,
            subject,
            body,
            status: 'failed',
            error_message: 'Email channel is disabled in setup.',
            created_by: userId,
          })
        } else if (!student.guardian_email?.trim()) {
          this.queueDelivery({
            school_id: schoolId,
            announcement_id: row.id,
            student_id: student.id,
            channel: 'email',
            recipient_name: student.guardian_name,
            recipient_contact: null,
            subject,
            body,
            status: 'failed',
            error_message: 'No guardian email on file.',
            created_by: userId,
          })
        } else {
          this.queueDelivery({
            school_id: schoolId,
            announcement_id: row.id,
            student_id: student.id,
            channel: 'email',
            recipient_name: student.guardian_name,
            recipient_contact: student.guardian_email,
            subject,
            body,
            status: 'queued',
            created_by: userId,
          })
          deliveryCount += 1
        }
      }

      if (channels.includes('internal')) {
        const thread = this.ensureThread(schoolId, student)
        const msg = this.addParentMessage({
          school_id: schoolId,
          thread_id: thread.id,
          direction: 'outbound',
          channel: 'internal',
          body: `${row.title}\n\n${body}`,
          status: 'sent',
          created_by: userId,
        })
        this.queueDelivery({
          school_id: schoolId,
          announcement_id: row.id,
          student_id: student.id,
          thread_id: thread.id,
          channel: 'internal',
          recipient_name: student.guardian_name,
          recipient_contact: null,
          subject: row.title,
          body: msg.body,
          status: 'sent',
          created_by: userId,
        })
        deliveryCount += 1
      }
    }

    const now = new Date().toISOString()
    const updated: Announcement = {
      ...row,
      status: 'sent',
      recipient_count: deliveryCount,
      sent_at: now,
      ...this.applyUpdateMeta(row),
    }
    this.updateRow('announcements', updated, row.id)

    return { recipient_count: deliveryCount }
  }

  deleteAnnouncement(schoolId: string, id: string): boolean {
    const row = this.findById(id)
    if (!row || row.school_id !== schoolId) return false
    if (row.status === 'sent') {
      throw new Error('Sent announcements cannot be deleted.')
    }
    return Boolean(this.delete(id))
  }

  listDeliveries(
    schoolId: string,
    channel?: CommunicationChannel | 'all'
  ): DeliveryDto[] {
    let sql = `
      SELECT d.*,
             s.first_name || ' ' || s.last_name AS student_name,
             c.name AS class_name
      FROM communication_deliveries d
      LEFT JOIN students s ON s.id = d.student_id
      LEFT JOIN classes c ON c.id = s.class_id
      WHERE d.school_id = ? AND d.deleted_at IS NULL
    `
    const params: string[] = [schoolId]
    if (channel && channel !== 'all') {
      if (channel === 'sms') {
        sql += ` AND d.channel IN ('sms', 'email')`
      } else {
        sql += ` AND d.channel = ?`
        params.push(channel)
      }
    } else {
      sql += ` AND d.channel IN ('sms', 'email')`
    }
    sql += ` ORDER BY d.created_at DESC LIMIT 500`
    const rows = this.db.prepare(sql).all(...params) as Array<
      CommunicationDelivery & {
        student_name: string | null
        class_name: string | null
      }
    >
    return rows.map((r) => ({
      id: r.id,
      channel: r.channel as CommunicationChannel,
      recipient_name: r.recipient_name,
      recipient_contact: r.recipient_contact,
      student_id: r.student_id,
      student_name: r.student_name?.trim() || null,
      class_name: r.class_name,
      subject: r.subject,
      body: r.body,
      status: r.status as DeliveryStatus,
      sent_at: r.sent_at,
      error_message: r.error_message,
      created_at: r.created_at,
    }))
  }

  sendSms(input: {
    school_id: string
    student_id?: string | null
    recipient_phone: string
    recipient_name?: string | null
    body: string
    created_by?: string | null
  }): DeliveryDto {
    const settings = this.settings(input.school_id)
    if (!settings.channel_sms) {
      throw new Error('SMS channel is disabled. Enable it under Setup → Communication.')
    }
    const phone = input.recipient_phone.trim()
    if (!phone) throw new Error('Recipient phone is required.')

    let student: Student | undefined
    if (input.student_id) {
      student = this.db
        .prepare(
          `SELECT * FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
        )
        .get(input.student_id, input.school_id) as Student | undefined
    }

    const delivery = this.queueDelivery({
      school_id: input.school_id,
      student_id: student?.id ?? null,
      channel: 'sms',
      recipient_name:
        input.recipient_name?.trim() || student?.guardian_name || null,
      recipient_contact: phone,
      body: input.body.trim(),
      status: 'queued',
      created_by: input.created_by ?? null,
    })

    if (student) {
      const thread = this.ensureThread(input.school_id, student)
      this.addParentMessage({
        school_id: input.school_id,
        thread_id: thread.id,
        direction: 'outbound',
        channel: 'sms',
        body: input.body.trim(),
        status: 'queued',
        created_by: input.created_by ?? null,
      })
    }

    return this.listDeliveries(input.school_id, 'sms').find(
      (d) => d.id === delivery.id
    )!
  }

  ensureThread(schoolId: string, student: Student): ParentMessageThread {
    const existing = this.db
      .prepare(
        `SELECT * FROM parent_message_threads
         WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(schoolId, student.id) as ParentMessageThread | undefined
    if (existing) return existing

    const now = new Date().toISOString()
    const record: ParentMessageThread = {
      ...this.buildBaseFields(),
      school_id: schoolId,
      student_id: student.id,
      guardian_name: student.guardian_name,
      guardian_phone: student.guardian_phone,
      guardian_email: student.guardian_email,
      last_message_at: now,
    }
    this.insertRow('parent_message_threads', record)
    return record
  }

  listThreads(schoolId: string, search?: string): ThreadDto[] {
    let sql = `
      SELECT t.*,
             s.first_name || ' ' || s.last_name AS student_name,
             c.name AS class_name,
             (
               SELECT body FROM parent_messages pm
               WHERE pm.thread_id = t.id AND pm.deleted_at IS NULL
               ORDER BY pm.created_at DESC LIMIT 1
             ) AS last_message_preview
      FROM parent_message_threads t
      JOIN students s ON s.id = t.student_id
      LEFT JOIN classes c ON c.id = s.class_id
      WHERE t.school_id = ? AND t.deleted_at IS NULL
    `
    const params: string[] = [schoolId]
    if (search?.trim()) {
      sql += ` AND (
        s.first_name LIKE ? OR s.last_name LIKE ? OR
        t.guardian_name LIKE ? OR t.guardian_phone LIKE ?
      )`
      const q = `%${search.trim()}%`
      params.push(q, q, q, q)
    }
    sql += ` ORDER BY t.last_message_at DESC LIMIT 200`
    const rows = this.db.prepare(sql).all(...params) as Array<
      ParentMessageThread & {
        student_name: string
        class_name: string | null
        last_message_preview: string | null
      }
    >
    return rows.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      student_name: r.student_name.trim(),
      class_name: r.class_name,
      guardian_name: r.guardian_name,
      guardian_phone: r.guardian_phone,
      guardian_email: r.guardian_email,
      last_message_at: r.last_message_at,
      last_message_preview: r.last_message_preview,
      unread_count: 0,
    }))
  }

  getThreadMessages(
    schoolId: string,
    threadId: string
  ): { thread: ThreadDto; messages: ThreadMessageDto[] } | null {
    const threadRow = this.db
      .prepare(
        `SELECT t.*,
                s.first_name || ' ' || s.last_name AS student_name,
                c.name AS class_name
         FROM parent_message_threads t
         JOIN students s ON s.id = t.student_id
         LEFT JOIN classes c ON c.id = s.class_id
         WHERE t.id = ? AND t.school_id = ? AND t.deleted_at IS NULL`
      )
      .get(threadId, schoolId) as
      | (ParentMessageThread & {
          student_name: string
          class_name: string | null
        })
      | undefined
    if (!threadRow) return null

    const messages = this.db
      .prepare(
        `SELECT * FROM parent_messages
         WHERE thread_id = ? AND deleted_at IS NULL
         ORDER BY created_at ASC`
      )
      .all(threadId) as ParentMessage[]

    return {
      thread: {
        id: threadRow.id,
        student_id: threadRow.student_id,
        student_name: threadRow.student_name.trim(),
        class_name: threadRow.class_name,
        guardian_name: threadRow.guardian_name,
        guardian_phone: threadRow.guardian_phone,
        guardian_email: threadRow.guardian_email,
        last_message_at: threadRow.last_message_at,
        last_message_preview: messages.at(-1)?.body ?? null,
        unread_count: 0,
      },
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction as MessageDirection,
        channel: m.channel as CommunicationChannel,
        body: m.body,
        status: m.status as DeliveryStatus,
        sent_at: m.sent_at,
        created_at: m.created_at,
      })),
    }
  }

  addParentMessage(input: {
    school_id: string
    thread_id: string
    direction: MessageDirection
    channel: CommunicationChannel
    body: string
    status: DeliveryStatus
    created_by?: string | null
  }): ParentMessage {
    const now = new Date().toISOString()
    const record: ParentMessage = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      thread_id: input.thread_id,
      direction: input.direction,
      channel: input.channel,
      body: input.body.trim(),
      status: input.status,
      sent_at: input.status === 'sent' ? now : null,
      created_by: input.created_by ?? null,
    }
    this.insertRow('parent_messages', record)

    const thread = this.db
      .prepare(`SELECT * FROM parent_message_threads WHERE id = ?`)
      .get(input.thread_id) as ParentMessageThread
    const updated: ParentMessageThread = {
      ...thread,
      last_message_at: now,
      ...this.applyUpdateMeta(thread),
    }
    this.updateRow('parent_message_threads', updated, thread.id)

    return record
  }

  sendParentMessage(input: {
    school_id: string
    student_id: string
    channel: CommunicationChannel
    body: string
    created_by?: string | null
  }): ThreadMessageDto {
    const student = this.db
      .prepare(
        `SELECT * FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .get(input.student_id, input.school_id) as Student | undefined
    if (!student) throw new Error('Student not found.')

    const settings = this.settings(input.school_id)
    const thread = this.ensureThread(input.school_id, student)
    const body = input.body.trim()
    if (!body) throw new Error('Message body is required.')

    let status: DeliveryStatus = 'sent'
    if (input.channel === 'sms') {
      if (!settings.channel_sms) {
        throw new Error('SMS channel is disabled.')
      }
      if (!student.guardian_phone?.trim()) {
        throw new Error('No guardian phone on file for this student.')
      }
      status = 'queued'
      this.queueDelivery({
        school_id: input.school_id,
        student_id: student.id,
        thread_id: thread.id,
        channel: 'sms',
        recipient_name: student.guardian_name,
        recipient_contact: student.guardian_phone,
        body,
        status: 'queued',
        created_by: input.created_by ?? null,
      })
    } else if (input.channel === 'email') {
      if (!settings.channel_email) {
        throw new Error('Email channel is disabled.')
      }
      if (!student.guardian_email?.trim()) {
        throw new Error('No guardian email on file for this student.')
      }
      status = 'queued'
      this.queueDelivery({
        school_id: input.school_id,
        student_id: student.id,
        thread_id: thread.id,
        channel: 'email',
        recipient_name: student.guardian_name,
        recipient_contact: student.guardian_email,
        body,
        status: 'queued',
        created_by: input.created_by ?? null,
      })
    }

    const msg = this.addParentMessage({
      school_id: input.school_id,
      thread_id: thread.id,
      direction: 'outbound',
      channel: input.channel,
      body,
      status,
      created_by: input.created_by ?? null,
    })

    return {
      id: msg.id,
      direction: msg.direction as MessageDirection,
      channel: msg.channel as CommunicationChannel,
      body: msg.body,
      status: msg.status as DeliveryStatus,
      sent_at: msg.sent_at,
      created_at: msg.created_at,
    }
  }

  listNotices(schoolId: string): NoticeDto[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM internal_notices
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY sent_at DESC, created_at DESC`
      )
      .all(schoolId) as InternalNotice[]
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      audience: r.audience as NoticeAudience,
      priority: r.priority as NoticePriority,
      expires_at: r.expires_at,
      sent_at: r.sent_at,
      recipient_count: r.recipient_count,
      created_at: r.created_at,
    }))
  }

  createNotice(input: {
    school_id: string
    title: string
    body: string
    audience: NoticeAudience
    priority?: NoticePriority
    expires_at?: string | null
    created_by?: string | null
    staffNotify: (
      userId: string,
      title: string,
      body: string,
      link: string
    ) => void
  }): NoticeDto {
    const settings = this.settings(input.school_id)
    if (!settings.channel_internal) {
      throw new Error(
        'Internal channel is disabled. Enable it under Setup → Communication.'
      )
    }

    const users = this.db
      .prepare(
        `SELECT id, role FROM users
         WHERE school_id = ? AND deleted_at IS NULL`
      )
      .all(input.school_id) as Array<{ id: string; role: string }>

    const audience = input.audience
    const recipients = users.filter((u) => {
      if (audience === 'all') {
        return ['admin', 'secretary', 'teacher'].includes(u.role)
      }
      if (audience === 'teachers') return u.role === 'teacher'
      if (audience === 'admin') {
        return u.role === 'admin' || u.role === 'secretary'
      }
      return false
    })

    const now = new Date().toISOString()
    const record: InternalNotice = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      title: input.title.trim(),
      body: input.body.trim(),
      audience: input.audience,
      priority: input.priority ?? 'normal',
      expires_at: input.expires_at ?? null,
      sent_at: now,
      recipient_count: recipients.length,
      created_by: input.created_by ?? null,
    }
    this.insertRow('internal_notices', record)

    const link = '/communication/notices'
    for (const user of recipients) {
      input.staffNotify(
        user.id,
        input.title.trim(),
        input.body.trim().slice(0, 200),
        link
      )
    }

    return this.listNotices(input.school_id).find((n) => n.id === record.id)!
  }

  queueFeeReminderDeliveries(input: {
    school_id: string
    student_id: string
    message: string
    created_by?: string | null
  }): number {
    const settings = this.settings(input.school_id)
    const student = this.db
      .prepare(
        `SELECT * FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .get(input.student_id, input.school_id) as Student | undefined
    if (!student) return 0

    const school = this.db
      .prepare(`SELECT name FROM schools WHERE id = ?`)
      .get(input.school_id) as { name: string } | undefined

    const body = input.message
    let queued = 0

    if (settings.channel_sms && student.guardian_phone?.trim()) {
      this.queueDelivery({
        school_id: input.school_id,
        student_id: student.id,
        channel: 'sms',
        recipient_name: student.guardian_name,
        recipient_contact: student.guardian_phone,
        subject: 'Fee reminder',
        body,
        status: 'queued',
        created_by: input.created_by ?? null,
      })
      queued += 1
    }

    if (settings.channel_email && student.guardian_email?.trim()) {
      this.queueDelivery({
        school_id: input.school_id,
        student_id: student.id,
        channel: 'email',
        recipient_name: student.guardian_name,
        recipient_contact: student.guardian_email,
        subject: 'Fee reminder',
        body,
        status: 'queued',
        created_by: input.created_by ?? null,
      })
      queued += 1
    }

    if (settings.channel_internal) {
      const thread = this.ensureThread(input.school_id, student)
      this.addParentMessage({
        school_id: input.school_id,
        thread_id: thread.id,
        direction: 'outbound',
        channel: 'internal',
        body,
        status: 'sent',
        created_by: input.created_by ?? null,
      })
      queued += 1
    }

    void school
    return queued
  }
}
