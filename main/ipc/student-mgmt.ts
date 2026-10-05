import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type { StudentStatus } from '../db/repositories/student.repository'
import type {
  Admission,
  AdmissionStatus,
  Class,
  DocumentType,
  Student,
  StudentDocument,
  StudentTransfer,
} from '../db/types'
import {
  assetToDataUrl,
  saveStudentDocumentFile,
  saveStudentPhoto,
} from '../helpers/student-documents'
import { compareClassesByStructure } from '../domain/class-order'
import { normalizeCameroonPhone } from '../domain/phone'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const PHONE_FORMAT_HINT =
  'Use a Cameroon number without country code (9 digits, e.g. 670000001).'

function resolveOptionalPhone(
  value: string | null | undefined
): { ok: true; phone: string | null } | { ok: false; error: string } {
  const phone = normalizeCameroonPhone(value)
  if (phone === 'invalid') {
    return { ok: false, error: `Invalid phone. ${PHONE_FORMAT_HINT}` }
  }
  return { ok: true, phone }
}

function resolveRequiredPhone(
  value: string | null | undefined,
  label: string
): { ok: true; phone: string } | { ok: false; error: string } {
  const phone = normalizeCameroonPhone(value)
  if (phone == null) {
    return { ok: false, error: `${label} is required.` }
  }
  if (phone === 'invalid') {
    return { ok: false, error: `Invalid ${label.toLowerCase()}. ${PHONE_FORMAT_HINT}` }
  }
  return { ok: true, phone }
}

export interface StudentDto {
  id: string
  name: string
  class_id: string
  class_name: string | null
  academic_level_id: string | null
  level_name: string | null
  level_sort_order: number | null
  section_id: string | null
  section_name: string | null
  school_id: string | null
  student_code: string | null
  admission_year: number | null
  sequence_number: number | null
  gender: string | null
  date_of_birth: string | null
  place_of_birth: string | null
  phone: string | null
  email: string | null
  address: string | null
  admission_type: string | null
  guardian_name: string | null
  guardian_phone: string | null
  guardian_email: string | null
  guardian_relationship: string | null
  status: string
  photo_url: string | null
  residence_type: string
  created_at: string
  updated_at: string
}

export type StudentDetailDto = StudentDto

export interface StudentListResult {
  students: StudentDto[]
  filters: {
    years: number[]
    levels: Array<{ id: string; name: string; sort_order: number }>
    sections: Array<{ id: string; name: string }>
    classes: Array<{
      id: string
      name: string
      academic_level_id: string | null
      section_id: string | null
      level_sort_order: number | null
      section_name: string | null
    }>
  }
}

export interface PromotionPreviewClass {
  class_id: string
  class_name: string
  academic_level_id: string | null
  level_name: string | null
  section_id: string | null
  section_name: string | null
  student_count: number
  suggested_to_class_id: string | null
  suggested_to_class_name: string | null
}

export interface PromotionPreviewDto {
  from_year: number
  to_year?: number
  classes: PromotionPreviewClass[]
  mappings: Array<{
    from_class_id: string
    to_class_id: string | null
    student_count: number
  }>
}

export interface StudentDocumentDto {
  id: string
  school_id: string
  student_id: string
  student_name: string | null
  document_type: DocumentType
  title: string
  file_path: string | null
  file_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TransferDto extends StudentTransfer {
  student_name: string | null
  student_code: string | null
}

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  return repos.schools.findLatest()?.id ?? null
}

type ClassListClassInfo = {
  id: string
  name: string
  level_name: string | null
  level_sort_order: number | null
  section_name: string | null
}

type ClassListGroupDto = {
  class: ClassListClassInfo | null
  students: StudentDto[]
}

function byName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

function classInfoOf(repos: Repositories, cls: Class): ClassListClassInfo {
  const level = cls.academic_level_id
    ? repos.academicLevels.findById(cls.academic_level_id)
    : undefined
  const section = cls.section_id
    ? repos.sections.findById(cls.section_id)
    : undefined
  return {
    id: cls.id,
    name: cls.name,
    level_name: level?.name ?? null,
    level_sort_order: level?.sort_order ?? null,
    section_name: section?.name ?? null,
  }
}

function sortedStudents(students: StudentDto[]): StudentDto[] {
  return [...students].sort((a, b) => byName(a.name, b.name))
}

function enrichStudent(repos: Repositories, student: Student): StudentDto {
  const cls = student.class_id
    ? repos.classes.findById(student.class_id)
    : undefined
  const levelId = student.academic_level_id ?? cls?.academic_level_id ?? null
  const level = levelId ? repos.academicLevels.findById(levelId) : undefined
  const sectionId = cls?.section_id ?? null
  const section = sectionId ? repos.sections.findById(sectionId) : undefined

  return {
    id: student.id,
    name: student.name,
    class_id: student.class_id,
    class_name: cls?.name ?? null,
    academic_level_id: levelId,
    level_name: level?.name ?? null,
    level_sort_order: level?.sort_order ?? null,
    section_id: sectionId,
    section_name: section?.name ?? null,
    school_id: student.school_id,
    student_code: student.student_code,
    admission_year: student.admission_year,
    sequence_number: student.sequence_number,
    gender: student.gender,
    date_of_birth: student.date_of_birth,
    place_of_birth: student.place_of_birth ?? null,
    phone: student.phone,
    email: student.email,
    address: student.address,
    admission_type: student.admission_type,
    guardian_name: student.guardian_name,
    guardian_phone: student.guardian_phone,
    guardian_email: student.guardian_email,
    guardian_relationship: student.guardian_relationship,
    status: student.status,
    photo_url: assetToDataUrl(student.photo_path),
    residence_type: student.residence_type || 'day',
    created_at: student.created_at,
    updated_at: student.updated_at,
  }
}

function listFilterOptions(
  repos: Repositories,
  schoolId: string
): StudentListResult['filters'] {
  const allStudents = repos.students.findBySchool(schoolId, 'all')
  const yearSet = new Set<number>()
  for (const s of allStudents) {
    if (s.admission_year != null) yearSet.add(s.admission_year)
  }
  const years = Array.from(yearSet).sort((a, b) => b - a)
  const levels = repos.academicLevels.findBySchool(schoolId).map((l) => ({
    id: l.id,
    name: l.name,
    sort_order: l.sort_order,
  }))
  const sections = repos.sections.findBySchool(schoolId).map((s) => ({
    id: s.id,
    name: s.name,
  }))
  const classes = repos.classes
    .findStructureClasses(schoolId)
    .filter((c) => c.is_active === 1)
    .map((c) => {
      const level = c.academic_level_id
        ? repos.academicLevels.findById(c.academic_level_id)
        : undefined
      const section = c.section_id
        ? repos.sections.findById(c.section_id)
        : undefined
      return {
        id: c.id,
        name: c.name,
        academic_level_id: c.academic_level_id,
        section_id: c.section_id,
        level_sort_order: level?.sort_order ?? null,
        section_name: section?.name ?? null,
      }
    })
  return { years, levels, sections, classes }
}

function toDocumentDto(
  repos: Repositories,
  doc: StudentDocument
): StudentDocumentDto {
  const student = repos.students.findById(doc.student_id)
  return {
    id: doc.id,
    school_id: doc.school_id,
    student_id: doc.student_id,
    student_name: student?.name ?? null,
    document_type: doc.document_type,
    title: doc.title,
    file_path: doc.file_path,
    file_url: assetToDataUrl(doc.file_path),
    notes: doc.notes,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  }
}

function toTransferDto(
  repos: Repositories,
  transfer: StudentTransfer
): TransferDto {
  const student = repos.students.findById(transfer.student_id)
  return {
    ...transfer,
    student_name: student?.name ?? null,
    student_code: student?.student_code ?? null,
  }
}

function buildPromotionPreview(
  repos: Repositories,
  schoolId: string,
  fromYear: number,
  toYear?: number
): PromotionPreviewDto {
  const levels = repos.academicLevels.findBySchool(schoolId)
  const levelById = new Map(levels.map((l) => [l.id, l]))
  const sections = repos.sections.findBySchool(schoolId)
  const sectionById = new Map(sections.map((s) => [s.id, s]))
  const classes = repos.classes.findStructureClasses(schoolId)

  const nextLevelId = (levelId: string | null): string | null => {
    if (!levelId) return null
    const current = levelById.get(levelId)
    if (!current) return null
    const next = levels.find((l) => l.sort_order === current.sort_order + 1)
    return next?.id ?? null
  }

  const classesDto: PromotionPreviewClass[] = classes.map((cls) => {
    const students = repos.students
      .findByClassId(cls.id)
      .filter((s) => s.status === 'active')
    const nextLevel = nextLevelId(cls.academic_level_id)
    const suggested =
      nextLevel && cls.section_id
        ? classes.find(
            (c) =>
              c.academic_level_id === nextLevel &&
              c.section_id === cls.section_id &&
              (cls.specialization_id
                ? c.specialization_id === cls.specialization_id
                : true)
          ) ??
          classes.find(
            (c) =>
              c.academic_level_id === nextLevel &&
              c.section_id === cls.section_id
          )
        : undefined

    return {
      class_id: cls.id,
      class_name: cls.name,
      academic_level_id: cls.academic_level_id,
      level_name: cls.academic_level_id
        ? levelById.get(cls.academic_level_id)?.name ?? null
        : null,
      section_id: cls.section_id,
      section_name: cls.section_id
        ? sectionById.get(cls.section_id)?.name ?? null
        : null,
      student_count: students.length,
      suggested_to_class_id: suggested?.id ?? null,
      suggested_to_class_name: suggested?.name ?? null,
    }
  })

  return {
    from_year: fromYear,
    to_year: toYear,
    classes: classesDto,
    mappings: classesDto.map((c) => ({
      from_class_id: c.class_id,
      to_class_id: c.suggested_to_class_id,
      student_count: c.student_count,
    })),
  }
}

export function registerStudentMgmtIpc(repos: Repositories): void {
  ipcMain.handle(
    'students:mgmt-list',
    (
      _e,
      input?: {
        status?: StudentStatus | 'all'
        admissionYear?: number | null
        academicLevelId?: string | null
        sectionId?: string | null
        classId?: string | null
        search?: string | null
        incompleteProfiles?: boolean
        sortBy?: 'name' | 'class'
      }
    ): Result<StudentListResult> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) {
        return {
          ok: false,
          error: 'No school found. Complete registration first.',
        }
      }

      const sortBy = input?.sortBy === 'class' ? 'class' : 'name'
      const students = repos.students
        .listFiltered({
          schoolId,
          status: input?.status,
          admissionYear: input?.admissionYear,
          academicLevelId: input?.academicLevelId,
          sectionId: input?.sectionId,
          classId: input?.classId,
          search: input?.search,
          incompleteProfiles: input?.incompleteProfiles === true,
        })
        .map((s) => enrichStudent(repos, s))
        .sort((a, b) => {
          if (sortBy === 'class') {
            const byClass = compareClassesByStructure(
              {
                level_sort_order: a.level_sort_order,
                section_name: a.section_name,
                name: a.class_name ?? '',
              },
              {
                level_sort_order: b.level_sort_order,
                section_name: b.section_name,
                name: b.class_name ?? '',
              }
            )
            if (byClass !== 0) return byClass
          }
          return a.name.localeCompare(b.name, undefined, {
            sensitivity: 'base',
            numeric: true,
          })
        })

      return {
        ok: true,
        data: {
          students,
          filters: listFilterOptions(repos, schoolId),
        },
      }
    }
  )

  ipcMain.handle(
    'students:class-list',
    (
      _e,
      input?: { class_id?: string | null; student_ids?: string[] }
    ): Result<{
      title: string
      generated_at: string
      all_classes: boolean
      school: {
        name: string
        address: string | null
        phone: string | null
        email: string | null
        school_code: string
        region: string | null
        division: string | null
        logo_url: string | null
      }
      academic_year: { id: string; name: string } | null
      class: ClassListClassInfo | null
      students: StudentDto[]
      groups: ClassListGroupDto[]
    }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }

      const school = repos.schools.findById(schoolId)
      if (!school) return { ok: false, error: 'School not found.' }

      const yearSetup = repos.academicYears.getSetupDto(schoolId)
      const ids = (input?.student_ids ?? []).filter(Boolean)
      const classId = input?.class_id?.trim() || null
      const allClasses = classId === 'all'

      if (!classId && ids.length === 0) {
        return {
          ok: false,
          error: 'Select a class or at least one student.',
        }
      }

      let groups: ClassListGroupDto[] = []

      if (ids.length > 0) {
        const selected = ids
          .map((id) => repos.students.findById(id))
          .filter((s): s is Student =>
            Boolean(s && s.school_id === schoolId && !s.deleted_at)
          )
          .map((s) => enrichStudent(repos, s))
        const byClass = new Map<string, StudentDto[]>()
        for (const s of selected) {
          const key = s.class_id || '__none__'
          const list = byClass.get(key) ?? []
          list.push(s)
          byClass.set(key, list)
        }
        groups = [...byClass.entries()]
          .map(([key, list]) => {
            const cls =
              key === '__none__' ? undefined : repos.classes.findById(key)
            return {
              class: cls ? classInfoOf(repos, cls) : null,
              students: sortedStudents(list),
            }
          })
          .sort((a, b) =>
            compareClassesByStructure(
              {
                level_sort_order: a.class?.level_sort_order,
                section_name: a.class?.section_name,
                name: a.class?.name ?? '',
              },
              {
                level_sort_order: b.class?.level_sort_order,
                section_name: b.class?.section_name,
                name: b.class?.name ?? '',
              }
            )
          )
      } else if (allClasses) {
        const classes = repos.classes
          .findStructureClasses(schoolId)
          .filter((c) => c.is_active === 1)
        groups = classes.map((cls) => ({
          class: classInfoOf(repos, cls),
          students: sortedStudents(
            repos.students
              .listFiltered({
                schoolId,
                status: 'active',
                classId: cls.id,
              })
              .map((s) => enrichStudent(repos, s))
          ),
        }))
      } else {
        const cls = classId ? repos.classes.findById(classId) : undefined
        if (!cls || cls.school_id !== schoolId) {
          return { ok: false, error: 'Class not found.' }
        }
        groups = [
          {
            class: classInfoOf(repos, cls),
            students: sortedStudents(
              repos.students
                .listFiltered({
                  schoolId,
                  status: 'active',
                  classId,
                })
                .map((s) => enrichStudent(repos, s))
            ),
          },
        ]
      }

      const students = groups.flatMap((g) => g.students)
      const onlyClass =
        !allClasses && groups.length === 1 ? groups[0].class : null
      const title = allClasses
        ? 'Class list — All classes'
        : onlyClass
          ? `Class list — ${onlyClass.name}`
          : 'Selected students'

      return {
        ok: true,
        data: {
          title,
          generated_at: new Date().toISOString(),
          all_classes: allClasses,
          school: {
            name: school.name,
            address: school.address,
            phone: school.phone,
            email: school.email,
            school_code: school.school_code,
            region: school.region,
            division: school.division,
            logo_url: assetToDataUrl(school.logo_path),
          },
          academic_year: yearSetup
            ? { id: yearSetup.id, name: yearSetup.name }
            : null,
          class: onlyClass,
          students,
          groups,
        },
      }
    }
  )

  ipcMain.handle(
    'students:mgmt-get',
    (_e, input: { id: string }): Result<StudentDetailDto> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.id) return { ok: false, error: 'Student id is required.' }

      const student = repos.students.findById(input.id)
      if (!student || student.school_id !== schoolId) {
        return { ok: false, error: 'Student not found.' }
      }
      return { ok: true, data: enrichStudent(repos, student) }
    }
  )

  ipcMain.handle(
    'students:mgmt-create',
    (
      _e,
      input: {
        name: string
        class_id: string
        admission_year: number
        gender?: string | null
        date_of_birth?: string | null
        place_of_birth?: string | null
        phone?: string | null
        email?: string | null
        address?: string | null
        admission_type?: string | null
        guardian_name?: string | null
        guardian_phone?: string | null
        guardian_email?: string | null
        guardian_relationship?: string | null
        residence_type?: 'day' | 'boarding' | null
      }
    ): Result<StudentDetailDto> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }

      const name = input?.name?.trim()
      if (!name) return { ok: false, error: 'Student name is required.' }
      if (!input?.class_id) return { ok: false, error: 'Class is required.' }
      if (!input?.admission_year) {
        return { ok: false, error: 'Admission year is required.' }
      }
      const guardianName = input?.guardian_name?.trim() || null
      const guardianPhoneRes = resolveRequiredPhone(
        input?.guardian_phone,
        'Guardian phone'
      )
      if (!guardianPhoneRes.ok) return guardianPhoneRes
      const phoneRes = resolveOptionalPhone(input?.phone)
      if (!phoneRes.ok) return phoneRes

      const cls = repos.classes.findById(input.class_id)
      if (!cls || cls.school_id !== schoolId) {
        return { ok: false, error: 'Class not found.' }
      }

      const duplicate = repos.students.findActiveDuplicateInClass(
        schoolId,
        name,
        input.class_id
      )
      if (duplicate) {
        return {
          ok: false,
          error: `A student named "${duplicate.name}" already exists in this class (${duplicate.student_code || 'no ID'}).`,
        }
      }

      const academicLevelId = cls.academic_level_id
      if (!academicLevelId) {
        return { ok: false, error: 'Class has no academic level assigned.' }
      }

      const section = cls.section_id
        ? repos.sections.findById(cls.section_id)
        : undefined
      const specialization = cls.specialization_id
        ? repos.specializations.findById(cls.specialization_id)
        : undefined

      try {
        const student = repos.students.create({
          name,
          class_id: input.class_id,
          school_id: schoolId,
          admission_year: input.admission_year,
          academic_level_id: academicLevelId,
          section_name: section?.name ?? null,
          specialization_abbr: specialization?.abbreviation ?? null,
          gender: input.gender ?? null,
          date_of_birth: input.date_of_birth ?? null,
          place_of_birth: input.place_of_birth ?? null,
          phone: phoneRes.phone,
          email: input.email ?? null,
          address: input.address ?? null,
          admission_type: input.admission_type ?? null,
          guardian_name: guardianName,
          guardian_phone: guardianPhoneRes.phone,
          guardian_email: input.guardian_email ?? null,
          guardian_relationship: input.guardian_relationship ?? null,
          status: 'active',
          residence_type: input.residence_type === 'boarding' ? 'boarding' : 'day',
        })

        return { ok: true, data: enrichStudent(repos, student) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not create student.',
        }
      }
    }
  )

  ipcMain.handle(
    'students:mgmt-update',
    (
      _e,
      input: {
        id: string
        name?: string
        class_id?: string
        gender?: string | null
        date_of_birth?: string | null
        place_of_birth?: string | null
        phone?: string | null
        email?: string | null
        address?: string | null
        admission_type?: string | null
        admission_year?: number | null
        guardian_name?: string | null
        guardian_phone?: string | null
        guardian_email?: string | null
        guardian_relationship?: string | null
        status?: string
        residence_type?: 'day' | 'boarding' | null
      }
    ): Result<StudentDetailDto> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.id) return { ok: false, error: 'Student id is required.' }

      const existing = repos.students.findById(input.id)
      if (!existing || existing.school_id !== schoolId) {
        return { ok: false, error: 'Student not found.' }
      }

      try {
        let academic_level_id = existing.academic_level_id
        let class_id = existing.class_id

        if (input.class_id && input.class_id !== existing.class_id) {
          const cls = repos.classes.findById(input.class_id)
          if (!cls || cls.school_id !== schoolId) {
            return { ok: false, error: 'Class not found.' }
          }
          class_id = input.class_id
          academic_level_id = cls.academic_level_id
        }

        let phone: string | null | undefined
        if (input.phone !== undefined) {
          const phoneRes = resolveOptionalPhone(input.phone)
          if (!phoneRes.ok) return phoneRes
          phone = phoneRes.phone
        }

        let guardian_phone: string | null | undefined
        if (input.guardian_phone !== undefined) {
          const guardianPhoneRes = resolveRequiredPhone(
            input.guardian_phone,
            'Guardian phone'
          )
          if (!guardianPhoneRes.ok) return guardianPhoneRes
          guardian_phone = guardianPhoneRes.phone
        }

        const updated = repos.students.update(input.id, {
          name: input.name,
          class_id,
          academic_level_id,
          gender: input.gender,
          date_of_birth: input.date_of_birth,
          place_of_birth: input.place_of_birth,
          phone,
          email: input.email,
          address: input.address,
          admission_type: input.admission_type,
          admission_year: input.admission_year,
          guardian_name: input.guardian_name,
          guardian_phone,
          guardian_email: input.guardian_email,
          guardian_relationship: input.guardian_relationship,
          ...(input.status !== undefined ? { status: input.status } : {}),
          residence_type:
            input.residence_type === 'boarding'
              ? 'boarding'
              : input.residence_type === 'day'
                ? 'day'
                : undefined,
          // student_code intentionally omitted — immutable
        })
        if (!updated) return { ok: false, error: 'Student not found.' }
        return { ok: true, data: enrichStudent(repos, updated) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not update student.',
        }
      }
    }
  )

  ipcMain.handle(
    'students:mgmt-bulk-status',
    (
      _e,
      input: { ids: string[]; status: StudentStatus }
    ): Result<{ updated: number }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.ids?.length) {
        return { ok: false, error: 'Select at least one student.' }
      }
      if (
        !input.status ||
        !['active', 'alumni', 'transferred'].includes(input.status)
      ) {
        return { ok: false, error: 'Invalid status.' }
      }

      const owned = input.ids.filter((id) => {
        const s = repos.students.findById(id)
        return s && s.school_id === schoolId
      })
      if (!owned.length) return { ok: false, error: 'No matching students.' }

      try {
        const updated = repos.students.bulkUpdateStatus(owned, input.status)
        return { ok: true, data: { updated } }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not update student status.',
        }
      }
    }
  )

  ipcMain.handle(
    'students:mgmt-delete',
    (_e, input: { id: string }): Result<{ id: string }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.id) return { ok: false, error: 'Student id is required.' }

      const existing = repos.students.findById(input.id)
      if (!existing || existing.school_id !== schoolId) {
        return { ok: false, error: 'Student not found.' }
      }

      try {
        repos.students.delete(input.id)
        return { ok: true, data: { id: input.id } }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not delete student.',
        }
      }
    }
  )

  ipcMain.handle(
    'admissions:create',
    (
      _e,
      input: {
        full_name: string
        gender?: string | null
        date_of_birth?: string | null
        phone?: string | null
        email?: string | null
        address?: string | null
        academic_level_id?: string | null
        preferred_class_id?: string | null
        admission_year?: number | null
        guardian_name?: string | null
        guardian_phone?: string | null
        guardian_email?: string | null
        guardian_relationship?: string | null
        notes?: string | null
        photo_base64?: string | null
        photo_mime_type?: string | null
      }
    ): Result<Admission> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }

      const full_name = input?.full_name?.trim()
      if (!full_name) return { ok: false, error: 'Full name is required.' }

      const phoneRes = resolveOptionalPhone(input?.phone)
      if (!phoneRes.ok) return phoneRes
      const guardianPhoneRes = resolveOptionalPhone(input?.guardian_phone)
      if (!guardianPhoneRes.ok) return guardianPhoneRes

      let photo_path: string | null = null
      if (input.photo_base64?.trim()) {
        const mime = input.photo_mime_type || 'image/jpeg'
        if (!mime.startsWith('image/')) {
          return { ok: false, error: 'Photo must be an image file.' }
        }
        try {
          photo_path = saveStudentPhoto(input.photo_base64, mime)
        } catch (err) {
          return {
            ok: false,
            error:
              err instanceof Error ? err.message : 'Could not save photo.',
          }
        }
      }

      try {
        const admission = repos.admissions.create({
          school_id: schoolId,
          full_name,
          gender: input.gender ?? null,
          date_of_birth: input.date_of_birth ?? null,
          phone: phoneRes.phone,
          email: input.email ?? null,
          address: input.address ?? null,
          academic_level_id: input.academic_level_id ?? null,
          preferred_class_id: input.preferred_class_id ?? null,
          admission_year: input.admission_year ?? null,
          guardian_name: input.guardian_name ?? null,
          guardian_phone: guardianPhoneRes.phone,
          guardian_email: input.guardian_email ?? null,
          guardian_relationship: input.guardian_relationship ?? null,
          notes: input.notes ?? null,
          status: 'pending',
          photo_path,
        })
        return { ok: true, data: admission }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not create admission.',
        }
      }
    }
  )

  ipcMain.handle(
    'admissions:list',
    (
      _e,
      input?: {
        status?: AdmissionStatus | 'all'
        search?: string | null
        admissionYear?: number | null
      }
    ): Result<
      Array<{
        id: string
        full_name: string
        gender: string | null
        phone: string | null
        email: string | null
        academic_level_id: string | null
        level_name: string | null
        preferred_class_id: string | null
        class_name: string | null
        admission_year: number | null
        guardian_name: string | null
        guardian_phone: string | null
        status: string
        notes: string | null
        student_id: string | null
        photo_url: string | null
        created_at: string
      }>
    > => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }

      let rows = repos.admissions.findBySchool(schoolId)
      const status = input?.status ?? 'all'
      if (status !== 'all') {
        rows = rows.filter((r) => r.status === status)
      }
      if (input?.admissionYear) {
        rows = rows.filter((r) => r.admission_year === input.admissionYear)
      }
      const q = input?.search?.trim().toLowerCase()
      if (q) {
        rows = rows.filter(
          (r) =>
            r.full_name.toLowerCase().includes(q) ||
            (r.phone || '').toLowerCase().includes(q) ||
            (r.email || '').toLowerCase().includes(q) ||
            (r.guardian_name || '').toLowerCase().includes(q)
        )
      }

      return {
        ok: true,
        data: rows.map((r) => ({
          id: r.id,
          full_name: r.full_name,
          gender: r.gender,
          phone: r.phone,
          email: r.email,
          academic_level_id: r.academic_level_id,
          level_name: r.academic_level_id
            ? repos.academicLevels.findById(r.academic_level_id)?.name ?? null
            : null,
          preferred_class_id: r.preferred_class_id,
          class_name: r.preferred_class_id
            ? repos.classes.findById(r.preferred_class_id)?.name ?? null
            : null,
          admission_year: r.admission_year,
          guardian_name: r.guardian_name,
          guardian_phone: r.guardian_phone,
          status: r.status,
          notes: r.notes,
          student_id: r.student_id,
          photo_url: assetToDataUrl(r.photo_path),
          created_at: r.created_at,
        })),
      }
    }
  )

  ipcMain.handle(
    'admissions:approve',
    (
      _e,
      input: {
        id: string
        class_id?: string | null
        admission_year?: number | null
      }
    ): Result<{ admission_id: string; student_id: string; student_code: string | null }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.id) return { ok: false, error: 'Admission id is required.' }

      const admission = repos.admissions.findById(input.id)
      if (!admission || admission.school_id !== schoolId) {
        return { ok: false, error: 'Admission not found.' }
      }
      if (admission.status !== 'pending') {
        return { ok: false, error: 'Only pending applications can be approved.' }
      }

      const classId =
        input.class_id?.trim() || admission.preferred_class_id || ''
      if (!classId) {
        return {
          ok: false,
          error: 'Assign a class before approving this application.',
        }
      }

      const cls = repos.classes.findById(classId)
      if (!cls || cls.school_id !== schoolId) {
        return { ok: false, error: 'Class not found.' }
      }
      const academicLevelId = cls.academic_level_id
      if (!academicLevelId) {
        return { ok: false, error: 'Class has no academic level assigned.' }
      }

      const admissionYear =
        input.admission_year ||
        admission.admission_year ||
        new Date().getFullYear()

      const section = cls.section_id
        ? repos.sections.findById(cls.section_id)
        : undefined
      const specialization = cls.specialization_id
        ? repos.specializations.findById(cls.specialization_id)
        : undefined

      try {
        const student = repos.schools.getDb().transaction(() => {
          const newStudent = repos.students.create({
            name: admission.full_name,
            class_id: classId,
            school_id: schoolId,
            admission_year: admissionYear,
            academic_level_id: academicLevelId,
            section_name: section?.name ?? null,
            specialization_abbr: specialization?.abbreviation ?? null,
            gender: admission.gender,
            date_of_birth: admission.date_of_birth,
            phone: admission.phone,
            email: admission.email,
            address: admission.address,
            admission_type: 'new',
            guardian_name: admission.guardian_name,
            guardian_phone: admission.guardian_phone,
            guardian_email: admission.guardian_email,
            guardian_relationship: admission.guardian_relationship,
            status: 'active',
            photo_path: admission.photo_path,
          })

          repos.admissions.updateDecision(admission.id, {
            status: 'accepted',
            student_id: newStudent.id,
            preferred_class_id: classId,
          })

          return newStudent
        })()

        return {
          ok: true,
          data: {
            admission_id: admission.id,
            student_id: student.id,
            student_code: student.student_code,
          },
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not approve admission.',
        }
      }
    }
  )

  ipcMain.handle(
    'admissions:reject',
    (
      _e,
      input: { id: string; notes?: string | null }
    ): Result<{ id: string; status: string }> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.id) return { ok: false, error: 'Admission id is required.' }

      const admission = repos.admissions.findById(input.id)
      if (!admission || admission.school_id !== schoolId) {
        return { ok: false, error: 'Admission not found.' }
      }
      if (admission.status !== 'pending') {
        return { ok: false, error: 'Only pending applications can be rejected.' }
      }

      try {
        const updated = repos.admissions.updateDecision(admission.id, {
          status: 'rejected',
          notes: input.notes?.trim()
            ? [admission.notes, input.notes.trim()].filter(Boolean).join('\n')
            : admission.notes,
        })
        if (!updated) return { ok: false, error: 'Could not reject admission.' }
        return { ok: true, data: { id: updated.id, status: updated.status } }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not reject admission.',
        }
      }
    }
  )

  ipcMain.handle(
    'transfers:list',
    (): Result<TransferDto[]> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const rows = repos.studentTransfers
        .findBySchool(schoolId)
        .map((t) => toTransferDto(repos, t))
      return { ok: true, data: rows }
    }
  )

  ipcMain.handle(
    'transfers:create',
    (
      _e,
      input: {
        student_id: string
        to_school_name: string
        transfer_date: string
        reason?: string | null
      }
    ): Result<TransferDto> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.student_id) {
        return { ok: false, error: 'Student is required.' }
      }
      const toSchool = input?.to_school_name?.trim()
      if (!toSchool) return { ok: false, error: 'Destination school is required.' }
      if (!input?.transfer_date) {
        return { ok: false, error: 'Transfer date is required.' }
      }

      const student = repos.students.findById(input.student_id)
      if (!student || student.school_id !== schoolId) {
        return { ok: false, error: 'Student not found.' }
      }

      try {
        // Create as pending, then complete + mark student transferred in one action.
        const created = repos.studentTransfers.create({
          school_id: schoolId,
          student_id: input.student_id,
          from_class_id: student.class_id,
          to_school_name: toSchool,
          transfer_date: input.transfer_date,
          reason: input.reason ?? null,
          status: 'pending',
        })
        const completed =
          repos.studentTransfers.updateStatus(created.id, 'completed') ?? created
        repos.students.update(student.id, { status: 'transferred' })
        return { ok: true, data: toTransferDto(repos, completed) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not create transfer.',
        }
      }
    }
  )

  ipcMain.handle(
    'documents:list',
    (): Result<StudentDocumentDto[]> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      return {
        ok: true,
        data: repos.studentDocuments
          .findBySchool(schoolId)
          .map((d) => toDocumentDto(repos, d)),
      }
    }
  )

  ipcMain.handle(
    'documents:list-by-student',
    (_e, input: { student_id: string }): Result<StudentDocumentDto[]> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.student_id) {
        return { ok: false, error: 'Student id is required.' }
      }
      const student = repos.students.findById(input.student_id)
      if (!student || student.school_id !== schoolId) {
        return { ok: false, error: 'Student not found.' }
      }
      return {
        ok: true,
        data: repos.studentDocuments
          .findByStudent(input.student_id)
          .map((d) => toDocumentDto(repos, d)),
      }
    }
  )

  ipcMain.handle(
    'documents:upload',
    (
      _e,
      input: {
        student_id: string
        document_type: DocumentType
        title: string
        file_base64: string
        mime_type?: string
        original_name?: string
        notes?: string | null
      }
    ): Result<StudentDocumentDto> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.student_id) {
        return { ok: false, error: 'Student id is required.' }
      }
      const title = input?.title?.trim()
      if (!title) return { ok: false, error: 'Document title is required.' }
      if (!input?.document_type) {
        return { ok: false, error: 'Document type is required.' }
      }
      if (!input?.file_base64) {
        return { ok: false, error: 'File data is required.' }
      }

      const student = repos.students.findById(input.student_id)
      if (!student || student.school_id !== schoolId) {
        return { ok: false, error: 'Student not found.' }
      }

      try {
        const file_path = saveStudentDocumentFile(
          input.file_base64,
          input.mime_type ?? 'application/octet-stream',
          input.original_name
        )
        const doc = repos.studentDocuments.create({
          school_id: schoolId,
          student_id: input.student_id,
          document_type: input.document_type,
          title,
          file_path,
          notes: input.notes ?? null,
        })
        return { ok: true, data: toDocumentDto(repos, doc) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not upload document.',
        }
      }
    }
  )

  ipcMain.handle(
    'promotions:preview',
    (
      _e,
      input: { from_year: number; to_year?: number }
    ): Result<PromotionPreviewDto> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.from_year) {
        return { ok: false, error: 'From year is required.' }
      }
      return {
        ok: true,
        data: buildPromotionPreview(
          repos,
          schoolId,
          input.from_year,
          input.to_year
        ),
      }
    }
  )

  ipcMain.handle(
    'promotions:run',
    (
      _e,
      input: {
        from_year: number
        to_year: number
        mappings: Array<{ from_class_id: string; to_class_id: string | null }>
        confirm: boolean
      }
    ): Result<
      PromotionPreviewDto | { run_id: string; moved: number; status: string }
    > => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      if (!input?.from_year || !input?.to_year) {
        return { ok: false, error: 'From and to years are required.' }
      }

      if (!input.confirm) {
        return {
          ok: true,
          data: buildPromotionPreview(
            repos,
            schoolId,
            input.from_year,
            input.to_year
          ),
        }
      }

      const mappings = (input.mappings ?? []).filter(
        (m) => m.from_class_id && m.to_class_id
      )
      if (!mappings.length) {
        return {
          ok: false,
          error: 'Provide at least one class mapping with a destination.',
        }
      }

      try {
        let moved = 0
        const mappingPayload = mappings.map((m) => {
          const count = repos.students
            .findByClassId(m.from_class_id)
            .filter((s) => s.status === 'active').length
          return {
            from_class_id: m.from_class_id,
            to_class_id: m.to_class_id,
            student_count: count,
          }
        })

        const run = repos.promotions.createRun({
          school_id: schoolId,
          from_year: input.from_year,
          to_year: input.to_year,
          mappings: mappingPayload,
        })

        for (const m of mappings) {
          const toClass = repos.classes.findById(m.to_class_id!)
          if (!toClass || toClass.school_id !== schoolId) continue

          const active = repos.students
            .findByClassId(m.from_class_id)
            .filter((s) => s.status === 'active' && s.school_id === schoolId)

          for (const student of active) {
            repos.students.update(student.id, {
              class_id: toClass.id,
              academic_level_id: toClass.academic_level_id,
              // admission_year kept as-is
            })
            moved += 1
          }
        }

        const completed = repos.promotions.markCompleted(run.id)
        return {
          ok: true,
          data: {
            run_id: run.id,
            moved,
            status: completed?.status ?? 'completed',
          },
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Could not run promotions.',
        }
      }
    }
  )

  ipcMain.handle(
    'alumni:list',
    (): Result<StudentDto[]> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const students = repos.students
        .findBySchool(schoolId, 'alumni')
        .map((s) => enrichStudent(repos, s))
      return { ok: true, data: students }
    }
  )
}
