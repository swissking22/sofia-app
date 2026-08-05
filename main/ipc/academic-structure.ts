import { ipcMain } from 'electron'
import { getSession } from '../auth'
import { suggestClassNames } from '../academic/structure'
import type { Repositories } from '../db/repositories'

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  return repos.schools.findLatest()?.id ?? null
}

type MutationOk<T> = { ok: true; data: T }
type MutationErr = { ok: false; error: string }
type MutationResult<T> = MutationOk<T> | MutationErr

function loadStructure(repos: Repositories, schoolId: string) {
  const levels = repos.academicLevels.ensureDefaults(schoolId)
  const sections = repos.sections.ensureDefaults(schoolId)
  const specializations = repos.specializations.findBySchool(schoolId)
  const classes = repos.classes.findStructureClasses(schoolId)

  const levelsWithCounts = levels.map((level) => ({
    ...level,
    class_count: repos.academicLevels.countClasses(level.id),
  }))

  const sectionsWithCounts = sections.map((section) => ({
    ...section,
    class_count: repos.sections.countClasses(section.id),
    specialization_count: repos.sections.countSpecializations(section.id),
  }))

  return {
    schoolId,
    levels: levelsWithCounts,
    sections: sectionsWithCounts,
    specializations,
    classes,
  }
}

export function registerAcademicStructureIpc(repos: Repositories): void {
  ipcMain.handle('academic-structure:get', () => {
    const schoolId = resolveSchoolId(repos)
    if (!schoolId) {
      return { ok: false as const, error: 'No school found.' }
    }
    return {
      ok: true as const,
      data: loadStructure(repos, schoolId),
    }
  })

  // ── Levels ──────────────────────────────────────────────

  ipcMain.handle(
    'academic-structure:create-level',
    (
      _e,
      input: {
        name: string
        category: 'lower_secondary' | 'upper_secondary'
        sort_order?: number
      }
    ): MutationResult<unknown> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const name = input?.name?.trim()
      if (!name) return { ok: false, error: 'Level name is required.' }
      if (
        input.category !== 'lower_secondary' &&
        input.category !== 'upper_secondary'
      ) {
        return { ok: false, error: 'Select a category.' }
      }

      const exists = repos.academicLevels
        .findBySchool(schoolId)
        .some((l) => l.name.toLowerCase() === name.toLowerCase())
      if (exists) return { ok: false, error: 'Level already exists.' }

      const maxOrder = repos.academicLevels
        .findBySchool(schoolId)
        .reduce((max, l) => Math.max(max, l.sort_order), 0)

      const row = repos.academicLevels.create({
        school_id: schoolId,
        name,
        category: input.category,
        is_active: 1,
        sort_order: input.sort_order ?? maxOrder + 1,
      })
      return { ok: true, data: row }
    }
  )

  ipcMain.handle(
    'academic-structure:update-level',
    (
      _e,
      input: {
        id: string
        name: string
        category: 'lower_secondary' | 'upper_secondary'
        is_active?: number
        sort_order?: number
      }
    ): MutationResult<unknown> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const name = input?.name?.trim()
      if (!name) return { ok: false, error: 'Level name is required.' }

      const exists = repos.academicLevels
        .findBySchool(schoolId)
        .some(
          (l) =>
            l.id !== input.id && l.name.toLowerCase() === name.toLowerCase()
        )
      if (exists) return { ok: false, error: 'Level already exists.' }

      const row = repos.academicLevels.update(input.id, {
        name,
        category: input.category,
        is_active: input.is_active,
        sort_order: input.sort_order,
      })
      if (!row) return { ok: false, error: 'Level not found.' }
      return { ok: true, data: row }
    }
  )

  ipcMain.handle(
    'academic-structure:delete-level',
    (_e, input: { id: string }): MutationResult<{ id: string }> => {
      const count = repos.academicLevels.countClasses(input.id)
      if (count > 0) {
        return {
          ok: false,
          error: 'Cannot delete a level that has classes. Remove classes first.',
        }
      }
      const row = repos.academicLevels.delete(input.id)
      if (!row) return { ok: false, error: 'Level not found.' }
      return { ok: true, data: { id: input.id } }
    }
  )

  // ── Sections ────────────────────────────────────────────

  ipcMain.handle(
    'academic-structure:create-section',
    (
      _e,
      input: { name: string; description?: string | null }
    ): MutationResult<unknown> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const name = input?.name?.trim()
      if (!name) return { ok: false, error: 'Section name is required.' }

      const exists = repos.sections
        .findBySchool(schoolId)
        .some((s) => s.name.toLowerCase() === name.toLowerCase())
      if (exists) return { ok: false, error: 'Section already exists.' }

      const row = repos.sections.create({
        school_id: schoolId,
        name,
        description: input.description ?? null,
        is_active: 1,
      })
      return { ok: true, data: row }
    }
  )

  ipcMain.handle(
    'academic-structure:update-section',
    (
      _e,
      input: {
        id: string
        name: string
        description?: string | null
        is_active?: number
      }
    ): MutationResult<unknown> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const name = input?.name?.trim()
      if (!name) return { ok: false, error: 'Section name is required.' }

      const exists = repos.sections
        .findBySchool(schoolId)
        .some(
          (s) =>
            s.id !== input.id && s.name.toLowerCase() === name.toLowerCase()
        )
      if (exists) return { ok: false, error: 'Section already exists.' }

      const row = repos.sections.update(input.id, {
        name,
        description: input.description,
        is_active: input.is_active,
      })
      if (!row) return { ok: false, error: 'Section not found.' }
      return { ok: true, data: row }
    }
  )

  ipcMain.handle(
    'academic-structure:delete-section',
    (_e, input: { id: string }): MutationResult<{ id: string }> => {
      const classCount = repos.sections.countClasses(input.id)
      if (classCount > 0) {
        return {
          ok: false,
          error:
            'Cannot delete a section that has classes. Remove classes first.',
        }
      }
      const specCount = repos.sections.countSpecializations(input.id)
      if (specCount > 0) {
        return {
          ok: false,
          error:
            'Cannot delete a section that has specializations. Remove them first.',
        }
      }
      const row = repos.sections.delete(input.id)
      if (!row) return { ok: false, error: 'Section not found.' }
      return { ok: true, data: { id: input.id } }
    }
  )

  // ── Specializations ─────────────────────────────────────

  ipcMain.handle(
    'academic-structure:create-specialization',
    (
      _e,
      input: {
        section_id: string
        name: string
        abbreviation: string
        description?: string | null
      }
    ): MutationResult<unknown> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const name = input?.name?.trim()
      const abbreviation = input?.abbreviation?.trim()
      if (!name) return { ok: false, error: 'Specialization name is required.' }
      if (!abbreviation) {
        return { ok: false, error: 'Abbreviation is required.' }
      }
      if (!input.section_id) return { ok: false, error: 'Select a section.' }

      const section = repos.sections.findById(input.section_id)
      if (!section || section.deleted_at) {
        return { ok: false, error: 'Section not found.' }
      }

      const siblings = repos.specializations.findBySection(input.section_id)
      if (siblings.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        return {
          ok: false,
          error: 'Specialization already exists in this section.',
        }
      }
      if (
        siblings.some(
          (s) => s.abbreviation.toLowerCase() === abbreviation.toLowerCase()
        )
      ) {
        return {
          ok: false,
          error: 'Abbreviation already used in this section.',
        }
      }

      const row = repos.specializations.create({
        school_id: schoolId,
        section_id: input.section_id,
        name,
        abbreviation,
        description: input.description ?? null,
        is_active: 1,
      })
      return { ok: true, data: row }
    }
  )

  ipcMain.handle(
    'academic-structure:update-specialization',
    (
      _e,
      input: {
        id: string
        section_id: string
        name: string
        abbreviation: string
        description?: string | null
        is_active?: number
      }
    ): MutationResult<unknown> => {
      const name = input?.name?.trim()
      const abbreviation = input?.abbreviation?.trim()
      if (!name) return { ok: false, error: 'Specialization name is required.' }
      if (!abbreviation) {
        return { ok: false, error: 'Abbreviation is required.' }
      }
      if (!input.section_id) return { ok: false, error: 'Select a section.' }

      const siblings = repos.specializations.findBySection(input.section_id)
      if (
        siblings.some(
          (s) =>
            s.id !== input.id && s.name.toLowerCase() === name.toLowerCase()
        )
      ) {
        return {
          ok: false,
          error: 'Specialization already exists in this section.',
        }
      }
      if (
        siblings.some(
          (s) =>
            s.id !== input.id &&
            s.abbreviation.toLowerCase() === abbreviation.toLowerCase()
        )
      ) {
        return {
          ok: false,
          error: 'Abbreviation already used in this section.',
        }
      }

      const row = repos.specializations.update(input.id, {
        section_id: input.section_id,
        name,
        abbreviation,
        description: input.description,
        is_active: input.is_active,
      })
      if (!row) return { ok: false, error: 'Specialization not found.' }
      return { ok: true, data: row }
    }
  )

  ipcMain.handle(
    'academic-structure:delete-specialization',
    (_e, input: { id: string }): MutationResult<{ id: string }> => {
      const count = repos.specializations.countClasses(input.id)
      if (count > 0) {
        return {
          ok: false,
          error:
            'Cannot delete a specialization that has classes. Remove classes first.',
        }
      }
      const row = repos.specializations.delete(input.id)
      if (!row) return { ok: false, error: 'Specialization not found.' }
      return { ok: true, data: { id: input.id } }
    }
  )

  // ── Classes ─────────────────────────────────────────────

  ipcMain.handle(
    'academic-structure:create-class',
    (
      _e,
      input: {
        academic_level_id: string
        section_id: string
        specialization_id?: string | null
        name: string
        capacity?: number | null
      }
    ): MutationResult<unknown> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      try {
        const row = repos.classes.createInHierarchy({
          school_id: schoolId,
          academic_level_id: input.academic_level_id,
          section_id: input.section_id,
          specialization_id: input.specialization_id,
          name: input.name,
          capacity: input.capacity,
        })
        return { ok: true, data: row }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not create class.',
        }
      }
    }
  )

  ipcMain.handle(
    'academic-structure:update-class',
    (
      _e,
      input: {
        id: string
        academic_level_id: string
        section_id: string
        specialization_id?: string | null
        name: string
        capacity?: number | null
        is_active?: number
      }
    ): MutationResult<unknown> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) return { ok: false, error: 'No school found.' }
      const name = input?.name?.trim()
      if (!name) return { ok: false, error: 'Class name is required.' }
      if (!input.academic_level_id) {
        return { ok: false, error: 'Select an academic level.' }
      }
      if (!input.section_id) return { ok: false, error: 'Select a section.' }

      const dup = repos.classes.findStructureClasses(schoolId).find(
        (c) =>
          c.id !== input.id &&
          c.name.toLowerCase() === name.toLowerCase() &&
          c.academic_level_id === input.academic_level_id &&
          c.section_id === input.section_id &&
          (c.specialization_id || null) === (input.specialization_id || null)
      )
      if (dup) {
        return {
          ok: false,
          error: `${name} already exists for this combination.`,
        }
      }

      const row = repos.classes.update(input.id, {
        name,
        academic_level_id: input.academic_level_id,
        section_id: input.section_id,
        specialization_id: input.specialization_id || null,
        capacity: input.capacity ?? null,
        is_active: input.is_active,
        school_id: schoolId,
      })
      if (!row) return { ok: false, error: 'Class not found.' }
      return { ok: true, data: row }
    }
  )

  ipcMain.handle(
    'academic-structure:delete-class',
    (_e, input: { id: string }): MutationResult<{ id: string }> => {
      const row = repos.classes.delete(input.id)
      if (!row) return { ok: false, error: 'Class not found.' }
      return { ok: true, data: { id: input.id } }
    }
  )

  ipcMain.handle(
    'academic-structure:suggest-names',
    (
      _e,
      input: {
        levelName: string
        sectionName: string
        specializationAbbreviation?: string | null
      }
    ) => {
      return {
        ok: true as const,
        data: suggestClassNames(input),
      }
    }
  )
}
