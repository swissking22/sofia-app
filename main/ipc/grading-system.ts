import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import {
  defaultGradingSetup,
  type GradingSystemSetupDto,
  type GradingSystemSetupInput,
} from '../db/repositories/grading-system.repository'

type GetResult =
  | { ok: true; setup: GradingSystemSetupDto }
  | { ok: false; error: string }

type SaveResult =
  | { ok: true; setup: GradingSystemSetupDto }
  | { ok: false; error: string }

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  return repos.schools.findLatest()?.id ?? null
}

export function registerGradingSystemIpc(repos: Repositories): void {
  ipcMain.handle('grading-system:get', (): GetResult => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) {
      return { ok: false, error: 'No school found. Complete registration first.' }
    }

    const existing = repos.gradingSystems.getSetupDto(schoolId)
    if (existing) return { ok: true, setup: existing }
    return { ok: true, setup: defaultGradingSetup(schoolId) }
  })

  ipcMain.handle(
    'grading-system:save',
    (_e, input: GradingSystemSetupInput): SaveResult => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) {
        return {
          ok: false,
          error: 'No school found. Complete registration first.',
        }
      }

      try {
        const setup = repos.gradingSystems.saveSetup(schoolId, {
          enable_ranking: Boolean(input.enable_ranking),
          show_class_average: Boolean(input.show_class_average),
          show_teacher_remarks: Boolean(input.show_teacher_remarks),
          assessment_types: (input.assessment_types ?? []).map((t) => ({
            id: t.id || null,
            name: t.name ?? '',
            weight_percent: Number(t.weight_percent),
          })),
          grade_bands: (input.grade_bands ?? []).map((b) => ({
            id: b.id || null,
            grade: b.grade ?? '',
            min_score: Number(b.min_score),
            max_score: Number(b.max_score),
          })),
        })
        return { ok: true, setup }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not save grading system.',
        }
      }
    }
  )
}
