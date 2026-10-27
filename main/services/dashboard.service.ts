/**
 * Dashboard aggregation — single entry point for /home overview data.
 * All queries are local SQLite via existing repositories.
 */

import type Database from 'better-sqlite3'
import type { Repositories } from '../db/repositories'
import type { SessionData } from '../auth'
import {
  aggregateAcademicPerformance,
  aggregateDistribution,
  buildAttendanceTrend,
  buildFeeCollectionTrend,
  feePeriodStats,
  formatCompactCurrency,
  greetingForHour,
  isIncompleteStudentProfile,
  resolveAttendanceRange,
  shouldShowDepartmentDonut,
  suggestFeeGranularity,
  summarizeAttendanceMarks,
  todayIso,
  type AttendanceTrendRange,
  type AttentionItem,
  type DashboardDistributionMode,
  type DailyAttendancePoint,
  type DistributionBar,
  type PerformanceBar,
  type TrendPoint,
} from '../domain/dashboard'
import { getSetupProgress, type SetupProgress } from '../ipc/setup'

export interface DashboardSummaryInput {
  academicYearId?: string | null
  termId?: string | null
  attendanceRange?: AttendanceTrendRange
  distributionMode?: DashboardDistributionMode
}

export interface DashboardSummary {
  greeting: string
  userName: string
  schoolName: string
  today: string
  role: string
  capabilities: {
    showFinance: boolean
    showAcademic: boolean
    showAttendance: boolean
    showEnrollment: boolean
    showAdmin: boolean
  }
  context: {
    years: Array<{ id: string; name: string; is_current: number }>
    terms: Array<{
      id: string
      name: string
      academic_year_id: string
      start_date: string
      end_date: string
    }>
    academicYearId: string | null
    termId: string | null
    periodFrom: string | null
    periodTo: string | null
    currency: string
  }
  students: {
    total: number
    label: string
    href: string
    available: boolean
  }
  teachers: {
    total: number
    label: string
    href: string
    available: boolean
  }
  attendanceToday: {
    recorded: boolean
    rate: number | null
    present: number
    late: number
    absent: number
    excused: number
    href: string
    summary: string
  }
  feesCollected: {
    available: boolean
    amount: number
    display: string
    percentOfExpected: number | null
    hint: string
    href: string
  } | null
  feesOutstanding: {
    available: boolean
    amount: number
    display: string
    studentCount: number
    href: string
  } | null
  attendanceTrend: {
    range: AttendanceTrendRange
    points: TrendPoint[]
    available: boolean
    summary: string
    href: string
  }
  feeCollectionTrend: {
    points: TrendPoint[]
    available: boolean
    summary: string
    href: string
  } | null
  studentDistribution: {
    mode: DashboardDistributionMode
    bars: DistributionBar[]
    available: boolean
    summary: string
  }
  departmentComposition: {
    available: boolean
    bars: DistributionBar[]
    total: number
    summary: string
  } | null
  academicPerformance: {
    bars: PerformanceBar[]
    available: boolean
    summary: string
    href: string
  }
  attendanceByLevel: {
    bars: Array<{ id: string; label: string; rate: number }>
    available: boolean
    summary: string
  }
  attention: AttentionItem[]
  recentActivity: Array<{
    id: string
    at: string
    label: string
    source: string
  }>
  pendingAdmissions: Array<{
    id: string
    full_name: string
    detail: string
    created_at: string
    href: string
  }>
  setupProgress: SetupProgress
  errors: Partial<
    Record<
      | 'students'
      | 'attendance'
      | 'finance'
      | 'academic'
      | 'activity'
      | 'attention',
      string
    >
  >
}

function displayName(session: SessionData): string {
  const email = session.email || ''
  const local = email.split('@')[0] || 'there'
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function canSeeFinance(role: string): boolean {
  return role === 'admin' || role === 'secretary' || role === 'bursar'
}

export function buildDashboardSummary(
  db: Database.Database,
  repos: Repositories,
  session: SessionData,
  input: DashboardSummaryInput = {}
): DashboardSummary {
  const schoolId = session.schoolId || repos.schools.findLatest()?.id || ''
  const school = repos.schools.findById(schoolId) ?? repos.schools.findLatest()
  const schoolName = school?.name ?? session.schoolName ?? 'School'
  const today = todayIso()
  const hour = new Date().getHours()
  const role = session.role
  const showFinance = canSeeFinance(role)
  const showAdmin = role === 'admin' || role === 'secretary'

  const errors: DashboardSummary['errors'] = {}

  const years = schoolId
    ? repos.academicYears
        .findAll()
        .filter((y) => y.school_id === schoolId)
        .map((y) => ({
          id: y.id,
          name: y.name,
          is_current: y.is_current,
        }))
    : []

  let academicYearId =
    input.academicYearId ||
    years.find((y) => y.is_current === 1)?.id ||
    years[0]?.id ||
    null

  const yearRow = academicYearId
    ? repos.academicYears.findById(academicYearId)
    : undefined

  const terms = academicYearId
    ? repos.academicYears.findTerms(academicYearId).map((t) => ({
        id: t.id,
        name: t.name,
        academic_year_id: t.academic_year_id,
        start_date: t.start_date,
        end_date: t.end_date,
      }))
    : []

  let termId = input.termId ?? null
  const allTerms = termId === 'all'
  if (allTerms) {
    termId = null
  } else {
    if (termId && !terms.some((t) => t.id === termId)) termId = null
    if (!termId) {
      const enclosing = terms.find(
        (t) => t.start_date <= today && t.end_date >= today
      )
      termId = enclosing?.id ?? terms[0]?.id ?? null
    }
  }
  const term = termId ? (terms.find((t) => t.id === termId) ?? null) : null

  const periodFrom =
    term?.start_date ?? yearRow?.start_date ?? null
  const periodTo = term?.end_date ?? yearRow?.end_date ?? today
  const contextTermId = allTerms ? 'all' : termId

  let currency = 'XAF'
  if (schoolId) {
    try {
      // Auto-create finance_settings when setup never ran / second desk has not
      // pulled them yet — dashboard must not hard-fail for bursars.
      repos.finance.ensureDefaults(schoolId)
      currency = repos.financeMgmt.getSettings(schoolId).currency || 'XAF'
    } catch {
      currency = 'XAF'
    }
  }

  // Teacher scope: limit to assigned classes when available
  let teacherClassIds: Set<string> | null = null
  if (role === 'teacher') {
    const staff = repos.staff.findByUserId(session.userId)
    if (staff) {
      const ids = repos.staff.findClassIds(staff.id)
      if (ids.length) teacherClassIds = new Set(ids)
    }
  }

  /* ---------- Students ---------- */
  let studentsTotal = 0
  let activeStudents: Array<{
    id: string
    class_id: string
    academic_level_id: string | null
    gender: string | null
    date_of_birth: string | null
    guardian_phone: string | null
  }> = []
  try {
    const all = schoolId
      ? repos.students.findBySchool(schoolId, 'active')
      : repos.students.findAll().filter((s) => s.status === 'active')
    activeStudents = all
      .filter((s) => !teacherClassIds || teacherClassIds.has(s.class_id))
      .map((s) => ({
        id: s.id,
        class_id: s.class_id,
        academic_level_id: s.academic_level_id,
        gender: s.gender,
        date_of_birth: s.date_of_birth,
        guardian_phone: s.guardian_phone,
      }))
    studentsTotal = activeStudents.length
  } catch {
    errors.students = 'Could not load student counts.'
  }

  let teachersTotal = 0
  try {
    if (schoolId) {
      teachersTotal = repos.staff
        .findBySchool(schoolId)
        .filter((s) => s.staff_type === 'teaching' && s.status === 'active')
        .length
    }
  } catch {
    // Teachers KPI falls back to 0 when staff directory is unavailable
  }

  let pendingAdmissions: DashboardSummary['pendingAdmissions'] = []
  try {
    if (schoolId && showAdmin) {
      const levelName = new Map(
        (schoolId
          ? repos.academicLevels.findBySchool(schoolId)
          : []
        ).map((l) => [l.id, l.name])
      )
      const className = new Map(
        (schoolId ? repos.classes.findBySchool(schoolId) : []).map((c) => [
          c.id,
          c.name,
        ])
      )
      pendingAdmissions = repos.admissions
        .findBySchool(schoolId)
        .filter((a) => a.status === 'pending')
        .slice(0, 5)
        .map((a) => {
          const parts = [
            a.preferred_class_id
              ? className.get(a.preferred_class_id)
              : null,
            a.academic_level_id ? levelName.get(a.academic_level_id) : null,
          ].filter(Boolean)
          return {
            id: a.id,
            full_name: a.full_name,
            detail: parts.length ? parts.join(' · ') : 'Admission request',
            created_at: a.created_at,
            href: '/students/admissions',
          }
        })
    }
  } catch {
    // Admissions widget stays empty on failure
  }

  const classes = schoolId
    ? repos.classes.findBySchool(schoolId)
    : repos.classes.findAll()
  const scopedClasses = teacherClassIds
    ? classes.filter((c) => teacherClassIds!.has(c.id))
    : classes
  const levels = schoolId
    ? repos.academicLevels.findBySchool(schoolId)
    : repos.academicLevels.findAll()
  const sections = schoolId
    ? repos.sections.findBySchool(schoolId)
    : repos.sections.findAll()

  const distributionMode: DashboardDistributionMode =
    input.distributionMode || 'level'
  const studentDistributionBars = aggregateDistribution(
    activeStudents,
    scopedClasses.map((c) => ({
      id: c.id,
      name: c.name,
      academic_level_id: c.academic_level_id,
      section_id: c.section_id,
    })),
    levels.map((l) => ({
      id: l.id,
      name: l.name,
      sort_order: l.sort_order,
    })),
    sections.map((s) => ({ id: s.id, name: s.name })),
    distributionMode
  )

  const deptBars = aggregateDistribution(
    activeStudents,
    scopedClasses.map((c) => ({
      id: c.id,
      name: c.name,
      academic_level_id: c.academic_level_id,
      section_id: c.section_id,
    })),
    levels.map((l) => ({
      id: l.id,
      name: l.name,
      sort_order: l.sort_order,
    })),
    sections.map((s) => ({ id: s.id, name: s.name })),
    'department'
  )
  const showDonut = shouldShowDepartmentDonut(deptBars)
  const departmentComposition =
    showDonut && deptBars.length
      ? {
          available: true,
          bars: deptBars,
          total: deptBars.reduce((s, b) => s + b.value, 0),
          summary: `Departments: ${deptBars.map((b) => `${b.label} ${b.value}`).join(', ')}.`,
        }
      : null

  /* ---------- Attendance today + trend ---------- */
  let attendanceToday: DashboardSummary['attendanceToday'] = {
    recorded: false,
    rate: null,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    href: '/academic/attendance',
    summary: 'Attendance has not been recorded today.',
  }
  let attendanceTrend: DashboardSummary['attendanceTrend'] = {
    range: input.attendanceRange || '7d',
    points: [],
    available: false,
    summary: 'Not enough attendance data',
    href: '/reports/attendance',
  }
  let attendanceByLevel: DashboardSummary['attendanceByLevel'] = {
    bars: [],
    available: false,
    summary: '',
  }

  try {
    const sessions = schoolId
      ? repos.attendance.findSessions(schoolId)
      : []
    const scopedSessions = teacherClassIds
      ? sessions.filter((s) => teacherClassIds!.has(s.class_id))
      : sessions

    const todaySessions = scopedSessions.filter((s) => s.session_date === today)
    const todayMarks = { present: 0, late: 0, absent: 0, excused: 0 }
    for (const session of todaySessions) {
      for (const rec of repos.attendance.findRecords(session.id)) {
        if (rec.status === 'present') todayMarks.present += 1
        else if (rec.status === 'late') todayMarks.late += 1
        else if (rec.status === 'absent') todayMarks.absent += 1
        else if (rec.status === 'excused') todayMarks.excused += 1
      }
    }
    const todaySummary = summarizeAttendanceMarks(todayMarks)
    attendanceToday = {
      ...todaySummary,
      href: '/academic/attendance',
      summary: todaySummary.recorded
        ? `Attendance was ${todaySummary.rate}% today (${todaySummary.present} present, ${todaySummary.late} late, ${todaySummary.absent} absent).`
        : 'Attendance has not been recorded today.',
    }

    const attendancePeriod =
      term ??
      (allTerms && yearRow
        ? { start_date: yearRow.start_date, end_date: yearRow.end_date }
        : null)
    const range = resolveAttendanceRange(
      input.attendanceRange || '7d',
      today,
      attendancePeriod
    )
    const byDay = new Map<string, DailyAttendancePoint>()
    for (const session of scopedSessions) {
      if (session.session_date < range.from || session.session_date > range.to)
        continue
      const point =
        byDay.get(session.session_date) ||
        ({
          date: session.session_date,
          present: 0,
          late: 0,
          absent: 0,
          excused: 0,
        } satisfies DailyAttendancePoint)
      for (const rec of repos.attendance.findRecords(session.id)) {
        if (rec.status === 'present') point.present += 1
        else if (rec.status === 'late') point.late += 1
        else if (rec.status === 'absent') point.absent += 1
        else if (rec.status === 'excused') point.excused += 1
      }
      byDay.set(session.session_date, point)
    }
    const daily = [...byDay.values()].sort((a, b) =>
      a.date.localeCompare(b.date)
    )
    const trend = buildAttendanceTrend(daily)
    attendanceTrend = {
      range: input.attendanceRange || '7d',
      points: trend.points,
      available: trend.available,
      summary: trend.summary,
      href: '/reports/attendance',
    }

    // Attendance by level (recent 30 days) — only if enough data
    const levelMarks = new Map<
      string,
      { label: string; sort: number; present: number; late: number; absent: number; excused: number }
    >()
    const classById = new Map(scopedClasses.map((c) => [c.id, c]))
    const levelById = new Map(levels.map((l) => [l.id, l]))
    const from30 = resolveAttendanceRange('30d', today).from
    for (const session of scopedSessions) {
      if (session.session_date < from30 || session.session_date > today) continue
      const cls = classById.get(session.class_id)
      const levelId = cls?.academic_level_id
      if (!levelId) continue
      const level = levelById.get(levelId)
      const row =
        levelMarks.get(levelId) ||
        {
          label: level?.name ?? 'Unknown',
          sort: level?.sort_order ?? 999,
          present: 0,
          late: 0,
          absent: 0,
          excused: 0,
        }
      for (const rec of repos.attendance.findRecords(session.id)) {
        if (rec.status === 'present') row.present += 1
        else if (rec.status === 'late') row.late += 1
        else if (rec.status === 'absent') row.absent += 1
        else if (rec.status === 'excused') row.excused += 1
      }
      levelMarks.set(levelId, row)
    }
    const levelBars = [...levelMarks.entries()]
      .map(([id, row]) => {
        const s = summarizeAttendanceMarks(row)
        return s.recorded && s.rate != null
          ? { id, label: row.label, rate: s.rate, sort: row.sort }
          : null
      })
      .filter((x): x is { id: string; label: string; rate: number; sort: number } => !!x)
      .sort((a, b) => a.sort - b.sort)
    if (levelBars.length >= 2) {
      attendanceByLevel = {
        bars: levelBars.map(({ id, label, rate }) => ({ id, label, rate })),
        available: true,
        summary: `Attendance by level over the last 30 days.`,
      }
    }
  } catch {
    errors.attendance = 'Could not load attendance.'
  }

  /* ---------- Finance ---------- */
  let feesCollected: DashboardSummary['feesCollected'] = null
  let feesOutstanding: DashboardSummary['feesOutstanding'] = null
  let feeCollectionTrend: DashboardSummary['feeCollectionTrend'] = null

  if (showFinance && schoolId) {
    try {
      const invoices = repos.financeMgmt.listInvoices(schoolId)
      const payments = repos.financeMgmt.listPayments(schoolId)

      const periodInvoices = invoices.filter((inv) => {
        if (inv.status === 'cancelled') return false
        if (periodFrom && inv.issue_date < periodFrom) return false
        if (periodTo && inv.issue_date > periodTo) return false
        return true
      })
      const periodPayments = payments.filter((p) => {
        const d = p.paid_at.slice(0, 10)
        if (periodFrom && d < periodFrom) return false
        if (periodTo && d > periodTo) return false
        return true
      })

      const billed = periodInvoices.reduce((s, i) => s + i.net_payable, 0)
      const collected = periodPayments.reduce((s, p) => s + p.amount, 0)
      const stats = feePeriodStats({ billed, collected })
      feesCollected = {
        available: true,
        amount: stats.collected,
        display: formatCompactCurrency(stats.collected, currency),
        percentOfExpected: stats.percentOfExpected,
        hint:
          stats.percentOfExpected != null
            ? `${stats.percentOfExpected}% of billed`
            : allTerms
              ? 'Collected this year'
              : term
                ? 'Collected this term'
                : 'Collected this period',
        href: '/finance/payments',
      }

      const openInvoices = invoices.filter(
        (i) => i.balance > 0 && i.status !== 'cancelled'
      )
      const outstandingAmount = openInvoices.reduce((s, i) => s + i.balance, 0)
      const outstandingStudents = new Set(openInvoices.map((i) => i.student_id))
        .size
      feesOutstanding = {
        available: true,
        amount: outstandingAmount,
        display: formatCompactCurrency(outstandingAmount, currency),
        studentCount: outstandingStudents,
        href: '/finance/outstanding',
      }

      const feeFrom = periodFrom || resolveAttendanceRange('30d', today).from
      const feeTo = periodTo && periodTo < today ? periodTo : today
      const granularity = suggestFeeGranularity(feeFrom, feeTo)
      const trend = buildFeeCollectionTrend(periodPayments, {
        from: feeFrom,
        to: feeTo,
      }, granularity)
      feeCollectionTrend = {
        points: trend.points,
        available: trend.available,
        summary: trend.summary,
        href: '/finance/reports',
      }
    } catch {
      errors.finance = 'Could not load finance figures.'
    }
  }

  /* ---------- Academic performance ---------- */
  let academicPerformance: DashboardSummary['academicPerformance'] = {
    bars: [],
    available: false,
    summary: 'No academic results available yet.',
    href: '/academic/results',
  }
  try {
    const runs = schoolId ? repos.results.findBySchool(schoolId) : []
    const classById = new Map(scopedClasses.map((c) => [c.id, c]))
    const levelById = new Map(levels.map((l) => [l.id, l]))
    const published = runs.filter((r) => {
      if (r.status !== 'published' && !r.published_at) return false
      if (teacherClassIds && !teacherClassIds.has(r.class_id)) return false
      if (academicYearId && r.academic_year_id && r.academic_year_id !== academicYearId)
        return false
      if (termId && r.term_id && r.term_id !== termId) return false
      return true
    })

    // Prefer one run per class (latest published)
    const latestByClass = new Map<string, (typeof published)[0]>()
    for (const run of published) {
      const existing = latestByClass.get(run.class_id)
      if (!existing || (run.published_at || '') > (existing.published_at || '')) {
        latestByClass.set(run.class_id, run)
      }
    }

    const summaries: Array<{
      average: number
      class_id: string
      level_id: string | null
      level_name: string | null
      level_sort: number
    }> = []
    for (const run of latestByClass.values()) {
      const cls = classById.get(run.class_id)
      const levelId = cls?.academic_level_id ?? null
      const level = levelId ? levelById.get(levelId) : undefined
      for (const row of repos.results.findSummaries(run.id)) {
        if (row.average == null) continue
        summaries.push({
          average: row.average,
          class_id: run.class_id,
          level_id: levelId,
          level_name: level?.name ?? cls?.name ?? null,
          level_sort: level?.sort_order ?? 999,
        })
      }
    }
    const perf = aggregateAcademicPerformance(summaries)
    academicPerformance = {
      bars: perf.bars,
      available: perf.available,
      summary: perf.summary,
      href: '/academic/results',
    }
  } catch {
    errors.academic = 'Could not load academic results.'
  }

  /* ---------- Attention ---------- */
  const attention: AttentionItem[] = []
  try {
    const incomplete = activeStudents.filter(isIncompleteStudentProfile).length
    if (incomplete > 0) {
      attention.push({
        id: 'incomplete-profiles',
        severity: 'warning',
        label: 'students have incomplete profiles',
        count: incomplete,
        href: '/students?incomplete=1',
      })
    }

    if (showFinance && feesOutstanding && feesOutstanding.studentCount > 0) {
      attention.push({
        id: 'outstanding-fees',
        severity: feesOutstanding.studentCount > 50 ? 'critical' : 'warning',
        label: 'students have outstanding fees',
        count: feesOutstanding.studentCount,
        href: '/finance/outstanding',
      })
    }

    // Classes with students but no attendance today
    const classesWithStudents = new Set(activeStudents.map((s) => s.class_id))
    const classesWithToday = new Set(
      (schoolId ? repos.attendance.findSessions(schoolId) : [])
        .filter((s) => s.session_date === today)
        .filter((s) => !teacherClassIds || teacherClassIds.has(s.class_id))
        .map((s) => s.class_id)
    )
    let missingAttendance = 0
    for (const classId of classesWithStudents) {
      if (!classesWithToday.has(classId)) missingAttendance += 1
    }
    if (missingAttendance > 0 && classesWithStudents.size > 0) {
      attention.push({
        id: 'incomplete-attendance',
        severity: 'info',
        label: 'classes have incomplete attendance today',
        count: missingAttendance,
        href: '/academic/attendance',
      })
    }

    // Draft result runs awaiting publish
    if (schoolId) {
      const draftRuns = repos.results
        .findBySchool(schoolId)
        .filter((r) => r.status === 'draft' || r.status === 'computed')
        .filter((r) => !teacherClassIds || teacherClassIds.has(r.class_id))
      if (draftRuns.length > 0) {
        attention.push({
          id: 'awaiting-results',
          severity: 'info',
          label: 'result runs awaiting publication',
          count: draftRuns.length,
          href: '/academic/results',
        })
      }
    }

    if (showAdmin && schoolId) {
      const pendingRow = db
        .prepare(
          `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'`
        )
        .get() as { count: number }
      if (pendingRow.count > 20) {
        attention.push({
          id: 'pending-sync',
          severity: 'warning',
          label: 'changes waiting to sync',
          count: pendingRow.count,
          href: '/administration/backup-sync',
        })
      }
    }
  } catch {
    errors.attention = 'Could not build attention items.'
  }

  /* ---------- Recent activity ---------- */
  let recentActivity: DashboardSummary['recentActivity'] = []
  try {
    if (schoolId && showAdmin) {
      const audit = repos.systemAdmin.listAudit(schoolId, {
        page: 1,
        page_size: 12,
      })
      recentActivity = (audit.events || []).map((row) => {
        const r = row as Record<string, unknown>
        return {
          id: String(r.id ?? ''),
          at: String(r.created_at ?? ''),
          label:
            (typeof r.description === 'string' && r.description.trim()) ||
            humanizeAction(
              String(r.action ?? ''),
              (r.module_key as string | null) ?? null
            ),
          source: 'audit',
        }
      })
    } else if (schoolId && showFinance) {
      // Teachers / limited: show finance audit snippets if any locally recent payments
      const payments = repos.financeMgmt.listPayments(schoolId).slice(0, 8)
      recentActivity = payments.map((p) => ({
        id: p.id,
        at: p.paid_at,
        label: `Fee payment recorded (${formatCompactCurrency(p.amount, currency)})`,
        source: 'payments',
      }))
    }
  } catch {
    errors.activity = 'Could not load recent activity.'
  }

  let setupProgress: SetupProgress
  try {
    setupProgress = getSetupProgress(repos)
  } catch {
    setupProgress = {
      steps: [],
      completed: 0,
      total: 0,
      isComplete: true,
      nextHref: '/setup',
    }
  }

  return {
    greeting: greetingForHour(hour),
    userName: displayName(session),
    schoolName,
    today,
    role,
    capabilities: {
      showFinance,
      showAcademic: true,
      showAttendance: true,
      showEnrollment: true,
      showAdmin,
    },
    context: {
      years,
      terms,
      academicYearId,
      termId: contextTermId,
      periodFrom,
      periodTo,
      currency,
    },
    students: {
      total: studentsTotal,
      label: 'Students enrolled',
      href: '/students',
      available: !errors.students,
    },
    teachers: {
      total: teachersTotal,
      label: 'Active teachers',
      href: '/staff/teachers',
      available: true,
    },
    attendanceToday,
    feesCollected,
    feesOutstanding,
    attendanceTrend,
    feeCollectionTrend,
    studentDistribution: {
      mode: distributionMode,
      bars: studentDistributionBars,
      available: studentDistributionBars.length > 0,
      summary:
        studentDistributionBars.length > 0
          ? `Enrollment by ${distributionMode}.`
          : 'No students enrolled yet.',
    },
    departmentComposition,
    academicPerformance,
    attendanceByLevel,
    attention,
    recentActivity,
    pendingAdmissions,
    setupProgress,
    errors,
  }
}

function humanizeAction(action: string, moduleKey?: string | null): string {
  const nice = action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  if (moduleKey) return `${nice} · ${moduleKey}`
  return nice
}
