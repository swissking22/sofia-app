/** Dashboard types + IPC helpers for the renderer. */

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

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return (await window.ipc.invoke('dashboard:stats')) as DashboardStats
}
