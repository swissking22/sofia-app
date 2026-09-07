import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'

function nowIso(): string {
  return new Date().toISOString()
}

export interface SubjectCoefficientRow {
  id: string
  school_id: string
  subject_id: string
  class_id: string | null
  academic_level_id: string | null
  academic_year_id: string | null
  coefficient: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  sync_status: string
  version: number
}

export interface SubjectWithEffectiveCoefficient {
  subject_id: string
  subject_name: string
  subject_code: string
  department_id: string | null
  department_name: string | null
  class_id: string | null
  class_name: string | null
  academic_level_id: string | null
  academic_year_id: string | null
  base_coefficient: number
  override_coefficient: number | null
  effective_coefficient: number
  override_scope: 'class' | 'level' | 'default'
}

export class SubjectCoefficientsRepository {
  constructor(private db: Database.Database) {}

  findBySchool(
    schoolId: string,
    filter?: {
      class_id?: string | null
      academic_year_id?: string | null
      subject_id?: string | null
    }
  ): SubjectCoefficientRow[] {
    let sql = `SELECT * FROM result_subject_coefficients WHERE school_id = ? AND deleted_at IS NULL`
    const params: unknown[] = [schoolId]

    if (filter?.class_id !== undefined) {
      if (filter.class_id === null) {
        sql += ` AND class_id IS NULL`
      } else {
        sql += ` AND class_id = ?`
        params.push(filter.class_id)
      }
    }
    if (filter?.academic_year_id !== undefined) {
      if (filter.academic_year_id === null) {
        sql += ` AND academic_year_id IS NULL`
      } else {
        sql += ` AND academic_year_id = ?`
        params.push(filter.academic_year_id)
      }
    }
    if (filter?.subject_id) {
      sql += ` AND subject_id = ?`
      params.push(filter.subject_id)
    }

    return this.db.prepare(sql).all(...params) as SubjectCoefficientRow[]
  }

  /**
   * Resolves the effective coefficient for a specific subject based on the hierarchy:
   * 1. Specific class + academic year override
   * 2. Specific class override
   * 3. Academic level + academic year override
   * 4. Academic level override
   * 5. General subject override (null class & level)
   * 6. Subject base coefficient (subjects.coefficient)
   * 7. Fallback: 1
   */
  resolveCoefficient(
    schoolId: string,
    subjectId: string,
    classId?: string | null,
    academicLevelId?: string | null,
    academicYearId?: string | null
  ): number {
    const overrides = this.db
      .prepare(
        `SELECT coefficient, class_id, academic_level_id, academic_year_id
         FROM result_subject_coefficients
         WHERE school_id = ? AND subject_id = ? AND deleted_at IS NULL`
      )
      .all(schoolId, subjectId) as Array<{
        coefficient: number
        class_id: string | null
        academic_level_id: string | null
        academic_year_id: string | null
      }>

    // 1. Class + Year
    if (classId && academicYearId) {
      const match = overrides.find(
        (o) => o.class_id === classId && o.academic_year_id === academicYearId
      )
      if (match != null) return match.coefficient
    }

    // 2. Class override (any year)
    if (classId) {
      const match = overrides.find((o) => o.class_id === classId)
      if (match != null) return match.coefficient
    }

    // 3. Level + Year
    if (academicLevelId && academicYearId) {
      const match = overrides.find(
        (o) =>
          o.academic_level_id === academicLevelId &&
          o.academic_year_id === academicYearId
      )
      if (match != null) return match.coefficient
    }

    // 4. Level override
    if (academicLevelId) {
      const match = overrides.find((o) => o.academic_level_id === academicLevelId)
      if (match != null) return match.coefficient
    }

    // 5. General subject override
    const genMatch = overrides.find(
      (o) => !o.class_id && !o.academic_level_id
    )
    if (genMatch != null) return genMatch.coefficient

    // 6. Base subject coefficient
    const baseSubj = this.db
      .prepare(
        `SELECT coefficient FROM subjects WHERE id = ? AND deleted_at IS NULL`
      )
      .get(subjectId) as { coefficient: number } | undefined

    if (baseSubj?.coefficient != null && baseSubj.coefficient > 0) {
      return baseSubj.coefficient
    }

    return 1
  }

  /**
   * Resolves a map of subjectId -> effective coefficient for multiple subjects.
   */
  resolveCoefficientsMap(
    schoolId: string,
    subjectIds: string[],
    classId?: string | null,
    academicLevelId?: string | null,
    academicYearId?: string | null
  ): Map<string, number> {
    const map = new Map<string, number>()
    for (const sid of subjectIds) {
      map.set(
        sid,
        this.resolveCoefficient(
          schoolId,
          sid,
          classId,
          academicLevelId,
          academicYearId
        )
      )
    }
    return map
  }

  /**
   * Returns list of subjects for configuration view with base and effective coefficients.
   */
  listSubjectCoefficientsTable(
    schoolId: string,
    classId?: string | null,
    academicYearId?: string | null
  ): SubjectWithEffectiveCoefficient[] {
    let sql = `
      SELECT 
        s.id AS subject_id,
        s.name AS subject_name,
        COALESCE(NULLIF(s.name, ''), 'SUBJ') AS subject_code,
        s.department_id,
        d.name AS department_name,
        s.class_id,
        c.name AS class_name,
        c.academic_level_id,
        s.coefficient AS base_coefficient
      FROM subjects s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN classes c ON c.id = s.class_id
      WHERE (s.school_id = ? OR s.school_id IS NULL) AND s.deleted_at IS NULL
    `
    const params: unknown[] = [schoolId]

    if (classId) {
      sql += ` AND s.class_id = ?`
      params.push(classId)
    }

    sql += ` ORDER BY s.name ASC`

    const rows = this.db.prepare(sql).all(...params) as Array<{
      subject_id: string
      subject_name: string
      subject_code: string
      department_id: string | null
      department_name: string | null
      class_id: string | null
      class_name: string | null
      academic_level_id: string | null
      base_coefficient: number
    }>

    return rows.map((r) => {
      const eff = this.resolveCoefficient(
        schoolId,
        r.subject_id,
        classId ?? r.class_id,
        r.academic_level_id,
        academicYearId
      )

      // Check if there is an explicit override
      const overrides = this.db
        .prepare(
          `SELECT coefficient, class_id, academic_level_id
           FROM result_subject_coefficients
           WHERE school_id = ? AND subject_id = ? AND deleted_at IS NULL
           ORDER BY updated_at DESC LIMIT 1`
        )
        .get(schoolId, r.subject_id) as
        | { coefficient: number; class_id: string | null; academic_level_id: string | null }
        | undefined

      let override_scope: 'class' | 'level' | 'default' = 'default'
      if (overrides) {
        if (overrides.class_id) override_scope = 'class'
        else if (overrides.academic_level_id) override_scope = 'level'
      }

      return {
        subject_id: r.subject_id,
        subject_name: r.subject_name,
        subject_code: r.subject_code,
        department_id: r.department_id,
        department_name: r.department_name,
        class_id: r.class_id,
        class_name: r.class_name,
        academic_level_id: r.academic_level_id,
        academic_year_id: academicYearId ?? null,
        base_coefficient: r.base_coefficient ?? 1,
        override_coefficient: overrides?.coefficient ?? null,
        effective_coefficient: eff,
        override_scope,
      }
    })
  }

  /**
   * Bulk updates or inserts coefficients in a single transaction.
   */
  bulkSave(
    schoolId: string,
    items: Array<{
      subject_id: string
      class_id?: string | null
      academic_level_id?: string | null
      academic_year_id?: string | null
      coefficient: number
    }>
  ): void {
    const t = nowIso()

    const upsert = this.db.transaction(() => {
      for (const item of items) {
        const val = Math.max(0.1, Number(item.coefficient) || 1)
        const classId = item.class_id ?? null
        const levelId = item.academic_level_id ?? null
        const yearId = item.academic_year_id ?? null

        // Look for existing override with matching scope
        let existingSql = `
          SELECT id FROM result_subject_coefficients
          WHERE school_id = ? AND subject_id = ? AND deleted_at IS NULL
        `
        const checkParams: unknown[] = [schoolId, item.subject_id]
        if (classId) {
          existingSql += ` AND class_id = ?`
          checkParams.push(classId)
        } else {
          existingSql += ` AND class_id IS NULL`
        }

        if (yearId) {
          existingSql += ` AND academic_year_id = ?`
          checkParams.push(yearId)
        } else {
          existingSql += ` AND academic_year_id IS NULL`
        }

        const existing = this.db
          .prepare(existingSql)
          .get(...checkParams) as { id: string } | undefined

        if (existing) {
          this.db
            .prepare(
              `UPDATE result_subject_coefficients
               SET coefficient = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
               WHERE id = ?`
            )
            .run(val, t, existing.id)
        } else {
          this.db
            .prepare(
              `INSERT INTO result_subject_coefficients (
                id, school_id, subject_id, class_id, academic_level_id, academic_year_id,
                coefficient, created_at, updated_at, deleted_at, sync_status, version
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', 1)`
            )
            .run(
              randomUUID(),
              schoolId,
              item.subject_id,
              classId,
              levelId,
              yearId,
              val,
              t,
              t
            )
        }

        // Also update the base subject coefficient if no class/level is specified
        if (!classId && !levelId) {
          this.db
            .prepare(
              `UPDATE subjects
               SET coefficient = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
               WHERE id = ? AND deleted_at IS NULL`
            )
            .run(val, t, item.subject_id)
        }
      }
    })

    upsert()
  }
}
