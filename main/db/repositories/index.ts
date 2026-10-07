import type Database from 'better-sqlite3'
import { SchoolRepository } from './school.repository'
import { UserRepository } from './user.repository'
import { ClassRepository } from './class.repository'
import { StudentRepository } from './student.repository'
import { SubjectRepository } from './subject.repository'
import { ScoreRepository } from './score.repository'
import { SetupStepRepository } from './setup-step.repository'
import { AcademicYearRepository } from './academic-year.repository'
import { DepartmentRepository } from './department.repository'
import { AcademicLevelRepository } from './academic-level.repository'
import { SectionRepository } from './section.repository'
import { SpecializationRepository } from './specialization.repository'
import { GradingSystemRepository } from './grading-system.repository'
import { StaffRepository } from './staff.repository'
import { RoleRepository } from './role.repository'
import { StudentSettingsRepository } from './student-settings.repository'
import { StudentIdSettingsRepository } from './student-id-settings.repository'
import { FinanceRepository } from './finance.repository'
import { FinanceMgmtRepository } from './finance-mgmt.repository'
import { DocumentTemplateRepository } from './document-template.repository'
import { CommunicationRepository } from './communication.repository'
import { CommunicationMgmtRepository } from './communication-mgmt.repository'
import { BackupSyncRepository } from './backup-sync.repository'
import { AdmissionRepository } from './admission.repository'
import { StudentTransferRepository } from './student-transfer.repository'
import { StudentDocumentRepository } from './student-document.repository'
import { PromotionRepository } from './promotion.repository'
import { ResultsCalculationRepository } from './results-calculation.repository'
import { SubjectCoefficientsRepository } from './subject-coefficients.repository'
import {
  AttendanceRepository,
  CaRepository,
  ExamRepository,
  ReportCardRepository,
  ResultsRepository,
  TimetableRepository,
} from './academic-mgmt.repository'
import { StaffAttendanceRepository } from './staff-attendance.repository'
import { GateAttendanceRepository } from './gate-attendance.repository'
import { LeaveRepository } from './leave.repository'
import { StaffNotificationRepository } from './staff-notification.repository'
import { BudgetRepository } from './budget.repository'
import { OnlinePaymentRepository } from './online-payment.repository'
import { BankDepositRepository } from './bank-deposit.repository'
import { StudentIdCardRepository } from './student-id-card.repository'
import { TeachingProgressRepository } from './teaching-progress.repository'
import { ReportsRepository } from './reports.repository'
import { DocumentsRepository } from './documents.repository'
import { SystemAdminRepository } from './system-admin.repository'
import { AssessmentQuestionsRepository } from './assessment-questions.repository'

/** Factory that creates all repositories from a shared DB connection. */
export function createRepositories(db: Database.Database) {
  const financeMgmt = new FinanceMgmtRepository(db)
  return {
    schools: new SchoolRepository(db),
    users: new UserRepository(db),
    classes: new ClassRepository(db),
    students: new StudentRepository(db),
    subjects: new SubjectRepository(db),
    scores: new ScoreRepository(db),
    setupSteps: new SetupStepRepository(db),
    academicYears: new AcademicYearRepository(db),
    departments: new DepartmentRepository(db),
    academicLevels: new AcademicLevelRepository(db),
    sections: new SectionRepository(db),
    specializations: new SpecializationRepository(db),
    gradingSystems: new GradingSystemRepository(db),
    staff: new StaffRepository(db),
    roles: new RoleRepository(db),
    studentSettings: new StudentSettingsRepository(db),
    studentIdSettings: new StudentIdSettingsRepository(db),
    finance: new FinanceRepository(db),
    financeMgmt,
    budgets: new BudgetRepository(db),
    onlinePayments: new OnlinePaymentRepository(db, financeMgmt),
    bankDeposits: new BankDepositRepository(db, financeMgmt),
    studentIdCards: new StudentIdCardRepository(db),
    teachingProgress: new TeachingProgressRepository(db),
    reports: new ReportsRepository(db),
    documents: new DocumentsRepository(db),
    systemAdmin: new SystemAdminRepository(db),
    documentTemplates: new DocumentTemplateRepository(db),
    communication: new CommunicationRepository(db),
    communicationMgmt: new CommunicationMgmtRepository(db),
    backupSync: new BackupSyncRepository(db),
    admissions: new AdmissionRepository(db),
    studentTransfers: new StudentTransferRepository(db),
    studentDocuments: new StudentDocumentRepository(db),
    promotions: new PromotionRepository(db),
    timetable: new TimetableRepository(db),
    attendance: new AttendanceRepository(db),
    gateAttendance: new GateAttendanceRepository(db),
    ca: new CaRepository(db),
    exams: new ExamRepository(db),
    results: new ResultsRepository(db),
    resultCalc: new ResultsCalculationRepository(db),
    subjectCoefficients: new SubjectCoefficientsRepository(db),
    reportCards: new ReportCardRepository(db),
    staffAttendance: new StaffAttendanceRepository(db),
    leave: new LeaveRepository(db),
    staffNotifications: new StaffNotificationRepository(db),
    assessmentQuestions: new AssessmentQuestionsRepository(db),
  }
}

export type Repositories = ReturnType<typeof createRepositories>

export {
  SchoolRepository,
  UserRepository,
  ClassRepository,
  StudentRepository,
  SubjectRepository,
  ScoreRepository,
  SetupStepRepository,
  AcademicYearRepository,
  DepartmentRepository,
  AcademicLevelRepository,
  SectionRepository,
  SpecializationRepository,
  GradingSystemRepository,
  StaffRepository,
  RoleRepository,
  StudentSettingsRepository,
  StudentIdSettingsRepository,
  FinanceRepository,
  FinanceMgmtRepository,
  DocumentTemplateRepository,
  CommunicationRepository,
  BackupSyncRepository,
  AdmissionRepository,
  StudentTransferRepository,
  StudentDocumentRepository,
  PromotionRepository,
  TimetableRepository,
  AttendanceRepository,
  CaRepository,
  ExamRepository,
  ResultsRepository,
  ResultsCalculationRepository,
  SubjectCoefficientsRepository,
  ReportCardRepository,
  StaffAttendanceRepository,
  LeaveRepository,
  StaffNotificationRepository,
}
