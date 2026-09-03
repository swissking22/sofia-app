import { ipcMain } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import {
  canActivateProfile,
  demoStandard4060,
  emptyDraftConfig,
  hasPermission,
  profileLabel,
  type CalculationConfig,
} from '../domain/results-calculation'
import { calculateClass, previewSubject } from '../services/results/calculation-engine'
import { mapComponentInputs } from '../domain/results-calculation'

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
  return hasPermission(perms(repos, s), names, s.role === 'admin')
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
      module_key: 'results',
      entity_type: 'result_calculation_profile',
      entity_id: entityId,
      description,
      before,
      after,
    })
  } catch {
    /* audit table may be missing in very old DBs */
  }
}

export function registerResultsCalculationIpc(repos: Repositories): void {
  ipcMain.handle('results-calc:list', (): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['results.calculation.view', 'results.read'])) {
      return { ok: false, error: 'Access denied.' }
    }
    const schoolId = sid(repos, s)
    return wrap(() => {
      repos.resultCalc.ensureDemo(schoolId, s.userId)
      return repos.resultCalc.list(schoolId)
    }, 'Could not load calculation profiles.')
  })

  ipcMain.handle('results-calc:get', (_e, input: { id: string }): Result<unknown> => {
    const s = session()
    if (!s || !allow(repos, s, ['results.calculation.view', 'results.read'])) {
      return { ok: false, error: 'Access denied.' }
    }
    const schoolId = sid(repos, s)
    const dto = repos.resultCalc.get(schoolId, input.id)
    if (!dto) return { ok: false, error: 'Profile not found.' }
    return { ok: true, data: dto }
  })

  ipcMain.handle(
    'results-calc:create',
    (
      _e,
      input: {
        name: string
        description?: string
        academic_year_id?: string | null
        period_mode?: 'term' | 'annual'
        config?: CalculationConfig
        assignments?: Array<{
          class_id: string | null
          academic_level_id: string | null
          department_id: string | null
          allow_overlap: number
        }>
      }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['results.calculation.create'])) {
        return { ok: false, error: 'Access denied.' }
      }
      if (!input?.name?.trim()) return { ok: false, error: 'Name is required.' }
      const schoolId = sid(repos, s)
      return wrap(() => {
        const dto = repos.resultCalc.create({
          school_id: schoolId,
          name: input.name,
          description: input.description,
          academic_year_id: input.academic_year_id,
          period_mode: input.period_mode,
          created_by: s.userId,
          config: input.config ?? emptyDraftConfig(),
          assignments: input.assignments,
        })
        audit(repos, s, schoolId, 'results.calculation.create', dto.profile.id, 'Created calculation profile', null, dto)
        return dto
      }, 'Could not create profile.')
    }
  )

  ipcMain.handle(
    'results-calc:save',
    (
      _e,
      input: {
        id: string
        name: string
        description?: string
        academic_year_id?: string | null
        period_mode?: 'term' | 'annual'
        config: CalculationConfig
        assignments?: Array<{
          class_id: string | null
          academic_level_id: string | null
          department_id: string | null
          allow_overlap: number
        }>
        create_new_version?: boolean
      }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['results.calculation.edit'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        const before = repos.resultCalc.get(schoolId, input.id)
        const dto = repos.resultCalc.save({
          school_id: schoolId,
          id: input.id,
          name: input.name,
          description: input.description,
          academic_year_id: input.academic_year_id,
          period_mode: input.period_mode,
          config: input.config,
          assignments: input.assignments,
          create_new_version: input.create_new_version,
          updated_by: s.userId,
        })
        audit(repos, s, schoolId, 'results.calculation.edit', input.id, 'Updated calculation profile', before, dto)
        return dto
      }, 'Could not save profile.')
    }
  )

  ipcMain.handle(
    'results-calc:activate',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['results.calculation.activate'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        const dto = repos.resultCalc.get(schoolId, input.id)
        if (!dto) throw new Error('Profile not found.')
        const check = canActivateProfile(dto.config)
        if (!check.ok) throw new Error(check.errors[0])
        const overlap = repos.resultCalc.overlappingActive(
          schoolId,
          dto.profile.id,
          dto.assignments
        )
        if (overlap.length) {
          throw new Error(
            `Another active profile already applies to the same class or level (${overlap.join(', ')}). Allow overlap on the assignment, or archive the other profile first.`
          )
        }
        const next = repos.resultCalc.setStatus(schoolId, input.id, 'active')
        audit(repos, s, schoolId, 'results.calculation.activate', input.id, 'Activated calculation profile')
        return next
      }, 'Could not activate profile.')
    }
  )

  ipcMain.handle(
    'results-calc:archive',
    (_e, input: { id: string }): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['results.calculation.edit', 'results.calculation.activate'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        const next = repos.resultCalc.setStatus(schoolId, input.id, 'archived')
        audit(repos, s, schoolId, 'results.calculation.archive', input.id, 'Archived calculation profile')
        return next
      }, 'Could not archive profile.')
    }
  )

  ipcMain.handle('results-calc:defaults', (): Result<unknown> => {
    const s = session()
    if (!s) return { ok: false, error: 'Access denied.' }
    return { ok: true, data: { config: demoStandard4060() } }
  })

  ipcMain.handle(
    'results-calc:preview',
    (
      _e,
      input: {
        profile_id?: string
        config?: CalculationConfig
        class_id?: string
        subject_id?: string
        student_id?: string
        scores?: Array<{ componentId: string; raw: number | null; max?: number; status?: string }>
      }
    ): Result<unknown> => {
      const s = session()
      if (!s || !allow(repos, s, ['results.calculation.test', 'results.calculation.view'])) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        let config = input.config
        if (!config && input.profile_id) {
          const dto = repos.resultCalc.get(schoolId, input.profile_id)
          if (!dto) throw new Error('Profile not found.')
          config = dto.config
        }
        if (!config) throw new Error('No calculation profile selected.')
        let scores = input.scores ?? []
        if (input.class_id && input.subject_id && input.student_id) {
          const ca = repos.ca
            .findScoresForClassTerm(input.class_id, null)
            .filter((a) => a.subject_id === input.subject_id)
            .map((a) => {
              const row = a.scores.find((x) => x.student_id === input.student_id)
              return {
                name: a.name,
                max: a.max_score,
                score: row?.score ?? null,
                status: (row?.score_status as never) ?? undefined,
              }
            })
          const papers = repos.exams.findPapersByClass(input.class_id, null)
          const paper = papers.find((p) => p.subject_id === input.subject_id)
          let exam = null
          if (paper) {
            const row = repos.exams
              .findScores(paper.id)
              .find((x) => x.student_id === input.student_id)
            exam = {
              name: 'Exam',
              max: paper.max_score,
              score: row?.score ?? null,
              status: (row?.score_status as never) ?? undefined,
            }
          }
          scores = mapComponentInputs(config.components, ca, exam)
        }
        return previewSubject(config, scores, input.subject_id ?? null)
      }, 'Could not preview calculation.')
    }
  )

  ipcMain.handle('results-calc:meta', (): Result<unknown> => {
    const s = session()
    if (!s) return { ok: false, error: 'Access denied.' }
    const schoolId = sid(repos, s)
    const year = repos.academicYears.getSetupDto(schoolId)
    return {
      ok: true,
      data: {
        classes: repos.classes.findBySchool(schoolId).map((c) => ({
          id: c.id,
          name: c.name,
          academic_level_id: c.academic_level_id,
        })),
        levels: repos.academicLevels.findBySchool(schoolId).map((l) => ({
          id: l.id,
          name: l.name,
        })),
        departments: repos.departments.findBySchool(schoolId).map((d) => ({
          id: d.id,
          name: d.name,
        })),
        subjects: repos.subjects.findBySchool(schoolId).map((sub) => ({
          id: sub.id,
          name: sub.name,
        })),
        students: repos.students.findBySchool(schoolId).map((st) => ({
          id: st.id,
          name: st.name,
          class_id: st.class_id,
        })),
        academic_year: year ? { id: year.id, name: year.name } : null,
      },
    }
  })

  ipcMain.handle(
    'results-calc:label',
    (_e, input: { id: string }): Result<string> => {
      const s = session()
      if (!s) return { ok: false, error: 'Access denied.' }
      const schoolId = sid(repos, s)
      const dto = repos.resultCalc.get(schoolId, input.id)
      if (!dto) return { ok: false, error: 'Profile not found.' }
      const year = repos.academicYears.getSetupDto(schoolId)
      return {
        ok: true,
        data: profileLabel(dto.profile.name, year?.name ?? null, dto.version_number),
      }
    }
  )
}

export function collectClassScores(
  repos: Repositories,
  classId: string,
  termId: string | null,
  students: Array<{ id: string }>,
  subjects: Array<{ id: string }>
) {
  const caAssessments = repos.ca.findScoresForClassTerm(classId, termId)
  const examPapers = repos.exams.findPapersByClass(classId, termId)
  const rows = []
  for (const student of students) {
    for (const subject of subjects) {
      const ca = caAssessments
        .filter((a) => a.subject_id === subject.id)
        .map((a) => {
          const row = a.scores.find((x) => x.student_id === student.id)
          return {
            name: a.name,
            max: a.max_score,
            score: row?.score ?? null,
            status: (row?.score_status as never) ?? undefined,
          }
        })
      const paper = examPapers.find((p) => p.subject_id === subject.id)
      let exam = null
      if (paper) {
        const row = repos.exams.findScores(paper.id).find((x) => x.student_id === student.id)
        exam = {
          name: 'Exam',
          max: paper.max_score,
          score: row?.score ?? null,
          status: (row?.score_status as never) ?? undefined,
        }
      }
      rows.push({ studentId: student.id, subjectId: subject.id, ca, exam })
    }
  }
  return rows
}

export { calculateClass }
