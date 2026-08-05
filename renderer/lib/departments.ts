/** Departments management types + IPC helpers. */

export interface DepartmentDto {
  id: string
  name: string
  staff_count: number
  subject_count: number
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchDepartments(): Promise<Result<DepartmentDto[]>> {
  return (await window.ipc.invoke('departments:list')) as Result<
    DepartmentDto[]
  >
}

export async function createDepartment(
  name: string
): Promise<Result<DepartmentDto[]>> {
  return (await window.ipc.invoke('departments:create', {
    name,
  })) as Result<DepartmentDto[]>
}

export async function updateDepartment(
  id: string,
  name: string
): Promise<Result<DepartmentDto[]>> {
  return (await window.ipc.invoke('departments:update', {
    id,
    name,
  })) as Result<DepartmentDto[]>
}

export async function deleteDepartment(
  id: string
): Promise<Result<DepartmentDto[]>> {
  return (await window.ipc.invoke('departments:delete', {
    id,
  })) as Result<DepartmentDto[]>
}
