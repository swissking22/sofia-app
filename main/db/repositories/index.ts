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
import { DocumentTemplateRepository } from './document-template.repository'
import { CommunicationRepository } from './communication.repository'
import { BackupSyncRepository } from './backup-sync.repository'
import { AdmissionRepository } from './admission.repository'
import { StudentTransferRepository } from './student-transfer.repository'
import { StudentDocumentRepository } from './student-document.repository'
import { PromotionRepository } from './promotion.repository'
import {
  AttendanceRepository,
  CaRepository,
  ExamRepository,
  ReportCardRepository,
  ResultsRepository,
  TimetableRepository,
} from './academic-mgmt.repository'

/** Factory that creates all repositories from a shared DB connection. */
export function createRepositories(db: Database.Database) {
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
    documentTemplates: new DocumentTemplateRepository(db),
    communication: new CommunicationRepository(db),
    backupSync: new BackupSyncRepository(db),
    admissions: new AdmissionRepository(db),
    studentTransfers: new StudentTransferRepository(db),
    studentDocuments: new StudentDocumentRepository(db),
    promotions: new PromotionRepository(db),
    timetable: new TimetableRepository(db),
    attendance: new AttendanceRepository(db),
    ca: new CaRepository(db),
    exams: new ExamRepository(db),
    results: new ResultsRepository(db),
    reportCards: new ReportCardRepository(db),
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
  ReportCardRepository,
}
