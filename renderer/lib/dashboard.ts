/** Dashboard types + IPC helpers for the renderer. */

export type AttendanceTrendRange = '7d' | '30d' | 'term'
export type DashboardDistributionMode = 'level' | 'department' | 'class'

export interface SetupStep {
  id: string
  label?: string
  title?: string
  href: string
  status?: 'pending' | 'draft' | 'skipped' | 'completed'
  done: boolean
}

export interface SetupProgress {
  steps: SetupStep[]
  completed: number
  total: number
  isComplete: boolean
  nextHref?: string
}

export interface DashboardStats {
  totalStudents: number
  activeStudents: number
  totalClasses: number
  totalSubjects: number
  totalTeachers: number
  averageGrade: number | null
  scoresCount: number
  pendingSync: number
  schoolName: string
  studentsByClass: Array<{ label: string; value: number }>
  setupProgress: SetupProgress
}

export interface TrendPoint {
  key: string
  label: string
  value: number
}

export interface DistributionBar {
  id: string
  label: string
  value: number
  href?: string | null
}

export interface PerformanceBar {
  id: string
  label: string
  average: number
  studentCount: number
  href?: string | null
}

export interface AttentionItem {
  id: string
  severity: 'critical' | 'warning' | 'info'
  label: string
  count: number
  href: string
}

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

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return (await window.ipc.invoke('dashboard:stats')) as DashboardStats
}

export async function fetchDashboardSummary(
  input?: DashboardSummaryInput
): Promise<Result<DashboardSummary>> {
  return (await window.ipc.invoke(
    'dashboard:summary',
    input ?? {}
  )) as Result<DashboardSummary>
}
