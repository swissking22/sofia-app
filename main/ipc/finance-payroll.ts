import { ipcMain } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import type { PayslipStatus } from '../db/types'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function requireSession(): SessionData | null {
  return getSession()
}

function schoolId(repos: Repositories, session: SessionData): string {
  return session.schoolId || repos.schools.findLatest()?.id || ''
}

function canView(role: string): boolean {
  return ['admin', 'bursar', 'secretary', 'principal', 'teacher'].includes(role)
}

function canManage(role: string): boolean {
  return ['admin', 'bursar', 'secretary'].includes(role)
}

export function registerFinancePayrollIpc(repos: Repositories): void {
  ipcMain.handle(
    'finance-payroll:salaries-get',
    (
      _e,
      input: { staff_id: string }
    ): Result<{ amount: number; currency: string; effective_from: string } | null> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const sid = schoolId(repos, session)
      const term = repos.payroll.currentSalary(sid, input.staff_id)
      if (!term) return { ok: true, data: null }
      return {
        ok: true,
        data: {
          amount: term.amount,
          currency: term.currency,
          effective_from: term.effective_from,
        },
      }
    }
  )

  ipcMain.handle(
    'finance-payroll:salaries-set',
    (
      _e,
      input: {
        staff_id: string
        amount: number
        effective_from?: string
        notes?: string | null
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const term = repos.payroll.setMonthlySalary({
          school_id: schoolId(repos, session),
          staff_id: input.staff_id,
          amount: Number(input.amount),
          effective_from: input.effective_from,
          notes: input.notes,
        })
        return { ok: true, data: term }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not save salary.',
        }
      }
    }
  )

  ipcMain.handle(
    'finance-payroll:payslips-list',
    (
      _e,
      input?: {
        year?: number | null
        month?: number | null
        status?: PayslipStatus | 'all' | null
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const sid = schoolId(repos, session)
      repos.finance.ensureDefaults(sid)
      return {
        ok: true,
        data: repos.payroll.listPayslips(sid, {
          year: input?.year || undefined,
          month: input?.month || undefined,
          status: input?.status || 'all',
        }),
      }
    }
  )

  ipcMain.handle(
    'finance-payroll:payslips-get',
    (_e, input: { id: string }): Result<unknown> => {
      const session = requireSession()
      if (!session || !canView(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      const row = repos.payroll.getPayslip(
        schoolId(repos, session),
        input.id
      )
      if (!row) return { ok: false, error: 'Payslip not found.' }
      return { ok: true, data: row }
    }
  )

  ipcMain.handle(
    'finance-payroll:payslips-generate',
    (
      _e,
      input: { year: number; month: number; issue_date?: string }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const sid = schoolId(repos, session)
        repos.finance.ensureDefaults(sid)
        const result = repos.payroll.generateMonth({
          school_id: sid,
          year: Number(input.year),
          month: Number(input.month),
          issue_date: input.issue_date,
          userId: session.userId,
        })
        return { ok: true, data: result }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not generate payslips.',
        }
      }
    }
  )

  ipcMain.handle(
    'finance-payroll:payslips-mark-paid',
    (
      _e,
      input: {
        id: string
        payment_method?: string | null
        paid_at?: string
      }
    ): Result<unknown> => {
      const session = requireSession()
      if (!session || !canManage(session.role)) {
        return { ok: false, error: 'Access denied.' }
      }
      try {
        const sid = schoolId(repos, session)
        const result = repos.payroll.markPaid({
          school_id: sid,
          payslip_id: input.id,
          payment_method: input.payment_method,
          paid_at: input.paid_at,
          userId: session.userId,
        })
        // Trace into salaries budget when configured
        const alerts = repos.budgets.applyExpense({
          school_id: sid,
          category: 'salaries',
          amount: result.payslip.net_amount,
          expense_date: result.payslip.paid_at || result.payslip.issue_date,
        })
        for (const alert of alerts) {
          const admins = repos.users
            .findAll()
            .filter(
              (u) =>
                u.school_id === sid &&
                (u.role === 'admin' || u.role === 'secretary')
            )
          for (const u of admins) {
            repos.staffNotifications.create({
              school_id: sid,
              user_id: u.id,
              title: `Budget ${alert.level}`,
              body: alert.message,
              link: '/finance/budgeting',
            })
          }
        }
        return { ok: true, data: result }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not mark payslip paid.',
        }
      }
    }
  )
}
