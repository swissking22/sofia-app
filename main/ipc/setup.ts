import { ipcMain } from 'electron'
import type { Repositories } from '../db/repositories'
import { SETUP_STEPS, type SetupStepId } from '../setup/steps'

export interface SetupProgressStep {
  id: SetupStepId
  title: string
  description: string
  href: string
  order: number
  status: 'pending' | 'draft' | 'skipped' | 'completed'
  done: boolean
}

export interface SetupProgress {
  steps: SetupProgressStep[]
  completed: number
  total: number
  isComplete: boolean
  nextHref: string
}

export type SetupMutationResult =
  | { ok: true; progress: SetupProgress }
  | { ok: false; error: string }

function buildProgress(repos: Repositories): SetupProgress {
  repos.setupSteps.ensureAllSteps()
  const records = repos.setupSteps.findAll()
  const byId = new Map(records.map((r) => [r.id, r]))

  const steps: SetupProgressStep[] = SETUP_STEPS.map((def) => {
    const record = byId.get(def.id)
    const status = record?.status ?? 'pending'
    return {
      ...def,
      status,
      done: status === 'completed',
    }
  })

  const completed = steps.filter((s) => s.done).length
  const total = steps.length
  const next = steps.find((s) => !s.done) ?? steps[0]

  return {
    steps,
    completed,
    total,
    isComplete: completed === total,
    nextHref: next?.href ?? '/setup/school-profile',
  }
}

function isSetupStepId(value: string): value is SetupStepId {
  return SETUP_STEPS.some((s) => s.id === value)
}

export function getSetupProgress(repos: Repositories): SetupProgress {
  return buildProgress(repos)
}

export function registerSetupIpc(repos: Repositories): void {
  ipcMain.handle('setup:get-progress', (): SetupProgress => buildProgress(repos))

  ipcMain.handle(
    'setup:save-draft',
    (
      _event,
      input: { stepId: string; draftData?: string | null }
    ): SetupMutationResult => {
      if (!input?.stepId || !isSetupStepId(input.stepId)) {
        return { ok: false, error: 'Invalid setup step.' }
      }
      try {
        repos.setupSteps.saveDraft(input.stepId, input.draftData)
        return { ok: true, progress: buildProgress(repos) }
      } catch {
        return { ok: false, error: 'Could not save draft.' }
      }
    }
  )

  ipcMain.handle(
    'setup:complete-step',
    (_event, input: { stepId: string }): SetupMutationResult => {
      if (!input?.stepId || !isSetupStepId(input.stepId)) {
        return { ok: false, error: 'Invalid setup step.' }
      }
      try {
        repos.setupSteps.completeStep(input.stepId)
        return { ok: true, progress: buildProgress(repos) }
      } catch {
        return { ok: false, error: 'Could not complete step.' }
      }
    }
  )

  ipcMain.handle(
    'setup:skip-step',
    (_event, input: { stepId: string }): SetupMutationResult => {
      if (!input?.stepId || !isSetupStepId(input.stepId)) {
        return { ok: false, error: 'Invalid setup step.' }
      }
      try {
        repos.setupSteps.skipStep(input.stepId)
        return { ok: true, progress: buildProgress(repos) }
      } catch {
        return { ok: false, error: 'Could not skip step.' }
      }
    }
  )
}
