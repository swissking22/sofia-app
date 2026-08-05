import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { DocumentTemplate, DocumentTemplateKey } from '../types'
import { BaseRepository } from './base'

export const DOCUMENT_TEMPLATE_DEFS: Array<{
  key: DocumentTemplateKey
  title: string
  defaultHeader: string
  defaultFooter: string
  signatureLabel: string
}> = [
  {
    key: 'report_card',
    title: 'Report Card Template',
    defaultHeader: 'Official Term Report Card',
    defaultFooter: 'This report is computer generated and valid without stamp.',
    signatureLabel: 'Principal',
  },
  {
    key: 'admission_letter',
    title: 'Admission Letter Template',
    defaultHeader: 'Letter of Admission',
    defaultFooter: 'Welcome to our school community.',
    signatureLabel: 'Principal',
  },
  {
    key: 'receipt',
    title: 'Receipt Template',
    defaultHeader: 'Official Payment Receipt',
    defaultFooter: 'Thank you for your payment.',
    signatureLabel: 'Bursar',
  },
  {
    key: 'certificate',
    title: 'Certificate Template',
    defaultHeader: 'Certificate of Achievement',
    defaultFooter: 'Awarded in recognition of academic excellence.',
    signatureLabel: 'Principal',
  },
]

export interface DocumentTemplateDto {
  id: string
  template_key: DocumentTemplateKey
  title: string
  header_text: string
  footer_text: string
  logo_url: string | null
  has_custom_logo: boolean
  show_logo: boolean
  show_stamp: boolean
  show_signature: boolean
  signature_label: string
  is_enabled: boolean
}

export interface DocumentsSetupDto {
  schoolId: string
  schoolName: string
  schoolLogoUrl: string | null
  schoolStampUrl: string | null
  schoolSignatureUrl: string | null
  templates: DocumentTemplateDto[]
}

export interface DocumentTemplateSaveInput {
  template_key: DocumentTemplateKey
  header_text: string
  footer_text: string
  show_logo: boolean
  show_stamp: boolean
  show_signature: boolean
  signature_label: string
  is_enabled: boolean
  /** When set, replaces template logo. Null clears override (use school logo). */
  logoBase64?: string | null
  logoMimeType?: string
  clearLogo?: boolean
}

export class DocumentTemplateRepository extends BaseRepository<DocumentTemplate> {
  constructor(db: Database.Database) {
    super(db, 'document_templates')
  }

  ensureDefaults(schoolId: string): DocumentTemplate[] {
    const tx = this.db.transaction(() => {
      for (const def of DOCUMENT_TEMPLATE_DEFS) {
        const existing = this.findByKey(schoolId, def.key)
        if (existing) continue

        const record: DocumentTemplate = {
          ...this.buildBaseFields(),
          school_id: schoolId,
          template_key: def.key,
          title: def.title,
          header_text: def.defaultHeader,
          footer_text: def.defaultFooter,
          logo_path: null,
          show_logo: 1,
          show_stamp: 1,
          show_signature: 1,
          signature_label: def.signatureLabel,
          is_enabled: 1,
        }
        this.db
          .prepare(
            `INSERT INTO document_templates (
              id, school_id, template_key, title, header_text, footer_text,
              logo_path, show_logo, show_stamp, show_signature, signature_label, is_enabled,
              created_at, updated_at, deleted_at, sync_status, version
            ) VALUES (
              @id, @school_id, @template_key, @title, @header_text, @footer_text,
              @logo_path, @show_logo, @show_stamp, @show_signature, @signature_label, @is_enabled,
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
      }
    })
    tx()
    return this.listBySchool(schoolId)
  }

  findByKey(
    schoolId: string,
    key: DocumentTemplateKey
  ): DocumentTemplate | undefined {
    return this.db
      .prepare(
        `SELECT * FROM document_templates
         WHERE school_id = ? AND template_key = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId, key) as DocumentTemplate | undefined
  }

  listBySchool(schoolId: string): DocumentTemplate[] {
    return this.db
      .prepare(
        `SELECT * FROM document_templates
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY created_at ASC`
      )
      .all(schoolId) as DocumentTemplate[]
  }

  updateTemplate(
    schoolId: string,
    input: DocumentTemplateSaveInput & { logo_path?: string | null }
  ): DocumentTemplate {
    const existing = this.findByKey(schoolId, input.template_key)
    if (!existing) throw new Error('Template not found.')

    let logo_path = existing.logo_path
    if (input.clearLogo) logo_path = null
    if (input.logo_path !== undefined) logo_path = input.logo_path

    const record: DocumentTemplate = {
      ...existing,
      header_text: input.header_text.trim(),
      footer_text: input.footer_text.trim(),
      logo_path,
      show_logo: input.show_logo ? 1 : 0,
      show_stamp: input.show_stamp ? 1 : 0,
      show_signature: input.show_signature ? 1 : 0,
      signature_label: input.signature_label.trim() || existing.signature_label,
      is_enabled: input.is_enabled ? 1 : 0,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE document_templates
           SET header_text = @header_text,
               footer_text = @footer_text,
               logo_path = @logo_path,
               show_logo = @show_logo,
               show_stamp = @show_stamp,
               show_signature = @show_signature,
               signature_label = @signature_label,
               is_enabled = @is_enabled,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(record)
      enqueueSync(
        this.db,
        this.tableName,
        record.id,
        'UPDATE',
        record as unknown as Record<string, unknown>
      )
    })
    tx()
    return record
  }
}
