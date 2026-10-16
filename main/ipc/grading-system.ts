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
    (
      _e,
      input: GradingSystemSetupInput & { apply_minesec_preset?: boolean }
    ): SaveResult => {
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
        if (input.apply_minesec_preset) {
          const session = getSession()
          repos.resultCalc.applyMinesecPreset(schoolId, session?.userId ?? null)
        }
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

  ipcMain.handle('grading-system:apply-minesec-preset', (): SaveResult => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) {
      return { ok: false, error: 'No school found. Complete registration first.' }
    }
    try {
      const session = getSession()
      repos.resultCalc.applyMinesecPreset(schoolId, session?.userId ?? null)
      const minesecTypes = [
        { id: null as string | null, name: 'Sequence 1', weight_percent: 50 },
        { id: null, name: 'Sequence 2', weight_percent: 50 },
      ]
      const minesecBands = [
        { id: null as string | null, grade: 'A', min_score: 16, max_score: 20 },
        { id: null, grade: 'B', min_score: 14, max_score: 15.99 },
        { id: null, grade: 'C', min_score: 12, max_score: 13.99 },
        { id: null, grade: 'D', min_score: 10, max_score: 11.99 },
        { id: null, grade: 'E', min_score: 8, max_score: 9.99 },
        { id: null, grade: 'F', min_score: 0, max_score: 7.99 },
      ]
      const existing = repos.gradingSystems.getSetupDto(schoolId)
      const setup = repos.gradingSystems.saveSetup(schoolId, {
        enable_ranking: existing?.enable_ranking ?? true,
        show_class_average: existing?.show_class_average ?? true,
        show_teacher_remarks: existing?.show_teacher_remarks ?? true,
        assessment_types: minesecTypes,
        grade_bands: minesecBands,
      })
      return { ok: true, setup }
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Could not apply MINESEC grading preset.',
      }
    }
  })
}
