import { randomBytes, randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  CATALOG_TEMPLATES,
  DEFAULT_NUMBER_PATTERN,
  DOCUMENT_PRINT_CSS,
  type DocumentFamily,
  amountInWords,
  assertTransition,
  canDeleteTemplate,
  formatDocumentNumber,
  gradingBandsHtml,
  isOfficialResultStatus,
  makeVerificationCode,
  nextStatusAfterGenerate,
  receiptLinesHtml,
  resolveTemplate,
  resultsTableHtml,
  transcriptExclusionMessage,
  variablesForFamily,
  wrapOfficialHtml,
} from '../../domain/documents'
import { assetToDataUrl } from '../../helpers/school-assets'
import type {
  DocumentSignatory,
  DocumentTemplate,
  IssuedDocument,
  IssuedDocumentStatus,
} from '../types'

type Ctx = Record<string, string>

export interface GenerateInput {
  template_id: string
  student_id: string
  academic_year_id?: string | null
  term_id?: string | null
  document_date?: string | null
  reason?: string | null
  custom_text?: string | null
  recipient?: string | null
  conditions?: string | null
  reporting_date?: string | null
  transcript_scope?: 'current' | 'selected' | 'history'
}

export class DocumentsRepository {
  constructor(private db: Database.Database) {}

  ensureCatalog(schoolId: string): void {
    const tx = this.db.transaction(() => {
      for (const def of CATALOG_TEMPLATES) {
        const existing = this.findTemplateByKey(schoolId, def.key)
        if (existing) {
          if (!existing.body_text) {
            this.db
              .prepare(
                `UPDATE document_templates
                 SET body_text = @body_text,
                     document_family = @document_family,
                     type_code = @type_code,
                     category = @category,
                     description = @description,
                     number_pattern = CASE WHEN IFNULL(number_pattern,'') = '' THEN @number_pattern ELSE number_pattern END,
                     signatory_role = @signatory_role,
                     is_default = CASE WHEN is_default = 1 THEN 1 ELSE @is_default END,
                     requires_approval = @requires_approval
                 WHERE id = @id`
              )
              .run({
                id: existing.id,
                body_text: def.body,
                document_family: def.family,
                type_code: def.typeCode,
                category: def.category,
                description: def.description,
                number_pattern: DEFAULT_NUMBER_PATTERN,
                signatory_role: def.signatoryRole,
                is_default: def.isDefault ? 1 : 0,
                requires_approval: def.requiresApproval ? 1 : 0,
              })
          }
          continue
        }
        const now = new Date().toISOString()
        const id = randomUUID()
        this.db
          .prepare(
            `INSERT INTO document_templates (
              id, school_id, template_key, title, header_text, footer_text,
              logo_path, show_logo, show_stamp, show_signature, signature_label, is_enabled,
              body_text, document_family, type_code, category, description, required_fields,
              number_pattern, signatory_role, is_default, requires_approval, created_by,
              created_at, updated_at, deleted_at, sync_status, version
            ) VALUES (
              @id, @school_id, @template_key, @title, @header_text, @footer_text,
              NULL, 1, 1, 1, @signature_label, 1,
              @body_text, @document_family, @type_code, @category, @description, '[]',
              @number_pattern, @signatory_role, @is_default, @requires_approval, NULL,
              @created_at, @updated_at, NULL, 'pending', 1
            )`
          )
          .run({
            id,
            school_id: schoolId,
            template_key: def.key,
            title: def.title,
            header_text: def.header,
            footer_text: def.footer,
            signature_label: def.signatureLabel,
            body_text: def.body,
            document_family: def.family,
            type_code: def.typeCode,
            category: def.category,
            description: def.description,
            number_pattern: DEFAULT_NUMBER_PATTERN,
            signatory_role: def.signatoryRole,
            is_default: def.isDefault ? 1 : 0,
            requires_approval: def.requiresApproval ? 1 : 0,
            created_at: now,
            updated_at: now,
          })
        enqueueSync(this.db, 'document_templates', id, 'INSERT', { id, school_id: schoolId })
      }

      this.ensureDefaultSignatories(schoolId)
    })
    tx()
  }

  meta(schoolId: string) {
    this.ensureCatalog(schoolId)
    const years = this.db
      .prepare(
        `SELECT id, name, is_current, start_date FROM academic_years
         WHERE school_id = ? AND deleted_at IS NULL ORDER BY start_date DESC`
      )
      .all(schoolId) as Array<{
      id: string
      name: string
      is_current: number
      start_date: string
    }>
    const terms = this.db
      .prepare(
        `SELECT t.id, t.name, t.academic_year_id, t.term_number
         FROM academic_terms t
         JOIN academic_years y ON y.id = t.academic_year_id
         WHERE y.school_id = ? AND t.deleted_at IS NULL
         ORDER BY t.term_number`
      )
      .all(schoolId) as Array<{
      id: string
      name: string
      academic_year_id: string
      term_number: number
    }>
    const classes = this.db
      .prepare(
        `SELECT c.id, c.name, c.section_id FROM classes c
         WHERE c.school_id = ? AND c.deleted_at IS NULL ORDER BY c.name`
      )
      .all(schoolId) as Array<{ id: string; name: string; section_id: string | null }>
    const sections = this.db
      .prepare(
        `SELECT id, name FROM sections WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY
           CASE LOWER(name)
             WHEN 'general' THEN 0
             WHEN 'commercial' THEN 1
             WHEN 'technical' THEN 2
             ELSE 50
           END ASC,
           name COLLATE NOCASE ASC`
      )
      .all(schoolId) as Array<{ id: string; name: string }>
    const students = this.db
      .prepare(
        `SELECT s.id, s.name, s.student_code, s.class_id, s.status, s.admission_year
         FROM students s
         WHERE s.school_id = ? AND s.deleted_at IS NULL
         ORDER BY s.name LIMIT 2000`
      )
      .all(schoolId) as Array<{
      id: string
      name: string
      student_code: string | null
      class_id: string
      status: string
      admission_year: number | null
    }>
    return { years, terms, classes, sections, students }
  }

  listTemplates(schoolId: string, family?: DocumentFamily | null): DocumentTemplate[] {
    this.ensureCatalog(schoolId)
    if (family) {
      return this.db
        .prepare(
          `SELECT * FROM document_templates
           WHERE school_id = ? AND document_family = ? AND deleted_at IS NULL
           ORDER BY is_default DESC, title ASC`
        )
        .all(schoolId, family) as DocumentTemplate[]
    }
    return this.db
      .prepare(
        `SELECT * FROM document_templates
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY document_family, title`
      )
      .all(schoolId) as DocumentTemplate[]
  }

  findTemplateByKey(schoolId: string, key: string): DocumentTemplate | undefined {
    return this.db
      .prepare(
        `SELECT * FROM document_templates
         WHERE school_id = ? AND template_key = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(schoolId, key) as DocumentTemplate | undefined
  }

  getTemplate(schoolId: string, id: string): DocumentTemplate | undefined {
    return this.db
      .prepare(
        `SELECT * FROM document_templates
         WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .get(id, schoolId) as DocumentTemplate | undefined
  }

  saveTemplate(
    schoolId: string,
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
    },
    userId: string | null
  ): DocumentTemplate {
    this.ensureCatalog(schoolId)
    const now = new Date().toISOString()
    const family = input.document_family
    const wantDefault = Boolean(input.is_default)

    const persist = this.db.transaction(() => {
      if (wantDefault) {
        this.db
          .prepare(
            `UPDATE document_templates SET is_default = 0, updated_at = ?
             WHERE school_id = ? AND document_family = ? AND deleted_at IS NULL`
          )
          .run(now, schoolId, family)
      }

      if (input.id) {
        const existing = this.getTemplate(schoolId, input.id)
        if (!existing) throw new Error('Template not found.')
        this.db
          .prepare(
            `UPDATE document_templates SET
               title = @title, description = @description,
               header_text = @header_text, footer_text = @footer_text, body_text = @body_text,
               document_family = @document_family, type_code = @type_code, category = @category,
               number_pattern = @number_pattern, signatory_role = @signatory_role,
               signature_label = @signature_label,
               is_enabled = @is_enabled, is_default = @is_default,
               requires_approval = @requires_approval,
               show_logo = @show_logo, show_stamp = @show_stamp, show_signature = @show_signature,
               updated_at = @updated_at, version = version + 1, sync_status = 'pending'
             WHERE id = @id AND school_id = @school_id`
          )
          .run({
            id: existing.id,
            school_id: schoolId,
            title: input.title.trim(),
            description: (input.description ?? existing.description).trim(),
            header_text: input.header_text,
            footer_text: input.footer_text,
            body_text: input.body_text,
            document_family: family,
            type_code: (input.type_code || existing.type_code).toUpperCase(),
            category: input.category || existing.category,
            number_pattern: input.number_pattern || existing.number_pattern,
            signatory_role: input.signatory_role || existing.signatory_role,
            signature_label: input.signature_label || existing.signature_label,
            is_enabled: input.is_enabled === false ? 0 : 1,
            is_default: wantDefault ? 1 : existing.id && !wantDefault ? 0 : existing.is_default,
            requires_approval: input.requires_approval ? 1 : 0,
            show_logo: input.show_logo === false ? 0 : 1,
            show_stamp: input.show_stamp === false ? 0 : 1,
            show_signature: input.show_signature === false ? 0 : 1,
            updated_at: now,
          })
        this.audit(schoolId, 'template.update', 'document_template', existing.id, userId)
        return this.getTemplate(schoolId, existing.id)!
      }

      const key =
        input.template_key?.trim() ||
        `${family}.${input.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 40)}`
      if (this.findTemplateByKey(schoolId, key)) {
        throw new Error('A template with this key already exists.')
      }
      const id = randomUUID()
      this.db
        .prepare(
          `INSERT INTO document_templates (
            id, school_id, template_key, title, header_text, footer_text,
            logo_path, show_logo, show_stamp, show_signature, signature_label, is_enabled,
            body_text, document_family, type_code, category, description, required_fields,
            number_pattern, signatory_role, is_default, requires_approval, created_by,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @school_id, @template_key, @title, @header_text, @footer_text,
            NULL, @show_logo, @show_stamp, @show_signature, @signature_label, @is_enabled,
            @body_text, @document_family, @type_code, @category, @description, '[]',
            @number_pattern, @signatory_role, @is_default, @requires_approval, @created_by,
            @created_at, @updated_at, NULL, 'pending', 1
          )`
        )
        .run({
          id,
          school_id: schoolId,
          template_key: key,
          title: input.title.trim(),
          header_text: input.header_text,
          footer_text: input.footer_text,
          show_logo: input.show_logo === false ? 0 : 1,
          show_stamp: input.show_stamp === false ? 0 : 1,
          show_signature: input.show_signature === false ? 0 : 1,
          signature_label: input.signature_label || 'Principal',
          is_enabled: input.is_enabled === false ? 0 : 1,
          body_text: input.body_text,
          document_family: family,
          type_code: (input.type_code || 'DOC').toUpperCase(),
          category: input.category || 'administrative',
          description: (input.description || '').trim(),
          number_pattern: input.number_pattern || DEFAULT_NUMBER_PATTERN,
          signatory_role: input.signatory_role || 'principal',
          is_default: wantDefault ? 1 : 0,
          requires_approval: input.requires_approval ? 1 : 0,
          created_by: userId,
          created_at: now,
          updated_at: now,
        })
      this.audit(schoolId, 'template.create', 'document_template', id, userId, { key })
      return this.getTemplate(schoolId, id)!
    })
    return persist()
  }

  duplicateTemplate(schoolId: string, id: string, userId: string | null): DocumentTemplate {
    const src = this.getTemplate(schoolId, id)
    if (!src) throw new Error('Template not found.')
    return this.saveTemplate(
      schoolId,
      {
        template_key: `${src.template_key}.copy.${randomUUID().slice(0, 6)}`,
        title: `${src.title} (copy)`,
        description: src.description,
        header_text: src.header_text,
        footer_text: src.footer_text,
        body_text: src.body_text,
        document_family: src.document_family as DocumentFamily,
        type_code: src.type_code,
        category: src.category,
        number_pattern: src.number_pattern,
        signatory_role: src.signatory_role,
        signature_label: src.signature_label,
        is_enabled: true,
        is_default: false,
        requires_approval: src.requires_approval === 1,
        show_logo: src.show_logo === 1,
        show_stamp: src.show_stamp === 1,
        show_signature: src.show_signature === 1,
      },
      userId
    )
  }

  setDefault(schoolId: string, id: string, userId: string | null): DocumentTemplate {
    const tpl = this.getTemplate(schoolId, id)
    if (!tpl) throw new Error('Template not found.')
    if (tpl.is_enabled !== 1) throw new Error('Activate the template before setting it as default.')
    return this.saveTemplate(
      schoolId,
      {
        id: tpl.id,
        title: tpl.title,
        description: tpl.description,
        header_text: tpl.header_text,
        footer_text: tpl.footer_text,
        body_text: tpl.body_text,
        document_family: tpl.document_family as DocumentFamily,
        type_code: tpl.type_code,
        category: tpl.category,
        number_pattern: tpl.number_pattern,
        signatory_role: tpl.signatory_role,
        signature_label: tpl.signature_label,
        is_enabled: true,
        is_default: true,
        requires_approval: tpl.requires_approval === 1,
        show_logo: tpl.show_logo === 1,
        show_stamp: tpl.show_stamp === 1,
        show_signature: tpl.show_signature === 1,
      },
      userId
    )
  }

  setActive(schoolId: string, id: string, enabled: boolean, userId: string | null): DocumentTemplate {
    const tpl = this.getTemplate(schoolId, id)
    if (!tpl) throw new Error('Template not found.')
    if (!enabled && tpl.is_default === 1) {
      throw new Error('Set another default template before deactivating this one.')
    }
    this.db
      .prepare(
        `UPDATE document_templates SET is_enabled = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
         WHERE id = ? AND school_id = ?`
      )
      .run(enabled ? 1 : 0, new Date().toISOString(), id, schoolId)
    this.audit(schoolId, enabled ? 'template.activate' : 'template.deactivate', 'document_template', id, userId)
    return this.getTemplate(schoolId, id)!
  }

  archiveTemplate(schoolId: string, id: string, userId: string | null): void {
    const issued = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM issued_documents
         WHERE school_id = ? AND template_id = ? AND deleted_at IS NULL`
      )
      .get(schoolId, id) as { n: number }
    if (!canDeleteTemplate(issued.n)) {
      throw new Error('This template has issued documents. Deactivate it instead of deleting.')
    }
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE document_templates SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
         WHERE id = ? AND school_id = ?`
      )
      .run(now, now, id, schoolId)
    this.audit(schoolId, 'template.archive', 'document_template', id, userId)
  }

  listIssued(
    schoolId: string,
    filters: {
      family?: DocumentFamily
      status?: string
      class_id?: string
      student_id?: string
      academic_year_id?: string
      from?: string
      to?: string
      section_id?: string
    }
  ) {
    const clauses = [`d.school_id = @schoolId`, `d.deleted_at IS NULL`]
    const params: Record<string, unknown> = { schoolId }
    if (filters.family) {
      clauses.push(`d.document_family = @family`)
      params.family = filters.family
    }
    if (filters.status) {
      clauses.push(`d.status = @status`)
      params.status = filters.status
    }
    if (filters.student_id) {
      clauses.push(`d.student_id = @student_id`)
      params.student_id = filters.student_id
    }
    if (filters.academic_year_id) {
      clauses.push(`d.academic_year_id = @year_id`)
      params.year_id = filters.academic_year_id
    }
    if (filters.class_id) {
      clauses.push(`s.class_id = @class_id`)
      params.class_id = filters.class_id
    }
    if (filters.section_id) {
      clauses.push(`c.section_id = @section_id`)
      params.section_id = filters.section_id
    }
    if (filters.from) {
      clauses.push(`d.created_at >= @from`)
      params.from = filters.from
    }
    if (filters.to) {
      clauses.push(`d.created_at <= @to`)
      params.to = filters.to
    }
    return this.db
      .prepare(
        `SELECT d.*, s.name AS student_name, s.student_code, s.created_at AS admission_date,
                s.admission_year, c.name AS class_name,
                y.name AS year_name, t.title AS template_title, u.email AS generated_by_email
         FROM issued_documents d
         LEFT JOIN students s ON s.id = d.student_id
         LEFT JOIN classes c ON c.id = s.class_id
         LEFT JOIN academic_years y ON y.id = d.academic_year_id
         LEFT JOIN document_templates t ON t.id = d.template_id
         LEFT JOIN users u ON u.id = d.generated_by
         WHERE ${clauses.join(' AND ')}
         ORDER BY d.created_at DESC`
      )
      .all(params)
  }

  getIssued(schoolId: string, id: string) {
    return this.db
      .prepare(
        `SELECT d.*, s.name AS student_name, s.student_code, c.name AS class_name,
                y.name AS year_name, t.title AS template_title
         FROM issued_documents d
         LEFT JOIN students s ON s.id = d.student_id
         LEFT JOIN classes c ON c.id = s.class_id
         LEFT JOIN academic_years y ON y.id = d.academic_year_id
         LEFT JOIN document_templates t ON t.id = d.template_id
         WHERE d.id = ? AND d.school_id = ? AND d.deleted_at IS NULL`
      )
      .get(id, schoolId) as (IssuedDocument & {
      student_name: string | null
      student_code: string | null
      class_name: string | null
      year_name: string | null
      template_title: string | null
    }) | undefined
  }

  preview(schoolId: string, input: GenerateInput) {
    const built = this.buildRender(schoolId, input, {
      documentNumber: 'DRAFT',
      verification: 'SOFIA-PREVIEW',
    })
    return {
      html: built.html,
      css: DOCUMENT_PRINT_CSS,
      warnings: built.warnings,
      values: built.values,
      template: {
        id: built.template.id,
        title: built.template.title,
        family: built.template.document_family,
        variables: variablesForFamily(built.template.document_family as DocumentFamily),
      },
    }
  }

  generate(schoolId: string, userId: string | null, input: GenerateInput): IssuedDocument {
    const built = this.buildRender(schoolId, input, {
      documentNumber: 'PENDING',
      verification: 'PENDING',
    })
    if (built.template.is_enabled !== 1) {
      throw new Error('This template is inactive.')
    }
    const year = this.yearLabel(schoolId, input.academic_year_id)
    const run = this.db.transaction(() => {
      const allocated = this.allocateNumber(
        schoolId,
        built.template.type_code,
        year,
        this.schoolCode(schoolId),
        built.template.number_pattern
      )
      const verification = this.uniqueVerification(schoolId)
      const rebuilt = this.buildRender(schoolId, input, {
        documentNumber: allocated.number,
        verification,
      })
      const now = new Date().toISOString()
      const status = nextStatusAfterGenerate(built.template.requires_approval === 1)
      const id = randomUUID()
      const record: IssuedDocument = {
        id,
        school_id: schoolId,
        document_family: built.template.document_family,
        template_id: built.template.id,
        template_key: built.template.template_key,
        document_number: allocated.number,
        verification_code: verification,
        student_id: input.student_id,
        academic_year_id: input.academic_year_id ?? null,
        term_id: input.term_id ?? null,
        status,
        version_number: 1,
        supersedes_id: null,
        generated_by: userId,
        issued_at: status === 'issued' ? now : null,
        issued_by: status === 'issued' ? userId : null,
        voided_at: null,
        rendered_html: rebuilt.html,
        metadata_json: JSON.stringify({
          warnings: rebuilt.warnings,
          reason: input.reason ?? null,
          custom_text: input.custom_text ?? null,
        }),
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_status: 'pending',
        version: 1,
      }
      this.insertIssued(record)
      this.snapshotVersion(record, userId)
      this.audit(schoolId, 'document.generate', 'issued_document', id, userId, {
        number: allocated.number,
      })
      if (status === 'issued') {
        this.audit(schoolId, 'document.issue', 'issued_document', id, userId)
      }
      return record
    })
    return run()
  }

  generateBulk(
    schoolId: string,
    userId: string | null,
    input: Omit<GenerateInput, 'student_id'> & { student_ids: string[] }
  ) {
    const created: IssuedDocument[] = []
    const errors: Array<{ student_id: string; error: string }> = []
    for (const student_id of input.student_ids) {
      try {
        created.push(
          this.generate(schoolId, userId, { ...input, student_id })
        )
      } catch (err) {
        errors.push({
          student_id,
          error: err instanceof Error ? err.message : 'Failed',
        })
      }
    }
    return { created, errors }
  }

  issue(schoolId: string, id: string, userId: string | null): IssuedDocument {
    const doc = this.requireIssued(schoolId, id)
    assertTransition(doc.status as IssuedDocumentStatus, 'issued')
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE issued_documents
         SET status = 'issued', issued_at = ?, issued_by = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
         WHERE id = ? AND school_id = ?`
      )
      .run(now, userId, now, id, schoolId)
    this.audit(schoolId, 'document.issue', 'issued_document', id, userId)
    return this.requireIssued(schoolId, id)
  }

  voidDoc(schoolId: string, id: string, userId: string | null): IssuedDocument {
    const doc = this.requireIssued(schoolId, id)
    assertTransition(doc.status as IssuedDocumentStatus, 'voided')
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE issued_documents
         SET status = 'voided', voided_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
         WHERE id = ? AND school_id = ?`
      )
      .run(now, now, id, schoolId)
    this.audit(schoolId, 'document.void', 'issued_document', id, userId)
    return this.requireIssued(schoolId, id)
  }

  regenerate(schoolId: string, id: string, userId: string | null): IssuedDocument {
    const current = this.requireIssued(schoolId, id)
    if (!current.student_id) throw new Error('Cannot regenerate this document.')
    assertTransition(current.status as IssuedDocumentStatus, 'superseded')
    const meta = JSON.parse(current.metadata_json || '{}') as {
      reason?: string
      custom_text?: string
    }
    const replacement = this.generate(schoolId, userId, {
      template_id: current.template_id,
      student_id: current.student_id,
      academic_year_id: current.academic_year_id,
      term_id: current.term_id,
      reason: meta.reason,
      custom_text: meta.custom_text,
      transcript_scope: 'selected',
    })
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE issued_documents
         SET status = 'superseded', updated_at = ?, version = version + 1, sync_status = 'pending'
         WHERE id = ? AND school_id = ?`
      )
      .run(now, current.id, schoolId)
    this.db
      .prepare(
        `UPDATE issued_documents
         SET supersedes_id = ?, version_number = ?, updated_at = ?
         WHERE id = ? AND school_id = ?`
      )
      .run(current.id, current.version_number + 1, now, replacement.id, schoolId)
    this.audit(schoolId, 'document.regenerate', 'issued_document', replacement.id, userId, {
      superseded: current.id,
    })
    return this.requireIssued(schoolId, replacement.id)
  }

  /** Appearance for Finance receipts — does not create a second receipt. */
  renderReceipt(schoolId: string, paymentId: string) {
    this.ensureCatalog(schoolId)
    const payment = this.db
      .prepare(
        `SELECT * FROM payments WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .get(paymentId, schoolId) as
      | {
          id: string
          student_id: string
          invoice_id: string
          amount: number
          method: string
          reference: string | null
          paid_at: string
        }
      | undefined
    const receipt = this.db
      .prepare(
        `SELECT * FROM receipts WHERE payment_id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .get(paymentId, schoolId) as
      | {
          receipt_number: string
          amount: number
          balance_remaining: number
          issued_at: string
        }
      | undefined
    if (!payment || !receipt) throw new Error('Receipt not found.')
    const tpl =
      this.listTemplates(schoolId, 'receipt').find((t) => t.is_default === 1 && t.is_enabled === 1) ||
      this.findTemplateByKey(schoolId, 'receipt')
    if (!tpl) throw new Error('No receipt template configured.')

    const built = this.buildRender(
      schoolId,
      {
        template_id: tpl.id,
        student_id: payment.student_id,
      },
      {
        documentNumber: receipt.receipt_number,
        verification: '',
        finance: {
          receipt_number: receipt.receipt_number,
          receipt_date: receipt.issued_at.slice(0, 10),
          amount: String(receipt.amount),
          method: payment.method,
          reference: payment.reference || '',
          invoice_id: payment.invoice_id,
          balance: String(receipt.balance_remaining),
        },
      }
    )
    return { html: built.html, css: DOCUMENT_PRINT_CSS, template: tpl }
  }

  listSignatories(schoolId: string): DocumentSignatory[] {
    this.ensureCatalog(schoolId)
    return this.db
      .prepare(
        `SELECT * FROM document_signatories
         WHERE school_id = ? AND deleted_at IS NULL ORDER BY role_key`
      )
      .all(schoolId) as DocumentSignatory[]
  }

  saveSignatory(
    schoolId: string,
    input: { role_key: string; display_name: string; title: string; is_active?: boolean }
  ) {
    const existing = this.db
      .prepare(
        `SELECT * FROM document_signatories
         WHERE school_id = ? AND role_key = ? AND deleted_at IS NULL`
      )
      .get(schoolId, input.role_key) as DocumentSignatory | undefined
    const now = new Date().toISOString()
    if (existing) {
      this.db
        .prepare(
          `UPDATE document_signatories
           SET display_name = ?, title = ?, is_active = ?, updated_at = ?, version = version + 1
           WHERE id = ?`
        )
        .run(
          input.display_name.trim(),
          input.title.trim(),
          input.is_active === false ? 0 : 1,
          now,
          existing.id
        )
      return this.listSignatories(schoolId)
    }
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO document_signatories (
          id, school_id, role_key, display_name, title, signature_path, is_active,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?, NULL, 'pending', 1)`
      )
      .run(id, schoolId, input.role_key, input.display_name.trim(), input.title.trim(), now, now)
    return this.listSignatories(schoolId)
  }

  searchStudents(schoolId: string, query: string, classId?: string | null) {
    const q = `%${query.trim()}%`
    const clauses = [`s.school_id = ?`, `s.deleted_at IS NULL`]
    const params: unknown[] = [schoolId]
    if (classId) {
      clauses.push(`s.class_id = ?`)
      params.push(classId)
    }
    if (query.trim()) {
      clauses.push(`(s.name LIKE ? OR IFNULL(s.student_code,'') LIKE ?)`)
      params.push(q, q)
    }
    return this.db
      .prepare(
        `SELECT s.id, s.name, s.student_code, s.class_id, c.name AS class_name
         FROM students s LEFT JOIN classes c ON c.id = s.class_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY s.name LIMIT 40`
      )
      .all(...params)
  }

  /* ------------ internals ------------ */

  private requireIssued(schoolId: string, id: string): IssuedDocument {
    const row = this.db
      .prepare(
        `SELECT * FROM issued_documents WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .get(id, schoolId) as IssuedDocument | undefined
    if (!row) throw new Error('Document not found.')
    return row
  }

  private insertIssued(record: IssuedDocument) {
    this.db
      .prepare(
        `INSERT INTO issued_documents (
          id, school_id, document_family, template_id, template_key, document_number,
          verification_code, student_id, academic_year_id, term_id, status, version_number,
          supersedes_id, generated_by, issued_at, issued_by, voided_at, rendered_html, metadata_json,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @document_family, @template_id, @template_key, @document_number,
          @verification_code, @student_id, @academic_year_id, @term_id, @status, @version_number,
          @supersedes_id, @generated_by, @issued_at, @issued_by, @voided_at, @rendered_html, @metadata_json,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )`
      )
      .run(record)
    enqueueSync(this.db, 'issued_documents', record.id, 'INSERT', record as unknown as Record<string, unknown>)
  }

  private snapshotVersion(record: IssuedDocument, userId: string | null) {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO issued_document_versions (
          id, school_id, issued_document_id, version_number, rendered_html, metadata_json, created_by,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', 1)`
      )
      .run(
        id,
        record.school_id,
        record.id,
        record.version_number,
        record.rendered_html,
        record.metadata_json,
        userId,
        now,
        now
      )
  }

  private allocateNumber(
    schoolId: string,
    typeCode: string,
    yearKey: string,
    schoolCode: string,
    pattern: string
  ): { number: string; sequence: number } {
    const type_code = typeCode.toUpperCase()
    let row = this.db
      .prepare(
        `SELECT * FROM document_number_sequences
         WHERE school_id = ? AND type_code = ? AND year_key = ? AND deleted_at IS NULL`
      )
      .get(schoolId, type_code, yearKey) as { id: string; next_number: number } | undefined
    const now = new Date().toISOString()
    if (!row) {
      const id = randomUUID()
      this.db
        .prepare(
          `INSERT INTO document_number_sequences (
            id, school_id, type_code, year_key, next_number,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (?, ?, ?, ?, 2, ?, ?, NULL, 'pending', 1)`
        )
        .run(id, schoolId, type_code, yearKey, now, now)
      return {
        sequence: 1,
        number: formatDocumentNumber({
          pattern,
          schoolCode,
          typeCode: type_code,
          year: yearKey,
          sequence: 1,
        }),
      }
    }
    const sequence = row.next_number
    this.db
      .prepare(
        `UPDATE document_number_sequences
         SET next_number = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
         WHERE id = ?`
      )
      .run(sequence + 1, now, row.id)
    return {
      sequence,
      number: formatDocumentNumber({
        pattern,
        schoolCode,
        typeCode: type_code,
        year: yearKey,
        sequence,
      }),
    }
  }

  private uniqueVerification(schoolId: string): string {
    for (let i = 0; i < 12; i++) {
      const code = makeVerificationCode(randomBytes(4).toString('hex'))
      const hit = this.db
        .prepare(
          `SELECT id FROM issued_documents
           WHERE school_id = ? AND verification_code = ? AND deleted_at IS NULL`
        )
        .get(schoolId, code)
      if (!hit) return code
    }
    return makeVerificationCode(randomUUID().replace(/-/g, ''))
  }

  private schoolCode(schoolId: string): string {
    const school = this.db
      .prepare(`SELECT short_code, school_code FROM schools WHERE id = ?`)
      .get(schoolId) as { short_code: string; school_code: string } | undefined
    return (school?.short_code || school?.school_code || 'SCH').toUpperCase()
  }

  private yearLabel(schoolId: string, yearId?: string | null): string {
    if (yearId) {
      const y = this.db
        .prepare(
          `SELECT name, start_date FROM academic_years WHERE id = ? AND school_id = ?`
        )
        .get(yearId, schoolId) as { name: string; start_date: string } | undefined
      const m = y?.name?.match(/(\d{4})/)
      if (m) return m[1]
      if (y?.start_date) return y.start_date.slice(0, 4)
    }
    return String(new Date().getFullYear())
  }

  private ensureDefaultSignatories(schoolId: string) {
    const roles: Array<{ role_key: string; title: string; staffRole: string }> = [
      { role_key: 'principal', title: 'Principal', staffRole: 'principal' },
      { role_key: 'headteacher', title: 'Headteacher', staffRole: 'principal' },
      { role_key: 'registrar', title: 'Registrar', staffRole: 'secretary' },
      { role_key: 'bursar', title: 'Bursar', staffRole: 'bursar' },
    ]
    for (const role of roles) {
      const exists = this.db
        .prepare(
          `SELECT id FROM document_signatories
           WHERE school_id = ? AND role_key = ? AND deleted_at IS NULL`
        )
        .get(schoolId, role.role_key)
      if (exists) continue
      const staff = this.db
        .prepare(
          `SELECT full_name FROM staff
           WHERE school_id = ? AND admin_role = ? AND deleted_at IS NULL
           ORDER BY created_at LIMIT 1`
        )
        .get(schoolId, role.staffRole) as { full_name: string } | undefined
      const now = new Date().toISOString()
      this.db
        .prepare(
          `INSERT INTO document_signatories (
            id, school_id, role_key, display_name, title, signature_path, is_active,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?, NULL, 'pending', 1)`
        )
        .run(
          randomUUID(),
          schoolId,
          role.role_key,
          staff?.full_name || '',
          role.title,
          now,
          now
        )
    }
  }

  private buildRender(
    schoolId: string,
    input: GenerateInput,
    opts: {
      documentNumber: string
      verification: string
      finance?: {
        receipt_number: string
        receipt_date: string
        amount: string
        method: string
        reference: string
        invoice_id: string
        balance: string
      }
    }
  ) {
    const template = this.getTemplate(schoolId, input.template_id)
    if (!template) throw new Error('Template not found.')
    const school = this.db
      .prepare(`SELECT * FROM schools WHERE id = ?`)
      .get(schoolId) as {
      name: string
      short_code: string
      address: string | null
      phone: string | null
      email: string
      website: string | null
      logo_path: string | null
      stamp_path: string | null
      principal_signature_path: string | null
    }
    const student = this.db
      .prepare(
        `SELECT s.*, c.name AS class_name, sec.name AS section_name
         FROM students s
         LEFT JOIN classes c ON c.id = s.class_id
         LEFT JOIN sections sec ON sec.id = c.section_id
         WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL`
      )
      .get(input.student_id, schoolId) as
      | {
          name: string
          student_code: string | null
          class_name: string | null
          section_name: string | null
          gender: string | null
          date_of_birth: string | null
          admission_year: number | null
          status: string
        }
      | undefined
    if (!student) throw new Error('Student not found.')

    const year = input.academic_year_id
      ? (this.db
          .prepare(
            `SELECT name, start_date FROM academic_years WHERE id = ? AND school_id = ?`
          )
          .get(input.academic_year_id, schoolId) as
          | { name: string; start_date: string }
          | undefined)
      : (this.db
          .prepare(
            `SELECT name, start_date FROM academic_years
             WHERE school_id = ? AND is_current = 1 AND deleted_at IS NULL LIMIT 1`
          )
          .get(schoolId) as { name: string; start_date: string } | undefined)

    const term = input.term_id
      ? (this.db
          .prepare(`SELECT name FROM academic_terms WHERE id = ?`)
          .get(input.term_id) as { name: string } | undefined)
      : undefined

    const signatory = this.db
      .prepare(
        `SELECT * FROM document_signatories
         WHERE school_id = ? AND role_key = ? AND deleted_at IS NULL`
      )
      .get(schoolId, template.signatory_role || 'principal') as DocumentSignatory | undefined

    const finance = opts.finance
    const currency = (
      this.db
        .prepare(
          `SELECT currency FROM finance_settings WHERE school_id = ? AND deleted_at IS NULL`
        )
        .get(schoolId) as { currency: string } | undefined
    )?.currency || 'XAF'

    let average = ''
    let grade = ''
    let position = ''
    let academicStatus = ''
    const warnings: string[] = []
    const family = template.document_family as DocumentFamily
    let resultRows: Array<{
      year?: string
      term?: string
      subject: string
      ca?: string | number
      exam?: string | number
      total?: string | number
      grade?: string
    }> = []

    if (family === 'transcript' || family === 'certificate' || family === 'report_card') {
      const payload = this.loadTranscript(schoolId, input)
      warnings.push(...payload.warnings)
      resultRows = payload.rows
      average = payload.average
      grade = payload.grade
      position = payload.position
      academicStatus = payload.status
      if (family === 'transcript' && !resultRows.length && payload.warnings.length) {
        // preview still allowed; generate also allowed with warning banner
      }
    }

    const invoiceLines = finance
      ? (this.db
          .prepare(
            `SELECT description, amount FROM invoice_lines
             WHERE invoice_id = ? AND deleted_at IS NULL ORDER BY sort_order`
          )
          .all(finance.invoice_id) as Array<{ description: string; amount: number }>)
      : []

    const bands = this.db
      .prepare(
        `SELECT gb.grade, gb.min_score, gb.max_score
         FROM grade_bands gb
         JOIN grading_systems gs ON gs.id = gb.grading_system_id
         WHERE gs.school_id = ? AND gb.deleted_at IS NULL AND gs.deleted_at IS NULL
         ORDER BY gb.sort_order`
      )
      .all(schoolId) as Array<{ grade: string; min_score: number; max_score: number }>

    const amountNum = finance ? Number(finance.amount) : 0
    const values: Ctx = {
      'school.name': school.name,
      'school.shortCode': school.short_code,
      'school.address': school.address || '',
      'school.phone': school.phone || '',
      'school.email': school.email || '',
      'school.website': school.website || '',
      'school.principal': signatory?.display_name || '',
      'student.name': student.name,
      'student.id': student.student_code || '',
      'student.admissionNumber': student.student_code || '',
      'student.class': student.class_name || '',
      'student.department': student.section_name || '',
      'student.academicYear': student.admission_year ? String(student.admission_year) : year?.name || '',
      'student.gender': student.gender || '',
      'student.dateOfBirth': student.date_of_birth || '',
      'student.status': student.status,
      'student.balance': finance?.balance || this.outstandingOf(schoolId, input.student_id),
      'academic.year': year?.name || '',
      'academic.term': term?.name || '',
      'academic.average': average,
      'academic.grade': grade,
      'academic.position': position,
      'academic.status': academicStatus,
      'receipt.number': finance?.receipt_number || '',
      'receipt.date': finance?.receipt_date || '',
      'payment.amount': finance ? `${amountNum.toLocaleString()} ${currency}` : '',
      'payment.amountWords': finance ? amountInWords(amountNum, 'CFA francs') : '',
      'payment.method': finance?.method || '',
      'payment.reference': finance?.reference || '',
      'invoice.reference': finance
        ? ((
            this.db
              .prepare(`SELECT invoice_number FROM invoices WHERE id = ?`)
              .get(finance.invoice_id) as { invoice_number: string } | undefined
          )?.invoice_number ?? '')
        : '',
      'document.number': opts.documentNumber,
      'document.date': (input.document_date || new Date().toISOString().slice(0, 10)),
      'document.type': template.title,
      'document.title': template.title,
      'document.verification': opts.verification,
      'document.reason': input.reason || '',
      'document.recipient': input.recipient || 'whom it may concern',
      'document.conditions':
        input.conditions ||
        'Admission is subject to payment of fees and completion of registration.',
      'document.reportingDate': input.reporting_date || year?.start_date || '',
      'document.customText': input.custom_text || '',
      'signatory.name': signatory?.display_name || '',
      'signatory.title': signatory?.title || template.signature_label,
    }

    const blocks = {
      'transcript.results': resultsTableHtml(resultRows),
      'receipt.lines': receiptLinesHtml(
        invoiceLines.map((l) => ({
          description: l.description,
          amount: `${l.amount.toLocaleString()} ${currency}`,
        }))
      ),
      'grading.bands': gradingBandsHtml(bands),
    }

    if (family === 'transcript' && warnings.length && !resultRows.length) {
      blocks['transcript.results'] = `<p><strong>${warnings
        .map((w) => w)
        .join(' ')}</strong></p>`
    }

    const resolvedBody = resolveTemplate(template.body_text || '<p></p>', values, blocks)
    const html = wrapOfficialHtml({
      title: template.title,
      header: resolveTemplate(template.header_text || '', values),
      body:
        warnings.length && family === 'transcript'
          ? `${warnings.map((w) => `<p><em>${w}</em></p>`).join('')}${resolvedBody}`
          : resolvedBody,
      footer: resolveTemplate(template.footer_text || '', values),
      schoolName: school.name,
      documentNumber: opts.documentNumber !== 'DRAFT' ? opts.documentNumber : undefined,
      verification: opts.verification && opts.verification !== 'SOFIA-PREVIEW' ? opts.verification : undefined,
      logoUrl: assetToDataUrl(template.logo_path) || assetToDataUrl(school.logo_path),
      stampUrl: assetToDataUrl(school.stamp_path),
      signatureUrl:
        assetToDataUrl(signatory?.signature_path) ||
        assetToDataUrl(school.principal_signature_path),
      showLogo: template.show_logo === 1,
      showStamp: template.show_stamp === 1,
      showSignature: template.show_signature === 1,
      signatureLabel: template.signature_label,
      signatoryName: signatory?.display_name,
    })

    return { html, warnings, values, template }
  }

  private outstandingOf(schoolId: string, studentId: string): string {
    const row = this.db
      .prepare(
        `SELECT IFNULL(SUM(balance),0) AS bal FROM invoices
         WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL
           AND status NOT IN ('cancelled','void')`
      )
      .get(schoolId, studentId) as { bal: number }
    return String(row?.bal ?? 0)
  }

  private loadTranscript(schoolId: string, input: GenerateInput) {
    const warnings: string[] = []
    const params: Record<string, unknown> = {
      schoolId,
      studentId: input.student_id,
    }
    const runClauses = [`r.school_id = @schoolId`, `r.deleted_at IS NULL`]
    if (input.transcript_scope === 'selected' || input.transcript_scope === 'current') {
      if (input.academic_year_id) {
        runClauses.push(`r.academic_year_id = @yearId`)
        params.yearId = input.academic_year_id
      }
      if (input.term_id) {
        runClauses.push(`r.term_id = @termId`)
        params.termId = input.term_id
      }
    }

    const runs = this.db
      .prepare(
        `SELECT DISTINCT r.id, r.status, r.academic_year_id, r.term_id,
                y.name AS year_name, t.name AS term_name
         FROM result_runs r
         LEFT JOIN academic_years y ON y.id = r.academic_year_id
         LEFT JOIN academic_terms t ON t.id = r.term_id
         WHERE ${runClauses.join(' AND ')}
           AND EXISTS (
             SELECT 1 FROM result_subject_rows rs
             WHERE rs.result_run_id = r.id AND rs.student_id = @studentId AND rs.deleted_at IS NULL
           )`
      )
      .all(params) as Array<{
      id: string
      status: string
      academic_year_id: string | null
      term_id: string | null
      year_name: string | null
      term_name: string | null
    }>

    for (const run of runs) {
      if (!isOfficialResultStatus(run.status)) {
        warnings.push(
          transcriptExclusionMessage({
            termName: run.term_name || 'this term',
            status: run.status,
          })
        )
      }
    }

    const officialIds = runs.filter((r) => isOfficialResultStatus(r.status)).map((r) => r.id)
    if (!officialIds.length) {
      return {
        warnings,
        rows: [],
        average: '',
        grade: '',
        position: '',
        status: warnings.length ? 'Results not finalized' : 'No results',
      }
    }

    const placeholders = officialIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT y.name AS year_name, t.name AS term_name, sub.name AS subject_name,
                rs.ca_score, rs.exam_score, rs.total, rs.grade
         FROM result_subject_rows rs
         JOIN result_runs r ON r.id = rs.result_run_id
         LEFT JOIN academic_years y ON y.id = r.academic_year_id
         LEFT JOIN academic_terms t ON t.id = r.term_id
         LEFT JOIN subjects sub ON sub.id = rs.subject_id
         WHERE rs.result_run_id IN (${placeholders})
           AND rs.student_id = ?
           AND rs.deleted_at IS NULL
         ORDER BY y.start_date, t.term_number, sub.name`
      )
      .all(...officialIds, input.student_id) as Array<{
      year_name: string | null
      term_name: string | null
      subject_name: string | null
      ca_score: number
      exam_score: number
      total: number
      grade: string | null
    }>

    const summaries = this.db
      .prepare(
        `SELECT average, grade, position FROM result_student_summaries
         WHERE result_run_id IN (${placeholders}) AND student_id = ? AND deleted_at IS NULL`
      )
      .all(...officialIds, input.student_id) as Array<{
      average: number
      grade: string | null
      position: number | null
    }>
    const avg =
      summaries.length > 0
        ? Math.round(
            (summaries.reduce((s, r) => s + r.average, 0) / summaries.length) * 100
          ) / 100
        : null

    return {
      warnings,
      rows: rows.map((r) => ({
        year: r.year_name || '',
        term: r.term_name || '',
        subject: r.subject_name || '',
        ca: r.ca_score,
        exam: r.exam_score,
        total: r.total,
        grade: r.grade || '',
      })),
      average: avg != null ? String(avg) : '',
      grade: summaries[summaries.length - 1]?.grade || '',
      position:
        summaries[summaries.length - 1]?.position != null
          ? String(summaries[summaries.length - 1].position)
          : '',
      status: 'Finalized',
    }
  }

  auditExport(schoolId: string, documentId: string, userId: string | null): void {
    this.audit(schoolId, 'document.export', 'issued_document', documentId, userId)
  }

  private audit(
    schoolId: string,
    action: string,
    entityType: string,
    entityId: string,
    userId: string | null,
    payload?: Record<string, unknown>
  ) {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO document_audit_log (
          id, school_id, action, entity_type, entity_id, user_id, payload_json,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', 1)`
      )
      .run(
        randomUUID(),
        schoolId,
        action,
        entityType,
        entityId,
        userId,
        payload ? JSON.stringify(payload) : null,
        now,
        now
      )
  }
}
