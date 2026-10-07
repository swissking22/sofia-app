import type { IconSvgElement } from '@hugeicons/react'
import {
  DashboardSquare01Icon,
  SchoolIcon,
  StudentIcon,
  BookOpen01Icon,
  TeacherIcon,
  Wallet01Icon,
  Message01Icon,
  Analytics01Icon,
  File01Icon,
  Settings01Icon,
  HelpCircleIcon,
} from '@hugeicons/core-free-icons'
import { canAny } from './rbac'

export interface NavChild {
  id: string
  label: string
  href: string
  /** True until the page module is built */
  comingSoon?: boolean
  /**
   * Any one of these permission names grants visibility.
   * Omit or leave empty for all authenticated users.
   */
  permissions?: string[]
}

export interface NavItem {
  id: string
  label: string
  icon: IconSvgElement
  href?: string
  comingSoon?: boolean
  children?: NavChild[]
  /**
   * Any one of these permission names grants visibility (leaf items without children).
   * Omit or leave empty for all authenticated users.
   */
  permissions?: string[]
}

export interface NavSection {
  id: string
  label: string
  items: NavItem[]
}

/** School structure: managers who create students/staff or change settings. */
const SCHOOL_MANAGE = [
  'students.create',
  'staff.create',
  'system.settings.view',
] as const

/** Communication desk: secretaries / admins (no dedicated catalog perms yet). */
const COMMUNICATION_MANAGE = [
  'students.create',
  'students.update',
  'system.settings.view',
] as const

/** Full SOFIA sidebar information architecture. */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'main',
    label: 'MAIN',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/home',
        icon: DashboardSquare01Icon,
      },
      {
        id: 'school-management',
        label: 'School Management',
        icon: SchoolIcon,
        children: [
          {
            id: 'school-profile',
            label: 'School Profile',
            href: '/school/profile',
            permissions: [...SCHOOL_MANAGE],
          },
          {
            id: 'academic-year',
            label: 'Academic Year',
            href: '/school/academic-year',
            permissions: [...SCHOOL_MANAGE],
          },
          {
            id: 'terms-sessions',
            label: 'Terms & Sessions',
            href: '/school/terms',
            permissions: [...SCHOOL_MANAGE],
          },
          {
            id: 'classes',
            label: 'Classes',
            href: '/school/classes',
            permissions: [...SCHOOL_MANAGE],
          },
          {
            id: 'departments',
            label: 'Departments',
            href: '/school/departments',
            permissions: [...SCHOOL_MANAGE],
          },
          {
            id: 'subjects',
            label: 'Subjects',
            href: '/school/subjects',
            permissions: [...SCHOOL_MANAGE],
          },
        ],
      },
      {
        id: 'student-management',
        label: 'Student Management',
        icon: StudentIcon,
        children: [
          {
            id: 'students',
            label: 'Students',
            href: '/students',
            permissions: ['students.read'],
          },
          {
            id: 'class-lists',
            label: 'Class Lists',
            href: '/students/class-lists',
            permissions: ['students.read'],
          },
          {
            id: 'admissions',
            label: 'Admissions',
            href: '/students/admissions',
            permissions: ['students.create'],
          },
          {
            id: 'transfers',
            label: 'Student Transfers',
            href: '/students/transfers',
            permissions: ['students.update'],
          },
          {
            id: 'promotion',
            label: 'Student Promotion',
            href: '/students/promotion',
            permissions: ['students.update'],
          },
          {
            id: 'student-documents',
            label: 'Student Documents',
            href: '/students/documents',
            permissions: ['students.read'],
          },
          {
            id: 'alumni',
            label: 'Alumni',
            href: '/students/alumni',
            permissions: ['students.read'],
          },
          {
            id: 'id-cards',
            label: 'ID Cards',
            href: '/students/id-cards',
            permissions: ['students.id_cards.view'],
          },
        ],
      },
      {
        id: 'academic-management',
        label: 'Academic Management',
        icon: BookOpen01Icon,
        children: [
          {
            id: 'timetable',
            label: 'Timetable',
            href: '/academic/timetable',
            permissions: [
              'students.read',
              'staff.read',
              'academics.teaching_progress.view',
            ],
          },
          {
            id: 'attendance',
            label: 'Attendance',
            href: '/academic/attendance',
            permissions: ['attendance.read', 'attendance.mark'],
          },
          {
            id: 'gate-scanner',
            label: 'Gate Scanner',
            href: '/academic/attendance/gate-scanner',
            permissions: ['attendance.mark'],
          },
          {
            id: 'assignments',
            label: 'Assignments',
            href: '/academic/assignments',
            comingSoon: true,
            permissions: ['results.enter', 'results.read'],
          },
          {
            id: 'continuous-assessment',
            label: 'Continuous Assessment',
            href: '/academic/ca',
            permissions: ['results.enter', 'results.read'],
          },
          {
            id: 'examinations',
            label: 'Examinations',
            href: '/academic/exams',
            permissions: ['results.enter', 'results.read'],
          },
          {
            id: 'assessment-questions',
            label: 'Assessment Questions',
            href: '/academic/assessment-questions',
            permissions: ['assessment_questions.view'],
          },
          {
            id: 'results',
            label: 'Results Processing',
            href: '/academic/results',
            permissions: ['results.enter', 'results.read', 'results.approve'],
          },
          {
            id: 'calculation-settings',
            label: 'Calculation Settings',
            href: '/academic/results/calculation-settings',
            permissions: ['results.calculation.view'],
          },
          {
            id: 'subject-coefficients',
            label: 'Subject Coefficients',
            href: '/academic/results/coefficients',
            permissions: ['results.calculation.view'],
          },
          {
            id: 'report-cards',
            label: 'Report Cards',
            href: '/academic/report-cards',
            permissions: ['results.read', 'results.enter', 'results.publish'],
          },
          {
            id: 'academic-reports',
            label: 'Academic Reports',
            href: '/academic/reports',
            permissions: ['results.read', 'reports.academic.view'],
          },
          {
            id: 'teaching-progress',
            label: 'Teaching Progress',
            href: '/academic/teaching-progress',
            permissions: ['academics.teaching_progress.view'],
          },
        ],
      },
      {
        id: 'staff-management',
        label: 'Staff Management',
        icon: TeacherIcon,
        children: [
          {
            id: 'teachers',
            label: 'Teachers',
            href: '/staff/teachers',
            permissions: ['staff.read'],
          },
          {
            id: 'staff-directory',
            label: 'Staff Directory',
            href: '/staff/directory',
            permissions: ['staff.read'],
          },
          {
            id: 'teacher-workload',
            label: 'Teacher Workload',
            href: '/staff/workload',
            permissions: ['staff.read'],
          },
          {
            id: 'teacher-attendance',
            label: 'Teacher Attendance',
            href: '/staff/attendance',
            permissions: ['staff.read'],
          },
          {
            id: 'leave',
            label: 'Leave Management',
            href: '/staff/leave',
            permissions: ['staff.read'],
          },
        ],
      },
      {
        id: 'finance',
        label: 'Finance & Fees',
        icon: Wallet01Icon,
        children: [
          {
            id: 'fee-structure',
            label: 'Fee Structure',
            href: '/finance/fee-structure',
            permissions: ['finance.read', 'finance.create_invoice'],
          },
          {
            id: 'billing',
            label: 'Student Billing',
            href: '/finance/billing',
            permissions: ['finance.read', 'finance.create_invoice'],
          },
          {
            id: 'payments',
            label: 'Payments',
            href: '/finance/payments',
            permissions: ['finance.read', 'finance.record_payment'],
          },
          {
            id: 'receipts',
            label: 'Receipts',
            href: '/finance/receipts',
            permissions: ['finance.read', 'finance.generate_receipt'],
          },
          {
            id: 'outstanding',
            label: 'Outstanding Fees',
            href: '/finance/outstanding',
            permissions: ['finance.read'],
          },
          {
            id: 'expenses',
            label: 'Expenses',
            href: '/finance/expenses',
            permissions: ['finance.read'],
          },
          {
            id: 'budgeting',
            label: 'Budgeting',
            href: '/finance/budgeting',
            permissions: ['finance.budget.view'],
          },
          {
            id: 'bank-deposits',
            label: 'Bank Deposits',
            href: '/finance/bank-deposits',
            permissions: ['finance.bank_deposit.view'],
          },
          {
            id: 'financial-reports',
            label: 'Financial Reports',
            href: '/finance/reports',
            permissions: ['finance.read', 'finance.export'],
          },
        ],
      },
      {
        id: 'communication',
        label: 'Communication',
        icon: Message01Icon,
        children: [
          {
            id: 'announcements',
            label: 'Announcements',
            href: '/communication/announcements',
            permissions: [...COMMUNICATION_MANAGE],
          },
          {
            id: 'sms',
            label: 'SMS Notifications',
            href: '/communication/sms',
            permissions: [...COMMUNICATION_MANAGE],
          },
          {
            id: 'parent-messages',
            label: 'Parent Messages',
            href: '/communication/messages',
            permissions: [...COMMUNICATION_MANAGE],
          },
          {
            id: 'notices',
            label: 'Internal Notices',
            href: '/communication/notices',
            permissions: [...COMMUNICATION_MANAGE],
          },
        ],
      },
      {
        id: 'reports-analytics',
        label: 'Reports & Analytics',
        icon: Analytics01Icon,
        children: [
          {
            id: 'academic-performance',
            label: 'Academic Performance',
            href: '/reports/academic-performance',
            permissions: ['reports.academic.view'],
          },
          {
            id: 'student-reports',
            label: 'Student Reports',
            href: '/reports/students',
            permissions: ['reports.students.view'],
          },
          {
            id: 'reports-financial',
            label: 'Financial Reports',
            href: '/reports/financial',
            permissions: ['reports.financial.view'],
          },
          {
            id: 'attendance-analytics',
            label: 'Attendance Analytics',
            href: '/reports/attendance',
            permissions: ['reports.attendance.view'],
          },
          {
            id: 'school-insights',
            label: 'School Insights',
            href: '/reports/school-insights',
            permissions: ['reports.school_insights.view'],
          },
        ],
      },
      {
        id: 'documents',
        label: 'Documents',
        icon: File01Icon,
        children: [
          {
            id: 'admission-letters',
            label: 'Admission Letters',
            href: '/documents/admission-letters',
            permissions: ['documents.admission.view'],
          },
          {
            id: 'certificates',
            label: 'Certificates',
            href: '/documents/certificates',
            permissions: ['documents.certificates.view'],
          },
          {
            id: 'transcripts',
            label: 'Transcripts',
            href: '/documents/transcripts',
            permissions: ['documents.transcripts.view'],
          },
          {
            id: 'receipt-templates',
            label: 'Receipts Templates',
            href: '/documents/receipt-templates',
            permissions: ['documents.receipts.view'],
          },
          {
            id: 'official-documents',
            label: 'Official Documents',
            href: '/documents/official',
            permissions: ['documents.official.view'],
          },
        ],
      },
    ],
  },
  {
    id: 'system',
    label: 'SYSTEM',
    items: [
      {
        id: 'system-admin',
        label: 'System Administration',
        icon: Settings01Icon,
        children: [
          {
            id: 'sys-overview',
            label: 'Overview',
            href: '/administration',
            permissions: [
              'system.users.view',
              'system.roles.view',
              'system.health.view',
              'system.settings.view',
            ],
          },
          {
            id: 'users-roles',
            label: 'Users & Roles',
            href: '/administration/users',
            permissions: ['system.users.view', 'system.roles.view'],
          },
          {
            id: 'permissions',
            label: 'Permissions',
            href: '/administration/permissions',
            permissions: ['system.permissions.view', 'system.roles.view'],
          },
          {
            id: 'audit-logs',
            label: 'Audit Logs',
            href: '/administration/audit-logs',
            permissions: ['system.audit.view'],
          },
          {
            id: 'backup-sync',
            label: 'Backup & Sync',
            href: '/administration/backup-sync',
            permissions: [
              'system.backup.view',
              'system.sync.view',
              'system.backup.manage',
            ],
          },
          {
            id: 'settings',
            label: 'Settings',
            href: '/administration/settings',
            permissions: ['system.settings.view'],
          },
        ],
      },
      {
        id: 'help-support',
        label: 'Help & Support',
        icon: HelpCircleIcon,
        children: [
          {
            id: 'documentation',
            label: 'Documentation',
            href: '/help/docs',
            comingSoon: true,
          },
          {
            id: 'contact-support',
            label: 'Contact Sofia Support',
            href: '/help/support',
            comingSoon: true,
          },
        ],
      },
    ],
  },
]

function isAllowed(
  required: string[] | undefined,
  userPermissions: string[]
): boolean {
  if (!required?.length) return true
  return canAny(userPermissions, required)
}

/**
 * Keep only modules/pages the user may open.
 * School owners (`unrestricted`) see the full tree.
 */
export function filterNavSections(
  sections: NavSection[],
  userPermissions: string[],
  options?: { unrestricted?: boolean }
): NavSection[] {
  if (options?.unrestricted) return sections

  return sections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => {
          if (!isAllowed(item.permissions, userPermissions)) return null

          if (item.children?.length) {
            const children = item.children.filter((child) =>
              isAllowed(child.permissions, userPermissions)
            )
            if (children.length === 0) return null
            return { ...item, children }
          }

          return item
        })
        .filter((item): item is NavItem => item != null),
    }))
    .filter((section) => section.items.length > 0)
}
