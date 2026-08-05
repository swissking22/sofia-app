import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type {
  DocumentsSetupDto,
  DocumentTemplateDto,
  DocumentTemplateSaveInput,
} from '../db/repositories/document-template.repository'
import { DOCUMENT_TEMPLATE_DEFS } from '../db/repositories/document-template.repository'
import type { DocumentTemplate } from '../db/types'
import {
  assetToDataUrl,
  saveSchoolAsset,
} from '../helpers/school-assets'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function resolveSchool(repos: Repositories) {
  const session = getSession()
  if (session?.schoolId) {
    const bySession = repos.schools.findById(session.schoolId)
    if (bySession) return repos.schools.ensureSchoolCode(bySession)
  }
  const latest = repos.schools.findLatest()
  return latest ? repos.schools.ensureSchoolCode(latest) : undefined
}

function toDto(
  row: DocumentTemplate,
  schoolLogoUrl: string | null
): DocumentTemplateDto {
  const override = assetToDataUrl(row.logo_path)
  return {
    id: row.id,
    template_key: row.template_key,
    title: row.title,
    header_text: row.header_text,
    footer_text: row.footer_text,
    logo_url: override ?? schoolLogoUrl,
    has_custom_logo: Boolean(row.logo_path),
    show_logo: row.show_logo === 1,
    show_stamp: row.show_stamp === 1,
    show_signature: row.show_signature === 1,
    signature_label: row.signature_label,
    is_enabled: row.is_enabled === 1,
  }
}

function loadSetup(repos: Repositories, schoolId: string): DocumentsSetupDto {
  const school = repos.schools.findById(schoolId)!
  const withCodes = repos.schools.ensureSchoolCode(school)
  const schoolLogoUrl = assetToDataUrl(withCodes.logo_path)
  const schoolStampUrl = assetToDataUrl(withCodes.stamp_path)
  const schoolSignatureUrl = assetToDataUrl(
    withCodes.principal_signature_path
  )

  const rows = repos.documentTemplates.ensureDefaults(schoolId)
  // Stable order by DOCUMENT_TEMPLATE_DEFS
  const byKey = new Map(rows.map((r) => [r.template_key, r]))
  const templates = DOCUMENT_TEMPLATE_DEFS.map((def) => {
    const row = byKey.get(def.key)!
    return toDto(row, schoolLogoUrl)
  })

  return {
    schoolId,
    schoolName: withCodes.name,
    schoolLogoUrl,
    schoolStampUrl,
    schoolSignatureUrl,
    templates,
  }
}

export function registerDocumentsIpc(repos: Repositories): void {
  ipcMain.handle('documents:get-setup', (): Result<DocumentsSetupDto> => {
    const school = resolveSchool(repos)
    if (!school) {
      return { ok: false, error: 'No school found. Complete registration first.' }
    }
    return { ok: true, data: loadSetup(repos, school.id) }
  })

  ipcMain.handle(
    'documents:save-template',
    (_e, input: DocumentTemplateSaveInput): Result<DocumentsSetupDto> => {
      const school = resolveSchool(repos)
      if (!school) return { ok: false, error: 'No school found.' }
      if (!input?.template_key) {
        return { ok: false, error: 'Template key is required.' }
      }

      try {
        repos.documentTemplates.ensureDefaults(school.id)

        let logo_path: string | null | undefined
        if (input.clearLogo) {
          logo_path = null
        } else if (input.logoBase64) {
          logo_path = saveSchoolAsset(
            'logo',
            input.logoBase64,
            input.logoMimeType ?? 'image/png'
          )
        }

        repos.documentTemplates.updateTemplate(school.id, {
          ...input,
          logo_path,
        })

        return { ok: true, data: loadSetup(repos, school.id) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not save document template.',
        }
      }
    }
  )
}
