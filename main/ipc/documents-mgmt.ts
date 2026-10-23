import { ipcMain } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { DocumentFamily } from '../domain/documents'
import { DOCUMENT_PRINT_CSS, variablesForFamily } from '../domain/documents'
import type { Repositories } from '../db/repositories'
import type { GenerateInput } from '../db/repositories/documents.repository'
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

function familyPerm(family: DocumentFamily | undefined, action: 'view' | 'generate' | 'manage'): string {
  const map: Record<DocumentFamily, string> = {
    admission_letter: 'documents.admission',
    certificate: 'documents.certificates',
    transcript: 'documents.transcripts',
    receipt: 'documents.receipts',
    official: 'documents.official',
    report_card: 'documents.templates',
  }
  const prefix = family ? map[family] : 'documents.templates'
  if (family === 'receipt' && action === 'generate') return 'documents.receipts.manage'
  return `${prefix}.${action === 'generate' && family === 'receipt' ? 'manage' : action}`
}

function userPerms(repos: Repositories, s: SessionData): string[] {
  try {
    return getSessionPermissionNames(repos, s)
  } catch {
    return []
  }
}

function canView(repos: Repositories, s: SessionData, family?: DocumentFamily): boolean {
  // Unrestricted owner only — custom roles with coarse "admin" must use grants.
  if (isUnrestrictedAdminSession(repos, s) || s.role === 'secretary') return true
  const perms = userPerms(repos, s)
  if (family) {
    if (perms.includes(familyPerm(family, 'view'))) return true
    if (family === 'certificate' || family === 'transcript') return s.role === 'teacher'
    return false
  }
  return (
    s.role === 'teacher' ||
    perms.some((p) => p.startsWith('documents.') && p.endsWith('.view'))
  )
}

function canGenerate(repos: Repositories, s: SessionData, family?: DocumentFamily): boolean {
  if (isUnrestrictedAdminSession(repos, s) || s.role === 'secretary') return true
  if (!family) return false
  if (family === 'receipt') return false
  return userPerms(repos, s).includes(familyPerm(family, 'generate'))
}

function canManage(repos: Repositories, s: SessionData, family?: DocumentFamily): boolean {
  if (isUnrestrictedAdminSession(repos, s) || s.role === 'secretary') return true
  const perms = userPerms(repos, s)
  if (family) {
    if (family === 'receipt') return perms.includes('documents.receipts.manage')
    return perms.includes(familyPerm(family, 'manage')) || perms.includes('documents.templates.manage')
  }
  return perms.includes('documents.templates.manage')
}

function wrap<T>(fn: () => T, fallback: string): Result<T> {
  try {
    return { ok: true, data: fn() }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : fallback,
    }
  }
}

export function registerDocumentsMgmtIpc(repos: Repositories): void {
  const docs = () => repos.documents

  ipcMain.handle('documents-mgmt:meta', (): Result<unknown> => {
    const s = session()
    if (!s || !canView(repos, s)) return { ok: false, error: 'Access denied.' }
    const schoolId = sid(repos, s)
    return {
      ok: true,
      data: {
        ...docs().meta(schoolId),
        can_view: true,
        can_generate: canGenerate(repos, s),
        can_manage: canManage(repos, s),
        can_receipts:
          canManage(repos, s, 'receipt') ||
          isUnrestrictedAdminSession(repos, s) ||
          s.role === 'secretary',
        can_export:
          isUnrestrictedAdminSession(repos, s) ||
          s.role === 'secretary' ||
          userPerms(repos, s).includes('documents.documents.export'),
        print_css: DOCUMENT_PRINT_CSS,
      },
    }
  })

  ipcMain.handle(
    'documents-mgmt:templates-list',
    (_e, input?: { family?: DocumentFamily }): Result<unknown> => {
      const s = session()
      if (!s || !canView(repos, s, input?.family)) {
        return { ok: false, error: 'Access denied.' }
      }
      return {
        ok: true,
        data: {
          templates: docs().listTemplates(sid(repos, s), input?.family),
        },
      }
    }
  )

  ipcMain.handle(
    'documents-mgmt:templates-get',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s || !canView(repos, s)) return { ok: false, error: 'Access denied.' }
      const schoolId = sid(repos, s)
      const template = docs().getTemplate(schoolId, input.id)
      if (!template) return { ok: false, error: 'Template not found.' }
      return {
        ok: true,
        data: {
          template,
          variables: variablesForFamily(template.document_family as DocumentFamily),
        },
      }
    }
  )

  ipcMain.handle(
    'documents-mgmt:templates-save',
    (
      _e,
      input: {
        id?: string
        template_key?: string
        title: string
        description?: string
        header_text: string
        footer_text: string
        body_text: string
        document_family: DocumentFamily
        type_code: string
        category?: string
        number_pattern?: string
        signatory_role?: string
        signature_label?: string
        is_enabled?: boolean
        is_default?: boolean
        requires_approval?: boolean
        show_logo?: boolean
        show_stamp?: boolean
        show_signature?: boolean
      }
    ): Result<unknown> => {
      const s = session()
      if (!s || !canManage(repos, s, input?.document_family)) {
        return { ok: false, error: 'Access denied.' }
      }
      return wrap(
        () => docs().saveTemplate(sid(repos, s), input, s.userId),
        'Could not save template.'
      )
    }
  )

  ipcMain.handle(
    'documents-mgmt:templates-duplicate',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s || !canManage(repos, s)) return { ok: false, error: 'Access denied.' }
      return wrap(
        () => docs().duplicateTemplate(sid(repos, s), input.id, s.userId),
        'Could not duplicate template.'
      )
    }
  )

  ipcMain.handle(
    'documents-mgmt:templates-set-default',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s || !canManage(repos, s)) return { ok: false, error: 'Access denied.' }
      return wrap(
        () => docs().setDefault(sid(repos, s), input.id, s.userId),
        'Could not set default.'
      )
    }
  )

  ipcMain.handle(
    'documents-mgmt:templates-set-active',
    (_e, input: { id: string; enabled: boolean }): Result<unknown> => {
      const s = session()
      if (!s || !canManage(repos, s)) return { ok: false, error: 'Access denied.' }
      return wrap(
        () => docs().setActive(sid(repos, s), input.id, input.enabled, s.userId),
        'Could not update template.'
      )
    }
  )

  ipcMain.handle(
    'documents-mgmt:list',
    (
      _e,
      input?: {
        family?: DocumentFamily
        status?: string
        class_id?: string
        student_id?: string
        academic_year_id?: string
        from?: string
        to?: string
        section_id?: string
      }
    ): Result<unknown> => {
      const s = session()
      if (!s || !canView(repos, s, input?.family)) {
        return { ok: false, error: 'Access denied.' }
      }
      return {
        ok: true,
        data: { documents: docs().listIssued(sid(repos, s), input ?? {}) },
      }
    }
  )

  ipcMain.handle(
        'documents-mgmt:get',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s || !canView(repos, s)) return { ok: false, error: 'Access denied.' }
      const row = docs().getIssued(sid(repos, s), input.id)
      if (!row) return { ok: false, error: 'Document not found.' }
      return { ok: true, data: { document: row, css: DOCUMENT_PRINT_CSS } }
    }
  )

  ipcMain.handle(
    'documents-mgmt:preview',
    (_e, input: GenerateInput): Result<unknown> => {
      const s = session()
      if (!s) return { ok: false, error: 'Access denied.' }
      const schoolId = sid(repos, s)
      const tpl = docs().getTemplate(schoolId, input.template_id)
      if (!tpl || !canView(repos, s, tpl.document_family as DocumentFamily)) {
        return { ok: false, error: 'Access denied.' }
      }
      return wrap(() => docs().preview(schoolId, input), 'Could not preview.')
    }
  )

  ipcMain.handle(
    'documents-mgmt:generate',
    (_e, input: GenerateInput): Result<unknown> => {
      const s = session()
      if (!s) return { ok: false, error: 'Access denied.' }
      const schoolId = sid(repos, s)
      const tpl = docs().getTemplate(schoolId, input.template_id)
      if (
        !tpl ||
        tpl.document_family === 'receipt' ||
        !canGenerate(repos, s, tpl.document_family as DocumentFamily)
      ) {
        return { ok: false, error: 'Access denied.' }
      }
      return wrap(
        () => docs().generate(schoolId, s.userId, input),
        'Could not generate document.'
      )
    }
  )

  ipcMain.handle(
    'documents-mgmt:generate-bulk',
    (
      _e,
      input: Omit<GenerateInput, 'student_id'> & { student_ids: string[] }
    ): Result<unknown> => {
      const s = session()
      if (!s) return { ok: false, error: 'Access denied.' }
      const schoolId = sid(repos, s)
      const tpl = docs().getTemplate(schoolId, input.template_id)
      if (
        !tpl ||
        tpl.document_family === 'receipt' ||
        !canGenerate(repos, s, tpl.document_family as DocumentFamily)
      ) {
        return { ok: false, error: 'Access denied.' }
      }
      return wrap(
        () => docs().generateBulk(schoolId, s.userId, input),
        'Could not generate letters.'
      )
    }
  )

  ipcMain.handle(
    'documents-mgmt:issue',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s) return { ok: false, error: 'Access denied.' }
      const schoolId = sid(repos, s)
      const row = docs().getIssued(schoolId, input.id)
      if (!row || !canGenerate(repos, s, row.document_family as DocumentFamily)) {
        return { ok: false, error: 'Access denied.' }
      }
      return wrap(() => docs().issue(schoolId, input.id, s.userId), 'Could not issue.')
    }
  )

  ipcMain.handle(
    'documents-mgmt:void',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s) return { ok: false, error: 'Access denied.' }
      const schoolId = sid(repos, s)
      const row = docs().getIssued(schoolId, input.id)
      if (!row || !canManage(repos, s, row.document_family as DocumentFamily)) {
        return { ok: false, error: 'Access denied.' }
      }
      return wrap(() => docs().voidDoc(schoolId, input.id, s.userId), 'Could not void.')
    }
  )

  ipcMain.handle(
    'documents-mgmt:regenerate',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s) return { ok: false, error: 'Access denied.' }
      const schoolId = sid(repos, s)
      const row = docs().getIssued(schoolId, input.id)
      if (!row || !canGenerate(repos, s, row.document_family as DocumentFamily)) {
        return { ok: false, error: 'Access denied.' }
      }
      return wrap(
        () => docs().regenerate(schoolId, input.id, s.userId),
        'Could not regenerate.'
      )
    }
  )

  ipcMain.handle(
    'documents-mgmt:students-search',
    (_e, input?: { query?: string; class_id?: string | null }): Result<unknown> => {
      const s = session()
      if (!s || !canView(repos, s)) return { ok: false, error: 'Access denied.' }
      return {
        ok: true,
        data: {
          students: docs().searchStudents(
            sid(repos, s),
            input?.query || '',
            input?.class_id
          ),
        },
      }
    }
  )

  ipcMain.handle('documents-mgmt:signatories-list', (): Result<unknown> => {
    const s = session()
    if (!s || !canView(repos, s)) return { ok: false, error: 'Access denied.' }
    return { ok: true, data: { signatories: docs().listSignatories(sid(repos, s)) } }
  })

  ipcMain.handle(
    'documents-mgmt:signatories-save',
    (
      _e,
      input: { role_key: string; display_name: string; title: string; is_active?: boolean }
    ): Result<unknown> => {
      const s = session()
      if (!s || !canManage(repos, s)) return { ok: false, error: 'Access denied.' }
      return wrap(
        () => ({ signatories: docs().saveSignatory(sid(repos, s), input) }),
        'Could not save signatory.'
      )
    }
  )

  ipcMain.handle(
    'documents-mgmt:templates-archive',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s || !canManage(repos, s)) return { ok: false, error: 'Access denied.' }
      return wrap(() => {
        docs().archiveTemplate(sid(repos, s), input.id, s.userId)
        return { ok: true }
      }, 'Could not archive template.')
    }
  )

  ipcMain.handle(
    'documents-mgmt:variables',
    (_e, input?: { family?: DocumentFamily }): Result<unknown> => {
      const s = session()
      if (!s || !canView(repos, s, input?.family)) {
        return { ok: false, error: 'Access denied.' }
      }
      return {
        ok: true,
        data: { variables: input?.family ? variablesForFamily(input.family) : [] },
      }
    }
  )

  ipcMain.handle(
    'documents-mgmt:log-export',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s || !canView(repos, s)) return { ok: false, error: 'Access denied.' }
      const schoolId = sid(repos, s)
      const row = docs().getIssued(schoolId, input.id)
      if (!row) return { ok: false, error: 'Document not found.' }
      docs().auditExport(schoolId, input.id, s.userId)
      return { ok: true, data: { id: input.id } }
    }
  )
}
