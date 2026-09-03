import { ipcMain } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import { daysPastDue } from '../domain/finance'
import type {
  ExpenseCategory,
  FeeFrequency,
  InvoiceStatus,
  LateFeeMode,
  PaymentMethod,
} from '../db/types'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function requireSession(): SessionData | null {
  return getSession()
}

function canManage(role: string): boolean {
  return role === 'admin' || role === 'secretary'
}

function canView(role: string): boolean {
  return canManage(role) || role === 'teacher'
}

function schoolId(repos: Repositories, session: SessionData): string {
  return session.schoolId || repos.schools.findLatest()?.id || ''
}

export function registerFinanceMgmtIpc(repos: Repositories): void {
  const fm = () => repos.financeMgmt

  ipcMain.handle('finance-mgmt:meta', (): Result<{
    can_manage: boolean
    currency: string
    payment_methods: string[]
    categories: Array<{ id: string; name: string; category_key: string }>
    levels: Array<{ id: string; name: string }>
    classes: Array<{ id: string; name: string; academic_level_id: string | null }>
    years: Array<{ id: string; name: string; is_current: number }>
    terms: Array<{ id: string; name: string; academic_year_id: string }>
    students: Array<{
      id: string
      name: string
      student_code: string | null
      class_id: string
      class_name: string | null
      academic_level_id: string | null
      residence_type: string
    }>
  }> => {
    const session = requireSession()
    if (!session) return { ok: false, error: 'Not signed in.' }
    if (!canView(session.role)) return { ok: false, error: 'Access denied.' }
    const sid = schoolId(repos, session)
    if (!sid) return { ok: false, error: 'No school found.' }

    repos.finance.ensureDefaults(sid)
    const settings = fm().getSettings(sid)
    let methods: string[] = []
    try {
      methods = JSON.parse(settings.payment_methods) as string[]
    } catch {
      methods = ['cash']
    }
    if (!methods.includes('card')) methods = [...methods, 'card']

    const classes = repos.classes.findBySchool(sid)
    const students = repos.students.findBySchool(sid, 'active').map((s) => ({
      id: s.id,
      name: s.name,
      student_code: s.student_code,
      class_id: s.class_id,
      class_name: classes.find((c) => c.id === s.class_id)?.name ?? null,
      academic_level_id: s.academic_level_id,
      residence_type: s.residence_type || 'day',
    }))

    const years = repos.academicYears
      .findAll()
      .filter((y) => y.school_id === sid)
    const terms = years.flatMap((y) =>
      repos.academicYears.findTerms(y.id).map((t) => ({
        id: t.id,
        name: t.name,
        academic_year_id: y.id,
      }))
    )

    return {
      ok: true,
      data: {
        can_manage: canManage(session.role),
        currency: settings.currency,
        payment_methods: methods,
        categories: repos.finance
          .getSetupDto(
            sid,
            repos.academicLevels.findBySchool(sid).map((l) => ({
              id: l.id,
              name: l.name,
            }))
          )
          .categories.filter((c) => c.is_active)
          .map((c) => ({
            id: c.id,
            name: c.name,
            category_key: c.category_key,
          })),
        levels: repos.academicLevels.findBySchool(sid).map((l) => ({
          id: l.id,
          name: l.name,
        })),
        classes: classes.map((c) => ({
          id: c.id,
          name: c.name,
          academic_level_id: c.academic_level_id,
        })),
        years: years.map((y) => ({
          id: y.id,
          name: y.name,
          is_current: y.is_current,
        })),
        terms,
        students,
      },
    }
  })

  /* Structures */
  ipcMain.handle('finance-mgmt:structures-list', (): Result<unknown> => {
    const session = requireSession()
    if (!session || !canView(session.role)) {
      return { ok: false, error: 'Access denied.' }
    }
    const sid = schoolId(repos, session)
    const years = new Map(
      repos.academicYears
        .findAll()
        .filter((y) => y.school_id === sid)
        .map((y) => [y.id, y.name])
    )
    const levels = new Map(
      repos.academicLevels.findBySchool(sid).map((l) => [l.id, l.name])
    )
    const classes = new Map(
      repos.classes.findBySchool(sid).map((c) => [c.id, c.name])
    )
    const rows = fm().listStructures(sid).map((s) => ({
      ...s,
      year_name: years.get(s.academic_year_id) ?? null,
      level_name: s.academic_level_id
        ? levels.get(s.academic_level_id) ?? null
        : null,
      class_name: s.class_id ? classes.get(s.class_id) ?? null : null,
      lines: fm().getStructureLines(s.id),
      total: fm()
        .getStructureLines(s.id)
        .reduce((sum, l) => sum + l.amount, 0),
    }))
    return { ok: true, data: rows }
  })

  ipcMain.handle(
    'finance-mgmt:structures-create',
    (
      _e,
      input: {
        name: string
        academic_year_id: string
        academic_term_id?: string | null
        academic_level_id?: string | null
        class_id?: string | null
        notes?: string | null
        applies_to_residence?: 'all' | 'day' | 'boarding'
        lines: Array<{
          fee_category_id?: string | null
          name: string
          amount: number
          frequency?: FeeFrequency
          is_mandatory?: boolean
          late_fee_mode?: LateFeeMode
          late_fee_value?: number
        }>
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Only finance officers can manage structures.' }
      }
      const sid = schoolId(repos, session)
      try {
        const s = fm().createStructure({ ...input, school_id: sid })
        fm().audit(sid, 'structure.create', 'fee_structure', s.id, session.userId)
        return {
          ok: true,
          data: { ...s, lines: fm().getStructureLines(s.id) },
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not create structure.',
        }
      }
    }
  )

  ipcMain.handle(
    'finance-mgmt:structures-set-active',
    (_e, input: { id: string; is_active: boolean }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const updated = fm().setStructureActive(input.id, input.is_active)
      if (!updated) return { ok: false, error: 'Structure not found.' }
      return { ok: true, data: updated }
    }
  )

  ipcMain.handle(
    'finance-mgmt:structures-delete',
    (_e, input: { id: string }): Result<{ id: string }> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      fm().deleteStructure(input.id)
      return { ok: true, data: { id: input.id } }
    }
  )

  ipcMain.handle(
    'finance-mgmt:discounts-list',
    (): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      return {
        ok: true,
        data: fm().listDiscounts(schoolId(repos, session)),
      }
    }
  )

  ipcMain.handle(
    'finance-mgmt:discounts-create',
    (
      _e,
      input: {
        name: string
        discount_mode: 'percent' | 'fixed'
        discount_value: number
        academic_year_id?: string | null
        notes?: string | null
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        return {
          ok: true,
          data: fm().createDiscount({
            ...input,
            school_id: schoolId(repos, session),
          }),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not create discount.',
        }
      }
    }
  )

  /* Billing */
  ipcMain.handle(
    'finance-mgmt:invoices-list',
    (
      _e,
      input?: {
        status?: InvoiceStatus | 'all'
        studentId?: string | null
        search?: string | null
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const sid = schoolId(repos, session)
      fm().refreshOverdue(sid)
      const students = new Map(
        repos.students.findBySchool(sid, 'all').map((s) => [s.id, s])
      )
      const classes = new Map(
        repos.classes.findBySchool(sid).map((c) => [c.id, c.name])
      )
      let rows = fm().listInvoices(sid, input).map((inv) => {
        const st = students.get(inv.student_id)
        return {
          ...inv,
          student_name: st?.name ?? '—',
          student_code: st?.student_code ?? null,
          class_name: st ? classes.get(st.class_id) ?? null : null,
        }
      })
      const q = input?.search?.trim().toLowerCase()
      if (q) {
        rows = rows.filter(
          (r) =>
            r.invoice_number.toLowerCase().includes(q) ||
            r.student_name.toLowerCase().includes(q) ||
            (r.student_code || '').toLowerCase().includes(q)
        )
      }
      return { ok: true, data: rows }
    }
  )

  ipcMain.handle(
    'finance-mgmt:invoices-get',
    (_e, input: { id: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const inv = fm().getInvoice(input.id)
      if (!inv) return { ok: false, error: 'Invoice not found.' }
      const student = repos.students.findById(inv.student_id)
      return {
        ok: true,
        data: {
          ...inv,
          student_name: student?.name ?? '—',
          student_code: student?.student_code ?? null,
          lines: fm().getInvoiceLines(inv.id),
          credit_balance: fm().studentCreditTotal(inv.school_id, inv.student_id),
        },
      }
    }
  )

  ipcMain.handle(
    'finance-mgmt:invoices-generate',
    (
      _e,
      input: {
        student_id: string
        fee_structure_id: string
        due_date?: string | null
        billing_period?: string | null
        notes?: string | null
        carry_arrears?: boolean
        discount_mode?: 'percent' | 'fixed' | null
        discount_value?: number
        extra_lines?: Array<{ description: string; amount: number }>
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const sid = schoolId(repos, session)
      try {
        const inv = fm().generateInvoice({
          ...input,
          school_id: sid,
          userId: session.userId,
        })
        return {
          ok: true,
          data: { ...inv, lines: fm().getInvoiceLines(inv.id) },
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not generate invoice.',
        }
      }
    }
  )

  ipcMain.handle(
    'finance-mgmt:invoices-bulk-generate',
    (
      _e,
      input: {
        fee_structure_id: string
        class_id?: string | null
        due_date?: string | null
        carry_arrears?: boolean
      }
    ): Result<{ created: number; skipped: number }> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const sid = schoolId(repos, session)
      const structure = fm()
        .listStructures(sid)
        .find((s) => s.id === input.fee_structure_id)
      if (!structure) return { ok: false, error: 'Structure not found.' }

      let students = repos.students.findBySchool(sid, 'active')
      if (input.class_id) {
        students = students.filter((s) => s.class_id === input.class_id)
      } else if (structure.class_id) {
        students = students.filter((s) => s.class_id === structure.class_id)
      } else if (structure.academic_level_id) {
        students = students.filter(
          (s) => s.academic_level_id === structure.academic_level_id
        )
      }

      let created = 0
      let skipped = 0
      for (const st of students) {
        try {
          fm().generateInvoice({
            school_id: sid,
            student_id: st.id,
            fee_structure_id: input.fee_structure_id,
            due_date: input.due_date,
            carry_arrears: input.carry_arrears,
            userId: session.userId,
          })
          created += 1
        } catch {
          skipped += 1
        }
      }
      return { ok: true, data: { created, skipped } }
    }
  )

  ipcMain.handle(
    'finance-mgmt:invoices-adjust',
    (
      _e,
      input: {
        id: string
        lines: Array<{ description: string; amount: number }>
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const inv = fm().adjustInvoice(input.id, input.lines, session.userId)
        return {
          ok: true,
          data: { ...inv, lines: fm().getInvoiceLines(inv.id) },
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not adjust invoice.',
        }
      }
    }
  )

  /* Payments */
  ipcMain.handle(
    'finance-mgmt:payments-list',
    (_e, input?: { studentId?: string | null }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const sid = schoolId(repos, session)
      const students = new Map(
        repos.students.findBySchool(sid, 'all').map((s) => [s.id, s.name])
      )
      const rows = fm()
        .listPayments(sid, input?.studentId)
        .map((p) => ({
          ...p,
          student_name: students.get(p.student_id) ?? '—',
          invoice_number: fm().getInvoice(p.invoice_id)?.invoice_number ?? null,
        }))
      return { ok: true, data: rows }
    }
  )

  ipcMain.handle(
    'finance-mgmt:payments-record',
    (
      _e,
      input: {
        invoice_id: string
        amount: number
        method: PaymentMethod
        reference?: string | null
        paid_at?: string | null
        notes?: string | null
        use_credit?: boolean
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const result = fm().recordPayment({
          ...input,
          school_id: schoolId(repos, session),
          userId: session.userId,
        })
        return { ok: true, data: result }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not record payment.',
        }
      }
    }
  )

  /* Receipts */
  ipcMain.handle('finance-mgmt:receipts-list', (): Result<unknown> => {
    const session = requireSession()
    if (!session || !canView(session.role)) {
      return { ok: false, error: 'Access denied.' }
    }
    const sid = schoolId(repos, session)
    const students = new Map(
      repos.students.findBySchool(sid, 'all').map((s) => [s.id, s])
    )
    const payments = new Map(
      fm().listPayments(sid).map((p) => [p.id, p])
    )
    const rows = fm().listReceipts(sid).map((r) => {
      const st = students.get(r.student_id)
      const pay = payments.get(r.payment_id)
      return {
        ...r,
        student_name: st?.name ?? '—',
        student_code: st?.student_code ?? null,
        payment_number: pay?.payment_number ?? null,
        method: pay?.method ?? null,
      }
    })
    return { ok: true, data: rows }
  })

  ipcMain.handle(
    'finance-mgmt:receipts-get',
    (_e, input: { id: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const receipt = fm().getReceipt(input.id)
      if (!receipt) return { ok: false, error: 'Receipt not found.' }
      const student = repos.students.findById(receipt.student_id)
      const payment = fm()
        .listPayments(receipt.school_id)
        .find((p) => p.id === receipt.payment_id)
      const invoice = payment ? fm().getInvoice(payment.invoice_id) : null
      const school = repos.schools.findById(receipt.school_id)
      const template = repos.documentTemplates
        .listBySchool(receipt.school_id)
        .find((t) => t.template_key === 'receipt' || t.document_family === 'receipt')
      let rendered_html: string | null = null
      let print_css: string | null = null
      try {
        const rendered = repos.documents.renderReceipt(
          receipt.school_id,
          receipt.payment_id
        )
        rendered_html = rendered.html
        print_css = rendered.css
      } catch {
        rendered_html = null
      }
      return {
        ok: true,
        data: {
          receipt,
          student,
          payment,
          invoice,
          school_name: school?.name ?? 'School',
          template,
          rendered_html,
          print_css,
        },
      }
    }
  )

  ipcMain.handle(
    'finance-mgmt:receipts-reprint',
    (_e, input: { id: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        return {
          ok: true,
          data: fm().reprintReceipt(input.id, session.userId),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not reprint.',
        }
      }
    }
  )

  /* Outstanding */
  ipcMain.handle(
    'finance-mgmt:outstanding',
    (
      _e,
      input?: { classId?: string | null; groupBy?: 'student' | 'class' }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const sid = schoolId(repos, session)
      fm().refreshOverdue(sid)
      const invoices = fm()
        .listInvoices(sid)
        .filter((i) => i.balance > 0 && i.status !== 'cancelled')
      const students = new Map(
        repos.students.findBySchool(sid, 'all').map((s) => [s.id, s])
      )
      const classes = new Map(
        repos.classes.findBySchool(sid).map((c) => [c.id, c.name])
      )

      const byStudent = new Map<
        string,
        {
          student_id: string
          student_name: string
          student_code: string | null
          class_id: string | null
          class_name: string | null
          total_billed: number
          total_paid: number
          outstanding: number
          aging_current: number
          aging_30: number
          aging_60: number
          invoice_ids: string[]
        }
      >()

      for (const inv of invoices) {
        const st = students.get(inv.student_id)
        if (!st) continue
        if (input?.classId && st.class_id !== input.classId) continue
        const key = st.id
        const row = byStudent.get(key) || {
          student_id: st.id,
          student_name: st.name,
          student_code: st.student_code,
          class_id: st.class_id,
          class_name: classes.get(st.class_id) ?? null,
          total_billed: 0,
          total_paid: 0,
          outstanding: 0,
          aging_current: 0,
          aging_30: 0,
          aging_60: 0,
          invoice_ids: [] as string[],
        }
        row.total_billed += inv.net_payable
        row.total_paid += inv.amount_paid
        row.outstanding += inv.balance
        row.invoice_ids.push(inv.id)
        const age = daysPastDue(inv.due_date)
        if (age <= 0) row.aging_current += inv.balance
        else if (age <= 30) row.aging_30 += inv.balance
        else row.aging_60 += inv.balance
        byStudent.set(key, row)
      }

      const studentsRows = Array.from(byStudent.values())
      if (input?.groupBy === 'class') {
        const byClass = new Map<
          string,
          {
            class_id: string | null
            class_name: string | null
            students: number
            outstanding: number
            aging_current: number
            aging_30: number
            aging_60: number
          }
        >()
        for (const r of studentsRows) {
          const key = r.class_id || 'none'
          const row = byClass.get(key) || {
            class_id: r.class_id,
            class_name: r.class_name,
            students: 0,
            outstanding: 0,
            aging_current: 0,
            aging_30: 0,
            aging_60: 0,
          }
          row.students += 1
          row.outstanding += r.outstanding
          row.aging_current += r.aging_current
          row.aging_30 += r.aging_30
          row.aging_60 += r.aging_60
          byClass.set(key, row)
        }
        return {
          ok: true,
          data: { mode: 'class', rows: Array.from(byClass.values()) },
        }
      }
      return {
        ok: true,
        data: { mode: 'student', rows: studentsRows },
      }
    }
  )

  ipcMain.handle(
    'finance-mgmt:reminders-send',
    (
      _e,
      input: { student_ids: string[]; message?: string | null }
    ): Result<{ sent: number }> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const sid = schoolId(repos, session)
      let sent = 0
      for (const student_id of input.student_ids ?? []) {
        fm().createReminder({
          school_id: sid,
          student_id,
          message:
            input.message ||
            'Fee reminder: please settle outstanding school fees.',
          userId: session.userId,
        })
        repos.communicationMgmt.queueFeeReminderDeliveries({
          school_id: sid,
          student_id,
          message:
            input.message ||
            'Fee reminder: please settle outstanding school fees.',
          created_by: session.userId,
        })
        sent += 1
      }
      return { ok: true, data: { sent } }
    }
  )

  /* Expenses */
  ipcMain.handle(
    'finance-mgmt:expenses-list',
    (
      _e,
      input?: { from?: string | null; to?: string | null }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      return {
        ok: true,
        data: fm().listExpenses(
          schoolId(repos, session),
          input?.from,
          input?.to
        ),
      }
    }
  )

  ipcMain.handle(
    'finance-mgmt:expenses-create',
    (
      _e,
      input: {
        category: ExpenseCategory
        amount: number
        expense_date: string
        description?: string | null
        vendor?: string | null
        payment_method?: string | null
        is_recurring?: boolean
        recurring_interval?: string | null
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const expense = fm().createExpense({
          ...input,
          school_id: schoolId(repos, session),
          userId: session.userId,
        })
        const alerts = repos.budgets.applyExpense({
          school_id: schoolId(repos, session),
          category: input.category,
          amount: input.amount,
          expense_date: input.expense_date,
        })
        for (const alert of alerts) {
          const admins = repos.users
            .findAll()
            .filter(
              (u) =>
                u.school_id === schoolId(repos, session) &&
                (u.role === 'admin' || u.role === 'secretary')
            )
          for (const u of admins) {
            repos.staffNotifications.create({
              school_id: schoolId(repos, session),
              user_id: u.id,
              title: `Budget ${alert.level}`,
              body: alert.message,
              link: '/finance/budgeting',
            })
          }
        }
        return { ok: true, data: expense }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not create expense.',
        }
      }
    }
  )

  /* Reports */
  ipcMain.handle(
    'finance-mgmt:reports',
    (
      _e,
      input?: { from?: string | null; to?: string | null }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const sid = schoolId(repos, session)
      const from = input?.from || '1970-01-01'
      const to = input?.to || '2999-12-31'

      const invoices = fm()
        .listInvoices(sid)
        .filter((i) => i.issue_date >= from && i.issue_date <= to)
      const payments = fm()
        .listPayments(sid)
        .filter((p) => p.paid_at >= from && p.paid_at <= to)
      const expenses = fm().listExpenses(sid, from, to)

      const revenue = invoices
        .filter((i) => i.status !== 'cancelled')
        .reduce((s, i) => s + i.net_payable, 0)
      const collected = payments.reduce((s, p) => s + p.amount, 0)
      const outstanding = fm()
        .listInvoices(sid)
        .filter((i) => i.balance > 0 && i.status !== 'cancelled')
        .reduce((s, i) => s + i.balance, 0)
      const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)

      const byMethod: Record<string, number> = {}
      for (const p of payments) {
        byMethod[p.method] = (byMethod[p.method] || 0) + p.amount
      }
      const byExpenseCategory: Record<string, number> = {}
      for (const e of expenses) {
        byExpenseCategory[e.category] =
          (byExpenseCategory[e.category] || 0) + e.amount
      }

      return {
        ok: true,
        data: {
          from,
          to,
          revenue,
          collected,
          outstanding,
          expenses: expenseTotal,
          profit_loss: collected - expenseTotal,
          payment_by_method: byMethod,
          expense_by_category: byExpenseCategory,
          invoice_count: invoices.length,
          payment_count: payments.length,
        },
      }
    }
  )

  ipcMain.handle(
    'finance-mgmt:student-summary',
    (_e, input: { student_id: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const sid = schoolId(repos, session)
      const invoices = fm()
        .listInvoices(sid, { studentId: input.student_id })
      const payments = fm().listPayments(sid, input.student_id)
      return {
        ok: true,
        data: {
          invoices,
          payments,
          credit_balance: fm().studentCreditTotal(sid, input.student_id),
          outstanding: invoices
            .filter((i) => i.balance > 0)
            .reduce((s, i) => s + i.balance, 0),
        },
      }
    }
  )
}
