import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

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

export interface GlobalSearchResult {
  query: string
  hits: GlobalSearchHit[]
}

function resolveSchoolId(repos: Repositories): string | null {
  const session = getSession()
  if (session?.schoolId) return session.schoolId
  return repos.schools.findLatest()?.id ?? null
}

function like(q: string): string {
  return `%${q.replace(/[%_]/g, '')}%`
}

function scoreMatch(query: string, ...fields: Array<string | null | undefined>): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const values = fields
    .map((f) => (f ?? '').trim().toLowerCase())
    .filter(Boolean)
  if (!values.length) return 0
  if (values.some((v) => v === q)) return 100
  if (values.some((v) => v.startsWith(q))) return 90
  if (values.some((v) => v.includes(q))) return 70
  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length > 1 && values.some((v) => tokens.every((t) => v.includes(t)))) {
    return 55
  }
  return 40
}

/**
 * Wide local search across students, staff, classes, subjects, departments,
 * fee packages, invoices, and users for the current school.
 */
export function runGlobalSearch(
  repos: Repositories,
  schoolId: string,
  rawQuery: string,
  limit = 40
): GlobalSearchHit[] {
  const query = rawQuery.trim()
  if (query.length < 2) return []

  const pattern = like(query)
  const hits: GlobalSearchHit[] = []
  const perKind = Math.max(5, Math.ceil(limit / 5))
  const db = repos.students.getDb()

  try {
    const students = db
      .prepare(
        `SELECT s.id, s.name, s.student_code, s.status, s.phone, s.guardian_name,
                s.guardian_phone, c.name AS class_name
         FROM students s
         LEFT JOIN classes c ON c.id = s.class_id AND c.deleted_at IS NULL
         WHERE s.school_id = ?
           AND s.deleted_at IS NULL
           AND (
             s.name LIKE ?
             OR IFNULL(s.student_code, '') LIKE ?
             OR IFNULL(s.phone, '') LIKE ?
             OR IFNULL(s.email, '') LIKE ?
             OR IFNULL(s.guardian_name, '') LIKE ?
             OR IFNULL(s.guardian_phone, '') LIKE ?
           )
         ORDER BY s.name COLLATE NOCASE ASC
         LIMIT ?`
      )
      .all(
        schoolId,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        perKind
      ) as Array<{
      id: string
      name: string
      student_code: string | null
      status: string
      phone: string | null
      guardian_name: string | null
      guardian_phone: string | null
      class_name: string | null
    }>

    for (const s of students) {
      hits.push({
        id: `student:${s.id}`,
        kind: 'student',
        label: s.name,
        subtitle: [
          s.student_code,
          s.class_name,
          s.status !== 'active' ? s.status : null,
          s.guardian_phone || s.phone,
        ]
          .filter(Boolean)
          .join(' · '),
        href: `/students/${s.id}`,
        score: scoreMatch(
          query,
          s.name,
          s.student_code,
          s.phone,
          s.guardian_name,
          s.guardian_phone
        ),
      })
    }
  } catch {
    /* table may be missing in early setup */
  }

  try {
    const staff = db
      .prepare(
        `SELECT id, full_name, employee_code, email, phone, staff_type, job_role, status
         FROM staff
         WHERE school_id = ?
           AND deleted_at IS NULL
           AND (
             full_name LIKE ?
             OR IFNULL(employee_code, '') LIKE ?
             OR IFNULL(email, '') LIKE ?
             OR IFNULL(phone, '') LIKE ?
           )
         ORDER BY full_name COLLATE NOCASE ASC
         LIMIT ?`
      )
      .all(schoolId, pattern, pattern, pattern, pattern, perKind) as Array<{
      id: string
      full_name: string
      employee_code: string | null
      email: string | null
      phone: string | null
      staff_type: string
      job_role: string | null
      status: string
    }>

    for (const row of staff) {
      const isTeacher = row.staff_type === 'teaching'
      hits.push({
        id: `${isTeacher ? 'teacher' : 'staff'}:${row.id}`,
        kind: isTeacher ? 'teacher' : 'staff',
        label: row.full_name,
        subtitle: [
          isTeacher ? 'Teacher' : row.job_role || 'Staff',
          row.employee_code,
          row.email || row.phone,
        ]
          .filter(Boolean)
          .join(' · '),
        href: isTeacher
          ? `/staff/teachers/${row.id}`
          : `/staff/directory/${row.id}`,
        score: scoreMatch(
          query,
          row.full_name,
          row.employee_code,
          row.email,
          row.phone
        ),
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const classes = db
      .prepare(
        `SELECT c.id, c.name, l.name AS level_name, sec.name AS section_name
         FROM classes c
         LEFT JOIN academic_levels l ON l.id = c.academic_level_id
         LEFT JOIN sections sec ON sec.id = c.section_id
         WHERE c.school_id = ?
           AND c.deleted_at IS NULL
           AND c.name LIKE ?
         ORDER BY c.name COLLATE NOCASE ASC
         LIMIT ?`
      )
      .all(schoolId, pattern, perKind) as Array<{
      id: string
      name: string
      level_name: string | null
      section_name: string | null
    }>

    for (const c of classes) {
      hits.push({
        id: `class:${c.id}`,
        kind: 'class',
        label: c.name,
        subtitle: [c.level_name, c.section_name, 'Class'].filter(Boolean).join(' · '),
        href: `/students?class_id=${encodeURIComponent(c.id)}`,
        score: scoreMatch(query, c.name, c.level_name, c.section_name),
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const subjects = db
      .prepare(
        `SELECT DISTINCT s.id, s.name, d.name AS department_name,
                (
                  SELECT c.academic_level_id
                  FROM subject_classes sc
                  INNER JOIN classes c ON c.id = sc.class_id AND c.deleted_at IS NULL
                  WHERE sc.subject_id = s.id AND sc.deleted_at IS NULL
                  LIMIT 1
                ) AS academic_level_id,
                (
                  SELECT l.name
                  FROM subject_classes sc
                  INNER JOIN classes c ON c.id = sc.class_id AND c.deleted_at IS NULL
                  LEFT JOIN academic_levels l ON l.id = c.academic_level_id
                  WHERE sc.subject_id = s.id AND sc.deleted_at IS NULL
                  LIMIT 1
                ) AS level_name
         FROM subjects s
         LEFT JOIN departments d ON d.id = s.department_id AND d.deleted_at IS NULL
         WHERE s.deleted_at IS NULL
           AND (s.school_id = ? OR s.school_id IS NULL)
           AND s.name LIKE ?
         ORDER BY s.name COLLATE NOCASE ASC
         LIMIT ?`
      )
      .all(schoolId, pattern, perKind) as Array<{
      id: string
      name: string
      department_name: string | null
      academic_level_id: string | null
      level_name: string | null
    }>

    for (const s of subjects) {
      const params = new URLSearchParams()
      params.set('q', s.name)
      if (s.academic_level_id) params.set('level_id', s.academic_level_id)
      hits.push({
        id: `subject:${s.id}`,
        kind: 'subject',
        label: s.name,
        subtitle: [s.level_name, s.department_name, 'Subject']
          .filter(Boolean)
          .join(' · '),
        href: `/school/subjects?${params.toString()}`,
        score: scoreMatch(query, s.name, s.department_name, s.level_name),
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const departments = db
      .prepare(
        `SELECT id, name
         FROM departments
         WHERE school_id = ?
           AND deleted_at IS NULL
           AND name LIKE ?
         ORDER BY name COLLATE NOCASE ASC
         LIMIT ?`
      )
      .all(schoolId, pattern, perKind) as Array<{ id: string; name: string }>

    for (const d of departments) {
      hits.push({
        id: `department:${d.id}`,
        kind: 'department',
        label: d.name,
        subtitle: 'Department',
        href: '/school/departments',
        score: scoreMatch(query, d.name),
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const structures = db
      .prepare(
        `SELECT id, name, applies_to_residence
         FROM fee_structures
         WHERE school_id = ?
           AND deleted_at IS NULL
           AND name LIKE ?
         ORDER BY name COLLATE NOCASE ASC
         LIMIT ?`
      )
      .all(schoolId, pattern, perKind) as Array<{
      id: string
      name: string
      applies_to_residence: string | null
    }>

    for (const f of structures) {
      const params = new URLSearchParams({ q: f.name })
      hits.push({
        id: `fee:${f.id}`,
        kind: 'fee_structure',
        label: f.name,
        subtitle: [
          'Fee structure',
          f.applies_to_residence && f.applies_to_residence !== 'all'
            ? f.applies_to_residence
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
        href: `/finance/fee-structure?${params.toString()}`,
        score: scoreMatch(query, f.name),
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const invoices = db
      .prepare(
        `SELECT i.id, i.invoice_number, i.status, i.balance_due, st.name AS student_name
         FROM invoices i
         LEFT JOIN students st ON st.id = i.student_id
         WHERE i.school_id = ?
           AND i.deleted_at IS NULL
           AND (
             IFNULL(i.invoice_number, '') LIKE ?
             OR IFNULL(st.name, '') LIKE ?
           )
         ORDER BY i.created_at DESC
         LIMIT ?`
      )
      .all(schoolId, pattern, pattern, perKind) as Array<{
      id: string
      invoice_number: string | null
      status: string
      balance_due: number | null
      student_name: string | null
    }>

    for (const inv of invoices) {
      hits.push({
        id: `invoice:${inv.id}`,
        kind: 'invoice',
        label: inv.invoice_number || 'Invoice',
        subtitle: [inv.student_name, inv.status, 'Billing']
          .filter(Boolean)
          .join(' · '),
        href: `/finance/billing?q=${encodeURIComponent(inv.invoice_number || inv.student_name || '')}`,
        score: scoreMatch(query, inv.invoice_number, inv.student_name),
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const users = db
      .prepare(
        `SELECT id, first_name, last_name, email, role, phone
         FROM users
         WHERE school_id = ?
           AND deleted_at IS NULL
           AND (
             IFNULL(first_name, '') LIKE ?
             OR IFNULL(last_name, '') LIKE ?
             OR IFNULL(email, '') LIKE ?
             OR IFNULL(phone, '') LIKE ?
             OR (IFNULL(first_name, '') || ' ' || IFNULL(last_name, '')) LIKE ?
           )
         ORDER BY first_name COLLATE NOCASE ASC, last_name COLLATE NOCASE ASC
         LIMIT ?`
      )
      .all(
        schoolId,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        Math.min(perKind, 8)
      ) as Array<{
      id: string
      first_name: string | null
      last_name: string | null
      email: string | null
      role: string | null
      phone: string | null
    }>

    for (const u of users) {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
      hits.push({
        id: `user:${u.id}`,
        kind: 'user',
        label: name || u.email || 'User',
        subtitle: [u.email, u.role, 'User account'].filter(Boolean).join(' · '),
        href: '/administration/users',
        score: scoreMatch(query, name, u.email, u.phone, u.role),
      })
    }
  } catch {
    /* ignore */
  }

  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.kind.localeCompare(b.kind) ||
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    )
    .slice(0, limit)
}

export function registerGlobalSearchIpc(repos: Repositories): void {
  ipcMain.handle(
    'search:global',
    (
      _e,
      input?: { query?: string; limit?: number }
    ): Result<GlobalSearchResult> => {
      const schoolId = resolveSchoolId(repos)
      if (!schoolId) {
        return { ok: false, error: 'No school found.' }
      }
      const query = String(input?.query ?? '').trim()
      const limit = Math.min(60, Math.max(10, Number(input?.limit) || 40))
      if (query.length < 2) {
        return { ok: true, data: { query, hits: [] } }
      }
      try {
        const hits = runGlobalSearch(repos, schoolId, query, limit)
        return { ok: true, data: { query, hits } }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Search failed.',
        }
      }
    }
  )
}
