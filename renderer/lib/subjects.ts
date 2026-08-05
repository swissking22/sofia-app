/** Subjects management types + IPC helpers. */

export interface SubjectDto {
  id: string
  name: string
  department_id: string | null
  department_name: string | null
  coefficient: number
  academic_level_id: string | null
  academic_level_name: string | null
  class_ids: string[]
  class_names: string[]
}

export interface SubjectsSetup {
  subjects: SubjectDto[]
  departments: Array<{ id: string; name: string }>
  levels: Array<{ id: string; name: string; sort_order: number }>
  classes: Array<{
    id: string
    name: string
    academic_level_id: string | null
  }>
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchSubjectsSetup(): Promise<Result<SubjectsSetup>> {
  return (await window.ipc.invoke('subjects:list')) as Result<SubjectsSetup>
}

export async function createSubject(input: {
  name: string
  department_id: string
  coefficient: number
  academic_level_id: string
  class_ids?: string[]
}): Promise<Result<SubjectsSetup>> {
  return (await window.ipc.invoke(
    'subjects:create',
    input
  )) as Result<SubjectsSetup>
}

export async function updateSubject(input: {
  id: string
  name: string
  department_id: string
  coefficient: number
  academic_level_id: string
  class_ids?: string[]
}): Promise<Result<SubjectsSetup>> {
  return (await window.ipc.invoke(
    'subjects:update',
    input
  )) as Result<SubjectsSetup>
}

export async function deleteSubject(
  id: string
): Promise<Result<SubjectsSetup>> {
  return (await window.ipc.invoke('subjects:delete', {
    id,
  })) as Result<SubjectsSetup>
}
