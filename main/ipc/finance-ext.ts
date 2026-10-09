import { ipcMain } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import type { BudgetPeriodType, BudgetStatus } from '../db/types'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function requireSession(): SessionData | null {
  return getSession()
}

function canManage(role: string): boolean {
  return role === 'admin' || role === 'secretary' || role === 'bursar'
}

function canView(role: string): boolean {
  return canManage(role) || role === 'teacher' || role === 'principal'
}

function schoolId(repos: Repositories, session: SessionData): string {
  return session.schoolId || repos.schools.findLatest()?.id || ''
}

export function registerFinanceExtIpc(repos: Repositories): void {
  ipcMain.handle('finance-ext:budget-meta', (): Result<unknown> => {
    const session = requireSession()
    if (!session || !canView(session.role)) {
      return { ok: false, error: 'Access denied.' }
    }
    const sid = schoolId(repos, session)
    let settings: {
      currency: string
      budget_alert_pct?: number
      budget_warning_pct?: number
      budget_critical_pct?: number
      require_full_deposit_reconciliation?: number
    } = { currency: 'XAF' }
    try {
      settings = repos.financeMgmt.getSettings(sid)
    } catch {
      /* finance setup may still be incomplete */
    }
    const years = repos.academicYears
      .findAll()
      .filter((y) => y.school_id === sid)
    const terms = years.flatMap((y) =>
      repos.academicYears.findTerms(y.id).map((t) => ({
        id: t.id,
        name: t.name,
        academic_year_id: y.id,
        start_date: t.start_date,
        end_date: t.end_date,
      }))
    )
    return {
      ok: true,
      data: {
        can_manage: canManage(session.role),
        currency: settings.currency,
        thresholds: {
          alert: settings.budget_alert_pct ?? 70,
          warning: settings.budget_warning_pct ?? 85,
          critical: settings.budget_critical_pct ?? 100,
        },
        require_full_deposit_reconciliation:
          (settings.require_full_deposit_reconciliation ?? 1) === 1,
        categories: repos.budgets.listCategories(sid),
        years: years.map((y) => ({
          id: y.id,
          name: y.name,
          is_current: y.is_current,
          start_date: y.start_date,
          end_date: y.end_date,
        })),
        terms,
      },
    }
  })

  ipcMain.handle(
    'finance-ext:budgets-list',
    (_e, input?: { academic_year_id?: string | null }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const sid = schoolId(repos, session)
      const rows = repos.budgets.list(sid, input?.academic_year_id)
      const allocated = rows.reduce((s, r) => s + r.allocated_amount, 0)
      const spent = rows.reduce((s, r) => s + r.spent, 0)
      return {
        ok: true,
        data: {
          rows,
          totals: {
            allocated,
            spent,
            remaining: allocated - spent,
            utilization: allocated > 0 ? Math.round((spent / allocated) * 1000) / 10 : 0,
          },
        },
      }
    }
  )

  ipcMain.handle(
    'finance-ext:budgets-create',
    (
      _e,
      input: {
        academic_year_id: string
        budget_category_id: string
        period_type: BudgetPeriodType
        period_start: string
        period_end: string
        allocated_amount: number
        description?: string | null
        status?: BudgetStatus
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const row = repos.budgets.create({
          ...input,
          school_id: schoolId(repos, session),
          created_by: session.userId,
        })
        repos.financeMgmt.audit(
          schoolId(repos, session),
          'budget.create',
          'budget',
          row.id,
          session.userId,
          { allocated_amount: input.allocated_amount }
        )
        return { ok: true, data: row }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not create budget.',
        }
      }
    }
  )

  ipcMain.handle(
    'finance-ext:budget-categories-create',
    (_e, input: { name: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        return {
          ok: true,
          data: repos.budgets.createCategory({
            school_id: schoolId(repos, session),
            name: input.name,
          }),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not add category.',
        }
      }
    }
  )

  ipcMain.handle(
    'finance-ext:budget-thresholds-save',
    (
      _e,
      input: { alert: number; warning: number; critical: number }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      repos.budgets.saveThresholds(schoolId(repos, session), input)
      return { ok: true, data: input }
    }
  )

  /* Online payments */
  ipcMain.handle('finance-ext:online-list', (): Result<unknown> => {
    const session = requireSession()
    if (!session || !canView(session.role)) {
      return { ok: false, error: 'Access denied.' }
    }
    return {
      ok: true,
      data: { transactions: repos.onlinePayments.list(schoolId(repos, session)) },
    }
  })

  ipcMain.handle(
    'finance-ext:online-initiate',
    (
      _e,
      input: { invoice_id: string; amount: number; idempotency_key?: string }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const sid = schoolId(repos, session)
        const settings = repos.financeMgmt.getSettings(sid)
        const txn = repos.onlinePayments.initiate({
          school_id: sid,
          invoice_id: input.invoice_id,
          amount: input.amount,
          currency: settings.currency || 'XAF',
          userId: session.userId,
          idempotency_key: input.idempotency_key ?? null,
        })
        repos.financeMgmt.audit(
          sid,
          'online_payment.initiate',
          'online_payment',
          txn.id,
          session.userId,
          { amount: txn.amount, status: txn.status }
        )
        return { ok: true, data: txn }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not start payment.',
        }
      }
    }
  )

  ipcMain.handle(
    'finance-ext:online-complete',
    (
      _e,
      input: { id: string; status: 'successful' | 'failed' | 'cancelled' }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const sid = schoolId(repos, session)
        const txn = repos.onlinePayments.complete(
          input.id,
          sid,
          input.status,
          session.userId
        )
        repos.financeMgmt.audit(
          sid,
          `online_payment.${input.status}`,
          'online_payment',
          txn.id,
          session.userId,
          { payment_id: txn.payment_id, status: txn.status }
        )
        return { ok: true, data: txn }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not complete payment.',
        }
      }
    }
  )

  /* Bank deposits */
  ipcMain.handle('finance-ext:deposits-list', (): Result<unknown> => {
    const session = requireSession()
    if (!session || !canView(session.role)) {
      return { ok: false, error: 'Access denied.' }
    }
    return {
      ok: true,
      data: { deposits: repos.bankDeposits.list(schoolId(repos, session)) },
    }
  })

  ipcMain.handle(
    'finance-ext:deposits-create',
    (
      _e,
      input: {
        amount: number
        collection_source?: string | null
        collection_date?: string | null
        deposit_date: string
        bank_name: string
        bank_account?: string | null
        deposit_reference?: string | null
        deposited_by?: string | null
        notes?: string | null
        document_path?: string | null
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        return {
          ok: true,
          data: repos.bankDeposits.create({
            ...input,
            school_id: schoolId(repos, session),
            created_by: session.userId,
          }),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not record deposit.',
        }
      }
    }
  )

  ipcMain.handle(
    'finance-ext:deposits-update',
    (
      _e,
      input: {
        id: string
        amount?: number
        collection_source?: string | null
        collection_date?: string | null
        deposit_date?: string
        bank_name?: string
        bank_account?: string | null
        deposit_reference?: string | null
        deposited_by?: string | null
        notes?: string | null
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const { id, ...patch } = input
        return {
          ok: true,
          data: repos.bankDeposits.updatePending(
            id,
            schoolId(repos, session),
            patch,
            session.userId
          ),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not update deposit.',
        }
      }
    }
  )

  ipcMain.handle(
    'finance-ext:deposits-reconcile',
    (
      _e,
      input: {
        id: string
        items: Array<{ payment_id: string; amount: number }>
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        return {
          ok: true,
          data: repos.bankDeposits.reconcile(
            input.id,
            schoolId(repos, session),
            input.items,
            session.userId
          ),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not reconcile.',
        }
      }
    }
  )

  ipcMain.handle(
    'finance-ext:deposits-verify',
    (_e, input: { id: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        return {
          ok: true,
          data: repos.bankDeposits.verify(
            input.id,
            schoolId(repos, session),
            session.userId
          ),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not verify deposit.',
        }
      }
    }
  )

  ipcMain.handle(
    'finance-ext:deposits-post',
    (_e, input: { id: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        return {
          ok: true,
          data: repos.bankDeposits.post(
            input.id,
            schoolId(repos, session),
            session.userId
          ),
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not post deposit.',
        }
      }
    }
  )

  ipcMain.handle('finance-ext:cash-collections', (): Result<unknown> => {
    const session = requireSession()
    if (!session || !canView(session.role)) {
      return { ok: false, error: 'Access denied.' }
    }
    const sid = schoolId(repos, session)
    const payments = repos.financeMgmt
      .listPayments(sid)
      .filter((p) => p.method === 'cash')
    return { ok: true, data: { payments } }
  })
}
