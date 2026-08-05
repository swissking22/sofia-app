/** Academic structure types + IPC helpers (Levels → Sections → Specs → Classes). */

export type LevelCategory = 'lower_secondary' | 'upper_secondary'

export interface StructureLevel {
  id: string
  school_id: string
  name: string
  category: LevelCategory
  is_active: number
  sort_order: number
  class_count: number
}

export interface StructureSection {
  id: string
  school_id: string
  name: string
  description: string | null
  is_active: number
  class_count: number
  specialization_count: number
}

export interface StructureSpecialization {
  id: string
  school_id: string
  section_id: string
  name: string
  abbreviation: string
  description: string | null
  is_active: number
}

export interface StructureClass {
  id: string
  name: string
  school_id: string | null
  academic_level_id: string | null
  section_id: string | null
  specialization_id: string | null
  capacity: number | null
  is_active: number
}

export interface AcademicStructureData {
  schoolId: string
  levels: StructureLevel[]
  sections: StructureSection[]
  specializations: StructureSpecialization[]
  classes: StructureClass[]
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export function suggestClassNames(input: {
  levelName: string
  sectionName: string
  specializationAbbreviation?: string | null
}): string[] {
  const { levelName, sectionName, specializationAbbreviation } = input
  const abbr = specializationAbbreviation?.trim()
  const base = abbr
    ? `${levelName} ${abbr}`
    : sectionName.toLowerCase() === 'general'
      ? levelName
      : `${levelName} ${sectionName}`

  return [`${base} A`, `${base} B`, `${base} C`, base]
}

export function canContinueStructure(data: AcademicStructureData | null): boolean {
  if (!data) return false
  const hasLevel = data.levels.some((l) => l.is_active === 1)
  const hasSection = data.sections.some((s) => s.is_active === 1)
  const hasClass = data.classes.some((c) => c.is_active === 1)
  return hasLevel && hasSection && hasClass
}

export async function fetchAcademicStructure(): Promise<
  Result<AcademicStructureData>
> {
  return (await window.ipc.invoke(
    'academic-structure:get'
  )) as Result<AcademicStructureData>
}

export async function createLevel(input: {
  name: string
  category: LevelCategory
}): Promise<Result<StructureLevel>> {
  return (await window.ipc.invoke(
    'academic-structure:create-level',
    input
  )) as Result<StructureLevel>
}

export async function updateLevel(input: {
  id: string
  name: string
  category: LevelCategory
  is_active?: number
}): Promise<Result<StructureLevel>> {
  return (await window.ipc.invoke(
    'academic-structure:update-level',
    input
  )) as Result<StructureLevel>
}

export async function deleteLevel(
  id: string
): Promise<Result<{ id: string }>> {
  return (await window.ipc.invoke('academic-structure:delete-level', {
    id,
  })) as Result<{ id: string }>
}

export async function createSection(input: {
  name: string
  description?: string | null
}): Promise<Result<StructureSection>> {
  return (await window.ipc.invoke(
    'academic-structure:create-section',
    input
  )) as Result<StructureSection>
}

export async function updateSection(input: {
  id: string
  name: string
  description?: string | null
  is_active?: number
}): Promise<Result<StructureSection>> {
  return (await window.ipc.invoke(
    'academic-structure:update-section',
    input
  )) as Result<StructureSection>
}

export async function deleteSection(
  id: string
): Promise<Result<{ id: string }>> {
  return (await window.ipc.invoke('academic-structure:delete-section', {
    id,
  })) as Result<{ id: string }>
}

export async function createSpecialization(input: {
  section_id: string
  name: string
  abbreviation: string
  description?: string | null
}): Promise<Result<StructureSpecialization>> {
  return (await window.ipc.invoke(
    'academic-structure:create-specialization',
    input
  )) as Result<StructureSpecialization>
}

export async function updateSpecialization(input: {
  id: string
  section_id: string
  name: string
  abbreviation: string
  description?: string | null
  is_active?: number
}): Promise<Result<StructureSpecialization>> {
  return (await window.ipc.invoke(
    'academic-structure:update-specialization',
    input
  )) as Result<StructureSpecialization>
}

export async function deleteSpecialization(
  id: string
): Promise<Result<{ id: string }>> {
  return (await window.ipc.invoke('academic-structure:delete-specialization', {
    id,
  })) as Result<{ id: string }>
}

export async function createStructureClass(input: {
  academic_level_id: string
  section_id: string
  specialization_id?: string | null
  name: string
  capacity?: number | null
}): Promise<Result<StructureClass>> {
  return (await window.ipc.invoke(
    'academic-structure:create-class',
    input
  )) as Result<StructureClass>
}

export async function updateStructureClass(input: {
  id: string
  academic_level_id: string
  section_id: string
  specialization_id?: string | null
  name: string
  capacity?: number | null
  is_active?: number
}): Promise<Result<StructureClass>> {
  return (await window.ipc.invoke(
    'academic-structure:update-class',
    input
  )) as Result<StructureClass>
}

export async function deleteStructureClass(
  id: string
): Promise<Result<{ id: string }>> {
  return (await window.ipc.invoke('academic-structure:delete-class', {
    id,
  })) as Result<{ id: string }>
}
