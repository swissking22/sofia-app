/** Shared setup catalog + IPC helpers for the renderer. */

export type SetupStepId =
  | 'school-profile'
  | 'academic-year'
  | 'academic-structure'
  | 'grading-system'
  | 'staff'
  | 'permissions'
  | 'student-id'
  | 'students'
  | 'finance'
  | 'documents'
  | 'communication'
  | 'backup-sync'

export type SetupStepStatus = 'pending' | 'draft' | 'skipped' | 'completed'

export interface SetupStepDef {
  id: SetupStepId
  title: string
  description: string
  href: string
  order: number
}

export const SETUP_STEPS: SetupStepDef[] = [
  {
    id: 'school-profile',
    title: 'School Profile',
    description: 'Configure your school’s identity and official information.',
    href: '/setup/school-profile',
    order: 1,
  },
  {
    id: 'academic-year',
    title: 'Academic Year',
    description: 'Define the current academic year and calendar.',
    href: '/setup/academic-year',
    order: 2,
  },
  {
    id: 'academic-structure',
    title: 'Academic Structure',
    description: 'Set up classes, departments, and subjects.',
    href: '/setup/academic-structure',
    order: 3,
  },
  {
    id: 'grading-system',
    title: 'Grading System',
    description: 'Configure grades, marks, and report rules.',
    href: '/setup/grading-system',
    order: 4,
  },
  {
    id: 'staff',
    title: 'Staff Setup',
    description: 'Add teachers and administrative staff.',
    href: '/setup/staff',
    order: 5,
  },
  {
    id: 'permissions',
    title: 'Roles & Permissions',
    description: 'Define roles and what each role can do.',
    href: '/setup/roles',
    order: 6,
  },
  {
    id: 'student-id',
    title: 'Student ID Settings',
    description: 'Configure how student IDs are generated.',
    href: '/setup/student-id',
    order: 7,
  },
  {
    id: 'students',
    title: 'Student Setup',
    description: 'Prepare student records and admissions defaults.',
    href: '/setup/students',
    order: 8,
  },
  {
    id: 'finance',
    title: 'Finance Setup',
    description: 'Define fee structures and payment basics.',
    href: '/setup/finance',
    order: 9,
  },
  {
    id: 'documents',
    title: 'Document Setup',
    description: 'Configure official document templates.',
    href: '/setup/documents',
    order: 10,
  },
  {
    id: 'communication',
    title: 'Communication Setup',
    description: 'Set up messaging defaults for parents and staff.',
    href: '/setup/communication',
    order: 11,
  },
  {
    id: 'backup-sync',
    title: 'Backup & Sync',
    description: 'Prepare local backup and future cloud sync.',
    href: '/setup/backup-sync',
    order: 12,
  },
]

export interface SetupProgressStep extends SetupStepDef {
  status: SetupStepStatus
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

export function getSetupStep(id: SetupStepId): SetupStepDef {
  const step = SETUP_STEPS.find((s) => s.id === id)
  if (!step) throw new Error(`Unknown setup step: ${id}`)
  return step
}

export function getNextSetupHref(currentId: SetupStepId): string {
  const current = getSetupStep(currentId)
  const next = SETUP_STEPS.find((s) => s.order === current.order + 1)
  return next?.href ?? '/home'
}

export async function fetchSetupProgress(): Promise<SetupProgress> {
  return (await window.ipc.invoke('setup:get-progress')) as SetupProgress
}

export async function saveSetupDraft(
  stepId: SetupStepId,
  draftData?: string | null
): Promise<SetupMutationResult> {
  return (await window.ipc.invoke('setup:save-draft', {
    stepId,
    draftData,
  })) as SetupMutationResult
}

export async function completeSetupStep(
  stepId: SetupStepId
): Promise<SetupMutationResult> {
  return (await window.ipc.invoke('setup:complete-step', {
    stepId,
  })) as SetupMutationResult
}

/** Advance past a step without marking it completed. */
export async function skipSetupStep(
  stepId: SetupStepId
): Promise<SetupMutationResult> {
  return (await window.ipc.invoke('setup:skip-step', {
    stepId,
  })) as SetupMutationResult
}
