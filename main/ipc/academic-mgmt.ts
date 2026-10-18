import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type {
  AttendanceMark,
  ExamSessionStatus,
  ResultRunStatus,
} from '../db/types'
import {
  calculateAnnual,
  hasPermission,
} from '../domain/results-calculation'
import {
  buildReportCardVerificationText,
  CAMEROON_20_BANDS,
  computeClassStats,
  defaultReportCardTemplate,
  extractGradingFromSnapshot,
  gceGradeForMark20,
  gradingScaleLegend,
  isOfferedSubjectRow,
  parseReportCardTemplateOverrides,
  parseSequenceMarksFromJson,
  rankSubjectPositions,
  type ReportCardPayload,
} from '../domain/report-card'
import {
  describeTeacherClash,
  fanOutClassIds,
  findTeacherClashes,
  isCommonSubjectAtLevel,
} from '../domain/timetable'
import {
  processAllClassesTermResults,
  processClassTermResults,
} from '../services/results/process-class-term'
import {
  calculateSequenceClassSheet,
  sequenceNamesMatch,
  type SequenceSheetKind,
  type SequenceSortMode,
} from '../services/results/sequence-results.service'
import { assetToDataUrl } from '../helpers/school-assets'
import type { SequenceScoreInput } from '../services/results/result-calculation.service'

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

  /**
   * Create one named assessment for a term across classes × subjects.
   * Default: all school classes and every subject taught in each class.
   */
  ipcMain.handle(
    'ca:open-sequence',
    (
      _e,
      input: {
        name: string
        class_ids?: string[]
        /** When true (default), use every class in the school. */
        all_classes?: boolean
        term_id?: string | null
        weight_percent?: number
        max_score?: number
        assessment_date?: string | null
        skip_existing?: boolean
      }
    ): Result<{
      created: number
      skipped: number
      class_count: number
      assessments: Array<{ id: string; class_id: string; subject_id: string; name: string }>
    }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const name = input?.name?.trim()
      if (!name) return { ok: false, error: 'Assessment name is required.' }
      if (!input?.term_id) {
        return { ok: false, error: 'Select a term for this assessment.' }
      }

      const allClasses = input.all_classes !== false
      const explicitIds = Array.isArray(input.class_ids)
        ? [...new Set(input.class_ids.filter(Boolean))]
        : []
      const schoolClasses = repos.classes.findBySchool(schoolId)
      const classIds = allClasses
        ? schoolClasses.map((c) => c.id)
        : explicitIds
      if (!classIds.length) {
        return {
          ok: false,
          error: allClasses
            ? 'No classes found. Add classes in Academic Structure first.'
            : 'Select at least one class.',
        }
      }

      const maxScore = Number(input.max_score) > 0 ? Number(input.max_score) : 20
      const weight =
        Number(input.weight_percent) > 0 ? Number(input.weight_percent) : 50
      const skipExisting = input.skip_existing !== false
      const year = repos.academicYears.getSetupDto(schoolId)
      const termId = input.term_id

      const existing = repos.ca.findBySchool(schoolId)
      let created = 0
      let skipped = 0
      const assessments: Array<{
        id: string
        class_id: string
        subject_id: string
        name: string
      }> = []

      for (const classId of classIds) {
        const subjects = repos.subjects.findByClassId(classId)
        if (!subjects.length) continue
        for (const subject of subjects) {
          const dup = existing.find(
            (a) =>
              a.class_id === classId &&
              a.subject_id === subject.id &&
              (a.term_id ?? null) === termId &&
              a.name.trim().toLowerCase() === name.toLowerCase()
          )
          if (dup) {
            if (skipExisting) {
              skipped += 1
              continue
            }
            return {
              ok: false,
              error: `“${name}” already exists for ${repos.classes.findById(classId)?.name ?? 'class'} / ${subject.name}.`,
            }
          }
          const row = repos.ca.create({
            school_id: schoolId,
            name,
            subject_id: subject.id,
            class_id: classId,
            term_id: termId,
            academic_year_id: year?.id ?? null,
            weight_percent: weight,
            max_score: maxScore,
            assessment_date:
              input.assessment_date ?? new Date().toISOString().slice(0, 10),
          })
          existing.push(row)
          assessments.push({
            id: row.id,
            class_id: classId,
            subject_id: subject.id,
            name: row.name,
          })
          created += 1
        }
      }

      if (created === 0 && skipped === 0) {
        return {
          ok: false,
          error: 'No subjects found on any class. Link subjects to classes first.',
        }
      }
      return {
        ok: true,
        data: { created, skipped, class_count: classIds.length, assessments },
      }
    }
  )

  type CaSequenceStatus = 'inactive' | 'active' | 'complete'

  function caSequenceStatus(
    expectedSlots: number,
    scoredSlots: number
  ): CaSequenceStatus {
    if (scoredSlots <= 0) return 'inactive'
    if (expectedSlots > 0 && scoredSlots >= expectedSlots) return 'complete'
    return 'active'
  }

  ipcMain.handle('ca:list-sequences', (): Result<
    Array<{
      name: string
      term_id: string | null
      term_name: string | null
      max_score: number
      created_at: string
      sheet_count: number
      class_count: number
      expected_slots: number
      scored_slots: number
      status: CaSequenceStatus
    }>
  > => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) return { ok: false, error: 'No school found.' }
    const year = repos.academicYears.getSetupDto(schoolId)
    const termMap = new Map(
      (year?.terms ?? []).map((t) => [t.id, t.name] as const)
    )
    const rows = repos.ca.findBySchool(schoolId)
    type Acc = {
      name: string
      term_id: string | null
      max_score: number
      created_at: string
      sheet_count: number
      classIds: Set<string>
      expected_slots: number
      scored_slots: number
    }
    const groups = new Map<string, Acc>()
    const studentCountCache = new Map<string, number>()

    for (const a of rows) {
      const key = `${(a.term_id ?? '')}\0${a.name.trim().toLowerCase()}`
      let g = groups.get(key)
      if (!g) {
        g = {
          name: a.name.trim(),
          term_id: a.term_id,
          max_score: a.max_score,
          created_at: a.created_at,
          sheet_count: 0,
          classIds: new Set(),
          expected_slots: 0,
          scored_slots: 0,
        }
        groups.set(key, g)
      }
      g.sheet_count += 1
      g.classIds.add(a.class_id)
      if (a.created_at < g.created_at) g.created_at = a.created_at
      if (!studentCountCache.has(a.class_id)) {
        studentCountCache.set(
          a.class_id,
          repos.students
            .findByClassId(a.class_id)
            .filter((s) => s.status === 'active').length
        )
      }
      const expected = studentCountCache.get(a.class_id) ?? 0
      g.expected_slots += expected
      const scored = repos.ca
        .findScores(a.id)
        .filter((s) => s.score != null).length
      g.scored_slots += Math.min(scored, expected || scored)
    }

    const data = [...groups.values()]
      .map((g) => ({
        name: g.name,
        term_id: g.term_id,
        term_name: g.term_id ? termMap.get(g.term_id) ?? null : null,
        max_score: g.max_score,
        created_at: g.created_at,
        sheet_count: g.sheet_count,
        class_count: g.classIds.size,
        expected_slots: g.expected_slots,
        scored_slots: g.scored_slots,
        status: caSequenceStatus(g.expected_slots, g.scored_slots),
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))

    return { ok: true, data }
  })

  ipcMain.handle(
    'ca:get-sequence',
    (
      _e,
      input: { name: string; term_id: string }
    ): Result<{
      name: string
      term_id: string
      term_name: string | null
      max_score: number
      status: CaSequenceStatus
      classes: Array<{ id: string; name: string }>
      sheets: Array<{
        id: string
        class_id: string
        class_name: string | null
        subject_id: string
        subject_name: string | null
        max_score: number
      }>
    }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const name = input?.name?.trim()
      if (!name) return { ok: false, error: 'Sequence name is required.' }
      if (!input?.term_id) return { ok: false, error: 'Term is required.' }

      const year = repos.academicYears.getSetupDto(schoolId)
      const termName =
        year?.terms.find((t) => t.id === input.term_id)?.name ?? null
      const nameKey = name.toLowerCase()
      const sheets = repos.ca
        .findBySchool(schoolId)
        .filter(
          (a) =>
            (a.term_id ?? null) === input.term_id &&
            a.name.trim().toLowerCase() === nameKey
        )
      if (!sheets.length) {
        return { ok: false, error: 'Sequence not found for this term.' }
      }

      let expected = 0
      let scored = 0
      const classMap = new Map<string, string>()
      const sheetDtos: Array<{
        id: string
        class_id: string
        class_name: string | null
        subject_id: string
        subject_name: string | null
        max_score: number
      }> = []

      for (const a of sheets) {
        const className = repos.classes.findById(a.class_id)?.name ?? null
        if (className) classMap.set(a.class_id, className)
        else classMap.set(a.class_id, className ?? '—')
        const students = repos.students
          .findByClassId(a.class_id)
          .filter((s) => s.status === 'active')
        expected += students.length
        scored += repos.ca
          .findScores(a.id)
          .filter((s) => s.score != null).length
        sheetDtos.push({
          id: a.id,
          class_id: a.class_id,
          class_name: className,
          subject_id: a.subject_id,
          subject_name:
            repos.subjects.findById(a.subject_id)?.name ?? null,
          max_score: a.max_score,
        })
      }

      sheetDtos.sort((a, b) => {
        const c = (a.class_name ?? '').localeCompare(b.class_name ?? '')
        if (c !== 0) return c
        return (a.subject_name ?? '').localeCompare(b.subject_name ?? '')
      })

      const classes = [...classMap.entries()]
        .map(([id, n]) => ({ id, name: n }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return {
        ok: true,
        data: {
          name: sheets[0].name.trim(),
          term_id: input.term_id,
          term_name: termName,
          max_score: sheets[0].max_score,
          status: caSequenceStatus(expected, scored),
          classes,
          sheets: sheetDtos,
        },
      }
    }
  )

  ipcMain.handle(
    'ca:update-sequence',
    (
      _e,
      input: {
        name: string
        term_id: string
        new_name?: string
        max_score?: number
      }
    ): Result<{ updated: number; name: string; max_score: number }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const name = input?.name?.trim()
      if (!name) return { ok: false, error: 'Sequence name is required.' }
      if (!input?.term_id) return { ok: false, error: 'Term is required.' }

      const sheets = repos.ca.findSequenceSheets(
        schoolId,
        name,
        input.term_id
      )
      if (!sheets.length) {
        return { ok: false, error: 'Sequence not found for this term.' }
      }
      if (repos.ca.hasRecordedMarks(sheets.map((s) => s.id))) {
        return {
          ok: false,
          error: 'This sequence already has marks and cannot be edited.',
        }
      }

      const newName = (input.new_name ?? name).trim()
      if (!newName) return { ok: false, error: 'Sequence name is required.' }
      const maxScore =
        input.max_score !== undefined
          ? Number(input.max_score)
          : sheets[0].max_score
      if (!maxScore || maxScore <= 0) {
        return { ok: false, error: 'Max score must be greater than zero.' }
      }

      if (newName.toLowerCase() !== name.toLowerCase()) {
        const clash = repos.ca.findSequenceSheets(
          schoolId,
          newName,
          input.term_id
        )
        if (clash.length) {
          return {
            ok: false,
            error: `“${newName}” already exists for this term.`,
          }
        }
      }

      let updated = 0
      for (const sheet of sheets) {
        repos.ca.updateAssessment(sheet.id, {
          name: newName,
          max_score: maxScore,
        })
        updated += 1
      }
      return {
        ok: true,
        data: { updated, name: newName, max_score: maxScore },
      }
    }
  )

  ipcMain.handle(
    'ca:delete-sequence',
    (
      _e,
      input: { name: string; term_id: string }
    ): Result<{ deleted: number }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const name = input?.name?.trim()
      if (!name) return { ok: false, error: 'Sequence name is required.' }
      if (!input?.term_id) return { ok: false, error: 'Term is required.' }

      const sheets = repos.ca.findSequenceSheets(
        schoolId,
        name,
        input.term_id
      )
      if (!sheets.length) {
        return { ok: false, error: 'Sequence not found for this term.' }
      }
      if (repos.ca.hasRecordedMarks(sheets.map((s) => s.id))) {
        return {
          ok: false,
          error: 'This sequence already has marks and cannot be deleted.',
        }
      }

      let deleted = 0
      const tx = repos.ca.getDb().transaction(() => {
        for (const sheet of sheets) {
          for (const score of repos.ca.findScores(sheet.id)) {
            repos.ca.softDeleteScore(score.id)
          }
          repos.ca.delete(sheet.id)
          deleted += 1
        }
      })
      tx()
      return { ok: true, data: { deleted } }
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
        teacher_name: string | null
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
      const teacherStaffId = repos.staff.findStaffIdForClassSubject(
        assessment.class_id,
        assessment.subject_id
      )
      const teacherName = teacherStaffId
        ? repos.staff.findById(teacherStaffId)?.full_name ?? null
        : null
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
            teacher_name: teacherName,
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
            name: 'Cameroon MINESEC (3 terms × 2 sequences)',
            version: 1,
            ca_weight: 100,
            exam_weight: 0,
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
    ): Result<{
      run_id: string
      students: number
      subjects: number
      profile?: string
      class_id?: string
      class_name?: string
    }> => {
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

      const existing = repos.results.findByClassTerm(
        input.class_id,
        input.term_id ?? null
      )
      if (
        existing &&
        (existing.status === 'computed' ||
          existing.status === 'approved' ||
          existing.status === 'published') &&
        session &&
        !hasPermission(
          names,
          ['results.recalculate', 'results.calculate'],
          isAdmin
        )
      ) {
        return {
          ok: false,
          error: 'Access denied to recalculate existing results.',
        }
      }

      const res = processClassTermResults(repos, {
        schoolId,
        classId: input.class_id,
        termId: input.term_id ?? null,
        actorUserId: session?.userId ?? null,
      })
      if (!res.ok) return { ok: false, error: res.error }
      return {
        ok: true,
        data: {
          run_id: res.data.run_id,
          students: res.data.students,
          subjects: res.data.subjects,
          profile: res.data.profile,
          class_id: res.data.class_id,
          class_name: res.data.class_name,
        },
      }
    }
  )

  ipcMain.handle(
    'results:bulk-process',
    (
      _e,
      input: { term_id?: string | null }
    ): Result<{
      succeeded: number
      failed: number
      skipped: number
      results: Array<{
        class_id: string
        class_name: string
        run_id?: string
        students?: number
        subjects?: number
        profile?: string
        error?: string
      }>
    }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
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

      const out = processAllClassesTermResults(repos, {
        schoolId,
        termId: input?.term_id ?? null,
        actorUserId: session?.userId ?? null,
      })
      return {
        ok: true,
        data: {
          succeeded: out.data.succeeded,
          failed: out.data.failed,
          skipped: out.data.skipped,
          results: out.data.results.map((r) =>
            'run_id' in r
              ? {
                  class_id: r.class_id,
                  class_name: r.class_name,
                  run_id: r.run_id,
                  students: r.students,
                  subjects: r.subjects,
                  profile: r.profile,
                }
              : {
                  class_id: r.class_id,
                  class_name: r.class_name,
                  error: r.error,
                }
          ),
        },
      }
    }
  )

  ipcMain.handle(
    'results:sequence-sheet',
    (
      _e,
      input: {
        class_id?: string | null
        class_ids?: string[]
        all_classes?: boolean
        term_id: string
        sequence_name: string
        sheet_kind?: SequenceSheetKind
        sort?: SequenceSortMode
      }
    ): Result<{
      school: {
        name: string
        address: string | null
        phone: string | null
        email: string | null
        logo_url: string | null
        region: string | null
      }
      academic_year: { id: string; name: string } | null
      term: { id: string; name: string; term_number: number } | null
      sequence_name: string
      sheet_kind: SequenceSheetKind
      sort: SequenceSortMode
      classes: ReturnType<typeof calculateSequenceClassSheet>[]
    }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.term_id) return { ok: false, error: 'Select a term.' }
      const sequenceName = input.sequence_name?.trim()
      if (!sequenceName) {
        return { ok: false, error: 'Select a sequence (e.g. Sequence 1).' }
      }

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
      if (
        session &&
        !hasPermission(
          names,
          ['results.read', 'results.enter', 'results.calculate'],
          session.role === 'admin'
        )
      ) {
        return { ok: false, error: 'Access denied.' }
      }

      const school = repos.schools.findById(schoolId)
      if (!school) return { ok: false, error: 'No school found.' }
      const year = repos.academicYears.getSetupDto(schoolId)
      const termRow = year?.terms.find((t) => t.id === input.term_id)
      const termDto: { id: string; name: string; term_number: number } | null =
        termRow
          ? {
              id: termRow.id,
              name: termRow.name,
              term_number: termRow.term_number,
            }
          : null

      const schoolClasses = repos.classes.findBySchool(schoolId)
      let classIds: string[] = []
      if (input.all_classes) {
        classIds = schoolClasses.map((c) => c.id)
      } else if (Array.isArray(input.class_ids) && input.class_ids.length) {
        classIds = [...new Set(input.class_ids.filter(Boolean))]
      } else if (input.class_id) {
        classIds = [input.class_id]
      }
      if (!classIds.length) {
        return { ok: false, error: 'Select at least one class.' }
      }

      const sheetKind: SequenceSheetKind =
        input.sheet_kind === 'final' ? 'final' : 'correction'
      const sort: SequenceSortMode =
        input.sort === 'merit' ? 'merit' : 'name'

      const sheets: ReturnType<typeof calculateSequenceClassSheet>[] = []

      for (const classId of classIds) {
        const classRow = repos.classes.findById(classId)
        if (!classRow) continue
        const students = repos.students
          .findByClassId(classId)
          .filter((s) => s.status === 'active')
        const subjects = repos.subjects.findByClassId(classId)
        if (!students.length || !subjects.length) continue

        const coeffMap = repos.subjectCoefficients.resolveCoefficientsMap(
          schoolId,
          subjects.map((s) => s.id),
          classId,
          classRow.academic_level_id ?? null,
          year?.id ?? null
        )

        const caAssessments = repos.ca
          .findScoresForClassTerm(classId, input.term_id)
          .filter((a) => sequenceNamesMatch(a.name, sequenceName))

        const scoresLookup = new Map<string, SequenceScoreInput | null>()
        for (const student of students) {
          for (const subject of subjects) {
            const assessment = caAssessments.find(
              (a) => a.subject_id === subject.id
            )
            if (!assessment) {
              scoresLookup.set(`${student.id}:${subject.id}`, null)
              continue
            }
            const row = assessment.scores.find(
              (x) => x.student_id === student.id
            )
            scoresLookup.set(`${student.id}:${subject.id}`, {
              name: assessment.name,
              max: assessment.max_score,
              raw: row?.score ?? null,
              status: (row?.score_status as SequenceScoreInput['status']) ?? undefined,
            })
          }
        }

        sheets.push(
          calculateSequenceClassSheet({
            classId,
            className: classRow.name,
            sequenceName,
            students: students.map((s) => ({
              id: s.id,
              name: s.name,
              student_code: s.student_code,
            })),
            subjects: subjects.map((s) => ({
              id: s.id,
              name: s.name,
              coefficient: coeffMap.get(s.id) ?? 1,
            })),
            scoresLookup,
            sort,
          })
        )
      }

      if (!sheets.length) {
        return {
          ok: false,
          error:
            'No sequence sheets could be built. Check that Sequence assessments and students exist for the selected classes.',
        }
      }

      return {
        ok: true,
        data: {
          school: {
            name: school.name,
            address: school.address ?? null,
            phone: school.phone ?? null,
            email: school.email ?? null,
            logo_url: assetToDataUrl(school.logo_path) ?? null,
            region: school.region ?? null,
          },
          academic_year: year
            ? { id: year.id, name: year.name }
            : null,
          term: termDto,
          sequence_name: sequenceName,
          sheet_kind: sheetKind,
          sort,
          classes: sheets,
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

  /**
   * Annual (promotional) average from the three term averages for a class.
   * MINESEC: (T1 + T2 + T3) / 3; pass mark default 10/20.
   */
  ipcMain.handle(
    'results:annual-summary',
    (
      _e,
      input: { class_id: string; academic_year_id?: string | null }
    ): Result<{
      class_id: string
      class_name: string
      pass_mark: number
      terms: Array<{
        term_id: string | null
        term_name: string
        term_number: number
        run_status: string | null
        student_count: number
      }>
      students: Array<{
        student_id: string
        student_name: string
        student_code: string | null
        term_averages: Array<{
          term_id: string | null
          term_number: number
          average: number | null
        }>
        annual_average: number | null
        status: 'PASSED' | 'FAILED' | 'INCOMPLETE'
      }>
    }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }

      const year = repos.academicYears.getSetupDto(schoolId)
      const terms = [...(year?.terms ?? [])].sort((a, b) => {
        const an = (a as { term_number?: number }).term_number ?? 0
        const bn = (b as { term_number?: number }).term_number ?? 0
        if (an !== bn) return an - bn
        return a.name.localeCompare(b.name)
      })
      const classRow = repos.classes.findById(input.class_id)
      const profile = repos.resultCalc.resolveForClass(
        schoolId,
        input.class_id,
        classRow?.academic_level_id ?? null,
        year?.id ?? null
      )
      const passMark = profile?.config.pass_mark ?? 10
      const annualCfg = profile?.config.annual ?? {
        method: 'average' as const,
        term_weights: [],
        best_n: null,
      }

      const termMeta = terms.map((t, i) => {
        const termNumber =
          (t as { term_number?: number }).term_number ?? i + 1
        const run = repos.results.findByClassTerm(input.class_id, t.id)
        const summaries = run ? repos.results.findSummaries(run.id) : []
        return {
          term_id: t.id as string | null,
          term_name: t.name,
          term_number: termNumber,
          run_status: run?.status ?? null,
          student_count: summaries.length,
          summaries,
        }
      })

      const studentIds = new Set<string>()
      for (const t of termMeta) {
        for (const s of t.summaries) studentIds.add(s.student_id)
      }

      const students = [...studentIds].map((studentId) => {
        const student = repos.students.findById(studentId)
        const term_averages = termMeta.map((t) => {
          const row = t.summaries.find((s) => s.student_id === studentId)
          return {
            term_id: t.term_id,
            term_number: t.term_number,
            average: row?.average ?? null,
          }
        })
        const present = term_averages
          .map((t) => t.average)
          .filter((v): v is number => v != null && !Number.isNaN(v))
        const annual_average =
          termMeta.length > 0 && present.length === termMeta.length
            ? calculateAnnual(present, annualCfg)
            : null
        let status: 'PASSED' | 'FAILED' | 'INCOMPLETE' = 'INCOMPLETE'
        if (annual_average != null) {
          status = annual_average >= passMark ? 'PASSED' : 'FAILED'
        }
        return {
          student_id: studentId,
          student_name: student?.name ?? 'Student',
          student_code: student?.student_code ?? null,
          term_averages,
          annual_average:
            annual_average != null
              ? Math.round(annual_average * 100) / 100
              : null,
          status,
        }
      })

      students.sort((a, b) => a.student_name.localeCompare(b.student_name))

      return {
        ok: true,
        data: {
          class_id: input.class_id,
          class_name: classRow?.name ?? '',
          pass_mark: passMark,
          terms: termMeta.map(({ summaries: _s, ...rest }) => rest),
          students,
        },
      }
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
    async (
      _e,
      input: { class_id: string; term_id?: string | null }
    ): Promise<Result<{ generated: number }>> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }

      const run = repos.results.findByClassTerm(
        input.class_id,
        input.term_id ?? null
      )
      if (
        !run ||
        (run.status !== 'computed' &&
          run.status !== 'published' &&
          run.status !== 'locked' &&
          run.status !== 'approved')
      ) {
        return {
          ok: false,
          error:
            'Process results for this class/term before generating report cards.',
        }
      }

      const QRCode = (await import('qrcode')).default

      const school = repos.schools.findById(schoolId)
      const year = repos.academicYears.getSetupDto(schoolId)
      const cls = repos.classes.findById(input.class_id)
      const className = cls?.name ?? ''
      const department =
        cls?.section_id != null
          ? repos.sections.findById(cls.section_id)?.name ?? null
          : null
      const termName =
        year?.terms.find((t) => t.id === input.term_id)?.name ?? null
      const summaries = repos.results.findSummaries(run.id)
      const subjectRows = repos.results.findSubjectRows(run.id)
      const template = repos.documentTemplates.findByKey(schoolId, 'report_card')
      const templateSnap = defaultReportCardTemplate(
        parseReportCardTemplateOverrides(template?.body_text)
      )
      if (template?.header_text?.trim()) {
        templateSnap.title_en = template.header_text.trim()
      }
      const gradingBands =
        extractGradingFromSnapshot(run.snapshot_json) ?? CAMEROON_20_BANDS
      const classStats = computeClassStats(summaries.map((s) => s.average))
      const grading_scale = gradingScaleLegend(gradingBands)

      const subjectPositionMap = rankSubjectPositions(
        subjectRows.map((r) => ({
          student_id: r.student_id,
          subject_id: r.subject_id,
          mark: r.subject_mark ?? r.total ?? null,
        }))
      )

      const teacherCache = new Map<string, string | null>()
      function teacherFor(subjectId: string): string | null {
        const key = `${input.class_id}:${subjectId}`
        if (teacherCache.has(key)) return teacherCache.get(key) ?? null
        const staffId = repos.staff.findStaffIdForClassSubject(
          input.class_id,
          subjectId
        )
        const name = staffId
          ? repos.staff.findById(staffId)?.full_name ?? null
          : null
        teacherCache.set(key, name)
        return name
      }

      let motto: string | null = null
      try {
        motto = repos.studentIdCards.getSettings(schoolId).motto || null
      } catch {
        motto = null
      }

      let principal_name: string | null = null
      let principal_title: string | null = null
      try {
        const signs = repos.documents.listSignatories(schoolId)
        const principal =
          signs.find((s) => s.role_key === 'principal' && s.is_active !== 0) ||
          signs.find((s) => s.role_key === 'headteacher' && s.is_active !== 0) ||
          signs[0]
        principal_name = principal?.display_name || null
        principal_title = principal?.title || null
      } catch {
        /* optional */
      }

      const schoolBlock = {
        name: school?.name ?? 'School',
        motto,
        address: school?.address ?? null,
        phone: school?.phone ?? null,
        email: school?.email ?? null,
        website: school?.website ?? null,
        logo_url: assetToDataUrl(school?.logo_path) || null,
        stamp_url: assetToDataUrl(school?.stamp_path) || null,
        signature_url: assetToDataUrl(school?.principal_signature_path) || null,
        principal_name,
        principal_title,
      }

      let generated = 0
      for (const summary of summaries) {
        const student = repos.students.findById(summary.student_id)
        if (!student) continue
        const status =
          summary.status ??
          (summary.average >= 10 ? 'PASSED' : 'FAILED')
        const subjects = subjectRows
          .filter((r) => r.student_id === summary.student_id)
          .filter((r) =>
            isOfferedSubjectRow({
              ca_score: r.ca_average ?? r.ca_score,
              exam_score: r.exam_score,
              subject_mark: r.subject_mark ?? r.total,
              total: r.total,
            })
          )
          .map((r) => {
            const mark = r.subject_mark ?? r.total
            const sequence_marks = parseSequenceMarksFromJson(
              r.sequence_scores_json
            )
            return {
              subject_id: r.subject_id,
              subject_name: repos.subjects.findById(r.subject_id)?.name ?? '—',
              teacher_name: teacherFor(r.subject_id),
              competences: null as string | null,
              sequence_marks,
              ca_score: r.ca_average ?? r.ca_score,
              exam_score: r.exam_score,
              subject_mark: mark,
              coefficient: r.coefficient ?? 1,
              weighted_mark:
                r.weighted_mark ??
                (mark != null ? mark * (r.coefficient ?? 1) : null),
              grade: r.grade,
              gce_grade: gceGradeForMark20(mark),
              subject_position:
                subjectPositionMap.get(
                  `${summary.student_id}:${r.subject_id}`
                ) ?? null,
              remark: r.remark ?? '',
            }
          })

        const verification_text = buildReportCardVerificationText({
          schoolName: schoolBlock.name,
          studentName: student.name,
          studentCode: student.student_code,
          className,
          yearName: year?.name ?? null,
          termName,
          average: summary.average,
          position: summary.position,
          classSize: classStats.class_size,
          status,
        })

        let qr_data_url: string | null = null
        try {
          qr_data_url = await QRCode.toDataURL(verification_text, {
            width: 120,
            margin: 1,
            errorCorrectionLevel: 'M',
          })
        } catch {
          qr_data_url = null
        }

        const payloadObj: ReportCardPayload = {
          schema_version: 1,
          template: templateSnap,
          school: schoolBlock,
          document: {
            header: template?.header_text ?? templateSnap.title_en,
            footer:
              template?.footer_text ??
              'Official school record — keep for your files.',
          },
          student: {
            name: student.name,
            student_code: student.student_code,
            date_of_birth: student.date_of_birth,
            gender: student.gender,
            class_name: className,
            department,
          },
          academic: {
            year_name: year?.name ?? null,
            term_name: termName,
          },
          subjects,
          summary: {
            total_weighted_marks: summary.total_weighted_marks ?? summary.total,
            total_coefficients: summary.total_coefficients ?? null,
            average: summary.average,
            grade: summary.grade,
            gce_grade: gceGradeForMark20(summary.average),
            position: summary.position,
            class_size: classStats.class_size,
            class_average: classStats.class_average,
            highest_average: classStats.highest_average,
            lowest_average: classStats.lowest_average,
            status,
            remark: summary.remark,
          },
          grading_scale,
          qr_data_url,
          verification_text,
        }

        // Backward-compatible flat keys for older views / consumers
        const payload = JSON.stringify({
          ...payloadObj,
          school_name: schoolBlock.name,
          header: payloadObj.document.header,
          footer: payloadObj.document.footer,
          student_name: student.name,
          student_code: student.student_code,
          class_name: className,
          term_name: termName,
          year_name: year?.name ?? null,
          total_weighted_marks: payloadObj.summary.total_weighted_marks,
          total_coefficients: payloadObj.summary.total_coefficients,
          average: payloadObj.summary.average,
          total: summary.total,
          grade: payloadObj.summary.grade,
          position: payloadObj.summary.position,
          status: payloadObj.summary.status,
          remark: payloadObj.summary.remark,
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
