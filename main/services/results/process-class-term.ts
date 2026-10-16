/**
 * Persist term results for one class (sequences → subject marks → coeff-weighted average).
 * Used by single Process and bulk Process all classes.
 */
import type { Repositories } from '../../db/repositories'
import {
  minesecCameroonSequences20,
  profileLabel,
} from '../../domain/results-calculation'
import { calculateClassResults } from './result-calculation.service'

export type ProcessClassTermOk = {
  run_id: string
  class_id: string
  class_name: string
  students: number
  subjects: number
  profile: string
}

export type ProcessClassTermFail = {
  class_id: string
  class_name: string
  error: string
}

/**
 * Calculate and store term results for one class.
 * Caller is responsible for RBAC and locked-run checks when needed.
 */
export function processClassTermResults(
  repos: Repositories,
  input: {
    schoolId: string
    classId: string
    termId?: string | null
    actorUserId?: string | null
    /** When true, skip classes that are locked instead of erroring (bulk). */
    skipLocked?: boolean
  }
): { ok: true; data: ProcessClassTermOk } | { ok: false; error: string; class_name?: string } {
  const year = repos.academicYears.getSetupDto(input.schoolId)
  const classRow = repos.classes.findById(input.classId)
  const className = classRow?.name ?? 'Class'
  const students = repos.students
    .findByClassId(input.classId)
    .filter((s) => s.status === 'active')
  const subjects = repos.subjects.findByClassId(input.classId)

  if (!students.length) {
    return {
      ok: false,
      error: 'No active students in this class.',
      class_name: className,
    }
  }
  if (!subjects.length) {
    return {
      ok: false,
      error: 'No subjects assigned to this class.',
      class_name: className,
    }
  }

  let run = repos.results.findByClassTerm(input.classId, input.termId ?? null)
  if (run?.status === 'locked') {
    if (input.skipLocked) {
      return {
        ok: false,
        error: 'Results are locked (skipped).',
        class_name: className,
      }
    }
    return {
      ok: false,
      error: 'Results are locked and cannot be recomputed.',
      class_name: className,
    }
  }

  if (!run) {
    run = repos.results.createRun({
      school_id: input.schoolId,
      class_id: input.classId,
      term_id: input.termId ?? null,
      academic_year_id: year?.id ?? null,
      status: 'draft',
    })
  } else {
    repos.results.softDeleteRows(run.id)
  }

  const profile = repos.resultCalc.resolveForClass(
    input.schoolId,
    input.classId,
    classRow?.academic_level_id ?? null,
    year?.id ?? null
  )

  const effectiveProfile = profile ?? {
    profile: {
      id: 'default-profile',
      school_id: input.schoolId,
      name: 'Cameroon MINESEC (3 terms × 2 sequences)',
      description: 'Default calculation profile',
      academic_year_id: year?.id ?? null,
      period_mode: 'term' as const,
      status: 'active' as const,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      sync_status: 'synced',
      version: 1,
    },
    version_number: 1,
    config_hash: '',
    config: minesecCameroonSequences20(),
    assignments: [],
    used_in_results: false,
  }

  const coeffMap = repos.subjectCoefficients.resolveCoefficientsMap(
    input.schoolId,
    subjects.map((s) => s.id),
    input.classId,
    classRow?.academic_level_id ?? null,
    year?.id ?? null
  )

  const caAssessments = repos.ca.findScoresForClassTerm(
    input.classId,
    input.termId ?? null
  )
  const examPapers = repos.exams.findPapersByClass(
    input.classId,
    input.termId ?? null
  )

  const scoresLookup = new Map<
    string,
    {
      sequences: Array<{
        name: string
        max: number
        raw: number | null
        status?: 'recorded' | 'missing' | 'absent' | 'excused' | 'na'
      }>
      exam: {
        name: string
        max: number
        raw: number | null
        status?: 'recorded' | 'missing' | 'absent' | 'excused' | 'na'
      } | null
    }
  >()

  for (const student of students) {
    for (const subject of subjects) {
      const ca = caAssessments
        .filter((a) => a.subject_id === subject.id)
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true })
        )
        .map((a) => {
          const row = a.scores.find((x) => x.student_id === student.id)
          return {
            name: a.name,
            max: a.max_score,
            raw: row?.score ?? null,
            status: (row?.score_status as
              | 'recorded'
              | 'missing'
              | 'absent'
              | 'excused'
              | 'na'
              | undefined) ?? undefined,
          }
        })

      const paper = examPapers.find((p) => p.subject_id === subject.id)
      let exam = null
      if (paper) {
        const row = repos.exams
          .findScores(paper.id)
          .find((x) => x.student_id === student.id)
        exam = {
          name: 'Exam',
          max: paper.max_score,
          raw: row?.score ?? null,
          status: (row?.score_status as
            | 'recorded'
            | 'missing'
            | 'absent'
            | 'excused'
            | 'na'
            | undefined) ?? undefined,
        }
      }

      scoresLookup.set(`${student.id}:${subject.id}`, { sequences: ca, exam })
    }
  }

  const out = calculateClassResults({
    classId: input.classId,
    termId: input.termId ?? null,
    academicYearId: year?.id ?? null,
    config: effectiveProfile.config,
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      student_code: s.student_code,
    })),
    subjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      department_id: s.department_id,
    })),
    coefficientsMap: coeffMap,
    scoresLookup,
  })

  for (const st of out.student_results) {
    for (const sr of st.subject_results) {
      repos.results.insertSubjectRow({
        result_run_id: run.id,
        student_id: st.student_id,
        subject_id: sr.subject_id,
        ca_score: sr.ca_contribution ?? sr.ca_average ?? 0,
        exam_score: sr.exam_contribution ?? sr.exam_normalized ?? 0,
        total: sr.subject_mark_rounded ?? sr.subject_mark ?? 0,
        grade: sr.grade,
        sequence_scores_json: JSON.stringify(sr.sequence_details),
        ca_average: sr.ca_average,
        subject_mark: sr.subject_mark_rounded ?? sr.subject_mark ?? 0,
        coefficient: sr.coefficient,
        weighted_mark: sr.weighted_mark_rounded ?? sr.weighted_mark ?? 0,
        remark: sr.remark,
      })
    }

    repos.results.insertSummary({
      result_run_id: run.id,
      student_id: st.student_id,
      average: st.term_average_rounded ?? st.term_average ?? 0,
      total: st.total_weighted_marks,
      grade: st.grade,
      position: st.position,
      remark: st.remark,
      promotion_outcome: st.promotion_outcome,
      gpa: st.gpa,
      failed_subjects: st.failed_subjects,
      total_coefficients: st.total_coefficients,
      total_weighted_marks: st.total_weighted_marks,
      passed_subjects: st.passed_subjects,
      status: st.status,
    })
  }

  const profileName = profileLabel(
    effectiveProfile.profile.name,
    year?.name ?? null,
    effectiveProfile.version_number
  )

  repos.results.attachCalculationSnapshot(run.id, {
    calculation_profile_id: effectiveProfile.profile.id,
    calculation_version: effectiveProfile.version_number,
    calculation_hash: out.config_hash,
    snapshot_json: JSON.stringify({
      label: profileName,
      config: effectiveProfile.config,
    }),
    calculated_by: input.actorUserId ?? null,
  })

  repos.results.updateStatus(run.id, 'computed', {
    computed_at: new Date().toISOString(),
  })

  try {
    repos.systemAdmin.writeAudit({
      school_id: input.schoolId,
      actor_user_id: input.actorUserId ?? null,
      action: 'results.calculate',
      module_key: 'results',
      entity_type: 'result_run',
      entity_id: run.id,
      description: `Calculated term results for ${className}: ${students.length} students using ${effectiveProfile.profile.name}`,
    })
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    data: {
      run_id: run.id,
      class_id: input.classId,
      class_name: className,
      students: students.length,
      subjects: subjects.length,
      profile: profileName,
    },
  }
}

export function processAllClassesTermResults(
  repos: Repositories,
  input: {
    schoolId: string
    termId?: string | null
    actorUserId?: string | null
  }
): {
  ok: true
  data: {
    succeeded: number
    failed: number
    skipped: number
    results: Array<ProcessClassTermOk | ProcessClassTermFail>
  }
} {
  const classes = repos.classes
    .findBySchool(input.schoolId)
    .filter((c) => Number(c.is_active) !== 0)

  const results: Array<ProcessClassTermOk | ProcessClassTermFail> = []
  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (const klass of classes) {
    const res = processClassTermResults(repos, {
      schoolId: input.schoolId,
      classId: klass.id,
      termId: input.termId,
      actorUserId: input.actorUserId,
      skipLocked: true,
    })
    if (res.ok) {
      succeeded += 1
      results.push(res.data)
    } else {
      const row: ProcessClassTermFail = {
        class_id: klass.id,
        class_name: res.class_name ?? klass.name,
        error: res.error,
      }
      if (res.error.includes('locked')) skipped += 1
      else failed += 1
      results.push(row)
    }
  }

  return {
    ok: true,
    data: { succeeded, failed, skipped, results },
  }
}
