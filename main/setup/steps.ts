/** Canonical Sofia initial-setup step catalog (main process). */

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
