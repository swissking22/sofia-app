/** Communication module IPC helpers + label maps. */

import type { NotificationTemplateDto } from './communication'

export type AnnouncementAudience = 'all' | 'class' | 'level'
export type CommunicationChannel = 'sms' | 'email' | 'internal'
export type DeliveryStatus = 'queued' | 'sent' | 'failed'
export type NoticeAudience = 'all' | 'teachers' | 'admin'
export type NoticePriority = 'normal' | 'high'

export interface CommunicationMeta {
  can_manage: boolean
  school_id: string
  channels: {
    sms: boolean
    email: boolean
    internal: boolean
  }
  sms_sender_name: string
  classes: Array<{ id: string; name: string }>
  levels: Array<{ id: string; name: string }>
  students: Array<{
    id: string
    name: string
    class_id: string
    guardian_name: string | null
    guardian_phone: string | null
    guardian_email: string | null
  }>
  templates: NotificationTemplateDto[]
}

export interface AnnouncementRow {
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

export interface DeliveryRow {
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

export interface ThreadRow {
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

export interface ThreadMessage {
  id: string
  direction: 'outbound' | 'inbound'
  channel: CommunicationChannel
  body: string
  status: DeliveryStatus
  sent_at: string | null
  created_at: string
}

export interface NoticeRow {
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

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: 'All parents',
  class: 'By class',
  level: 'By level',
}

export const CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  sms: 'SMS',
  email: 'Email',
  internal: 'In-app (parent inbox)',
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  queued: 'Queued',
  sent: 'Sent',
  failed: 'Failed',
}

export const NOTICE_AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  all: 'All staff',
  teachers: 'Teachers only',
  admin: 'Admin & secretary',
}

export const NOTICE_PRIORITY_LABELS: Record<NoticePriority, string> = {
  normal: 'Normal',
  high: 'High',
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
}

export async function fetchCommunicationMeta(): Promise<Result<CommunicationMeta>> {
  return (await window.ipc.invoke(
    'communication-mgmt:meta'
  )) as Result<CommunicationMeta>
}

export async function fetchAnnouncements(): Promise<
  Result<{ announcements: AnnouncementRow[] }>
> {
  return (await window.ipc.invoke(
    'communication-mgmt:announcements-list'
  )) as Result<{ announcements: AnnouncementRow[] }>
}

export async function createAnnouncement(input: {
  title: string
  body: string
  audience_type: AnnouncementAudience
  class_id?: string | null
  academic_level_id?: string | null
  channels: CommunicationChannel[]
}): Promise<Result<AnnouncementRow>> {
  return (await window.ipc.invoke(
    'communication-mgmt:announcements-create',
    input
  )) as Result<AnnouncementRow>
}

export async function sendAnnouncement(
  id: string
): Promise<Result<{ recipient_count: number }>> {
  return (await window.ipc.invoke('communication-mgmt:announcements-send', {
    id,
  })) as Result<{ recipient_count: number }>
}

export async function deleteAnnouncement(
  id: string
): Promise<Result<{ deleted: boolean }>> {
  return (await window.ipc.invoke('communication-mgmt:announcements-delete', {
    id,
  })) as Result<{ deleted: boolean }>
}

export async function fetchSmsDeliveries(): Promise<
  Result<{ deliveries: DeliveryRow[] }>
> {
  return (await window.ipc.invoke('communication-mgmt:sms-list', {
    channel: 'sms',
  })) as Result<{ deliveries: DeliveryRow[] }>
}

export async function sendSms(input: {
  student_id?: string | null
  recipient_phone: string
  recipient_name?: string | null
  body: string
}): Promise<Result<DeliveryRow>> {
  return (await window.ipc.invoke(
    'communication-mgmt:sms-send',
    input
  )) as Result<DeliveryRow>
}

export async function fetchThreads(
  search?: string
): Promise<Result<{ threads: ThreadRow[] }>> {
  return (await window.ipc.invoke('communication-mgmt:threads-list', {
    search,
  })) as Result<{ threads: ThreadRow[] }>
}

export async function fetchThread(
  threadId: string
): Promise<Result<{ thread: ThreadRow; messages: ThreadMessage[] }>> {
  return (await window.ipc.invoke('communication-mgmt:thread-get', {
    thread_id: threadId,
  })) as Result<{ thread: ThreadRow; messages: ThreadMessage[] }>
}

export async function sendParentMessage(input: {
  student_id: string
  channel: CommunicationChannel
  body: string
}): Promise<Result<ThreadMessage>> {
  return (await window.ipc.invoke(
    'communication-mgmt:message-send',
    input
  )) as Result<ThreadMessage>
}

export async function fetchNotices(): Promise<
  Result<{ notices: NoticeRow[] }>
> {
  return (await window.ipc.invoke(
    'communication-mgmt:notices-list'
  )) as Result<{ notices: NoticeRow[] }>
}

export async function createNotice(input: {
  title: string
  body: string
  audience: NoticeAudience
  priority?: NoticePriority
  expires_at?: string | null
}): Promise<Result<NoticeRow>> {
  return (await window.ipc.invoke(
    'communication-mgmt:notices-create',
    input
  )) as Result<NoticeRow>
}
