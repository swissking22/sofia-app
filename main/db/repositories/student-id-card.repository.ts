import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  academicYearToken,
  canDeleteTemplate,
  cardStatusForDates,
  computeExpiry,
  DEFAULT_SETTINGS,
  designHash,
  formatCardNumber,
  formatDisplayDate,
  formatJobNumber,
  interpolate,
  newVerificationCode,
  parseDesign,
  requiredBindings,
  requireStudentCode,
  sampleBindings,
  splitName,
  todayIso,
  validateStudentForCard,
  verificationPayload,
  type BindingMap,
  type CardDesign,
  type CardKind,
  type IdCardSettingsShape,
  type MissingPhotoPolicy,
  type PaperSize,
  type ReplacementReason,
} from '../../domain/id-card'
import { SAMPLE_SPECS } from '../../domain/id-card-templates'
import { studentQrPayload } from '../../domain/id-card-classic-tokens'
import {
  DEFAULT_ACADEMIC_CREST,
  DEFAULT_SAMPLE_SIGNATURE,
  DEFAULT_SAMPLE_STUDENT_PHOTO,
} from '../../domain/id-card-assets'
import { code128Svg } from '../../helpers/code128'
import { qrSvg } from '../../helpers/qr-svg'
import { assetToDataUrl } from '../../helpers/school-assets'
import type { StudentIdCard, StudentIdCardTemplate } from '../types'
import { BaseRepository } from './base'

export type StudentCardContext = {
  id: string
  name: string
  student_code: string | null
  gender: string | null
  date_of_birth: string | null
  photo_path: string | null
  status: string
  admission_year: number | null
  class_id: string
  class_name: string | null
  stream: string | null
  department_name: string | null
  level_name: string | null
}

function parseSettings(json: string | null): IdCardSettingsShape {
  if (!json) return { ...DEFAULT_SETTINGS, numbering: { ...DEFAULT_SETTINGS.numbering } }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(json), numbering: { ...DEFAULT_SETTINGS.numbering, ...(JSON.parse(json).numbering || {}) } }
  } catch {
    return { ...DEFAULT_SETTINGS, numbering: { ...DEFAULT_SETTINGS.numbering } }
  }
}

export class StudentIdCardRepository extends BaseRepository<StudentIdCard> {
  constructor(db: Database.Database) {
    super(db, 'student_id_cards')
  }

  getSettings(schoolId: string): IdCardSettingsShape {
    const row = this.db
      .prepare(
        `SELECT settings_json FROM id_card_settings WHERE school_id = ? AND deleted_at IS NULL`
      )
      .get(schoolId) as { settings_json: string } | undefined
    return parseSettings(row?.settings_json ?? null)
  }

  saveSettings(schoolId: string, patch: Partial<IdCardSettingsShape>): IdCardSettingsShape {
    const current = this.getSettings(schoolId)
    const next: IdCardSettingsShape = {
      ...current,
      ...patch,
      numbering: { ...current.numbering, ...(patch.numbering || {}) },
    }
    const existing = this.db
      .prepare(`SELECT id FROM id_card_settings WHERE school_id = ? AND deleted_at IS NULL`)
      .get(schoolId) as { id: string } | undefined
    const now = new Date().toISOString()
    const json = JSON.stringify(next)
    if (existing) {
      this.db
        .prepare(
          `UPDATE id_card_settings SET settings_json = ?, updated_at = ?, version = version + 1, sync_status = 'pending' WHERE id = ?`
        )
        .run(json, now, existing.id)
      enqueueSync(this.db, 'id_card_settings', existing.id, 'UPDATE', { settings_json: json })
    } else {
      const id = randomUUID()
      this.db
        .prepare(
          `INSERT INTO id_card_settings (
             id, school_id, settings_json, created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (?, ?, ?, ?, ?, NULL, 'pending', 1)`
        )
        .run(id, schoolId, json, now, now)
      enqueueSync(this.db, 'id_card_settings', id, 'INSERT', { id, school_id: schoolId })
    }
    return next
  }

  allocateSequence(schoolId: string, scopeKey: string): number {
    return this.db.transaction(() => {
      const row = this.db
        .prepare(
          `SELECT * FROM id_card_sequences WHERE school_id = ? AND scope_key = ? AND deleted_at IS NULL`
        )
        .get(schoolId, scopeKey) as { id: string; next_number: number } | undefined
      const now = new Date().toISOString()
      if (!row) {
        const id = randomUUID()
        this.db
          .prepare(
            `INSERT INTO id_card_sequences (
               id, school_id, scope_key, next_number, created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (?, ?, ?, 2, ?, ?, NULL, 'pending', 1)`
          )
          .run(id, schoolId, scopeKey, now, now)
        return 1
      }
      const n = row.next_number
      this.db
        .prepare(
          `UPDATE id_card_sequences SET next_number = ?, updated_at = ?, version = version + 1 WHERE id = ?`
        )
        .run(n + 1, now, row.id)
      return n
    })()
  }

  ensureSampleTemplates(schoolId: string, userId: string | null): void {
    for (const spec of SAMPLE_SPECS) {
      const exists = this.db
        .prepare(
          `SELECT id, is_system, category, status, current_version_id, orientation, width_mm, height_mm
           FROM student_id_card_templates WHERE school_id = ? AND sample_key = ? AND deleted_at IS NULL`
        )
        .get(schoolId, spec.key) as
        | {
            id: string
            is_system?: number
            category?: string
            status?: string
            current_version_id: string | null
            orientation: string
            width_mm: number
            height_mm: number
          }
        | undefined
      if (exists) {
        if (spec.is_system && (!exists.is_system || exists.category !== spec.category || exists.status !== 'active')) {
          this.db
            .prepare(
              `UPDATE student_id_card_templates SET is_system = ?, category = ?, status = 'active', updated_at = ? WHERE id = ?`
            )
            .run(spec.is_system ? 1 : 0, spec.category || 'Standard', new Date().toISOString(), exists.id)
        }
        // Refresh system template design when factory definition changes (school copies untouched).
        if (spec.is_system && exists.current_version_id) {
          const design = spec.design()
          const nextHash = designHash(design)
          const ver = this.db
            .prepare(`SELECT design_json FROM id_card_template_versions WHERE id = ?`)
            .get(exists.current_version_id) as { design_json: string } | undefined
          const currentHash = designHash(parseDesign(ver?.design_json))
          if (currentHash !== nextHash) {
            const now = new Date().toISOString()
            this.db
              .prepare(
                `UPDATE id_card_template_versions SET design_json = ? WHERE id = ? AND school_id = ?`
              )
              .run(JSON.stringify(design), exists.current_version_id, schoolId)
            this.db
              .prepare(
                `UPDATE student_id_card_templates
                 SET orientation = ?, width_mm = ?, height_mm = ?, unit = ?, updated_at = ?, version = version + 1
                 WHERE id = ? AND school_id = ?`
              )
              .run(
                design.orientation,
                design.widthMm,
                design.heightMm,
                design.unit,
                now,
                exists.id,
                schoolId
              )
          }
        }
        continue
      }
      this.createTemplate({
        school_id: schoolId,
        name: spec.name,
        description: spec.description,
        card_type: spec.card_type,
        design: spec.design(),
        status: 'active',
        is_default: spec.key === 'the_heritage' ? 1 : 0,
        sample_key: spec.key,
        userId,
        is_system: spec.is_system ? 1 : 0,
        category: spec.category,
      })
    }
  }

  ensureDefaultTemplate(schoolId: string): StudentIdCardTemplate {
    this.ensureSampleTemplates(schoolId, null)
    const existing = this.db
      .prepare(
        `SELECT * FROM student_id_card_templates
         WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'
         ORDER BY is_default DESC LIMIT 1`
      )
      .get(schoolId) as StudentIdCardTemplate | undefined
    if (existing) return existing
    const any = this.db
      .prepare(
        `SELECT * FROM student_id_card_templates WHERE school_id = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(schoolId) as StudentIdCardTemplate | undefined
    if (any) return any
    return this.createTemplate({
      school_id: schoolId,
      name: 'Official student ID',
      description: '',
      card_type: 'student',
      design: SAMPLE_SPECS[0].design(),
      status: 'active',
      is_default: 1,
      sample_key: null,
      userId: null,
    })
  }

  listTemplates(schoolId: string): Array<
    StudentIdCardTemplate & { updated_by_email: string | null }
  > {
    return this.db
      .prepare(
        `SELECT t.*, u.email AS updated_by_email
         FROM student_id_card_templates t
         LEFT JOIN users u ON u.id = t.updated_by
         WHERE t.school_id = ? AND t.deleted_at IS NULL
         ORDER BY t.is_default DESC, t.updated_at DESC`
      )
      .all(schoolId) as Array<StudentIdCardTemplate & { updated_by_email: string | null }>
  }

  getTemplate(schoolId: string, id: string): StudentIdCardTemplate | undefined {
    return this.db
      .prepare(
        `SELECT * FROM student_id_card_templates WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .get(id, schoolId) as StudentIdCardTemplate | undefined
  }

  getVersion(schoolId: string, id: string) {
    return this.db
      .prepare(
        `SELECT * FROM id_card_template_versions WHERE id = ? AND school_id = ?`
      )
      .get(id, schoolId) as
      | {
          id: string
          school_id: string
          template_id: string
          version_number: number
          design_json: string
          created_by: string | null
          created_at: string
        }
      | undefined
  }

  currentDesign(schoolId: string, templateId: string): CardDesign {
    const tpl = this.getTemplate(schoolId, templateId)
    if (!tpl?.current_version_id) return parseDesign(null)
    const ver = this.getVersion(schoolId, tpl.current_version_id)
    return parseDesign(ver?.design_json)
  }

  createTemplate(input: {
    school_id: string
    name: string
    description: string
    card_type: 'student' | 'staff'
    design: CardDesign
    status: 'draft' | 'active' | 'archived'
    is_default: number
    sample_key: string | null
    userId: string | null
    is_system?: number
    category?: string
  }): StudentIdCardTemplate {
    const now = new Date().toISOString()
    const tplId = randomUUID()
    const verId = randomUUID()
    const tpl: StudentIdCardTemplate = {
      ...this.buildBaseFields(),
      id: tplId,
      school_id: input.school_id,
      name: input.name,
      is_default: input.is_default,
      front_layout: 'designed',
      back_layout: 'designed',
      show_photo: 1,
      validity_months: 12,
      description: input.description,
      card_type: input.card_type,
      status: input.status,
      orientation: input.design.orientation,
      width_mm: input.design.widthMm,
      height_mm: input.design.heightMm,
      unit: input.design.unit,
      sample_key: input.sample_key,
      is_system: input.is_system ?? 0,
      category: input.category ?? 'Standard',
      current_version_id: verId,
      current_version_number: 1,
      updated_by: input.userId,
    }
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO student_id_card_templates (
             id, school_id, name, is_default, front_layout, back_layout, show_photo, validity_months,
             description, card_type, status, orientation, width_mm, height_mm, unit, sample_key,
             is_system, category,
             current_version_id, current_version_number, updated_by,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @name, @is_default, @front_layout, @back_layout, @show_photo, @validity_months,
             @description, @card_type, @status, @orientation, @width_mm, @height_mm, @unit, @sample_key,
             @is_system, @category,
             @current_version_id, @current_version_number, @updated_by,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`
        )
        .run(tpl)
      this.db
        .prepare(
          `INSERT INTO id_card_template_versions (
             id, school_id, template_id, version_number, design_json, created_by, created_at
           ) VALUES (?, ?, ?, 1, ?, ?, ?)`
        )
        .run(verId, input.school_id, tplId, JSON.stringify(input.design), input.userId, now)
      enqueueSync(this.db, 'student_id_card_templates', tplId, 'INSERT', tpl as unknown as Record<string, unknown>)
    })()
    return tpl
  }

  saveTemplate(input: {
    school_id: string
    id: string
    name?: string
    description?: string
    status?: 'draft' | 'active' | 'archived'
    design?: CardDesign
    userId: string | null
    bumpVersion?: boolean
    is_system?: number
    category?: string
  }): StudentIdCardTemplate {
    const existing = this.getTemplate(input.school_id, input.id)
    if (!existing) throw new Error('Template not found.')
    const now = new Date().toISOString()
    let versionId = existing.current_version_id
    let versionNumber = existing.current_version_number
    if (input.design) {
      const current = this.currentDesign(input.school_id, existing.id)
      const changed = designHash(current) !== designHash(input.design)
      const issued = this.issuedCountForTemplate(input.school_id, existing.id)
      if (changed && input.bumpVersion !== false && issued > 0) {
        versionNumber = existing.current_version_number + 1
        versionId = randomUUID()
        this.db
          .prepare(
            `INSERT INTO id_card_template_versions (
               id, school_id, template_id, version_number, design_json, created_by, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            versionId,
            input.school_id,
            existing.id,
            versionNumber,
            JSON.stringify(input.design),
            input.userId,
            now
          )
      } else if (existing.current_version_id) {
        this.db
          .prepare(
            `UPDATE id_card_template_versions SET design_json = ? WHERE id = ? AND school_id = ?`
          )
          .run(JSON.stringify(input.design), existing.current_version_id, input.school_id)
      }
    }
    if (input.status === 'active') {
      this.db
        .prepare(
          `UPDATE student_id_card_templates SET is_default = 0 WHERE school_id = ? AND deleted_at IS NULL AND id != ?`
        )
        .run(input.school_id, existing.id)
    }
    const next = {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      status: input.status ?? existing.status,
      orientation: input.design?.orientation ?? existing.orientation,
      width_mm: input.design?.widthMm ?? existing.width_mm,
      height_mm: input.design?.heightMm ?? existing.height_mm,
      unit: input.design?.unit ?? existing.unit,
      current_version_id: versionId,
      current_version_number: versionNumber,
      updated_by: input.userId,
      is_default: input.status === 'active' ? 1 : existing.is_default,
      is_system: input.is_system ?? existing.is_system ?? 0,
      category: input.category ?? existing.category ?? 'Standard',
      updated_at: now,
      version: existing.version + 1,
      sync_status: 'pending' as const,
    }
    this.db
      .prepare(
        `UPDATE student_id_card_templates SET
           name = @name, description = @description, status = @status, orientation = @orientation,
           width_mm = @width_mm, height_mm = @height_mm, unit = @unit,
           current_version_id = @current_version_id, current_version_number = @current_version_number,
           updated_by = @updated_by, is_default = @is_default, is_system = @is_system, category = @category,
           updated_at = @updated_at, version = @version, sync_status = @sync_status
         WHERE id = @id AND school_id = @school_id`
      )
      .run(next)
    enqueueSync(this.db, 'student_id_card_templates', next.id, 'UPDATE', next as unknown as Record<string, unknown>)
    return next
  }

  duplicateTemplate(schoolId: string, id: string, userId: string | null): StudentIdCardTemplate {
    const tpl = this.getTemplate(schoolId, id)
    if (!tpl) throw new Error('Template not found.')
    return this.createTemplate({
      school_id: schoolId,
      name: `${tpl.name} copy`,
      description: tpl.description,
      card_type: tpl.card_type,
      design: this.currentDesign(schoolId, id),
      status: 'draft',
      is_default: 0,
      sample_key: null,
      is_system: 0,
      category: tpl.category || 'Standard',
      userId,
    })
  }

  useTemplate(schoolId: string, id: string, userId: string | null): StudentIdCardTemplate {
    const tpl = this.getTemplate(schoolId, id)
    if (!tpl) throw new Error('Template not found.')
    const school = this.db
      .prepare(`SELECT name, short_code FROM schools WHERE id = ?`)
      .get(schoolId) as { name: string; short_code: string } | undefined
    const schoolLabel = school?.short_code || school?.name || 'My School'

    let copyName = `${tpl.name} - ${schoolLabel}`
    if (tpl.name.toUpperCase().startsWith('THE ')) {
      const cleanTitle = tpl.name.slice(4).charAt(0).toUpperCase() + tpl.name.slice(5).toLowerCase()
      copyName = `${cleanTitle} Student ID - ${schoolLabel}`
    } else if (!tpl.is_system) {
      copyName = `${tpl.name} (Copy)`
    }

    return this.createTemplate({
      school_id: schoolId,
      name: copyName,
      description: tpl.description || `Customized from ${tpl.name}`,
      card_type: tpl.card_type,
      design: this.currentDesign(schoolId, id),
      status: 'draft',
      is_default: 0,
      sample_key: null,
      is_system: 0,
      category: tpl.category || 'Standard',
      userId,
    })
  }

  issuedCountForTemplate(schoolId: string, templateId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM student_id_cards WHERE school_id = ? AND template_id = ? AND deleted_at IS NULL`
      )
      .get(schoolId, templateId) as { n: number }
    return row.n
  }

  deleteTemplate(schoolId: string, id: string): void {
    const tpl = this.getTemplate(schoolId, id)
    if (!tpl) throw new Error('Template not found.')
    if (tpl.is_system) {
      throw new Error('System templates cannot be deleted.')
    }
    const count = this.issuedCountForTemplate(schoolId, id)
    if (!canDeleteTemplate(count, tpl.status)) {
      throw new Error(
        'This template has issued cards. Archive it instead so historical cards can still be reprinted.'
      )
    }
    const now = new Date().toISOString()
    this.db.transaction(() => {
      // Drafts may have test cards from Generate — remove them with the draft.
      if (tpl.status === 'draft' && count > 0) {
        this.db
          .prepare(
            `UPDATE student_id_cards
             SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
             WHERE school_id = ? AND template_id = ? AND deleted_at IS NULL`
          )
          .run(now, now, schoolId, id)
      }
      const next = {
        ...tpl,
        deleted_at: now,
        updated_at: now,
        version: tpl.version + 1,
        sync_status: 'pending' as const,
      }
      this.db
        .prepare(
          `UPDATE student_id_card_templates
           SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
           WHERE id = ? AND school_id = ?`
        )
        .run(now, now, id, schoolId)
      enqueueSync(
        this.db,
        'student_id_card_templates',
        id,
        'DELETE',
        next as unknown as Record<string, unknown>
      )
    })()
  }

  studentContext(schoolId: string, studentId: string): StudentCardContext | undefined {
    return this.db
      .prepare(
        `SELECT s.id, s.name, s.student_code, s.gender, s.date_of_birth, s.photo_path, s.status,
                s.admission_year, s.class_id, c.name AS class_name, c.stream AS stream,
                sec.name AS department_name, al.name AS level_name
         FROM students s
         LEFT JOIN classes c ON c.id = s.class_id
         LEFT JOIN sections sec ON sec.id = c.section_id
         LEFT JOIN academic_levels al ON al.id = COALESCE(s.academic_level_id, c.academic_level_id)
         WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL`
      )
      .get(studentId, schoolId) as StudentCardContext | undefined
  }

  listStudentsForCards(
    schoolId: string,
    filters?: { academic_year_id?: string; class_id?: string; department_id?: string; stream?: string; status?: string }
  ): StudentCardContext[] {
    let sql = `
      SELECT s.id, s.name, s.student_code, s.gender, s.date_of_birth, s.photo_path, s.status,
             s.admission_year, s.class_id, c.name AS class_name, c.stream AS stream,
             sec.name AS department_name, al.name AS level_name
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN sections sec ON sec.id = c.section_id
      LEFT JOIN academic_levels al ON al.id = COALESCE(s.academic_level_id, c.academic_level_id)
      WHERE s.school_id = ? AND s.deleted_at IS NULL
    `
    const params: string[] = [schoolId]
    if (filters?.status) {
      sql += ` AND s.status = ?`
      params.push(filters.status)
    } else {
      sql += ` AND s.status = 'active'`
    }
    if (filters?.class_id) {
      sql += ` AND s.class_id = ?`
      params.push(filters.class_id)
    }
    if (filters?.department_id) {
      sql += ` AND c.section_id = ?`
      params.push(filters.department_id)
    }
    if (filters?.stream) {
      sql += ` AND c.stream = ?`
      params.push(filters.stream)
    }
    sql += ` ORDER BY s.name COLLATE NOCASE`
    return this.db.prepare(sql).all(...params) as StudentCardContext[]
  }

  buildBindings(input: {
    schoolId: string
    student: StudentCardContext
    yearName: string | null
    yearEnd: string | null
    termName: string | null
    card: {
      number: string
      issue_date: string
      expiry_date: string | null
      status: string
      verification_code: string
    }
  }): BindingMap {
    const school = this.db
      .prepare(`SELECT * FROM schools WHERE id = ?`)
      .get(input.schoolId) as {
      name: string
      short_code: string
      address: string | null
      phone: string | null
      email: string
      website: string | null
      logo_path?: string | null
      principal_signature_path?: string | null
    }
    const settings = this.getSettings(input.schoolId)
    const names = splitName(input.student.name)
    const today = todayIso()
    return {
      'student.name': input.student.name,
      'student.first_name': names.first,
      'student.last_name': names.last,
      'student.student_id': input.student.student_code || '',
      'student.gender': input.student.gender || '',
      'student.date_of_birth': formatDisplayDate(input.student.date_of_birth),
      'student.photo': assetToDataUrl(input.student.photo_path) || DEFAULT_SAMPLE_STUDENT_PHOTO,
      'student.class': input.student.class_name || '',
      'student.stream': input.student.stream || '',
      'student.department': input.student.department_name || '',
      'student.admission_year':
        input.student.admission_year != null ? String(input.student.admission_year) : '',
      'student.type': 'STUDENT',
      'student.qr_payload': studentQrPayload(input.student.student_code || ''),
      'academic.year': input.yearName || '',
      'academic.term': input.termName || '',
      'academic.level': input.student.level_name || '',
      'academic.class': input.student.class_name || '',
      'academic.department': input.student.department_name || '',
      'school.name': school?.name || '',
      'school.short_code': school?.short_code || '',
      'school.logo': assetToDataUrl(school?.logo_path) || DEFAULT_ACADEMIC_CREST,
      'school.address': school?.address || '',
      'school.phone': school?.phone || '',
      'school.email': school?.email || '',
      'school.website': school?.website || '',
      'school.motto': settings.motto || '',
      'school.signature': assetToDataUrl(school?.principal_signature_path) || DEFAULT_SAMPLE_SIGNATURE,
      'card.number': input.card.number,
      'card.issue_date': formatDisplayDate(input.card.issue_date),
      'card.expiry_date': formatDisplayDate(input.card.expiry_date),
      'card.status': input.card.status,
      'card.verification_code': input.card.verification_code,
      'card.barcode': input.student.student_code || '',
      'card.qr_code': verificationPayload(input.card.verification_code),
      'date.today': formatDisplayDate(today),
      'date.year': today.slice(0, 4),
      'system.generated_at': formatDisplayDate(today),
    }
  }

  yearInfo(schoolId: string, yearId: string | null) {
    if (!yearId) return { name: null as string | null, end: null as string | null, term: null as string | null }
    const y = this.db
      .prepare(
        `SELECT name, end_date FROM academic_years WHERE id = ? AND school_id = ?`
      )
      .get(yearId, schoolId) as { name: string; end_date: string } | undefined
    const term = this.db
      .prepare(
        `SELECT name FROM academic_terms WHERE academic_year_id = ? ORDER BY term_number LIMIT 1`
      )
      .get(yearId) as { name: string } | undefined
    return { name: y?.name ?? null, end: y?.end_date ?? null, term: term?.name ?? null }
  }

  findActiveCard(schoolId: string, studentId: string): StudentIdCard | undefined {
    return this.db
      .prepare(
        `SELECT * FROM student_id_cards
         WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL
           AND status IN ('generated','issued','active')
         ORDER BY generated_at DESC LIMIT 1`
      )
      .get(schoolId, studentId) as StudentIdCard | undefined
  }

  generateForStudent(input: {
    school_id: string
    student_id: string
    academic_year_id: string
    userId: string | null
    regenerate?: boolean
    template_id?: string
    card_kind?: CardKind
    replacement_reason?: ReplacementReason
    replaced_card_id?: string
    job_id?: string
    missing_photo_policy?: MissingPhotoPolicy
  }): StudentIdCard {
    const student = this.studentContext(input.school_id, input.student_id)
    if (!student) throw new Error('Student not found.')
    const student_code = requireStudentCode(student.student_code)
    const template = input.template_id
      ? this.getTemplate(input.school_id, input.template_id)
      : this.ensureDefaultTemplate(input.school_id)
    if (!template) throw new Error('Template not found.')
    if (!template.current_version_id) throw new Error('Template has no saved design.')
    const kind = input.card_kind || (input.regenerate ? 'renewal' : 'new')
    const existing = this.findActiveCard(input.school_id, input.student_id)
    if (existing && kind === 'new' && !input.regenerate) {
      throw new Error('An active ID card already exists for this student. Issue a replacement instead.')
    }
    if (existing && (kind === 'replacement' || kind === 'renewal' || input.regenerate)) {
      this.db
        .prepare(
          `UPDATE student_id_cards SET status = 'replaced', updated_at = ?, version = version + 1
           WHERE id = ? AND school_id = ?`
        )
        .run(new Date().toISOString(), existing.id, input.school_id)
    }

    const settings = this.getSettings(input.school_id)
    const year = this.yearInfo(input.school_id, input.academic_year_id)
    const issueDate = todayIso()
    const expiry = computeExpiry({
      issueDate,
      mode: settings.expiry_mode,
      months: settings.expiry_months || template.validity_months,
      customDate: settings.custom_expiry_date,
      yearEnd: year.end,
    })
    const yearToken = academicYearToken(year.name)
    const seq = this.allocateSequence(input.school_id, `card:${yearToken}`)
    const card_number = formatCardNumber(settings.numbering, seq, yearToken)
    const verification_code = newVerificationCode()
    const bindings = this.buildBindings({
      schoolId: input.school_id,
      student,
      yearName: year.name,
      yearEnd: year.end,
      termName: year.term,
      card: {
        number: card_number,
        issue_date: issueDate,
        expiry_date: expiry,
        status: 'active',
        verification_code,
      },
    })
    const generated_at = new Date().toISOString()
    const record: StudentIdCard = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      student_id: student.id,
      student_code,
      academic_year_id: input.academic_year_id,
      template_id: template.id,
      template_version_id: template.current_version_id,
      class_id: student.class_id,
      class_name: student.class_name,
      student_name: student.name,
      valid_from: issueDate,
      valid_to: expiry || issueDate,
      generated_at,
      generated_by: input.userId,
      card_number,
      verification_code,
      issue_date: issueDate,
      expiry_date: expiry,
      status: 'active',
      card_kind: kind,
      replaced_card_id: existing && kind !== 'new' ? existing.id : input.replaced_card_id || null,
      replacement_reason: input.replacement_reason || null,
      printed_at: null,
      issued_at: generated_at,
      issued_by: input.userId,
      job_id: input.job_id || null,
      snapshot_json: JSON.stringify(bindings),
      revoked_at: null,
      revoked_by: null,
    }
    this.db
      .prepare(
        `INSERT INTO student_id_cards (
           id, school_id, student_id, student_code, academic_year_id, template_id, template_version_id,
           class_id, class_name, student_name, valid_from, valid_to, generated_at, generated_by,
           card_number, verification_code, issue_date, expiry_date, status, card_kind,
           replaced_card_id, replacement_reason, printed_at, issued_at, issued_by, job_id, snapshot_json,
           revoked_at, revoked_by,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @student_id, @student_code, @academic_year_id, @template_id, @template_version_id,
           @class_id, @class_name, @student_name, @valid_from, @valid_to, @generated_at, @generated_by,
           @card_number, @verification_code, @issue_date, @expiry_date, @status, @card_kind,
           @replaced_card_id, @replacement_reason, @printed_at, @issued_at, @issued_by, @job_id, @snapshot_json,
           @revoked_at, @revoked_by,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)
    enqueueSync(this.db, this.tableName, record.id, 'INSERT', record as unknown as Record<string, unknown>)
    void input.missing_photo_policy
    return record
  }

  bulkGenerate(input: {
    school_id: string
    academic_year_id: string
    student_ids?: string[]
    class_id?: string | null
    userId: string | null
  }): { created: number; skipped: number } {
    let students = this.listStudentsForCards(input.school_id, {
      class_id: input.class_id || undefined,
    })
    if (input.student_ids?.length) {
      const set = new Set(input.student_ids)
      students = students.filter((s) => set.has(s.id))
    }
    let created = 0
    let skipped = 0
    for (const s of students) {
      try {
        if (this.findActiveCard(input.school_id, s.id)) {
          skipped += 1
          continue
        }
        this.generateForStudent({
          school_id: input.school_id,
          student_id: s.id,
          academic_year_id: input.academic_year_id,
          userId: input.userId,
          card_kind: 'new',
        })
        created += 1
      } catch {
        skipped += 1
      }
    }
    return { created, skipped }
  }

  validateSelection(input: {
    school_id: string
    template_id: string
    student_ids: string[]
  }) {
    const design = this.currentDesign(input.school_id, input.template_id)
    const required = requiredBindings(design)
    const ready: Array<{ id: string; name: string }> = []
    const blocked: Array<{ id: string; name: string; missing: string[] }> = []
    const warnings: Array<{ id: string; name: string; warnings: string[] }> = []
    for (const id of input.student_ids) {
      const s = this.studentContext(input.school_id, id)
      if (!s) continue
      const v = validateStudentForCard({
        student_code: s.student_code,
        photo: s.photo_path,
        class_name: s.class_name,
        required,
      })
      if (!v.ready) blocked.push({ id: s.id, name: s.name, missing: v.missing })
      else if (v.warnings.length) warnings.push({ id: s.id, name: s.name, warnings: v.warnings })
      else ready.push({ id: s.id, name: s.name })
    }
    return { required, ready, blocked, warnings, total: input.student_ids.length }
  }

  runGenerationJob(input: {
    school_id: string
    template_id: string
    academic_year_id: string
    student_ids: string[]
    card_kind: CardKind
    replacement_reason?: ReplacementReason
    paper_size: PaperSize
    cards_per_row: number
    margin_mm: number
    gap_x_mm: number
    gap_y_mm: number
    crop_marks: boolean
    missing_photo_policy: MissingPhotoPolicy
    userId: string | null
  }) {
    const template = this.getTemplate(input.school_id, input.template_id)
    if (!template?.current_version_id) throw new Error('Template not found.')
    const year = this.yearInfo(input.school_id, input.academic_year_id)
    const jobSeq = this.allocateSequence(input.school_id, `job:${academicYearToken(year.name)}`)
    const jobId = randomUUID()
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO id_card_generation_jobs (
           id, school_id, job_number, template_id, template_version_id, academic_year_id, card_kind,
           status, total, processed, successful, failed, skipped, paper_size, cards_per_row,
           margin_mm, gap_x_mm, gap_y_mm, crop_marks, missing_photo_policy, created_by,
           created_at, updated_at, completed_at, deleted_at, sync_status, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'pending', 1)`
      )
      .run(
        jobId,
        input.school_id,
        formatJobNumber(jobSeq, academicYearToken(year.name)),
        template.id,
        template.current_version_id,
        input.academic_year_id,
        input.card_kind,
        input.student_ids.length,
        input.paper_size,
        input.cards_per_row,
        input.margin_mm,
        input.gap_x_mm,
        input.gap_y_mm,
        input.crop_marks ? 1 : 0,
        input.missing_photo_policy,
        input.userId,
        now,
        now
      )

    let successful = 0
    let failed = 0
    let skipped = 0
    const cardIds: string[] = []
    const design = this.currentDesign(input.school_id, template.id)
    const required = requiredBindings(design)

    for (const studentId of input.student_ids) {
      const itemId = randomUUID()
      const student = this.studentContext(input.school_id, studentId)
      const t = new Date().toISOString()
      try {
        if (!student) throw new Error('Student not found.')
        const check = validateStudentForCard({
          student_code: student.student_code,
          photo: student.photo_path,
          class_name: student.class_name,
          required,
        })
        if (!check.ready) throw new Error(`Missing ${check.missing.join(', ')}`)
        if (check.warnings.includes('Photo') && input.missing_photo_policy === 'skip') {
          skipped += 1
          this.db
            .prepare(
              `INSERT INTO id_card_generation_items (
                 id, school_id, job_id, student_id, card_id, status, error, warning,
                 created_at, updated_at, deleted_at, sync_status, version
               ) VALUES (?, ?, ?, ?, NULL, 'skipped', NULL, 'Missing photo', ?, ?, NULL, 'pending', 1)`
            )
            .run(itemId, input.school_id, jobId, studentId, t, t)
          continue
        }
        if (check.warnings.includes('Photo') && input.missing_photo_policy === 'cancel') {
          throw new Error('Cancelled because a photo is missing.')
        }
        const card = this.generateForStudent({
          school_id: input.school_id,
          student_id: studentId,
          academic_year_id: input.academic_year_id,
          userId: input.userId,
          template_id: template.id,
          card_kind: input.card_kind,
          replacement_reason: input.replacement_reason,
          job_id: jobId,
          missing_photo_policy: input.missing_photo_policy,
        })
        successful += 1
        cardIds.push(card.id)
        this.db
          .prepare(
            `INSERT INTO id_card_generation_items (
               id, school_id, job_id, student_id, card_id, status, error, warning,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (?, ?, ?, ?, ?, 'success', NULL, ?, ?, ?, NULL, 'pending', 1)`
          )
          .run(
            itemId,
            input.school_id,
            jobId,
            studentId,
            card.id,
            check.warnings.length ? check.warnings.join(', ') : null,
            t,
            t
          )
      } catch (err) {
        failed += 1
        this.db
          .prepare(
            `INSERT INTO id_card_generation_items (
               id, school_id, job_id, student_id, card_id, status, error, warning,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (?, ?, ?, ?, NULL, 'failed', ?, NULL, ?, ?, NULL, 'pending', 1)`
          )
          .run(
            itemId,
            input.school_id,
            jobId,
            studentId,
            err instanceof Error ? err.message : 'Failed',
            t,
            t
          )
      }
    }

    const done = new Date().toISOString()
    const status = failed && !successful ? 'failed' : 'completed'
    this.db
      .prepare(
        `UPDATE id_card_generation_jobs SET
           status = ?, processed = ?, successful = ?, failed = ?, skipped = ?,
           updated_at = ?, completed_at = ?, version = version + 1
         WHERE id = ?`
      )
      .run(
        status,
        input.student_ids.length,
        successful,
        failed,
        skipped,
        done,
        done,
        jobId
      )
    return this.getJob(input.school_id, jobId)
  }

  getJob(schoolId: string, id: string) {
    const job = this.db
      .prepare(
        `SELECT * FROM id_card_generation_jobs WHERE id = ? AND school_id = ?`
      )
      .get(id, schoolId) as Record<string, unknown> | undefined
    if (!job) return null
    const items = this.db
      .prepare(
        `SELECT i.*, s.name AS student_name
         FROM id_card_generation_items i
         LEFT JOIN students s ON s.id = i.student_id
         WHERE i.job_id = ? AND i.school_id = ?
         ORDER BY i.created_at`
      )
      .all(id, schoolId)
    return { ...job, items }
  }

  listJobs(schoolId: string, limit = 20) {
    return this.db
      .prepare(
        `SELECT j.*, t.name AS template_name, u.email AS created_by_email
         FROM id_card_generation_jobs j
         LEFT JOIN student_id_card_templates t ON t.id = j.template_id
         LEFT JOIN users u ON u.id = j.created_by
         WHERE j.school_id = ? AND j.deleted_at IS NULL
         ORDER BY j.created_at DESC LIMIT ?`
      )
      .all(schoolId, limit)
  }

  retryFailedJobItems(schoolId: string, jobId: string, userId: string | null) {
    const job = this.getJob(schoolId, jobId) as
      | { academic_year_id: string; template_id: string; card_kind: CardKind; items: Array<{ status: string; student_id: string }> }
      | null
    if (!job) throw new Error('Job not found.')
    const ids = job.items.filter((i) => i.status === 'failed').map((i) => i.student_id)
    if (!ids.length) return job
    return this.runGenerationJob({
      school_id: schoolId,
      template_id: job.template_id,
      academic_year_id: job.academic_year_id,
      student_ids: ids,
      card_kind: job.card_kind,
      paper_size: 'A4',
      cards_per_row: 2,
      margin_mm: 10,
      gap_x_mm: 4,
      gap_y_mm: 4,
      crop_marks: false,
      missing_photo_policy: 'generate_without',
      userId,
    })
  }

  list(
    schoolId: string,
    filters?: {
      academic_year_id?: string | null
      class_id?: string | null
      status?: string | null
      search?: string | null
    }
  ) {
    let sql = `
      SELECT c.*, y.name AS year_name, s.photo_path, t.name AS template_name,
             t.current_version_number AS template_version
      FROM student_id_cards c
      LEFT JOIN academic_years y ON y.id = c.academic_year_id
      LEFT JOIN students s ON s.id = c.student_id
      LEFT JOIN student_id_card_templates t ON t.id = c.template_id
      WHERE c.school_id = ? AND c.deleted_at IS NULL
    `
    const params: string[] = [schoolId]
    if (filters?.academic_year_id) {
      sql += ` AND c.academic_year_id = ?`
      params.push(filters.academic_year_id)
    }
    if (filters?.class_id) {
      sql += ` AND c.class_id = ?`
      params.push(filters.class_id)
    }
    if (filters?.status) {
      sql += ` AND c.status = ?`
      params.push(filters.status)
    }
    if (filters?.search) {
      sql += ` AND (c.student_name LIKE ? OR c.student_code LIKE ? OR c.card_number LIKE ?)`
      const q = `%${filters.search}%`
      params.push(q, q, q)
    }
    sql += ` ORDER BY c.generated_at DESC`
    const rows = this.db.prepare(sql).all(...params) as Array<
      StudentIdCard & { year_name: string | null; photo_path: string | null; template_name: string | null }
    >
    const today = todayIso()
    return rows.map((r) => ({
      ...r,
      effective_status: cardStatusForDates(r.status as 'active', r.expiry_date, today),
      photo_path: r.photo_path,
    }))
  }

  getPrintRows(schoolId: string, ids: string[]) {
    if (!ids.length) return []
    const all = this.list(schoolId)
    const set = new Set(ids)
    return all.filter((c) => set.has(c.id))
  }

  dashboard(schoolId: string) {
    const today = todayIso()
    const soon = new Date()
    soon.setDate(soon.getDate() + 30)
    const soonIso = soon.toISOString().slice(0, 10)
    const activeStudents = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM students WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'`
      )
      .get(schoolId) as { n: number }
    const issued = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM student_id_cards WHERE school_id = ? AND deleted_at IS NULL AND status IN ('generated','issued','active')`
      )
      .get(schoolId) as { n: number }
    const expired = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM student_id_cards
         WHERE school_id = ? AND deleted_at IS NULL AND status NOT IN ('revoked','replaced')
           AND expiry_date IS NOT NULL AND expiry_date < ?`
      )
      .get(schoolId, today) as { n: number }
    const expiring = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM student_id_cards
         WHERE school_id = ? AND deleted_at IS NULL AND status IN ('generated','issued','active')
           AND expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= ?`
      )
      .get(schoolId, today, soonIso) as { n: number }
    const templates = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM student_id_card_templates WHERE school_id = ? AND deleted_at IS NULL`
      )
      .get(schoolId) as { n: number }
    const pending = Math.max(0, activeStudents.n - issued.n)
    return {
      active_students: activeStudents.n,
      cards_issued: issued.n,
      pending,
      expiring_soon: expiring.n,
      expired: expired.n,
      templates: templates.n,
      recent_jobs: this.listJobs(schoolId, 8),
    }
  }

  setCardStatus(
    schoolId: string,
    id: string,
    status: 'issued' | 'revoked' | 'active',
    userId: string | null
  ) {
    const card = this.db
      .prepare(
        `SELECT * FROM student_id_cards WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .get(id, schoolId) as StudentIdCard | undefined
    if (!card) throw new Error('Card not found.')
    const now = new Date().toISOString()
    const extra =
      status === 'revoked'
        ? { revoked_at: now, revoked_by: userId }
        : status === 'issued'
          ? { issued_at: now, issued_by: userId }
          : {}
    this.db
      .prepare(
        `UPDATE student_id_cards SET status = ?, revoked_at = COALESCE(?, revoked_at),
           revoked_by = COALESCE(?, revoked_by), issued_at = COALESCE(?, issued_at),
           issued_by = COALESCE(?, issued_by), updated_at = ?, version = version + 1
         WHERE id = ? AND school_id = ?`
      )
      .run(
        status,
        extra.revoked_at ?? null,
        extra.revoked_by ?? null,
        extra.issued_at ?? null,
        extra.issued_by ?? null,
        now,
        id,
        schoolId
      )
    return this.db
      .prepare(`SELECT * FROM student_id_cards WHERE id = ?`)
      .get(id) as StudentIdCard
  }

  markPrinted(schoolId: string, ids: string[], userId: string | null, layout: {
    paper_size: string
    cards_per_row: number
  }) {
    const now = new Date().toISOString()
    const tx = this.db.transaction(() => {
      for (const id of ids) {
        this.db
          .prepare(
            `UPDATE student_id_cards SET printed_at = ?, updated_at = ?, version = version + 1
             WHERE id = ? AND school_id = ?`
          )
          .run(now, now, id, schoolId)
      }
      const hid = randomUUID()
      this.db
        .prepare(
          `INSERT INTO id_card_print_history (
             id, school_id, job_id, card_ids_json, paper_size, cards_per_row, card_count,
             printed_at, printed_by, created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', 1)`
        )
        .run(
          hid,
          schoolId,
          JSON.stringify(ids),
          layout.paper_size,
          layout.cards_per_row,
          ids.length,
          now,
          userId,
          now,
          now
        )
      enqueueSync(this.db, 'id_card_print_history', hid, 'INSERT', { id: hid })
    })
    tx()
  }

  printHistory(schoolId: string) {
    return this.db
      .prepare(
        `SELECT h.*, u.email AS printed_by_email
         FROM id_card_print_history h
         LEFT JOIN users u ON u.id = h.printed_by
         WHERE h.school_id = ? AND h.deleted_at IS NULL
         ORDER BY h.printed_at DESC LIMIT 100`
      )
      .all(schoolId)
  }

  renderPayload(schoolId: string, cardIds: string[]) {
    const school = this.db
      .prepare(`SELECT * FROM schools WHERE id = ?`)
      .get(schoolId) as {
      name: string
      short_code: string
      phone: string | null
      address: string | null
      logo_path: string | null
      website: string | null
      email: string
      principal_signature_path: string | null
    }
    const logo = assetToDataUrl(school?.logo_path)
    const signature = assetToDataUrl(school?.principal_signature_path)
    const cards = this.getPrintRows(schoolId, cardIds).map((card) => {
      const version = card.template_version_id
        ? this.getVersion(schoolId, card.template_version_id)
        : null
      const design = parseDesign(version?.design_json)
      const student = this.studentContext(schoolId, card.student_id)
      const stored = card.snapshot_json ? (JSON.parse(card.snapshot_json) as BindingMap) : {}
      const bindings: BindingMap = {
        ...sampleBindings(),
        ...stored,
        'school.logo': logo || stored['school.logo'] || DEFAULT_ACADEMIC_CREST,
        'student.photo': student ? assetToDataUrl(student.photo_path) || stored['student.photo'] || DEFAULT_SAMPLE_STUDENT_PHOTO : stored['student.photo'] || DEFAULT_SAMPLE_STUDENT_PHOTO,
      }
      const resolved = design.elements.map((el) => {
        const text = el.text ? interpolate(el.text, bindings) : ''
        const qrValue = interpolate(el.qrBinding || '{{card.qr_code}}', bindings)
        const barValue = interpolate(el.barcodeBinding || '{{student.student_id}}', bindings)
        let image = ''
        if (el.imageBinding === 'student.photo') image = bindings['student.photo']
        else if (el.imageBinding === 'school.logo') image = bindings['school.logo']
        else if (el.imageBinding === 'school.signature') image = signature || DEFAULT_SAMPLE_SIGNATURE
        else if (el.imageSrc) image = assetToDataUrl(el.imageSrc) || el.imageSrc
        return {
          ...el,
          resolvedText: text,
          resolvedImage: image,
          qrSvg: el.type === 'qr' ? qrSvg(qrValue, 128) : '',
          barcodeSvg: el.type === 'barcode' ? code128Svg(barValue, 160, 48) : '',
        }
      })
      return {
        ...card,
        design: { ...design, elements: resolved },
        photo_url: bindings['student.photo'] || null,
      }
    })
    return {
      school: {
        name: school?.name ?? '',
        short_code: school?.short_code ?? '',
        phone: school?.phone ?? '',
        address: school?.address ?? '',
        logo_url: logo,
        website: school?.website ?? '',
      },
      cards,
    }
  }

  previewStudent(
    schoolId: string,
    templateId: string,
    studentId: string | null,
    academicYearId: string | null
  ) {
    const design = this.currentDesign(schoolId, templateId)
    const school = this.db
      .prepare(`SELECT * FROM schools WHERE id = ?`)
      .get(schoolId) as {
      logo_path: string | null
      principal_signature_path: string | null
    }
    let bindings = sampleBindings()
    bindings['school.logo'] = assetToDataUrl(school?.logo_path) || ''
    if (studentId) {
      const student = this.studentContext(schoolId, studentId)
      if (student) {
        const year = this.yearInfo(schoolId, academicYearId)
        bindings = this.buildBindings({
          schoolId,
          student,
          yearName: year.name,
          yearEnd: year.end,
          termName: year.term,
          card: {
            number: 'PREVIEW',
            issue_date: todayIso(),
            expiry_date: year.end,
            status: 'preview',
            verification_code: 'ID-PREVIEW',
          },
        })
        bindings['school.logo'] = assetToDataUrl(school?.logo_path) || ''
        bindings['student.photo'] = assetToDataUrl(student.photo_path) || ''
      }
    }
    const signature = assetToDataUrl(school?.principal_signature_path)
    const elements = design.elements.map((el) => {
      const text = el.text ? interpolate(el.text, bindings) : ''
      const qrValue = interpolate(el.qrBinding || '{{card.qr_code}}', bindings)
      const barValue = interpolate(el.barcodeBinding || '{{student.student_id}}', bindings)
      let image = el.imageSrc || ''
      if (el.imageBinding === 'student.photo') image = bindings['student.photo']
      if (el.imageBinding === 'school.logo') image = bindings['school.logo']
      if (el.imageBinding === 'school.signature') image = signature || ''
      return {
        ...el,
        resolvedText: text,
        resolvedImage: image,
        qrSvg: el.type === 'qr' ? qrSvg(qrValue, 128) : '',
        barcodeSvg: el.type === 'barcode' ? code128Svg(barValue, 160, 48) : '',
      }
    })
    return { design: { ...design, elements }, bindings }
  }
}
