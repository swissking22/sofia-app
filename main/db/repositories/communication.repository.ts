import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type {
  CommunicationSettings,
  NotificationTemplate,
  NotificationTemplateKey,
} from '../types'
import { BaseRepository } from './base'

export const SMS_PROVIDER_OPTIONS = [
  { key: 'africas_talking', label: "Africa's Talking" },
  { key: 'twilio', label: 'Twilio' },
  { key: 'nexmo', label: 'Vonage (Nexmo)' },
  { key: 'custom', label: 'Custom / Other' },
] as const

export type SmsProviderKey = (typeof SMS_PROVIDER_OPTIONS)[number]['key']

export const NOTIFICATION_TEMPLATE_DEFS: Array<{
  key: NotificationTemplateKey
  title: string
  subject: string
  body: string
}> = [
  {
    key: 'fee_reminder',
    title: 'Fee Reminder',
    subject: 'Fee payment reminder — {{student_name}}',
    body: 'Dear {{parent_name}}, this is a reminder that school fees for {{student_name}} ({{student_id}}) are due. Amount outstanding: {{amount}}. Please settle at your earliest convenience. — {{school_name}}',
  },
  {
    key: 'admission_confirmation',
    title: 'Admission Confirmation',
    subject: 'Admission confirmed — {{student_name}}',
    body: 'Dear {{parent_name}}, congratulations! {{student_name}} has been admitted to {{school_name}} for {{academic_year}}. Please complete registration by {{deadline}}.',
  },
  {
    key: 'results_notification',
    title: 'Results Notification',
    subject: 'Results available — {{student_name}}',
    body: 'Dear {{parent_name}}, term results for {{student_name}} ({{class_name}}) are now available. Please log in or visit the school office to collect the report card. — {{school_name}}',
  },
  {
    key: 'announcement',
    title: 'Announcement',
    subject: 'School announcement — {{school_name}}',
    body: 'Dear parents and guardians, {{announcement_body}} — {{school_name}}',
  },
]

export interface NotificationTemplateDto {
  id: string
  template_key: NotificationTemplateKey
  title: string
  subject: string
  body: string
  is_enabled: boolean
}

export interface CommunicationSetupDto {
  schoolId: string
  schoolName: string
  sms_provider: string
  sms_api_key: string
  sms_sender_name: string
  channel_sms: boolean
  channel_email: boolean
  channel_internal: boolean
  templates: NotificationTemplateDto[]
}

export interface CommunicationSaveInput {
  sms_provider: string
  sms_api_key: string
  sms_sender_name: string
  channel_sms: boolean
  channel_email: boolean
  channel_internal: boolean
  templates: Array<{
    template_key: NotificationTemplateKey
    subject: string
    body: string
    is_enabled: boolean
  }>
}

function toTemplateDto(row: NotificationTemplate): NotificationTemplateDto {
  return {
    id: row.id,
    template_key: row.template_key,
    title: row.title,
    subject: row.subject,
    body: row.body,
    is_enabled: row.is_enabled === 1,
  }
}

export class CommunicationRepository extends BaseRepository<CommunicationSettings> {
  constructor(db: Database.Database) {
    super(db, 'communication_settings')
  }

  ensureDefaults(schoolId: string): void {
    const tx = this.db.transaction(() => {
      this.ensureSettings(schoolId)
      this.ensureTemplates(schoolId)
    })
    tx()
  }

  private ensureSettings(schoolId: string): CommunicationSettings {
    const existing = this.db
      .prepare(
        `SELECT * FROM communication_settings
         WHERE school_id = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId) as CommunicationSettings | undefined

    if (existing) return existing

    const record: CommunicationSettings = {
      ...this.buildBaseFields(),
      school_id: schoolId,
      sms_provider: '',
      sms_api_key: '',
      sms_sender_name: '',
      channel_sms: 0,
      channel_email: 1,
      channel_internal: 1,
    }

    this.db
      .prepare(
        `INSERT INTO communication_settings (
          id, school_id, sms_provider, sms_api_key, sms_sender_name,
          channel_sms, channel_email, channel_internal,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @sms_provider, @sms_api_key, @sms_sender_name,
          @channel_sms, @channel_email, @channel_internal,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )`
      )
      .run(record)

    enqueueSync(
      this.db,
      this.tableName,
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  private ensureTemplates(schoolId: string): void {
    for (const def of NOTIFICATION_TEMPLATE_DEFS) {
      const existing = this.findTemplateByKey(schoolId, def.key)
      if (existing) continue

      const record: NotificationTemplate = {
        ...this.buildBaseFields(),
        school_id: schoolId,
        template_key: def.key,
        title: def.title,
        subject: def.subject,
        body: def.body,
        is_enabled: 1,
      }

      this.db
        .prepare(
          `INSERT INTO notification_templates (
            id, school_id, template_key, title, subject, body, is_enabled,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @school_id, @template_key, @title, @subject, @body, @is_enabled,
            @created_at, @updated_at, @deleted_at, @sync_status, @version
          )`
        )
        .run(record)

      enqueueSync(
        this.db,
        'notification_templates',
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
    }
  }

  findTemplateByKey(
    schoolId: string,
    key: NotificationTemplateKey
  ): NotificationTemplate | undefined {
    return this.db
      .prepare(
        `SELECT * FROM notification_templates
         WHERE school_id = ? AND template_key = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId, key) as NotificationTemplate | undefined
  }

  listTemplates(schoolId: string): NotificationTemplate[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM notification_templates
         WHERE school_id = ? AND deleted_at IS NULL`
      )
      .all(schoolId) as NotificationTemplate[]

    const byKey = new Map(rows.map((r) => [r.template_key, r]))
    return NOTIFICATION_TEMPLATE_DEFS.map((def) => byKey.get(def.key)!).filter(
      Boolean
    )
  }

  getSetupDto(schoolId: string, schoolName: string): CommunicationSetupDto {
    this.ensureDefaults(schoolId)
    const settings = this.ensureSettings(schoolId)
    const templates = this.listTemplates(schoolId).map(toTemplateDto)

    return {
      schoolId,
      schoolName,
      sms_provider: settings.sms_provider,
      sms_api_key: settings.sms_api_key,
      sms_sender_name: settings.sms_sender_name,
      channel_sms: settings.channel_sms === 1,
      channel_email: settings.channel_email === 1,
      channel_internal: settings.channel_internal === 1,
      templates,
    }
  }

  saveSetup(
    schoolId: string,
    schoolName: string,
    input: CommunicationSaveInput
  ): CommunicationSetupDto {
    this.ensureDefaults(schoolId)

    const tx = this.db.transaction(() => {
      const settings = this.ensureSettings(schoolId)
      const updatedSettings: CommunicationSettings = {
        ...settings,
        sms_provider: input.sms_provider.trim(),
        sms_api_key: input.sms_api_key.trim(),
        sms_sender_name: input.sms_sender_name.trim().slice(0, 20),
        channel_sms: input.channel_sms ? 1 : 0,
        channel_email: input.channel_email ? 1 : 0,
        channel_internal: input.channel_internal ? 1 : 0,
        ...this.applyUpdateMeta(settings),
      }

      this.db
        .prepare(
          `UPDATE communication_settings
           SET sms_provider = @sms_provider,
               sms_api_key = @sms_api_key,
               sms_sender_name = @sms_sender_name,
               channel_sms = @channel_sms,
               channel_email = @channel_email,
               channel_internal = @channel_internal,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(updatedSettings)

      enqueueSync(
        this.db,
        this.tableName,
        updatedSettings.id,
        'UPDATE',
        updatedSettings as unknown as Record<string, unknown>
      )

      for (const t of input.templates) {
        const existing = this.findTemplateByKey(schoolId, t.template_key)
        if (!existing) continue

        const record: NotificationTemplate = {
          ...existing,
          subject: t.subject.trim(),
          body: t.body.trim(),
          is_enabled: t.is_enabled ? 1 : 0,
          ...this.applyUpdateMeta(existing),
        }

        this.db
          .prepare(
            `UPDATE notification_templates
             SET subject = @subject,
                 body = @body,
                 is_enabled = @is_enabled,
                 updated_at = @updated_at,
                 version = @version,
                 sync_status = @sync_status
             WHERE id = @id`
          )
          .run(record)

        enqueueSync(
          this.db,
          'notification_templates',
          record.id,
          'UPDATE',
          record as unknown as Record<string, unknown>
        )
      }
    })
    tx()

    return this.getSetupDto(schoolId, schoolName)
  }
}
