import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type {
  AttendanceMark,
  ExamSessionStatus,
  ResultRunStatus,
} from '../db/types'
import { cameroonStandardSecondary20, hasPermission, profileLabel } from '../domain/results-calculation'
import {
  describeTeacherClash,
  fanOutClassIds,
  findTeacherClashes,
  isCommonSubjectAtLevel,
} from '../domain/timetable'
import { calculateClassResults } from '../services/results/result-calculation.service'

const DAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  const schools = repos.schools.findAll()
  return schools[0]?.id ?? null
}

export function registerAcademicMgmtIpc(repos: Repositories): void {
  ipcMain.handle('academic:meta', (): Result<{
    classes: Array<{
      id: string
      name: string
      academic_level_id: string | null
    }>
    subjects: Array<{
      id: string
      name: string
      class_ids: string[]
      is_common: boolean
      level_class_ids: string[]
    }>
    teachers: Array<{
      id: string
      full_name: string
      assignments: Array<{ class_id: string; subject_id: string }>
    }>
    terms: Array<{ id: string; name: string; term_number: number }>
    academic_year: { id: string; name: string } | null
    periods: number
    period_times: Array<{
      period_number: number
      label: string
      start_time: string
      end_time: string
    }>
    breaks: Array<{
      name: string
      after_period: number
      start_time: string
      end_time: string
      duration_minutes: number
    }>
    day_start_time: string
    day_end_time: string
    period_duration_minutes: number
    days: Array<{ day: number; label: string }>
  }> => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) return { ok: false, error: 'No school found.' }

    const yearSetup = repos.academicYears.getSetupDto(schoolId)
    const classRows = repos.classes
      .findStructureClasses(schoolId)
      .filter((c) => c.is_active === 1)
    const classRefs = classRows.map((c) => ({
      id: c.id,
      academic_level_id: c.academic_level_id,
    }))

    const subjects = repos.subjects.findBySchoolWithClasses(schoolId).map((s) => {
      const anchor = s.class_ids[0] ?? ''
      const is_common = anchor
        ? isCommonSubjectAtLevel(
            { id: s.id, class_ids: s.class_ids },
            anchor,
            classRefs
          )
        : false
      const level_class_ids = is_common
        ? fanOutClassIds({ id: s.id, class_ids: s.class_ids }, anchor, classRefs)
        : s.class_ids
      return {
        id: s.id,
        name: s.name,
        class_ids: s.class_ids,
        is_common,
        level_class_ids,
      }
    })

    const daySchedule = repos.schools.getDayScheduleDto(schoolId)

    return {
      ok: true,
      data: {
        classes: classRows.map((c) => ({
          id: c.id,
          name: c.name,
          academic_level_id: c.academic_level_id,
        })),
        subjects,
        teachers: repos.staff
          .findBySchool(schoolId)
          .filter((s) => s.staff_type === 'teaching' && s.status === 'active')
          .map((s) => ({
            id: s.id,
            full_name: s.full_name,
            assignments: repos.staff.findAssignments(s.id),
          })),
        terms: yearSetup?.terms ?? [],
        academic_year: yearSetup
          ? { id: yearSetup.id, name: yearSetup.name }
          : null,
        periods: daySchedule.periods_per_day,
        period_times: daySchedule.periods,
        breaks: daySchedule.blocks
          .filter((b) => b.kind === 'break')
          .map((b) => ({
            name: b.name,
            after_period: b.after_period,
            start_time: b.start_time,
            end_time: b.end_time,
            duration_minutes: b.duration_minutes,
          })),
        day_start_time: daySchedule.day_start_time,
        day_end_time: daySchedule.day_end_time,
        period_duration_minutes: daySchedule.period_duration_minutes,
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
    ): Result<{
      slots: unknown[]
      synced_class_ids: string[]
      is_common: boolean
    }> => {
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

      const maxPeriods =
        repos.schools.getDayScheduleConfig(schoolId).periods_per_day
      if (input.period_number > maxPeriods) {
        return {
          ok: false,
          error: `Period must be between 1 and ${maxPeriods}.`,
        }
      }

      const classRefs = repos.classes
        .findStructureClasses(schoolId)
        .filter((c) => c.is_active === 1)
        .map((c) => ({
          id: c.id,
          academic_level_id: c.academic_level_id,
        }))

      const subjectRow = input.subject_id
        ? repos.subjects.findBySchoolWithClasses(schoolId).find(
            (s) => s.id === input.subject_id
          )
        : null
      const subjectRef = subjectRow
        ? { id: subjectRow.id, class_ids: subjectRow.class_ids }
        : null

      const targetClassIds =
        subjectRef && input.subject_id
          ? fanOutClassIds(subjectRef, input.class_id, classRefs)
          : [input.class_id]
      const is_common = subjectRef
        ? isCommonSubjectAtLevel(subjectRef, input.class_id, classRefs)
        : false

      const existingSlots = repos.timetable.findBySchool(schoolId)
      const staffByClass = new Map<string, string | null>()
      for (const classId of targetClassIds) {
        const assigned = input.subject_id
          ? repos.staff.findStaffIdForClassSubject(classId, input.subject_id)
          : null
        const staffId =
          (classId === input.class_id ? input.staff_id : null) || assigned
        staffByClass.set(classId, staffId)
      }

      for (const [classId, staffId] of staffByClass) {
        if (!staffId) continue
        const clashes = findTeacherClashes({
          staffId,
          day_of_week: input.day_of_week,
          period_number: input.period_number,
          subject_id: input.subject_id ?? null,
          target_class_ids: targetClassIds,
          existing: existingSlots,
        })
        if (clashes.length > 0) {
          const clash = clashes[0]
          const teacher = repos.staff.findById(staffId)?.full_name
          const otherClass = repos.classes.findById(clash.class_id)?.name
          const otherSubject = clash.subject_id
            ? repos.subjects.findById(clash.subject_id)?.name
            : null
          return {
            ok: false,
            error: describeTeacherClash(clash, {
              teacher,
              class_name: otherClass,
              subject_name: otherSubject,
              day_label: DAY_LABELS[clash.day_of_week],
            }),
          }
        }
        void classId
      }

      const saved = []
      for (const classId of targetClassIds) {
        const slot = repos.timetable.upsertSlot({
          id: classId === input.class_id ? input.id : null,
          school_id: schoolId,
          class_id: classId,
          subject_id: input.subject_id ?? null,
          staff_id: staffByClass.get(classId) ?? null,
          day_of_week: input.day_of_week,
          period_number: input.period_number,
          room: input.room ?? null,
        })
        saved.push(slot)
      }

      return {
        ok: true,
        data: {
          slots: saved,
          synced_class_ids: targetClassIds,
          is_common,
        },
      }
    }
  )

  ipcMain.handle(
    'timetable:clear-slot',
    (
      _e,
      input: { class_id: string; day_of_week: number; period_number: number }
    ): Result<{ cleared: boolean; synced_class_ids: string[] }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }

      const cell = repos.timetable
        .findByClass(input.class_id)
        .find(
          (s) =>
            s.day_of_week === input.day_of_week &&
            s.period_number === input.period_number
        )

      let targetClassIds = [input.class_id]
      if (cell?.subject_id) {
        const subjectRow = repos.subjects
          .findBySchoolWithClasses(schoolId)
          .find((s) => s.id === cell.subject_id)
        if (subjectRow) {
          const classRefs = repos.classes
            .findStructureClasses(schoolId)
            .filter((c) => c.is_active === 1)
            .map((c) => ({
              id: c.id,
              academic_level_id: c.academic_level_id,
            }))
          targetClassIds = fanOutClassIds(
            { id: subjectRow.id, class_ids: subjectRow.class_ids },
            input.class_id,
            classRefs
          )
          // Only clear other classes when they hold the same subject in that slot.
          targetClassIds = targetClassIds.filter((classId) => {
            if (classId === input.class_id) return true
            const other = repos.timetable
              .findByClass(classId)
              .find(
                (s) =>
                  s.day_of_week === input.day_of_week &&
                  s.period_number === input.period_number
              )
            return other?.subject_id === cell.subject_id
          })
        }
      }

      for (const classId of targetClassIds) {
        repos.timetable.clearCell(
          classId,
          input.day_of_week,
          input.period_number
        )
      }
      return {
        ok: true,
        data: { cleared: true, synced_class_ids: targetClassIds },
      }
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
        calculation_version?: number | null
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
        total_coefficients?: number | null
        total_weighted_marks?: number | null
        passed_subjects?: number | null
        status?: string | null
      }>
      subject_rows: Array<{
        student_id: string
        subject_id: string
        subject_name: string | null
        ca_score: number
        exam_score: number
        total: number
        grade: string | null
        ca_average?: number | null
        subject_mark?: number | null
        coefficient?: number
        weighted_mark?: number
        sequence_scores?: unknown[]
        remark?: string | null
      }>
      class_summary?: {
        total_students: number
        processed_students: number
        incomplete_students: number
        passed_students: number
        failed_students: number
        class_average: number | null
        highest_average: number | null
        lowest_average: number | null
      } | null
      calculation_profile?: {
        id: string
        name: string
        version: number
        ca_weight: number
        exam_weight: number
        pass_mark: number
        sequence_method: string
        rounding_places: number | string
        scale: number
        status: string
      } | null
    }> => {
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }
      const schoolId = resolveSchoolId(repos)
      const classRow = repos.classes.findById(input.class_id)
      const year = schoolId ? repos.academicYears.getSetupDto(schoolId) : null

      const profile = schoolId
        ? repos.resultCalc.resolveForClass(
            schoolId,
            input.class_id,
            classRow?.academic_level_id ?? null,
            year?.id ?? null
          )
        : null

      const caWeight = profile?.config.ca_weight ?? 40
      const examWeight = profile?.config.exam_weight ?? 60
      const passMark = profile?.config.pass_mark ?? 10
      const seqMethod = profile?.config.sequence_method ?? 'simple_average'
      const roundingPlaces = profile?.config.rounding?.places ?? 2
      const scale = profile?.config.scale ?? 20

      const profileSummary = profile
        ? {
            id: profile.profile.id,
            name: profile.profile.name,
            version: profile.version_number,
            ca_weight: caWeight,
            exam_weight: examWeight,
            pass_mark: passMark,
            sequence_method: seqMethod,
            rounding_places: roundingPlaces,
            scale,
            status: profile.profile.status,
          }
        : {
            id: 'default',
            name: 'Cameroon Secondary Standard (40/60)',
            version: 1,
            ca_weight: 40,
            exam_weight: 60,
            pass_mark: 10,
            sequence_method: 'simple_average',
            rounding_places: 2,
            scale: 20,
            status: 'active',
          }

      const run = repos.results.findByClassTerm(
        input.class_id,
        input.term_id ?? null
      )
      if (!run) {
        return {
          ok: true,
          data: {
            run: null,
            summaries: [],
            subject_rows: [],
            class_summary: null,
            calculation_profile: profileSummary,
          },
        }
      }

      const summaries = repos.results.findSummaries(run.id).map((s) => {
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
          total_coefficients: s.total_coefficients ?? null,
          total_weighted_marks: s.total_weighted_marks ?? null,
          passed_subjects: s.passed_subjects ?? null,
          status: s.status ?? (s.average >= passMark ? 'PASSED' : 'FAILED'),
        }
      })

      const subjectRows = repos.results.findSubjectRows(run.id).map((r) => {
        let seqScores: unknown[] = []
        if (r.sequence_scores_json) {
          try {
            seqScores = JSON.parse(r.sequence_scores_json)
          } catch {
            seqScores = []
          }
        }
        return {
          student_id: r.student_id,
          subject_id: r.subject_id,
          subject_name: repos.subjects.findById(r.subject_id)?.name ?? null,
          ca_score: r.ca_score,
          exam_score: r.exam_score,
          total: r.total,
          grade: r.grade,
          ca_average: r.ca_average ?? r.ca_score,
          subject_mark: r.subject_mark ?? r.total,
          coefficient: r.coefficient ?? 1,
          weighted_mark: r.weighted_mark ?? r.total * (r.coefficient ?? 1),
          sequence_scores: seqScores,
          remark: r.remark ?? null,
        }
      })

      const avgs = summaries.map((s) => s.average).filter((v) => v != null)
      const passedCount = summaries.filter(
        (s) => s.status === 'PASSED' || (s.average >= passMark && s.status !== 'FAILED')
      ).length
      const failedCount = summaries.filter(
        (s) => s.status === 'FAILED' || (s.average < passMark && s.status !== 'PASSED')
      ).length
      const incompleteCount = summaries.filter(
        (s) => s.status === 'INCOMPLETE'
      ).length

      const classSummary = {
        total_students: summaries.length,
        processed_students: summaries.length,
        incomplete_students: incompleteCount,
        passed_students: passedCount,
        failed_students: failedCount,
        class_average:
          avgs.length > 0
            ? Number((avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2))
            : null,
        highest_average: avgs.length > 0 ? Math.max(...avgs) : null,
        lowest_average: avgs.length > 0 ? Math.min(...avgs) : null,
      }

      return {
        ok: true,
        data: {
          run: {
            id: run.id,
            status: run.status,
            computed_at: run.computed_at,
            published_at: run.published_at,
            calculation_version: run.calculation_version ?? profile?.version_number ?? 1,
          },
          summaries,
          subject_rows: subjectRows,
          class_summary: classSummary,
          calculation_profile: profileSummary,
        },
      }
    }
  )

  ipcMain.handle(
    'results:process',
    (
      _e,
      input: { class_id: string; term_id?: string | null }
    ): Result<{ run_id: string; students: number; subjects: number; profile?: string }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }
      const session = getSession()
      const names = session
        ? (() => {
            try {
              return repos.roles.getPermissionNamesForUser(session.userId)
            } catch {
              return [] as string[]
            }
          })()
        : []
      const isAdmin = session?.role === 'admin'
      if (
        session &&
        !hasPermission(
          names,
          ['results.calculate', 'results.enter', 'results.update'],
          isAdmin
        )
      ) {
        return { ok: false, error: 'Access denied.' }
      }

      const year = repos.academicYears.getSetupDto(schoolId)
      const classRow = repos.classes.findById(input.class_id)
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
      if (
        run &&
        (run.status === 'computed' ||
          run.status === 'approved' ||
          run.status === 'published') &&
        session &&
        !hasPermission(names, ['results.recalculate', 'results.calculate'], isAdmin)
      ) {
        return { ok: false, error: 'Access denied to recalculate existing results.' }
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

      const profile = repos.resultCalc.resolveForClass(
        schoolId,
        input.class_id,
        classRow?.academic_level_id ?? null,
        year?.id ?? null
      )

      const effectiveProfile = profile ?? {
        profile: {
          id: 'default-profile',
          school_id: schoolId,
          name: 'Cameroon Secondary Standard (40% CA + 60% Exam)',
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
        config: cameroonStandardSecondary20(),
        assignments: [],
        used_in_results: false,
      }

      const coeffMap = repos.subjectCoefficients.resolveCoefficientsMap(
        schoolId,
        subjects.map((s) => s.id),
        input.class_id,
        classRow?.academic_level_id ?? null,
        year?.id ?? null
      )

      const caAssessments = repos.ca.findScoresForClassTerm(
        input.class_id,
        input.term_id ?? null
      )
      const examPapers = repos.exams.findPapersByClass(
        input.class_id,
        input.term_id ?? null
      )

      const scoresLookup = new Map<
        string,
        {
          sequences: Array<{ name: string; max: number; raw: number | null; status?: any }>
          exam: { name: string; max: number; raw: number | null; status?: any } | null
        }
      >()

      for (const student of students) {
        for (const subject of subjects) {
          const ca = caAssessments
            .filter((a) => a.subject_id === subject.id)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
            .map((a) => {
              const row = a.scores.find((x) => x.student_id === student.id)
              return {
                name: a.name,
                max: a.max_score,
                raw: row?.score ?? null,
                status: (row?.score_status as never) ?? undefined,
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
              status: (row?.score_status as never) ?? undefined,
            }
          }

          scoresLookup.set(`${student.id}:${subject.id}`, { sequences: ca, exam })
        }
      }

      const out = calculateClassResults({
        classId: input.class_id,
        termId: input.term_id ?? null,
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

      repos.results.attachCalculationSnapshot(run.id, {
        calculation_profile_id: effectiveProfile.profile.id,
        calculation_version: effectiveProfile.version_number,
        calculation_hash: out.config_hash,
        snapshot_json: JSON.stringify({
          label: profileLabel(
            effectiveProfile.profile.name,
            year?.name ?? null,
            effectiveProfile.version_number
          ),
          config: effectiveProfile.config,
        }),
        calculated_by: session?.userId ?? null,
      })

      repos.results.updateStatus(run.id, 'computed', {
        computed_at: new Date().toISOString(),
      })

      try {
        repos.systemAdmin.writeAudit({
          school_id: schoolId,
          actor_user_id: session?.userId ?? null,
          action: run ? 'results.recalculate' : 'results.calculate',
          module_key: 'results',
          entity_type: 'result_run',
          entity_id: run.id,
          description: `Calculated results for ${students.length} students using ${effectiveProfile.profile.name}`,
        })
      } catch {
        /* ignore */
      }

      return {
        ok: true,
        data: {
          run_id: run.id,
          students: students.length,
          subjects: subjects.length,
          profile: profileLabel(
            effectiveProfile.profile.name,
            year?.name ?? null,
            effectiveProfile.version_number
          ),
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
      if (
        run.status !== 'computed' &&
        run.status !== 'approved' &&
        run.status !== 'published'
      ) {
        return { ok: false, error: 'Process results before publishing.' }
      }
      const session = getSession()
      if (session) {
        const names = (() => {
          try {
            return repos.roles.getPermissionNamesForUser(session.userId)
          } catch {
            return [] as string[]
          }
        })()
        const need = input.lock ? ['results.lock'] : ['results.publish']
        if (!hasPermission(names, need, session.role === 'admin')) {
          return { ok: false, error: 'Access denied.' }
        }
      }
      const status: ResultRunStatus = input.lock ? 'locked' : 'published'
      repos.results.updateStatus(run.id, status, {
        published_at: new Date().toISOString(),
      })
      return { ok: true, data: { status } }
    }
  )

  ipcMain.handle(
    'results:approve',
    (
      _e,
      input: { class_id: string; term_id?: string | null }
    ): Result<{ status: ResultRunStatus }> => {
      const session = getSession()
      if (!session) return { ok: false, error: 'Access denied.' }
      const names = (() => {
        try {
          return repos.roles.getPermissionNamesForUser(session.userId)
        } catch {
          return [] as string[]
        }
      })()
      if (!hasPermission(names, ['results.approve', 'results.review'], session.role === 'admin')) {
        return { ok: false, error: 'Access denied.' }
      }
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }
      const run = repos.results.findByClassTerm(
        input.class_id,
        input.term_id ?? null
      )
      if (!run) return { ok: false, error: 'No computed results to approve.' }
      if (run.status === 'locked') {
        return { ok: false, error: 'Results are locked.' }
      }
      if (run.status !== 'computed' && run.status !== 'approved') {
        return { ok: false, error: 'Process results before approving.' }
      }
      repos.results.updateStatus(run.id, 'approved')
      try {
        repos.systemAdmin.writeAudit({
          school_id: run.school_id,
          actor_user_id: session.userId,
          action: 'results.approve',
          module_key: 'results',
          entity_type: 'result_run',
          entity_id: run.id,
          description: 'Approved class results',
        })
      } catch {
        /* ignore */
      }
      return { ok: true, data: { status: 'approved' } }
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
            ca_score: r.ca_average ?? r.ca_score,
            exam_score: r.exam_score,
            subject_mark: r.subject_mark ?? r.total,
            total: r.subject_mark ?? r.total,
            coefficient: r.coefficient ?? 1,
            weighted_mark: r.weighted_mark ?? (r.total * (r.coefficient ?? 1)),
            grade: r.grade,
            remark: r.remark ?? '',
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
          total_weighted_marks: summary.total_weighted_marks ?? summary.total,
          total_coefficients: summary.total_coefficients ?? null,
          average: summary.average,
          total: summary.total,
          grade: summary.grade,
          position: summary.position,
          status: summary.status ?? (summary.average >= 10 ? 'PASSED' : 'FAILED'),
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
