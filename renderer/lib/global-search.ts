/** Wide global search across pages + local SQLite records. */

export type GlobalSearchKind =
  | 'page'
  | 'student'
  | 'teacher'
  | 'staff'
  | 'class'
  | 'subject'
  | 'department'
  | 'fee_structure'
  | 'invoice'
  | 'user'

export interface GlobalSearchHit {
  id: string
  kind: GlobalSearchKind
  label: string
  subtitle: string
  href: string
  score: number
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function searchGlobal(
  query: string,
  limit = 40
): Promise<Result<{ query: string; hits: GlobalSearchHit[] }>> {
  return (await window.ipc.invoke('search:global', {
    query,
    limit,
  })) as Result<{ query: string; hits: GlobalSearchHit[] }>
}

export const SEARCH_KIND_LABELS: Record<GlobalSearchKind, string> = {
  page: 'Page',
  student: 'Student',
  teacher: 'Teacher',
  staff: 'Staff',
  class: 'Class',
  subject: 'Subject',
  department: 'Department',
  fee_structure: 'Fee package',
  invoice: 'Invoice',
  user: 'User',
}
