import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type {
  AttendanceMark,
  ExamSessionStatus,
  ResultRunStatus,
} from '../db/types'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  const schools = repos.schools.findAll()
  return schools[0]?.id ?? null
}

function gradeForScore(
  score: number,
  bands: Array<{ grade: string; min_score: number; max_score: number }>
): string | null {
  const match = bands.find((b) => score >= b.min_score && score <= b.max_score)
  return match?.grade ?? null
}

function assessmentWeights(repos: Repositories, schoolId: string) {
  const setup = repos.gradingSystems.getSetupDto(schoolId)
  const types = setup?.assessment_types ?? []
  const ca =
    types.find((t) => /continuous|ca|c\.?a/i.test(t.name))?.weight_percent ?? 30
  const exam =
    types.find((t) => /exam/i.test(t.name))?.weight_percent ?? 70
  return {
    caWeight: ca,
    examWeight: exam,
    bands: setup?.grade_bands ?? [],
    enableRanking: setup?.enable_ranking ?? true,
  }
}

export function registerAcademicMgmtIpc(repos: Repositories): void {
  ipcMain.handle('academic:meta', (): Result<{
    classes: Array<{ id: string; name: string }>
    subjects: Array<{ id: string; name: string; class_ids: string[] }>
    teachers: Array<{ id: string; full_name: string }>
    terms: Array<{ id: string; name: string; term_number: number }>
    academic_year: { id: string; name: string } | null
    periods: number
    days: Array<{ day: number; label: string }>
  }> => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) return { ok: false, error: 'No school found.' }

    const yearSetup = repos.academicYears.getSetupDto(schoolId)
    const subjects = repos.subjects.findBySchoolWithClasses(schoolId).map((s) => ({
      id: s.id,
      name: s.name,
      class_ids: s.class_ids,
    }))

    return {
      ok: true,
      data: {
        classes: repos.classes
          .findStructureClasses(schoolId)
          .filter((c) => c.is_active === 1)
          .map((c) => ({ id: c.id, name: c.name })),
        subjects,
        teachers: repos.staff
          .findBySchool(schoolId)
          .filter((s) => s.staff_type === 'teaching' && s.status === 'active')
          .map((s) => ({ id: s.id, full_name: s.full_name })),
        terms: yearSetup?.terms ?? [],
        academic_year: yearSetup
          ? { id: yearSetup.id, name: yearSetup.name }
          : null,
        periods: 8,
        days: [
          { day: 1, label: 'Monday' },
          { day: 2, label: 'Tuesday' },
          { day: 3, label: 'Wednesday' },
          { day: 4, label: 'Thursday' },
          { day: 5, label: 'Friday' },
        ],
      },
    }
  })

  // ── Timetable ──────────────────────────────────────────────
  ipcMain.handle(
    'timetable:get',
    (
      _e,
      input: { view?: 'class' | 'teacher'; class_id?: string; staff_id?: string }
    ): Result<{
      slots: Array<{
        id: string
        class_id: string
        class_name: string | null
        subject_id: string | null
        subject_name: string | null
        staff_id: string | null
        staff_name: string | null
        day_of_week: number
        period_number: number
        room: string | null
      }>
    }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }

      let slots = repos.timetable.findBySchool(schoolId)
      if (input?.view === 'teacher' && input.staff_id) {
        slots = repos.timetable.findByStaff(input.staff_id)
      } else if (input?.class_id) {
        slots = repos.timetable.findByClass(input.class_id)
      }

      return {
        ok: true,
        data: {
          slots: slots.map((s) => ({
            id: s.id,
            class_id: s.class_id,
            class_name: repos.classes.findById(s.class_id)?.name ?? null,
            subject_id: s.subject_id,
            subject_name: s.subject_id
              ? repos.subjects.findById(s.subject_id)?.name ?? null
              : null,
            staff_id: s.staff_id,
            staff_name: s.staff_id
              ? repos.staff.findById(s.staff_id)?.full_name ?? null
              : null,
            day_of_week: s.day_of_week,
            period_number: s.period_number,
            room: s.room,
          })),
        },
      }
    }
  )

  ipcMain.handle(
    'timetable:save-slot',
    (
      _e,
      input: {
        id?: string | null
        class_id: string
        subject_id?: string | null
        staff_id?: string | null
        day_of_week: number
        period_number: number
        room?: string | null
      }
    ): Result<unknown> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }
      if (
        !input.day_of_week ||
        input.day_of_week < 1 ||
        input.day_of_week > 5
      ) {
        return { ok: false, error: 'Day must be Monday–Friday.' }
      }
      if (!input.period_number || input.period_number < 1) {
        return { ok: false, error: 'Period is required.' }
      }

      const slot = repos.timetable.upsertSlot({
        id: input.id,
        school_id: schoolId,
        class_id: input.class_id,
        subject_id: input.subject_id ?? null,
        staff_id: input.staff_id ?? null,
        day_of_week: input.day_of_week,
        period_number: input.period_number,
        room: input.room ?? null,
      })
      return { ok: true, data: slot }
    }
  )

  ipcMain.handle(
    'timetable:clear-slot',
    (
      _e,
      input: { class_id: string; day_of_week: number; period_number: number }
    ): Result<{ cleared: boolean }> => {
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }
      repos.timetable.clearCell(
        input.class_id,
        input.day_of_week,
        input.period_number
      )
      return { ok: true, data: { cleared: true } }
    }
  )

  // ── Attendance ─────────────────────────────────────────────
  ipcMain.handle(
    'attendance:list-sessions',
    (
      _e,
      input?: { class_id?: string | null }
    ): Result<
      Array<{
        id: string
        class_id: string
        class_name: string | null
        session_date: string
        notes: string | null
        present: number
        absent: number
        total: number
      }>
    > => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const sessions = repos.attendance.findSessions(
        schoolId,
        input?.class_id
      )
      return {
        ok: true,
        data: sessions.map((s) => {
          const records = repos.attendance.findRecords(s.id)
          return {
            id: s.id,
            class_id: s.class_id,
            class_name: repos.classes.findById(s.class_id)?.name ?? null,
            session_date: s.session_date,
            notes: s.notes,
            present: records.filter((r) => r.status === 'present').length,
            absent: records.filter((r) => r.status === 'absent').length,
            total: records.length,
          }
        }),
      }
    }
  )

  ipcMain.handle(
    'attendance:get-roster',
    (
      _e,
      input: { class_id: string; session_date: string }
    ): Result<{
      session_id: string | null
      students: Array<{
        id: string
        name: string
        student_code: string | null
        status: AttendanceMark | null
      }>
    }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.class_id || !input?.session_date) {
        return { ok: false, error: 'Class and date are required.' }
      }

      const session = repos.attendance.findSessionByClassDate(
        input.class_id,
        input.session_date
      )
      const records = session
        ? repos.attendance.findRecords(session.id)
        : []
      const byStudent = new Map(records.map((r) => [r.student_id, r.status]))

      const students = repos.students
        .findByClassId(input.class_id)
        .filter((s) => s.status === 'active')
        .map((s) => ({
          id: s.id,
          name: s.name,
          student_code: s.student_code,
          status: byStudent.get(s.id) ?? null,
        }))

      return {
        ok: true,
        data: { session_id: session?.id ?? null, students },
      }
    }
  )

  ipcMain.handle(
    'attendance:save',
    (
      _e,
      input: {
        class_id: string
        session_date: string
        notes?: string | null
        marks: Array<{ student_id: string; status: AttendanceMark }>
      }
    ): Result<{ session_id: string; saved: number }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.class_id || !input?.session_date) {
        return { ok: false, error: 'Class and date are required.' }
      }

      let session = repos.attendance.findSessionByClassDate(
        input.class_id,
        input.session_date
      )
      if (!session) {
        session = repos.attendance.createSession({
          school_id: schoolId,
          class_id: input.class_id,
          session_date: input.session_date,
          notes: input.notes,
        })
      }

      let saved = 0
      for (const mark of input.marks ?? []) {
        repos.attendance.upsertRecord({
          session_id: session.id,
          student_id: mark.student_id,
          status: mark.status,
        })
        saved += 1
      }
      return { ok: true, data: { session_id: session.id, saved } }
    }
  )

  ipcMain.handle(
    'attendance:report',
    (
      _e,
      input: {
        class_id: string
        from_date?: string | null
        to_date?: string | null
      }
    ): Result<{
      rows: Array<{
        student_id: string
        student_name: string
        student_code: string | null
        present: number
        absent: number
        late: number
        excused: number
        total: number
        rate: number
      }>
    }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }

      const stats = repos.attendance.reportByClass(
        schoolId,
        input.class_id,
        input.from_date,
        input.to_date
      )
      return {
        ok: true,
        data: {
          rows: stats.map((r) => {
            const student = repos.students.findById(r.student_id)
            return {
              student_id: r.student_id,
              student_name: student?.name ?? '—',
              student_code: student?.student_code ?? null,
              present: r.present,
              absent: r.absent,
              late: r.late,
              excused: r.excused,
              total: r.total,
              rate: r.total
                ? Math.round(((r.present + r.late) / r.total) * 1000) / 10
                : 0,
            }
          }),
        },
      }
    }
  )

  // ── Continuous Assessment ──────────────────────────────────
  ipcMain.handle('ca:list', (): Result<
    Array<{
      id: string
      name: string
      subject_id: string
      subject_name: string | null
      class_id: string
      class_name: string | null
      term_id: string | null
      weight_percent: number
      max_score: number
      assessment_date: string | null
    }>
  > => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) return { ok: false, error: 'No school found.' }
    const rows = repos.ca.findBySchool(schoolId)
    return {
      ok: true,
      data: rows.map((a) => ({
        id: a.id,
        name: a.name,
        subject_id: a.subject_id,
        subject_name: repos.subjects.findById(a.subject_id)?.name ?? null,
        class_id: a.class_id,
        class_name: repos.classes.findById(a.class_id)?.name ?? null,
        term_id: a.term_id,
        weight_percent: a.weight_percent,
        max_score: a.max_score,
        assessment_date: a.assessment_date,
      })),
    }
  })

  ipcMain.handle(
    'ca:create',
    (
      _e,
      input: {
        name: string
        subject_id: string
        class_id: string
        term_id?: string | null
        weight_percent: number
        max_score: number
        assessment_date?: string | null
      }
    ): Result<unknown> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.name?.trim()) return { ok: false, error: 'Name is required.' }
      if (!input.subject_id || !input.class_id) {
        return { ok: false, error: 'Subject and class are required.' }
      }
      const year = repos.academicYears.getSetupDto(schoolId)
      const assessment = repos.ca.create({
        school_id: schoolId,
        name: input.name,
        subject_id: input.subject_id,
        class_id: input.class_id,
        term_id: input.term_id ?? null,
        academic_year_id: year?.id ?? null,
        weight_percent: Number(input.weight_percent) || 0,
        max_score: Number(input.max_score) || 100,
        assessment_date: input.assessment_date ?? null,
      })
      return { ok: true, data: assessment }
    }
  )

  ipcMain.handle(
    'ca:get-scores',
    (
      _e,
      input: { assessment_id: string }
    ): Result<{
      assessment: {
        id: string
        name: string
        max_score: number
        class_id: string
        subject_name: string | null
      }
      students: Array<{
        id: string
        name: string
        student_code: string | null
        score: number | null
      }>
    }> => {
      if (!input?.assessment_id) {
        return { ok: false, error: 'Assessment is required.' }
      }
      const assessment = repos.ca.findById(input.assessment_id)
      if (!assessment) return { ok: false, error: 'Assessment not found.' }
      const scores = repos.ca.findScores(assessment.id)
      const byStudent = new Map(scores.map((s) => [s.student_id, s.score]))
      const students = repos.students
        .findByClassId(assessment.class_id)
        .filter((s) => s.status === 'active')
        .map((s) => ({
          id: s.id,
          name: s.name,
          student_code: s.student_code,
          score: byStudent.has(s.id) ? byStudent.get(s.id)! : null,
        }))
      return {
        ok: true,
        data: {
          assessment: {
            id: assessment.id,
            name: assessment.name,
            max_score: assessment.max_score,
            class_id: assessment.class_id,
            subject_name:
              repos.subjects.findById(assessment.subject_id)?.name ?? null,
          },
          students,
        },
      }
    }
  )

  ipcMain.handle(
    'ca:save-scores',
    (
      _e,
      input: {
        assessment_id: string
        scores: Array<{ student_id: string; score: number | null }>
      }
    ): Result<{ saved: number }> => {
      if (!input?.assessment_id) {
        return { ok: false, error: 'Assessment is required.' }
      }
      const assessment = repos.ca.findById(input.assessment_id)
      if (!assessment) return { ok: false, error: 'Assessment not found.' }
      let saved = 0
      for (const row of input.scores ?? []) {
        let score = row.score
        if (score != null && score > assessment.max_score) {
          score = assessment.max_score
        }
        repos.ca.upsertScore({
          assessment_id: assessment.id,
          student_id: row.student_id,
          score,
        })
        saved += 1
      }
      return { ok: true, data: { saved } }
    }
  )

  // ── Exams ──────────────────────────────────────────────────
  ipcMain.handle('exams:list', (): Result<
    Array<{
      id: string
      name: string
      term_id: string | null
      term_name: string | null
      start_date: string | null
      end_date: string | null
      status: string
      paper_count: number
    }>
  > => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) return { ok: false, error: 'No school found.' }
    const year = repos.academicYears.getSetupDto(schoolId)
    const termMap = new Map((year?.terms ?? []).map((t) => [t.id, t.name]))
    return {
      ok: true,
      data: repos.exams.findBySchool(schoolId).map((s) => ({
        id: s.id,
        name: s.name,
        term_id: s.term_id,
        term_name: s.term_id ? termMap.get(s.term_id) ?? null : null,
        start_date: s.start_date,
        end_date: s.end_date,
        status: s.status,
        paper_count: repos.exams.findPapers(s.id).length,
      })),
    }
  })

  ipcMain.handle(
    'exams:create',
    (
      _e,
      input: {
        name: string
        term_id?: string | null
        start_date?: string | null
        end_date?: string | null
        status?: ExamSessionStatus
        papers?: Array<{
          subject_id: string
          class_id: string
          max_score: number
          exam_date?: string | null
        }>
      }
    ): Result<unknown> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.name?.trim()) return { ok: false, error: 'Name is required.' }
      const year = repos.academicYears.getSetupDto(schoolId)
      const session = repos.exams.createSession({
        school_id: schoolId,
        name: input.name,
        term_id: input.term_id ?? null,
        academic_year_id: year?.id ?? null,
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        status: input.status ?? 'draft',
      })
      for (const paper of input.papers ?? []) {
        repos.exams.upsertPaper({
          exam_session_id: session.id,
          subject_id: paper.subject_id,
          class_id: paper.class_id,
          max_score: paper.max_score || 100,
          exam_date: paper.exam_date ?? null,
        })
      }
      return { ok: true, data: session }
    }
  )

  ipcMain.handle(
    'exams:list-papers',
    (
      _e,
      input?: { session_id?: string; class_id?: string }
    ): Result<
      Array<{
        id: string
        exam_session_id: string
        session_name: string | null
        subject_id: string
        subject_name: string | null
        class_id: string
        class_name: string | null
        max_score: number
        exam_date: string | null
      }>
    > => {
      let papers = input?.session_id
        ? repos.exams.findPapers(input.session_id)
        : input?.class_id
          ? repos.exams.findPapersByClass(input.class_id)
          : []

      if (!input?.session_id && !input?.class_id) {
        const schoolId = resolveSchoolId(repos)
        if (!schoolId) return { ok: false, error: 'No school found.' }
        papers = repos.exams
          .findBySchool(schoolId)
          .flatMap((s) => repos.exams.findPapers(s.id))
      }

      return {
        ok: true,
        data: papers.map((p) => ({
          id: p.id,
          exam_session_id: p.exam_session_id,
          session_name:
            repos.exams.findById(p.exam_session_id)?.name ?? null,
          subject_id: p.subject_id,
          subject_name: repos.subjects.findById(p.subject_id)?.name ?? null,
          class_id: p.class_id,
          class_name: repos.classes.findById(p.class_id)?.name ?? null,
          max_score: p.max_score,
          exam_date: p.exam_date,
        })),
      }
    }
  )

  ipcMain.handle(
    'exams:get-scores',
    (
      _e,
      input: { paper_id: string }
    ): Result<{
      paper: {
        id: string
        max_score: number
        subject_name: string | null
        class_id: string
        class_name: string | null
      }
      students: Array<{
        id: string
        name: string
        student_code: string | null
        score: number | null
      }>
    }> => {
      if (!input?.paper_id) return { ok: false, error: 'Paper is required.' }
      const found = repos.exams.findPaperById(input.paper_id)
      if (!found) return { ok: false, error: 'Exam paper not found.' }
      const scores = repos.exams.findScores(found.id)
      const byStudent = new Map(scores.map((s) => [s.student_id, s.score]))
      return {
        ok: true,
        data: {
          paper: {
            id: found.id,
            max_score: found.max_score,
            subject_name:
              repos.subjects.findById(found.subject_id)?.name ?? null,
            class_id: found.class_id,
            class_name: repos.classes.findById(found.class_id)?.name ?? null,
          },
          students: repos.students
            .findByClassId(found.class_id)
            .filter((s) => s.status === 'active')
            .map((s) => ({
              id: s.id,
              name: s.name,
              student_code: s.student_code,
              score: byStudent.has(s.id) ? byStudent.get(s.id)! : null,
            })),
        },
      }
    }
  )

  ipcMain.handle(
    'exams:save-scores',
    (
      _e,
      input: {
        paper_id: string
        scores: Array<{ student_id: string; score: number | null }>
      }
    ): Result<{ saved: number }> => {
      if (!input?.paper_id) return { ok: false, error: 'Paper is required.' }
      const found = repos.exams.findPaperById(input.paper_id)
      if (!found) return { ok: false, error: 'Exam paper not found.' }

      let saved = 0
      for (const row of input.scores ?? []) {
        let score = row.score
        if (score != null && score > found.max_score) score = found.max_score
        repos.exams.upsertScore({
          paper_id: input.paper_id,
          student_id: row.student_id,
          score,
        })
        saved += 1
      }
      return { ok: true, data: { saved } }
    }
  )

  // ── Results ────────────────────────────────────────────────
  ipcMain.handle(
    'results:get',
    (
      _e,
      input: { class_id: string; term_id?: string | null }
    ): Result<{
      run: {
        id: string
        status: string
        computed_at: string | null
        published_at: string | null
      } | null
      summaries: Array<{
        student_id: string
        student_name: string
        student_code: string | null
        average: number
        total: number
        grade: string | null
        position: number | null
        remark: string | null
      }>
      subject_rows: Array<{
        student_id: string
        subject_id: string
        subject_name: string | null
        ca_score: number
        exam_score: number
        total: number
        grade: string | null
      }>
    }> => {
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }
      const run = repos.results.findByClassTerm(
        input.class_id,
        input.term_id ?? null
      )
      if (!run) {
        return {
          ok: true,
          data: { run: null, summaries: [], subject_rows: [] },
        }
      }
      return {
        ok: true,
        data: {
          run: {
            id: run.id,
            status: run.status,
            computed_at: run.computed_at,
            published_at: run.published_at,
          },
          summaries: repos.results.findSummaries(run.id).map((s) => {
            const student = repos.students.findById(s.student_id)
            return {
              student_id: s.student_id,
              student_name: student?.name ?? '—',
              student_code: student?.student_code ?? null,
              average: s.average,
              total: s.total,
              grade: s.grade,
              position: s.position,
              remark: s.remark,
            }
          }),
          subject_rows: repos.results.findSubjectRows(run.id).map((r) => ({
            student_id: r.student_id,
            subject_id: r.subject_id,
            subject_name: repos.subjects.findById(r.subject_id)?.name ?? null,
            ca_score: r.ca_score,
            exam_score: r.exam_score,
            total: r.total,
            grade: r.grade,
          })),
        },
      }
    }
  )

  ipcMain.handle(
    'results:process',
    (
      _e,
      input: { class_id: string; term_id?: string | null }
    ): Result<{ run_id: string; students: number; subjects: number }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }

      const weights = assessmentWeights(repos, schoolId)
      const year = repos.academicYears.getSetupDto(schoolId)
      const students = repos.students
        .findByClassId(input.class_id)
        .filter((s) => s.status === 'active')
      const subjects = repos.subjects.findByClassId(input.class_id)
      if (!students.length) {
        return { ok: false, error: 'No active students in this class.' }
      }
      if (!subjects.length) {
        return { ok: false, error: 'No subjects assigned to this class.' }
      }

      let run = repos.results.findByClassTerm(
        input.class_id,
        input.term_id ?? null
      )
      if (run?.status === 'locked') {
        return { ok: false, error: 'Results are locked and cannot be recomputed.' }
      }
      if (!run) {
        run = repos.results.createRun({
          school_id: schoolId,
          class_id: input.class_id,
          term_id: input.term_id ?? null,
          academic_year_id: year?.id ?? null,
          status: 'draft',
        })
      } else {
        repos.results.softDeleteRows(run.id)
      }

      const caAssessments = repos.ca.findScoresForClassTerm(
        input.class_id,
        input.term_id ?? null
      )
      const examPapers = repos.exams.findPapersByClass(
        input.class_id,
        input.term_id ?? null
      )

      const caByStudentSubject = new Map<string, number>()
      for (const a of caAssessments) {
        for (const sc of a.scores) {
          if (sc.score == null) continue
          const key = `${sc.student_id}:${a.subject_id}`
          const pct = (sc.score / (a.max_score || 100)) * 100
          const prev = caByStudentSubject.get(key) ?? []
          // accumulate as array via string hack — use weighted avg
          void prev
          const existing = caByStudentSubject.get(key)
          if (existing == null) caByStudentSubject.set(key, pct)
          else caByStudentSubject.set(key, (existing + pct) / 2)
        }
      }

      const examByStudentSubject = new Map<string, number>()
      for (const paper of examPapers) {
        const scores = repos.exams.findScores(paper.id)
        for (const sc of scores) {
          if (sc.score == null) continue
          const key = `${sc.student_id}:${paper.subject_id}`
          const pct = (sc.score / (paper.max_score || 100)) * 100
          examByStudentSubject.set(key, pct)
        }
      }

      const averages: Array<{ student_id: string; average: number; total: number }> =
        []

      for (const student of students) {
        let sum = 0
        let count = 0
        for (const subject of subjects) {
          const key = `${student.id}:${subject.id}`
          const caRaw = caByStudentSubject.get(key) ?? 0
          const examRaw = examByStudentSubject.get(key) ?? 0
          const caScore = (caRaw * weights.caWeight) / 100
          const examScore = (examRaw * weights.examWeight) / 100
          const total = Math.round((caScore + examScore) * 10) / 10
          const grade = gradeForScore(total, weights.bands)
          repos.results.insertSubjectRow({
            result_run_id: run.id,
            student_id: student.id,
            subject_id: subject.id,
            ca_score: Math.round(caScore * 10) / 10,
            exam_score: Math.round(examScore * 10) / 10,
            total,
            grade,
          })
          sum += total
          count += 1
        }
        const average = count ? Math.round((sum / count) * 10) / 10 : 0
        averages.push({ student_id: student.id, average, total: sum })
      }

      averages.sort((a, b) => b.average - a.average)
      averages.forEach((row, idx) => {
        repos.results.insertSummary({
          result_run_id: run!.id,
          student_id: row.student_id,
          average: row.average,
          total: Math.round(row.total * 10) / 10,
          grade: gradeForScore(row.average, weights.bands),
          position: weights.enableRanking ? idx + 1 : null,
          remark: null,
        })
      })

      repos.results.updateStatus(run.id, 'computed', {
        computed_at: new Date().toISOString(),
      })

      return {
        ok: true,
        data: {
          run_id: run.id,
          students: students.length,
          subjects: subjects.length,
        },
      }
    }
  )

  ipcMain.handle(
    'results:publish',
    (
      _e,
      input: {
        class_id: string
        term_id?: string | null
        lock?: boolean
      }
    ): Result<{ status: ResultRunStatus }> => {
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }
      const run = repos.results.findByClassTerm(
        input.class_id,
        input.term_id ?? null
      )
      if (!run) return { ok: false, error: 'No computed results to publish.' }
      if (run.status === 'locked') {
        return { ok: false, error: 'Results are already locked.' }
      }
      if (run.status !== 'computed' && run.status !== 'published') {
        return { ok: false, error: 'Process results before publishing.' }
      }
      const status: ResultRunStatus = input.lock ? 'locked' : 'published'
      repos.results.updateStatus(run.id, status, {
        published_at: new Date().toISOString(),
      })
      return { ok: true, data: { status } }
    }
  )

  // ── Report cards ───────────────────────────────────────────
  ipcMain.handle(
    'report-cards:list',
    (
      _e,
      input?: { class_id?: string; term_id?: string | null }
    ): Result<
      Array<{
        id: string
        student_id: string
        student_name: string | null
        student_code: string | null
        class_id: string
        class_name: string | null
        term_id: string | null
        status: string
        generated_at: string | null
      }>
    > => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const cards = input?.class_id
        ? repos.reportCards.findByClassTerm(
            input.class_id,
            input.term_id ?? null
          )
        : repos.reportCards.findBySchool(schoolId)
      return {
        ok: true,
        data: cards.map((c) => ({
          id: c.id,
          student_id: c.student_id,
          student_name: repos.students.findById(c.student_id)?.name ?? null,
          student_code:
            repos.students.findById(c.student_id)?.student_code ?? null,
          class_id: c.class_id,
          class_name: repos.classes.findById(c.class_id)?.name ?? null,
          term_id: c.term_id,
          status: c.status,
          generated_at: c.generated_at,
        })),
      }
    }
  )

  ipcMain.handle(
    'report-cards:generate',
    (
      _e,
      input: { class_id: string; term_id?: string | null }
    ): Result<{ generated: number }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }

      const run = repos.results.findByClassTerm(
        input.class_id,
        input.term_id ?? null
      )
      if (!run || (run.status !== 'computed' && run.status !== 'published' && run.status !== 'locked')) {
        return {
          ok: false,
          error: 'Process results for this class/term before generating report cards.',
        }
      }

      const school = repos.schools.findById(schoolId)
      const year = repos.academicYears.getSetupDto(schoolId)
      const className = repos.classes.findById(input.class_id)?.name ?? ''
      const termName =
        year?.terms.find((t) => t.id === input.term_id)?.name ?? null
      const summaries = repos.results.findSummaries(run.id)
      const subjectRows = repos.results.findSubjectRows(run.id)
      const template = repos.documentTemplates.findByKey(schoolId, 'report_card')

      let generated = 0
      for (const summary of summaries) {
        const student = repos.students.findById(summary.student_id)
        if (!student) continue
        const subjects = subjectRows
          .filter((r) => r.student_id === summary.student_id)
          .map((r) => ({
            subject_id: r.subject_id,
            subject_name: repos.subjects.findById(r.subject_id)?.name ?? '—',
            ca_score: r.ca_score,
            exam_score: r.exam_score,
            total: r.total,
            grade: r.grade,
          }))

        const payload = JSON.stringify({
          school_name: school?.name ?? 'School',
          header: template?.header_text ?? 'Official Term Report Card',
          footer: template?.footer_text ?? '',
          student_name: student.name,
          student_code: student.student_code,
          class_name: className,
          term_name: termName,
          year_name: year?.name ?? null,
          average: summary.average,
          total: summary.total,
          grade: summary.grade,
          position: summary.position,
          remark: summary.remark,
          subjects,
        })

        repos.reportCards.upsertCard({
          school_id: schoolId,
          student_id: student.id,
          class_id: input.class_id,
          term_id: input.term_id ?? null,
          academic_year_id: year?.id ?? null,
          result_run_id: run.id,
          status: 'generated',
          payload,
        })
        generated += 1
      }

      return { ok: true, data: { generated } }
    }
  )

  ipcMain.handle(
    'report-cards:get',
    (_e, input: { id: string }): Result<{
      id: string
      status: string
      generated_at: string | null
      payload: Record<string, unknown> | null
    }> => {
      if (!input?.id) return { ok: false, error: 'Report card id is required.' }
      const card = repos.reportCards.findById(input.id)
      if (!card) return { ok: false, error: 'Report card not found.' }
      let payload: Record<string, unknown> | null = null
      if (card.payload) {
        try {
          payload = JSON.parse(card.payload) as Record<string, unknown>
        } catch {
          payload = null
        }
      }
      return {
        ok: true,
        data: {
          id: card.id,
          status: card.status,
          generated_at: card.generated_at,
          payload,
        },
      }
    }
  )

  // ── Analytics dashboard ────────────────────────────────────
  ipcMain.handle('academic-reports:dashboard', (): Result<{
    attendance_sessions: number
    ca_assessments: number
    exam_sessions: number
    published_results: number
    report_cards: number
    class_averages: Array<{
      class_id: string
      class_name: string
      average: number
      students: number
    }>
  }> => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) return { ok: false, error: 'No school found.' }

    const runs = repos.results
      .findBySchool(schoolId)
      .filter((r) =>
        ['computed', 'published', 'locked'].includes(r.status)
      )

    const classAverages = runs.slice(0, 12).map((run) => {
      const summaries = repos.results.findSummaries(run.id)
      const avg = summaries.length
        ? summaries.reduce((s, r) => s + r.average, 0) / summaries.length
        : 0
      return {
        class_id: run.class_id,
        class_name: repos.classes.findById(run.class_id)?.name ?? '—',
        average: Math.round(avg * 10) / 10,
        students: summaries.length,
      }
    })

    return {
      ok: true,
      data: {
        attendance_sessions: repos.attendance.findSessions(schoolId).length,
        ca_assessments: repos.ca.findBySchool(schoolId).length,
        exam_sessions: repos.exams.findBySchool(schoolId).length,
        published_results: runs.filter((r) =>
          ['published', 'locked'].includes(r.status)
        ).length,
        report_cards: repos.reportCards.findBySchool(schoolId).length,
        class_averages: classAverages,
      },
    }
  })
}
