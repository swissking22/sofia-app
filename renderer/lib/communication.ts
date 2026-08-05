/** Communication setup types + IPC helpers. */

export const SMS_PROVIDER_OPTIONS = [
  { key: 'africas_talking', label: "Africa's Talking" },
  { key: 'twilio', label: 'Twilio' },
  { key: 'nexmo', label: 'Vonage (Nexmo)' },
  { key: 'custom', label: 'Custom / Other' },
] as const

export type SmsProviderKey = (typeof SMS_PROVIDER_OPTIONS)[number]['key']

export type NotificationTemplateKey =
  | 'fee_reminder'
  | 'admission_confirmation'
  | 'results_notification'
  | 'announcement'

export interface NotificationTemplateDto {
  id: string
  template_key: NotificationTemplateKey
  title: string
  subject: string
  body: string
  is_enabled: boolean
}

export interface CommunicationSetup {
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

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchCommunicationSetup(): Promise<
  Result<CommunicationSetup>
> {
  return (await window.ipc.invoke(
    'communication:get-setup'
  )) as Result<CommunicationSetup>
}

export async function saveCommunicationSetup(
  input: CommunicationSaveInput
): Promise<Result<CommunicationSetup>> {
  return (await window.ipc.invoke(
    'communication:save-setup',
    input
  )) as Result<CommunicationSetup>
}

export const CHANNEL_OPTIONS = [
  {
    key: 'sms' as const,
    label: 'SMS',
    description: 'Text messages to parent phone numbers.',
  },
  {
    key: 'email' as const,
    label: 'Email',
    description: 'Messages to parent and staff email addresses.',
  },
  {
    key: 'internal' as const,
    label: 'Internal Notifications',
    description: 'In-app alerts for staff inside SOFIA.',
  },
]
