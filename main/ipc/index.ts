import type Database from 'better-sqlite3'
import type { Repositories } from '../db/repositories'
import { registerAuthIpc } from './auth'
import { registerDashboardIpc } from './dashboard'
import { registerSchoolIpc } from './school'
import { registerSetupIpc } from './setup'
import { registerAcademicYearIpc } from './academic-year'
import { registerAcademicStructureIpc } from './academic-structure'
import { registerGradingSystemIpc } from './grading-system'
import { registerStaffIpc } from './staff'
import { registerRolesIpc } from './roles'
import { registerStudentsIpc } from './students'
import { registerStudentIdIpc } from './student-id'
import { registerFinanceIpc } from './finance'
import { registerDocumentsIpc } from './documents'
import { registerCommunicationIpc } from './communication'
import { registerBackupSyncIpc } from './backup-sync'
import { registerDepartmentsIpc } from './departments'
import { registerSubjectsIpc } from './subjects'
import { registerStudentMgmtIpc } from './student-mgmt'
import { registerAcademicMgmtIpc } from './academic-mgmt'

/** Register all IPC handlers for the main process. */
export function registerIpcHandlers(
  db: Database.Database,
  repos: Repositories
): void {
  registerAuthIpc(repos)
  registerDashboardIpc(db, repos)
  registerSchoolIpc(repos)
  registerSetupIpc(repos)
  registerAcademicYearIpc(repos)
  registerAcademicStructureIpc(repos)
  registerGradingSystemIpc(repos)
  registerStaffIpc(repos)
  registerRolesIpc(repos)
  registerStudentsIpc(repos)
  registerStudentIdIpc(repos)
  registerStudentMgmtIpc(repos)
  registerAcademicMgmtIpc(repos)
  registerFinanceIpc(repos)
  registerDocumentsIpc(repos)
  registerCommunicationIpc(repos)
  registerBackupSyncIpc(db, repos)
  registerDepartmentsIpc(repos)
  registerSubjectsIpc(repos)
}
