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

export interface NavChild {
  id: string
  label: string
  href: string
  /** True until the page module is built */
  comingSoon?: boolean
}

export interface NavItem {
  id: string
  label: string
  icon: IconSvgElement
  href?: string
  comingSoon?: boolean
  children?: NavChild[]
}

export interface NavSection {
  id: string
  label: string
  items: NavItem[]
}

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
          { id: 'school-profile', label: 'School Profile', href: '/school/profile' },
          { id: 'academic-year', label: 'Academic Year', href: '/school/academic-year' },
          { id: 'terms-sessions', label: 'Terms & Sessions', href: '/school/terms' },
          { id: 'classes', label: 'Classes', href: '/school/classes' },
          { id: 'departments', label: 'Departments', href: '/school/departments' },
          { id: 'subjects', label: 'Subjects', href: '/school/subjects' },
        ],
      },
      {
        id: 'student-management',
        label: 'Student Management',
        icon: StudentIcon,
        children: [
          { id: 'students', label: 'Students', href: '/students' },
          { id: 'admissions', label: 'Admissions', href: '/students/admissions' },
          { id: 'transfers', label: 'Student Transfers', href: '/students/transfers' },
          { id: 'promotion', label: 'Student Promotion', href: '/students/promotion' },
          { id: 'student-documents', label: 'Student Documents', href: '/students/documents' },
          { id: 'alumni', label: 'Alumni', href: '/students/alumni' },
        ],
      },
      {
        id: 'academic-management',
        label: 'Academic Management',
        icon: BookOpen01Icon,
        children: [
          { id: 'timetable', label: 'Timetable', href: '/academic/timetable' },
          { id: 'attendance', label: 'Attendance', href: '/academic/attendance' },
          { id: 'assignments', label: 'Assignments', href: '/academic/assignments', comingSoon: true },
          { id: 'continuous-assessment', label: 'Continuous Assessment', href: '/academic/ca' },
          { id: 'examinations', label: 'Examinations', href: '/academic/exams' },
          { id: 'results', label: 'Results Processing', href: '/academic/results' },
          { id: 'report-cards', label: 'Report Cards', href: '/academic/report-cards' },
          { id: 'academic-reports', label: 'Academic Reports', href: '/academic/reports' },
        ],
      },
      {
        id: 'staff-management',
        label: 'Staff Management',
        icon: TeacherIcon,
        children: [
          { id: 'teachers', label: 'Teachers', href: '/staff/teachers' },
          { id: 'staff-directory', label: 'Staff Directory', href: '/staff/directory' },
          { id: 'teacher-workload', label: 'Teacher Workload', href: '/staff/workload' },
          { id: 'teacher-attendance', label: 'Teacher Attendance', href: '/staff/attendance' },
          { id: 'leave', label: 'Leave Management', href: '/staff/leave' },
        ],
      },
      {
        id: 'finance',
        label: 'Finance & Fees',
        icon: Wallet01Icon,
        children: [
          { id: 'fee-structure', label: 'Fee Structure', href: '/finance/fee-structure' },
          { id: 'billing', label: 'Student Billing', href: '/finance/billing' },
          { id: 'payments', label: 'Payments', href: '/finance/payments' },
          { id: 'receipts', label: 'Receipts', href: '/finance/receipts' },
          { id: 'outstanding', label: 'Outstanding Fees', href: '/finance/outstanding' },
          { id: 'expenses', label: 'Expenses', href: '/finance/expenses' },
          { id: 'financial-reports', label: 'Financial Reports', href: '/finance/reports' },
        ],
      },
      {
        id: 'communication',
        label: 'Communication',
        icon: Message01Icon,
        children: [
          { id: 'announcements', label: 'Announcements', href: '/communication/announcements', comingSoon: true },
          { id: 'sms', label: 'SMS Notifications', href: '/communication/sms', comingSoon: true },
          { id: 'parent-messages', label: 'Parent Messages', href: '/communication/messages', comingSoon: true },
          { id: 'notices', label: 'Internal Notices', href: '/communication/notices', comingSoon: true },
        ],
      },
      {
        id: 'reports-analytics',
        label: 'Reports & Analytics',
        icon: Analytics01Icon,
        children: [
          { id: 'academic-performance', label: 'Academic Performance', href: '/reports/academic-performance', comingSoon: true },
          { id: 'student-reports', label: 'Student Reports', href: '/reports/students', comingSoon: true },
          { id: 'reports-financial', label: 'Financial Reports', href: '/reports/financial', comingSoon: true },
          { id: 'attendance-analytics', label: 'Attendance Analytics', href: '/reports/attendance', comingSoon: true },
          { id: 'school-insights', label: 'School Insights', href: '/reports/insights', comingSoon: true },
        ],
      },
      {
        id: 'documents',
        label: 'Documents',
        icon: File01Icon,
        children: [
          { id: 'admission-letters', label: 'Admission Letters', href: '/documents/admission-letters', comingSoon: true },
          { id: 'certificates', label: 'Certificates', href: '/documents/certificates', comingSoon: true },
          { id: 'transcripts', label: 'Transcripts', href: '/documents/transcripts', comingSoon: true },
          { id: 'receipt-templates', label: 'Receipts Templates', href: '/documents/receipt-templates', comingSoon: true },
          { id: 'official-documents', label: 'Official Documents', href: '/documents/official', comingSoon: true },
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
          { id: 'users-roles', label: 'Users & Roles', href: '/admin/users', comingSoon: true },
          { id: 'permissions', label: 'Permissions', href: '/admin/permissions', comingSoon: true },
          { id: 'audit-logs', label: 'Audit Logs', href: '/admin/audit-logs', comingSoon: true },
          { id: 'backup-sync', label: 'Backup & Sync', href: '/admin/backup-sync', comingSoon: true },
          { id: 'settings', label: 'Settings', href: '/admin/settings', comingSoon: true },
        ],
      },
      {
        id: 'help-support',
        label: 'Help & Support',
        icon: HelpCircleIcon,
        children: [
          { id: 'documentation', label: 'Documentation', href: '/help/docs', comingSoon: true },
          { id: 'contact-support', label: 'Contact Sofia Support', href: '/help/support', comingSoon: true },
        ],
      },
    ],
  },
]
