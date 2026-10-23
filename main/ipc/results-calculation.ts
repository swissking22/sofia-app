import { ipcMain } from 'electron'
import { getSession, type SessionData } from '../auth'
import type { Repositories } from '../db/repositories'
import {
  cameroonStandardSecondary20,
  canActivateProfile,
  emptyDraftConfig,
  hasPermission,
  profileLabel,
  type CalculationConfig,
  type ScoreInput,
} from '../domain/results-calculation'
import { calculateClass, previewSubject } from '../services/results/calculation-engine'
import { mapComponentInputs } from '../domain/results-calculation'
import {
  calculateSubjectResult,
  validateClassCalculation,
} from '../services/results/result-calculation.service'
import {
  getSessionPermissionNames,
  isUnrestrictedAdminSession,
} from '../rbac/session-access'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function session(): SessionData | null {
  return getSession()
}

function sid(repos: Repositories, s: SessionData): string {
  return s.schoolId || repos.schools.findLatest()?.id || ''
}

function perms(repos: Repositories, s: SessionData): string[] {
  try {
    return getSessionPermissionNames(repos, s)
  } catch {
    return []
  }
}

function allow(repos: Repositories, s: SessionData, names: string[]): boolean {
  return hasPermission(
    perms(repos, s),
    names,
    isUnrestrictedAdminSession(repos, s)
  )
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
    return { ok: true, data: { config: cameroonStandardSecondary20() } }
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
        let scores: ScoreInput[] = input.scores ?? []
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

  ipcMain.handle(
    'results-calc:coefficients-list',
    (
      _e,
      input?: { class_id?: string | null; academic_year_id?: string | null }
    ): Result<unknown> => {
      const s = session()
      if (
        !s ||
        !allow(repos, s, [
          'results.coefficients.view',
          'results.calculation.view',
          'academic.manage',
          'results.read',
        ])
      ) {
        return { ok: false, error: 'Access denied.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        return repos.subjectCoefficients.listSubjectCoefficientsTable(
          schoolId,
          input?.class_id,
          input?.academic_year_id
        )
      }, 'Could not load subject coefficients.')
    }
  )

  ipcMain.handle(
    'results-calc:coefficients-save',
    (
      _e,
      input: {
        items: Array<{
          subject_id: string
          class_id?: string | null
          academic_level_id?: string | null
          academic_year_id?: string | null
          coefficient: number
        }>
      }
    ): Result<unknown> => {
      const s = session()
      if (
        !s ||
        !allow(repos, s, [
          'results.coefficients.edit',
          'results.calculation.edit',
          'academic.manage',
        ])
      ) {
        return { ok: false, error: 'Access denied.' }
      }
      if (!input?.items?.length) {
        return { ok: false, error: 'No coefficient items to save.' }
      }
      const schoolId = sid(repos, s)
      return wrap(() => {
        repos.subjectCoefficients.bulkSave(schoolId, input.items)
        audit(
          repos,
          s,
          schoolId,
          'results.coefficient.updated',
          schoolId,
          `Updated ${input.items.length} subject coefficient(s)`
        )
        return { count: input.items.length }
      }, 'Could not save subject coefficients.')
    }
  )

  ipcMain.handle(
    'results-calc:validate',
    (
      _e,
      input: { class_id: string; term_id?: string | null }
    ): Result<unknown> => {
      const s = session()
      if (
        !s ||
        !allow(repos, s, [
          'results.calculate',
          'results.calculation.view',
          'academic.manage',
          'results.read',
        ])
      ) {
        return { ok: false, error: 'Access denied.' }
      }
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }
      const schoolId = sid(repos, s)

      return wrap(() => {
        const classRow = repos.classes.findById(input.class_id)
        const year = repos.academicYears.getSetupDto(schoolId)
        const profile =
          repos.resultCalc.resolveForClass(
            schoolId,
            input.class_id,
            classRow?.academic_level_id ?? null,
            year?.id ?? null
          ) ?? {
            profile: { id: 'default', name: 'Standard Cameroon 40/60' },
            config: cameroonStandardSecondary20(),
          }

        const students = repos.students
          .findByClassId(input.class_id)
          .filter((st) => st.status === 'active')
        const subjects = repos.subjects.findByClassId(input.class_id)
        const coeffMap = repos.subjectCoefficients.resolveCoefficientsMap(
          schoolId,
          subjects.map((sub) => sub.id),
          input.class_id,
          classRow?.academic_level_id ?? null,
          year?.id ?? null
        )

        const caAssessments = repos.ca.findScoresForClassTerm(
          input.class_id,
          input.term_id ?? null
        )
        const examPapers = repos.exams
          .findPapersByClass(input.class_id, input.term_id ?? null)
          .map((p) => ({
            ...p,
            scores: repos.exams.findScores(p.id),
          }))

        const validation = validateClassCalculation({
          config: profile.config,
          students,
          subjects,
          coefficientsMap: coeffMap,
          caAssessments,
          examPapers,
        })

        return {
          validation,
          profile_name: profile.profile.name,
          config: profile.config,
        }
      }, 'Validation check failed.')
    }
  )

  ipcMain.handle(
    'results-calc:breakdown',
    (
      _e,
      input: {
        class_id: string
        term_id?: string | null
        student_id: string
        subject_id: string
      }
    ): Result<unknown> => {
      const s = session()
      if (!s) return { ok: false, error: 'Access denied.' }
      const schoolId = sid(repos, s)

      return wrap(() => {
        const student = repos.students.findById(input.student_id)
        const subject = repos.subjects.findById(input.subject_id)
        const classRow = repos.classes.findById(input.class_id)
        const year = repos.academicYears.getSetupDto(schoolId)

        const profile =
          repos.resultCalc.resolveForClass(
            schoolId,
            input.class_id,
            classRow?.academic_level_id ?? null,
            year?.id ?? null
          ) ?? {
            profile: { id: 'default', name: 'Standard Cameroon 40/60' },
            config: cameroonStandardSecondary20(),
          }

        const coeff = repos.subjectCoefficients.resolveCoefficient(
          schoolId,
          input.subject_id,
          input.class_id,
          classRow?.academic_level_id ?? null,
          year?.id ?? null
        )

        // Check if computed row exists in result_subject_rows
        const run = repos.results.findByClassTerm(
          input.class_id,
          input.term_id ?? null
        )
        if (run) {
          const rows = repos.results.findSubjectRows(run.id)
          const row = rows.find(
            (r) =>
              r.student_id === input.student_id &&
              r.subject_id === input.subject_id
          )
          if (row) {
            let seqDetails = []
            if (row.sequence_scores_json) {
              try {
                seqDetails = JSON.parse(row.sequence_scores_json)
              } catch {
                seqDetails = []
              }
            }

            const targetScale = profile.config.scale ?? 20
            const caWeight = profile.config.ca_weight ?? 40
            const examWeight = profile.config.exam_weight ?? 60
            const passMark = profile.config.pass_mark ?? 10

            return {
              student_id: student?.id,
              student_name: student?.name ?? 'Student',
              student_code: student?.student_code ?? null,
              subject_id: subject?.id,
              subject_name: subject?.name ?? 'Subject',
              sequence_details: seqDetails,
              ca_average: row.ca_average ?? row.ca_score,
              ca_weight: caWeight,
              ca_contribution:
                row.ca_score != null && row.ca_average != null
                  ? Number(((row.ca_average * caWeight) / 100).toFixed(4))
                  : null,
              exam_raw: row.exam_score,
              exam_max: targetScale,
              exam_normalized: row.exam_score,
              exam_weight: examWeight,
              exam_contribution:
                row.exam_score != null
                  ? Number(((row.exam_score * examWeight) / 100).toFixed(4))
                  : null,
              subject_mark: row.subject_mark ?? row.total,
              coefficient: row.coefficient ?? coeff,
              weighted_mark: row.weighted_mark ?? row.total * (row.coefficient ?? coeff),
              grade: row.grade,
              remark: row.remark ?? '',
              passed: (row.subject_mark ?? row.total) >= passMark,
              scale: targetScale,
              status: run.status,
            }
          }
        }

        // Live calculation if no stored row
        const caAssessments = repos.ca
          .findScoresForClassTerm(input.class_id, input.term_id ?? null)
          .filter((a) => a.subject_id === input.subject_id)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((a) => {
            const sc = a.scores.find((x) => x.student_id === input.student_id)
            return {
              name: a.name,
              max: a.max_score,
              raw: sc?.score ?? null,
              status: (sc?.score_status as never) ?? undefined,
            }
          })

        const papers = repos.exams.findPapersByClass(
          input.class_id,
          input.term_id ?? null
        )
        const paper = papers.find((p) => p.subject_id === input.subject_id)
        let examInput = null
        if (paper) {
          const sc = repos.exams
            .findScores(paper.id)
            .find((x) => x.student_id === input.student_id)
          examInput = {
            name: 'Exam',
            max: paper.max_score,
            raw: sc?.score ?? null,
            status: (sc?.score_status as never) ?? undefined,
          }
        }

        const res = calculateSubjectResult({
          subjectId: input.subject_id,
          subjectName: subject?.name,
          sequences: caAssessments,
          exam: examInput,
          coefficient: coeff,
          caWeight: profile.config.ca_weight ?? 40,
          examWeight: profile.config.exam_weight ?? 60,
          passMark: profile.config.pass_mark ?? 10,
          targetScale: profile.config.scale ?? 20,
          grading: profile.config.grading,
          rounding: profile.config.rounding,
          missingPolicy: profile.config.missing_policy ?? 'exclude',
          absentPolicy: profile.config.absent_policy ?? 'exclude',
          sequenceMethod: profile.config.sequence_method ?? 'simple_average',
          bestN: profile.config.best_n,
        })

        return {
          student_id: student?.id,
          student_name: student?.name ?? 'Student',
          student_code: student?.student_code ?? null,
          ...res,
        }
      }, 'Could not compute calculation breakdown.')
    }
  )

  ipcMain.handle(
    'results-calc:student-summary',
    (
      _e,
      input: {
        class_id: string
        term_id?: string | null
        student_id: string
      }
    ): Result<unknown> => {
      const s = session()
      if (!s) return { ok: false, error: 'Access denied.' }
      const schoolId = sid(repos, s)

      return wrap(() => {
        const student = repos.students.findById(input.student_id)
        if (!student) throw new Error('Student not found.')
        const classRow = repos.classes.findById(input.class_id)
        const year = repos.academicYears.getSetupDto(schoolId)
        const termName =
          year?.terms.find((t) => t.id === input.term_id)?.name ?? 'Current Term'

        const run = repos.results.findByClassTerm(
          input.class_id,
          input.term_id ?? null
        )

        const profile =
          repos.resultCalc.resolveForClass(
            schoolId,
            input.class_id,
            classRow?.academic_level_id ?? null,
            year?.id ?? null
          ) ?? {
            profile: { id: 'default', name: 'Standard Cameroon 40/60' },
            config: cameroonStandardSecondary20(),
          }

        if (run) {
          const summaries = repos.results.findSummaries(run.id)
          const sm = summaries.find((x) => x.student_id === input.student_id)
          const rows = repos.results
            .findSubjectRows(run.id)
            .filter((r) => r.student_id === input.student_id)

          const subjectList = rows.map((r) => ({
            subject_id: r.subject_id,
            subject_name: repos.subjects.findById(r.subject_id)?.name ?? '—',
            ca_average: r.ca_average ?? r.ca_score,
            exam_score: r.exam_score,
            subject_mark: r.subject_mark ?? r.total,
            coefficient: r.coefficient ?? 1,
            weighted_mark: r.weighted_mark ?? r.total * (r.coefficient ?? 1),
            grade: r.grade,
            remark: r.remark ?? '',
          }))

          return {
            student_id: student.id,
            student_name: student.name,
            student_code: student.student_code,
            class_name: classRow?.name ?? 'Class',
            term_name: termName,
            year_name: year?.name ?? null,
            total_weighted_marks:
              sm?.total_weighted_marks ?? sm?.total ?? 0,
            total_coefficients: sm?.total_coefficients ?? 0,
            term_average: sm?.average ?? 0,
            pass_mark: profile.config.pass_mark ?? 10,
            status: sm?.status ?? (sm?.average && sm.average >= 10 ? 'PASSED' : 'FAILED'),
            position: sm?.position ?? null,
            total_students: summaries.length,
            subjects: subjectList,
          }
        }

        throw new Error('Results have not been processed yet for this student.')
      }, 'Could not load student result summary.')
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
