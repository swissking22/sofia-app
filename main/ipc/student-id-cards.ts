import { ipcMain } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import {
  hasIdCardPermission,
  parseDesign,
  printLayout,
  VARIABLE_CATALOG,
  type CardDesign,
  type CardKind,
  type IdCardSettingsShape,
  type MissingPhotoPolicy,
  type PaperSize,
  type ReplacementReason,
} from '../domain/id-card'
import { wizardDesign } from '../domain/id-card-templates'
import { saveSchoolAsset } from '../helpers/school-assets'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function session(): SessionData | null {
  return getSession()
}

function sid(repos: Repositories, s: SessionData): string {
  return s.schoolId || repos.schools.findLatest()?.id || ''
}

function perms(repos: Repositories, s: SessionData): string[] {
  try {
    return repos.roles.getPermissionNamesForUser(s.userId)
  } catch {
    return []
  }
}

function allow(repos: Repositories, s: SessionData, names: string[]): boolean {
  const list = perms(repos, s)
  if (list.includes('students.id_cards.manage') && names.some((n) => n.startsWith('students.id_cards.'))) {
    return hasIdCardPermission(list, names, s.role === 'admin')
  }
  return hasIdCardPermission(list, names, s.role === 'admin')
}

function wrap<T>(fn: () => T, fallback: string): Result<T> {
  try {
    return { ok: true, data: fn() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : fallback }
  }
}

function audit(
  repos: Repositories,
  s: SessionData,
  schoolId: string,
  action: string,
  entityId: string,
  description: string,
  before?: unknown,
  after?: unknown
): void {
  try {
    repos.systemAdmin.writeAudit({
      school_id: schoolId,
      actor_user_id: s.userId,
      action,
      module_key: 'id_cards',
      entity_type: 'id_card',
      entity_id: entityId,
      description,
      before,
      after,
    })
  } catch {
    /* optional on older DBs */
  }
}

export function registerStudentIdCardsIpc(repos: Repositories): void {
  const cards = () => repos.studentIdCards

  ipcMain.handle('students:id-cards-meta', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['students.id_cards.view'])) {
      return { ok: false, error: 'Access denied.' }
    }
    const schoolId = sid(repos, s)
    const school = repos.schools.findById(schoolId)
    const years = repos.academicYears.findAll().filter((y) => y.school_id === schoolId)
    const classes = repos.classes.findBySchool(schoolId)
    const names = perms(repos, s)
    const isAdmin = s.role === 'admin'
    cards().ensureSampleTemplates(schoolId, s.userId)
    const students = cards()
      .listStudentsForCards(schoolId)
      .map((st) => ({
        id: st.id,
        name: st.name,
        student_code: st.student_code,
        class_id: st.class_id,
        class_name: st.class_name,
        department_name: st.department_name,
        stream: st.stream,
        status: st.status,
        photo_url: null as string | null,
      }))
    return {
      ok: true,
      data: {
        can_manage: allow(repos, s, ['students.id_cards.manage', 'students.id_cards.edit_template']),
        can_generate: allow(repos, s, ['students.id_cards.generate']),
        can_print: allow(repos, s, ['students.id_cards.print', 'students.id_cards.generate']),
        can_issue: allow(repos, s, ['students.id_cards.issue', 'students.id_cards.generate']),
        can_replace: allow(repos, s, ['students.id_cards.replace', 'students.id_cards.generate']),
        can_revoke: allow(repos, s, ['students.id_cards.revoke', 'students.id_cards.manage']),
        can_settings: allow(repos, s, ['students.id_cards.manage_settings', 'students.id_cards.manage']),
        variables: VARIABLE_CATALOG,
        school: {
          name: school?.name ?? '',
          short_code: school?.short_code ?? '',
          phone: school?.phone ?? '',
          address: school?.address ?? '',
          email: school?.email ?? '',
          website: school?.website ?? '',
          logo_url: null,
        },
        years: years.map((y) => ({ id: y.id, name: y.name, is_current: y.is_current })),
        classes: classes.map((c) => ({
          id: c.id,
          name: c.name,
          stream: c.stream,
          section_id: c.section_id,
        })),
        students,
        permissions: names,
        is_admin: isAdmin,
      },
    }
  })

  ipcMain.handle('id-cards:dashboard', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['students.id_cards.view'])) {
      return { ok: false, error: 'Access denied.' }
    }
    const schoolId = sid(repos, s)
    cards().ensureSampleTemplates(schoolId, s.userId)
    return wrap(() => cards().dashboard(schoolId), 'Could not load dashboard.')
  })

  ipcMain.handle('id-cards:templates-list', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['students.id_cards.view'])) {
      return { ok: false, error: 'Access denied.' }
    }
    const schoolId = sid(repos, s)
    cards().ensureSampleTemplates(schoolId, s.userId)
    return wrap(() => {
      const list = cards().listTemplates(schoolId).map((t) => ({
        ...t,
        design: cards().currentDesign(schoolId, t.id),
      }))
      return { templates: list }
    }, 'Could not list templates.')
  })

  ipcMain.handle(
    'id-cards:template-get',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.view'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        const tpl = cards().getTemplate(schoolId, input.id)
        if (!tpl) throw new Error('Template not found.')
        return { template: tpl, design: cards().currentDesign(schoolId, tpl.id) }
      }, 'Could not load template.')
    }
  )

  ipcMain.handle(
    'id-cards:template-save',
    (
      _e,
      input: {
        id?: string
        name: string
        description?: string
        card_type?: 'student' | 'staff'
        status?: 'draft' | 'active' | 'archived'
        design: CardDesign
      }
    ): Result<unknown> => {
      const s = session()
      if (
        !s ||
        !allow(repos, s, [
          'students.id_cards.manage',
          'students.id_cards.create_template',
          'students.id_cards.edit_template',
        ])
      ) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        if (input.id) {
          const updated = cards().saveTemplate({
            school_id: schoolId,
            id: input.id,
            name: input.name,
            description: input.description,
            status: input.status,
            design: input.design,
            userId: s.userId,
          })
          audit(repos, s, schoolId, 'id_card.template.edited', updated.id, `Edited template ${updated.name}`)
          return updated
        }
        const created = cards().createTemplate({
          school_id: schoolId,
          name: input.name,
          description: input.description || '',
          card_type: input.card_type || 'student',
          design: input.design,
          status: input.status || 'draft',
          is_default: 0,
          sample_key: null,
          userId: s.userId,
        })
        audit(repos, s, schoolId, 'id_card.template.created', created.id, `Created template ${created.name}`)
        return created
      }, 'Could not save template.')
    }
  )

  ipcMain.handle(
    'id-cards:template-wizard',
    (
      _e,
      input: {
        name: string
        card_type: 'student' | 'staff'
        orientation: 'landscape' | 'portrait'
        starting: 'blank' | 'classic' | 'modern' | 'minimal' | 'branding'
        fields: string[]
      }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.manage', 'students.id_cards.create_template'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        const design = wizardDesign({
          orientation: input.orientation,
          starting: input.starting,
          fields: input.fields,
        })
        const created = cards().createTemplate({
          school_id: schoolId,
          name: input.name,
          description: 'Created from the template wizard',
          card_type: input.card_type,
          design,
          status: 'draft',
          is_default: 0,
          sample_key: null,
          userId: s.userId,
        })
        audit(repos, s, schoolId, 'id_card.template.created', created.id, `Wizard created ${created.name}`)
        return created
      }, 'Could not create template.')
    }
  )

  ipcMain.handle(
    'id-cards:template-action',
    (
      _e,
      input: { id: string; action: 'duplicate' | 'use' | 'activate' | 'archive' | 'delete' | 'rename'; name?: string }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.manage', 'students.id_cards.edit_template'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        if (input.action === 'use') {
          const created = cards().useTemplate(schoolId, input.id, s.userId)
          audit(repos, s, schoolId, 'id_card.template.created', created.id, `Created school template ${created.name} from template ${input.id}`)
          return created
        }
        if (input.action === 'duplicate') {
          const d = cards().duplicateTemplate(schoolId, input.id, s.userId)
          audit(repos, s, schoolId, 'id_card.template.created', d.id, `Duplicated template`)
          return d
        }
        if (input.action === 'delete') {
          if (!allow(repos, s, ['students.id_cards.manage', 'students.id_cards.delete_template'])) {
            throw new Error('Access denied.')
          }
          cards().deleteTemplate(schoolId, input.id)
          audit(repos, s, schoolId, 'id_card.template.deleted', input.id, 'Deleted ID card template')
          return { ok: true }
        }
        const status =
          input.action === 'activate' ? 'active' : input.action === 'archive' ? 'archived' : undefined
        const updated = cards().saveTemplate({
          school_id: schoolId,
          id: input.id,
          name: input.name,
          status,
          userId: s.userId,
        })
        audit(
          repos,
          s,
          schoolId,
          input.action === 'activate' ? 'id_card.template.activated' : 'id_card.template.archived',
          updated.id,
          `${input.action} ${updated.name}`
        )
        return updated
      }, 'Template action failed.')
    }
  )

  ipcMain.handle(
    'id-cards:preview',
    (
      _e,
      input: { template_id: string; student_id?: string | null; academic_year_id?: string | null; sample?: boolean }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.view'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(
        () =>
          cards().previewStudent(
            schoolId,
            input.template_id,
            input.sample ? null : input.student_id || null,
            input.academic_year_id || null
          ),
        'Preview failed.'
      )
    }
  )

  ipcMain.handle(
    'id-cards:validate',
    (_e, input: { template_id: string; student_ids: string[] }): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.generate'])) {
        return { ok: false, error: 'Access denied.' }
      }
      return wrap(
        () => cards().validateSelection({ school_id: sid(repos, s), ...input }),
        'Validation failed.'
      )
    }
  )

  ipcMain.handle(
    'id-cards:generate-job',
    (
      _e,
      input: {
        template_id: string
        academic_year_id: string
        student_ids: string[]
        card_kind: CardKind
        replacement_reason?: ReplacementReason
        paper_size?: PaperSize
        cards_per_row?: number
        margin_mm?: number
        gap_x_mm?: number
        gap_y_mm?: number
        crop_marks?: boolean
        missing_photo_policy?: MissingPhotoPolicy
      }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.generate'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        const job = cards().runGenerationJob({
          school_id: schoolId,
          template_id: input.template_id,
          academic_year_id: input.academic_year_id,
          student_ids: input.student_ids,
          card_kind: input.card_kind || 'new',
          replacement_reason: input.replacement_reason,
          paper_size: input.paper_size || 'A4',
          cards_per_row: input.cards_per_row || 2,
          margin_mm: input.margin_mm ?? 10,
          gap_x_mm: input.gap_x_mm ?? 4,
          gap_y_mm: input.gap_y_mm ?? 4,
          crop_marks: Boolean(input.crop_marks),
          missing_photo_policy: input.missing_photo_policy || 'generate_without',
          userId: s.userId,
        })
        audit(
          repos,
          s,
          schoolId,
          'id_card.generated',
          String((job as { id?: string })?.id || ''),
          `Generated ${(job as { successful?: number })?.successful || 0} cards`
        )
        return job
      }, 'Generation failed.')
    }
  )

  ipcMain.handle('id-cards:job-get', (_e, input: { id: string }): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['students.id_cards.view'])) {
      return { ok: false, error: 'Access denied.' }
    }
    return wrap(() => cards().getJob(sid(repos, s), input.id), 'Job not found.')
  })

  ipcMain.handle('id-cards:job-retry', (_e, input: { id: string }): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['students.id_cards.generate'])) {
      return { ok: false, error: 'Access denied.' }
    }
    return wrap(
      () => cards().retryFailedJobItems(sid(repos, s), input.id, s.userId),
      'Retry failed.'
    )
  })

  ipcMain.handle(
    'id-cards:issued-list',
    (
      _e,
      input?: { academic_year_id?: string; class_id?: string; status?: string; search?: string }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.view'])) {
        return { ok: false, error: 'Access denied.' }
      }
      return wrap(
        () => ({ cards: cards().list(sid(repos, s), input) }),
        'Could not list cards.'
      )
    }
  )

  ipcMain.handle(
    'id-cards:card-status',
    (_e, input: { id: string; status: 'issued' | 'revoked' | 'active' }): Result<unknown> => {
      const s = session()
      const needed =
        input.status === 'revoked'
          ? ['students.id_cards.revoke', 'students.id_cards.manage']
          : ['students.id_cards.issue', 'students.id_cards.generate']
      if (!s || !allow(repos, s, needed)) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        const card = cards().setCardStatus(schoolId, input.id, input.status, s.userId)
        audit(
          repos,
          s,
          schoolId,
          input.status === 'revoked' ? 'id_card.revoked' : 'id_card.issued',
          card.id,
          `${input.status} card ${card.card_number}`
        )
        return card
      }, 'Could not update card.')
    }
  )

  ipcMain.handle(
    'id-cards:replace',
    (
      _e,
      input: {
        student_id: string
        academic_year_id: string
        template_id: string
        reason: ReplacementReason
      }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.replace', 'students.id_cards.generate'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        const card = cards().generateForStudent({
          school_id: schoolId,
          student_id: input.student_id,
          academic_year_id: input.academic_year_id,
          template_id: input.template_id,
          userId: s.userId,
          card_kind: 'replacement',
          replacement_reason: input.reason,
        })
        audit(repos, s, schoolId, 'id_card.replaced', card.id, `Replacement ${card.card_number}`)
        return card
      }, 'Replacement failed.')
    }
  )

  ipcMain.handle('id-cards:settings-get', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['students.id_cards.view'])) {
      return { ok: false, error: 'Access denied.' }
    }
    return wrap(() => cards().getSettings(sid(repos, s)), 'Could not load settings.')
  })

  ipcMain.handle(
    'id-cards:settings-save',
    (_e, input: Partial<IdCardSettingsShape>): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.manage_settings', 'students.id_cards.manage'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        const next = cards().saveSettings(schoolId, input)
        audit(repos, s, schoolId, 'id_card.settings', schoolId, 'Updated ID card settings')
        return next
      }, 'Could not save settings.')
    }
  )

  ipcMain.handle('id-cards:print-history', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['students.id_cards.view'])) {
      return { ok: false, error: 'Access denied.' }
    }
    return wrap(() => ({ rows: cards().printHistory(sid(repos, s)) }), 'Could not load print history.')
  })

  ipcMain.handle(
    'id-cards:print-layout',
    (
      _e,
      input: {
        template_id: string
        paper_size: PaperSize
        cards_per_row?: number
        margin_mm?: number
        gap_x_mm?: number
        gap_y_mm?: number
      }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.view'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const design = parseDesign(
        JSON.stringify(cards().currentDesign(sid(repos, s), input.template_id))
      )
      return wrap(
        () =>
          printLayout({
            cardW: design.widthMm,
            cardH: design.heightMm,
            paper: input.paper_size,
            marginMm: input.margin_mm ?? 10,
            gapX: input.gap_x_mm ?? 4,
            gapY: input.gap_y_mm ?? 4,
            cardsPerRow: input.cards_per_row,
          }),
        'Layout failed.'
      )
    }
  )

  ipcMain.handle(
    'id-cards:upload-asset',
    (_e, input: { data_url: string; mime?: string }): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.edit_template', 'students.id_cards.manage'])) {
        return { ok: false, error: 'Access denied.' }
      }
      return wrap(() => {
        const path = saveSchoolAsset('logo', input.data_url, input.mime || 'image/png')
        return { path }
      }, 'Upload failed.')
    }
  )

  ipcMain.handle('students:id-cards-list', (_e, input?: { academic_year_id?: string; class_id?: string }) => {
    const s = session()
    if (!s || !allow(repos, s, ['students.id_cards.view'])) {
      return { ok: false, error: 'Access denied.' }
    }
    return { ok: true, data: { cards: cards().list(sid(repos, s), input) } }
  })

  ipcMain.handle(
    'students:id-cards-generate',
    (
      _e,
      input: { student_id: string; academic_year_id: string; regenerate?: boolean; template_id?: string }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.generate'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        const card = cards().generateForStudent({
          school_id: schoolId,
          student_id: input.student_id,
          academic_year_id: input.academic_year_id,
          userId: s.userId,
          regenerate: input.regenerate,
          template_id: input.template_id,
          card_kind: input.regenerate ? 'renewal' : 'new',
        })
        audit(repos, s, schoolId, 'id_card.generated', card.id, `Generated card for ${card.student_name}`)
        return card
      }, 'Could not generate card.')
    }
  )

  ipcMain.handle(
    'students:id-cards-bulk',
    (
      _e,
      input: { academic_year_id: string; class_id?: string | null; student_ids?: string[] }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['students.id_cards.generate'])) {
        return { ok: false, error: 'Access denied.' }
      }
      return wrap(
        () =>
          cards().bulkGenerate({
            school_id: sid(repos, s),
            academic_year_id: input.academic_year_id,
            class_id: input.class_id,
            student_ids: input.student_ids,
            userId: s.userId,
          }),
        'Bulk generate failed.'
      )
    }
  )

  ipcMain.handle('students:id-cards-print', (_e, input: { ids: string[]; mark?: boolean }): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['students.id_cards.view', 'students.id_cards.print'])) {
      return { ok: false, error: 'Access denied.' }
    }
    const schoolId = sid(repos, s)
    return wrap(() => {
      const payload = cards().renderPayload(schoolId, input.ids || [])
      if (input.mark && allow(repos, s, ['students.id_cards.print', 'students.id_cards.generate'])) {
        cards().markPrinted(schoolId, input.ids, s.userId, { paper_size: 'A4', cards_per_row: 2 })
        audit(repos, s, schoolId, 'id_card.printed', input.ids[0] || '', `Printed ${input.ids.length} cards`)
      }
      return payload
    }, 'Could not load print data.')
  })
}
