import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type {
  FinanceSaveInput,
  FinanceSetupDto,
} from '../db/repositories/finance.repository'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  return repos.schools.findLatest()?.id ?? null
}

function loadLevels(repos: Repositories, schoolId: string) {
  return repos.academicLevels.ensureDefaults(schoolId).map((l) => ({
    id: l.id,
    name: l.name,
  }))
}

export function registerFinanceIpc(repos: Repositories): void {
  ipcMain.handle('finance:get-setup', (): Result<FinanceSetupDto> => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) {
      return { ok: false, error: 'No school found. Complete registration first.' }
    }
    const levels = loadLevels(repos, schoolId)
    return {
      ok: true,
      data: repos.finance.getSetupDto(schoolId, levels),
    }
  })

  ipcMain.handle(
    'finance:save-setup',
    (_e, input: FinanceSaveInput): Result<FinanceSetupDto> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      try {
        const levels = loadLevels(repos, schoolId)
        return {
          ok: true,
          data: repos.finance.saveSetup(schoolId, input, levels),
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not save finance settings.',
        }
      }
    }
  )
}
