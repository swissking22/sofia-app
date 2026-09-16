import type Database from 'better-sqlite3'
import type { Repositories } from '../db/repositories'
import { registerAuthIpc } from './auth'
import { registerDashboardIpc } from './dashboard'
import { registerSchoolIpc } from './school'
import { registerSetupIpc } from './setup'
import { registerAcademicYearIpc } from './academic-year'
import { registerAcademicStructureIpc } from './academic-structure'
import { registerDayScheduleIpc } from './day-schedule'
import { registerGradingSystemIpc } from './grading-system'
import { registerStaffIpc } from './staff'
import { registerRolesIpc } from './roles'
import { registerStudentsIpc } from './students'
import { registerStudentIdIpc } from './student-id'
import { registerFinanceIpc } from './finance'
import { registerDocumentsIpc } from './documents'
import { registerCommunicationIpc } from './communication'
import { registerCommunicationMgmtIpc } from './communication-mgmt'
import { registerBackupSyncIpc } from './backup-sync'
import { registerDepartmentsIpc } from './departments'
import { registerSubjectsIpc } from './subjects'
import { registerStudentMgmtIpc } from './student-mgmt'
import { registerAcademicMgmtIpc } from './academic-mgmt'
import { registerStaffMgmtIpc } from './staff-mgmt'
import { registerFinanceMgmtIpc } from './finance-mgmt'
import { registerFinanceExtIpc } from './finance-ext'
import { registerStudentIdCardsIpc } from './student-id-cards'
import { registerTeachingProgressIpc } from './teaching-progress'
import { registerReportsIpc } from './reports'
import { registerDocumentsMgmtIpc } from './documents-mgmt'
import { registerSystemAdminIpc } from './system-admin'
import { registerResultsCalculationIpc } from './results-calculation'
import { registerUpdaterIpc } from './updater'
import { registerGateAttendanceIpc } from './gate-attendance'

/** Register all IPC handlers for the main process. */
export function registerIpcHandlers(
  db: Database.Database,
  repos: Repositories
): void {
  registerUpdaterIpc()
  registerAuthIpc(repos)
  registerDashboardIpc(db, repos)
  registerSchoolIpc(repos)
  registerSetupIpc(repos)
  registerAcademicYearIpc(repos)
  registerAcademicStructureIpc(repos)
  registerDayScheduleIpc(repos)
  registerGradingSystemIpc(repos)
  registerStaffIpc(repos)
  registerStaffMgmtIpc(repos)
  registerRolesIpc(repos)
  registerStudentsIpc(repos)
  registerStudentIdIpc(repos)
  registerStudentMgmtIpc(repos)
  registerAcademicMgmtIpc(repos)
  registerGateAttendanceIpc(repos)
  registerFinanceIpc(repos)
  registerFinanceMgmtIpc(repos)
  registerFinanceExtIpc(repos)
  registerStudentIdCardsIpc(repos)
  registerTeachingProgressIpc(repos)
  registerReportsIpc(repos)
  registerDocumentsMgmtIpc(repos)
  registerSystemAdminIpc(repos)
  registerResultsCalculationIpc(repos)
  registerDocumentsIpc(repos)
  registerCommunicationIpc(repos)
  registerCommunicationMgmtIpc(repos)
  registerBackupSyncIpc(db, repos)
  registerDepartmentsIpc(repos)
  registerSubjectsIpc(repos)
}
