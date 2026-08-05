/** Global permission catalog + default system role seeds. */

export interface PermissionSeed {
  name: string
  label: string
  module_key: string
  module_label: string
}

export const PERMISSION_CATALOG: PermissionSeed[] = [
  // Students
  {
    name: 'students.read',
    label: 'View students',
    module_key: 'students',
    module_label: 'Students',
  },
  {
    name: 'students.create',
    label: 'Create students',
    module_key: 'students',
    module_label: 'Students',
  },
  {
    name: 'students.update',
    label: 'Update students',
    module_key: 'students',
    module_label: 'Students',
  },
  {
    name: 'students.delete',
    label: 'Delete students',
    module_key: 'students',
    module_label: 'Students',
  },
  {
    name: 'students.import',
    label: 'Import students',
    module_key: 'students',
    module_label: 'Students',
  },
  // Results
  {
    name: 'results.read',
    label: 'View results',
    module_key: 'results',
    module_label: 'Results',
  },
  {
    name: 'results.enter',
    label: 'Enter results',
    module_key: 'results',
    module_label: 'Results',
  },
  {
    name: 'results.update',
    label: 'Update results',
    module_key: 'results',
    module_label: 'Results',
  },
  {
    name: 'results.submit',
    label: 'Submit results',
    module_key: 'results',
    module_label: 'Results',
  },
  {
    name: 'results.approve',
    label: 'Approve results',
    module_key: 'results',
    module_label: 'Results',
  },
  {
    name: 'results.publish',
    label: 'Publish results',
    module_key: 'results',
    module_label: 'Results',
  },
  // Attendance
  {
    name: 'attendance.read',
    label: 'View attendance',
    module_key: 'attendance',
    module_label: 'Attendance',
  },
  {
    name: 'attendance.mark',
    label: 'Mark attendance',
    module_key: 'attendance',
    module_label: 'Attendance',
  },
  {
    name: 'attendance.update',
    label: 'Update attendance',
    module_key: 'attendance',
    module_label: 'Attendance',
  },
  // Finance
  {
    name: 'finance.read',
    label: 'View finance',
    module_key: 'finance',
    module_label: 'Finance',
  },
  {
    name: 'finance.create_invoice',
    label: 'Create invoices',
    module_key: 'finance',
    module_label: 'Finance',
  },
  {
    name: 'finance.record_payment',
    label: 'Record payments',
    module_key: 'finance',
    module_label: 'Finance',
  },
  {
    name: 'finance.generate_receipt',
    label: 'Generate receipts',
    module_key: 'finance',
    module_label: 'Finance',
  },
  {
    name: 'finance.export',
    label: 'Export finance data',
    module_key: 'finance',
    module_label: 'Finance',
  },
  // Staff
  {
    name: 'staff.read',
    label: 'View staff',
    module_key: 'staff',
    module_label: 'Staff',
  },
  {
    name: 'staff.create',
    label: 'Create staff',
    module_key: 'staff',
    module_label: 'Staff',
  },
  {
    name: 'staff.update',
    label: 'Update staff',
    module_key: 'staff',
    module_label: 'Staff',
  },
  {
    name: 'staff.delete',
    label: 'Delete staff',
    module_key: 'staff',
    module_label: 'Staff',
  },
]

export interface SystemRoleSeed {
  name: string
  description: string
  /** Permission names; empty array means all permissions */
  permissions: string[] | 'all'
}

export const SYSTEM_ROLE_SEEDS: SystemRoleSeed[] = [
  {
    name: 'Principal',
    description: 'Full access to all modules and actions.',
    permissions: 'all',
  },
  {
    name: 'Vice Principal',
    description: 'Academic oversight with staff visibility.',
    permissions: [
      'students.read',
      'students.update',
      'results.read',
      'results.approve',
      'results.publish',
      'staff.read',
    ],
  },
  {
    name: 'Teacher',
    description: 'Classroom attendance and results entry.',
    permissions: [
      'students.read',
      'attendance.mark',
      'results.enter',
      'results.update',
      'results.submit',
    ],
  },
  {
    name: 'Bursar',
    description: 'Fee collection and receipts.',
    permissions: [
      'students.read',
      'finance.read',
      'finance.record_payment',
      'finance.generate_receipt',
    ],
  },
  {
    name: 'Secretary',
    description: 'Student records management.',
    permissions: ['students.read', 'students.create', 'students.update'],
  },
]
