/** Helpers for Help → Contact Sofia Support. */

import { getUpdaterStatus } from './updater'
import { authGetSession } from './auth'

export const SUPPORT_EMAIL = 'cherubtech7@gmail.com'

export const SUPPORT_CATEGORIES = [
  { id: 'technical', label: 'Technical issue / crash' },
  { id: 'sync', label: 'Backup or sync problem' },
  { id: 'howto', label: 'How do I…?' },
  { id: 'data', label: 'Data or permissions issue' },
  { id: 'feature', label: 'Feature request' },
  { id: 'other', label: 'Other' },
] as const

export type SupportCategoryId = (typeof SUPPORT_CATEGORIES)[number]['id']

export type SupportDiagnostics = {
  appVersion: string
  schoolName: string
  schoolId: string
  userEmail: string
  userRole: string
  platform: string
  generatedAt: string
}

export async function loadSupportDiagnostics(): Promise<SupportDiagnostics> {
  const session = await authGetSession()
  let appVersion = 'unknown'
  try {
    const status = await getUpdaterStatus()
    if (status.ok && status.data.currentVersion) {
      appVersion = status.data.currentVersion
    }
  } catch {
    /* packaged vs dev */
  }

  return {
    appVersion,
    schoolName: session?.schoolName || '—',
    schoolId: session?.schoolId || '—',
    userEmail: session?.email || '—',
    userRole: session?.role || '—',
    platform:
      typeof navigator !== 'undefined' ? navigator.platform || 'unknown' : 'unknown',
    generatedAt: new Date().toISOString(),
  }
}

export function formatDiagnosticsBlock(d: SupportDiagnostics): string {
  return [
    '--- Sofia diagnostics (please keep) ---',
    `App version: ${d.appVersion}`,
    `School: ${d.schoolName}`,
    `School ID: ${d.schoolId}`,
    `User: ${d.userEmail} (${d.userRole})`,
    `Platform: ${d.platform}`,
    `Generated: ${d.generatedAt}`,
    '--------------------------------------',
  ].join('\n')
}

export function buildSupportMailto(input: {
  categoryLabel: string
  subject: string
  message: string
  diagnostics: SupportDiagnostics
}): string {
  const subject = encodeURIComponent(
    `[Sofia] ${input.categoryLabel}: ${input.subject.trim() || 'Support request'}`
  )
  const body = encodeURIComponent(
    [
      input.message.trim() || '(Please describe the issue here.)',
      '',
      formatDiagnosticsBlock(input.diagnostics),
    ].join('\n')
  )
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
