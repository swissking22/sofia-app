import type Database from 'better-sqlite3'

export type SchoolSeed = {
  id: string
  name: string
  short_code: string
  email: string
}

export type ClassSeed = {
  id: string
  school_id: string
  name: string
  level: string
  academic_level_id: string
  department_id: string | null
  section_id: string | null
}

export type StaffSeed = {
  id: string
  school_id: string
  full_name: string
  department_id: string | null
  staff_type: 'teaching' | 'non_teaching'
  job_role: string
  email: string | null
}

export type SubjectSeed = {
  id: string
  school_id: string
  name: string
  class_id: string
  department_id: string | null
}

export type StudentSeed = {
  id: string
  school_id: string
  class_id: string
  name: string
  student_code: string
  academic_level_id: string | null
}

export type FeeStructureSeed = {
  id: string
  school_id: string
  class_id: string
  academic_year_id: string
  total: number
}

export type SeedContext = {
  db: Database.Database
  schools: SchoolSeed[]
  /** schoolId → academic year id */
  years: Map<string, string>
  /** schoolId → term ids */
  terms: Map<string, string[]>
  /** schoolId → department id by name */
  departments: Map<string, Map<string, string>>
  /** schoolId → level id by name */
  levels: Map<string, Map<string, string>>
  /** schoolId → section id by name */
  sections: Map<string, Map<string, string>>
  classes: ClassSeed[]
  staff: StaffSeed[]
  subjects: SubjectSeed[]
  students: StudentSeed[]
  feeStructures: FeeStructureSeed[]
  /** schoolId → counters */
  counters: Map<
    string,
    { invoice: number; payment: number; receipt: number; expense: number }
  >
  adminEmails: string[]
}

export function createContext(db: Database.Database): SeedContext {
  return {
    db,
    schools: [],
    years: new Map(),
    terms: new Map(),
    departments: new Map(),
    levels: new Map(),
    sections: new Map(),
    classes: [],
    staff: [],
    subjects: [],
    students: [],
    feeStructures: [],
    counters: new Map(),
    adminEmails: [],
  }
}
