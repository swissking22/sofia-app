import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import {
  demoStandard4060,
  demoUpperSecondary,
  hashConfig,
  type CalculationConfig,
  type ProfileStatus,
} from '../../domain/results-calculation'

export interface CalculationProfileRow {
  id: string
  school_id: string
  name: string
  description: string
  academic_year_id: string | null
  period_mode: 'term' | 'annual'
  status: ProfileStatus
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  sync_status: string
  version: number
}

export interface ProfileAssignment {
  id: string
  class_id: string | null
  academic_level_id: string | null
  department_id: string | null
  allow_overlap: number
}

export interface ProfileDto {
  profile: CalculationProfileRow
  version_number: number
  config_hash: string
  config: CalculationConfig
  assignments: ProfileAssignment[]
  used_in_results: boolean
}

function nowIso(): string {
  return new Date().toISOString()
}

function parseConfig(json: string): CalculationConfig {
  return JSON.parse(json) as CalculationConfig
}

export class ResultsCalculationRepository {
  constructor(private db: Database.Database) {}

  list(schoolId: string): ProfileDto[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM result_calculation_profiles
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY name ASC`
      )
      .all(schoolId) as CalculationProfileRow[]
    return rows.map((p) => this.toDto(schoolId, p)).filter((x): x is ProfileDto => !!x)
  }

  get(schoolId: string, id: string): ProfileDto | null {
    const row = this.db
      .prepare(
        `SELECT * FROM result_calculation_profiles
         WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .get(id, schoolId) as CalculationProfileRow | undefined
    return row ? this.toDto(schoolId, row) : null
  }

  private latestVersion(profileId: string): {
    version_number: number
    config_json: string
    config_hash: string
  } | null {
    return (
      (this.db
        .prepare(
          `SELECT version_number, config_json, config_hash
           FROM result_calculation_profile_versions
           WHERE profile_id = ?
           ORDER BY version_number DESC LIMIT 1`
        )
        .get(profileId) as {
        version_number: number
        config_json: string
        config_hash: string
      } | undefined) ?? null
    )
  }

  private assignments(schoolId: string, profileId: string): ProfileAssignment[] {
    return this.db
      .prepare(
        `SELECT id, class_id, academic_level_id, department_id, allow_overlap
         FROM result_calculation_class_assignments
         WHERE school_id = ? AND profile_id = ? AND deleted_at IS NULL`
      )
      .all(schoolId, profileId) as ProfileAssignment[]
  }

  usedInResults(schoolId: string, profileId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM result_runs
         WHERE school_id = ? AND calculation_profile_id = ? AND deleted_at IS NULL`
      )
      .get(schoolId, profileId) as { n: number }
    return row.n > 0
  }

  private toDto(schoolId: string, profile: CalculationProfileRow): ProfileDto | null {
    const ver = this.latestVersion(profile.id)
    if (!ver) return null
    return {
      profile,
      version_number: ver.version_number,
      config_hash: ver.config_hash,
      config: parseConfig(ver.config_json),
      assignments: this.assignments(schoolId, profile.id),
      used_in_results: this.usedInResults(schoolId, profile.id),
    }
  }

  create(input: {
    school_id: string
    name: string
    description?: string
    academic_year_id?: string | null
    period_mode?: 'term' | 'annual'
    created_by?: string | null
    config: CalculationConfig
    assignments?: Array<Omit<ProfileAssignment, 'id'>>
  }): ProfileDto {
    const t = nowIso()
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO result_calculation_profiles (
          id, school_id, name, description, academic_year_id, period_mode,
          status, created_by, created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, NULL, 'pending', 1)`
      )
      .run(
        id,
        input.school_id,
        input.name.trim(),
        input.description ?? '',
        input.academic_year_id ?? null,
        input.period_mode ?? 'term',
        input.created_by ?? null,
        t,
        t
      )
    this.insertVersion(input.school_id, id, 1, input.config, input.created_by)
    this.replaceAssignments(input.school_id, id, input.assignments ?? [])
    const dto = this.get(input.school_id, id)
    if (!dto) throw new Error('Failed to create calculation profile.')
    return dto
  }

  private insertVersion(
    schoolId: string,
    profileId: string,
    versionNumber: number,
    config: CalculationConfig,
    createdBy?: string | null
  ): void {
    this.db
      .prepare(
        `INSERT INTO result_calculation_profile_versions (
          id, school_id, profile_id, version_number, config_json, config_hash, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        schoolId,
        profileId,
        versionNumber,
        JSON.stringify(config),
        hashConfig(config),
        createdBy ?? null,
        nowIso()
      )
  }

  replaceAssignments(
    schoolId: string,
    profileId: string,
    assignments: Array<Omit<ProfileAssignment, 'id'>>
  ): void {
    const t = nowIso()
    this.db
      .prepare(
        `UPDATE result_calculation_class_assignments
         SET deleted_at = ?, updated_at = ?
         WHERE school_id = ? AND profile_id = ? AND deleted_at IS NULL`
      )
      .run(t, t, schoolId, profileId)
    for (const a of assignments) {
      this.db
        .prepare(
          `INSERT INTO result_calculation_class_assignments (
            id, school_id, profile_id, class_id, academic_level_id, department_id,
            allow_overlap, created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', 1)`
        )
        .run(
          randomUUID(),
          schoolId,
          profileId,
          a.class_id,
          a.academic_level_id,
          a.department_id,
          a.allow_overlap ? 1 : 0,
          t,
          t
        )
    }
  }

  save(input: {
    school_id: string
    id: string
    name: string
    description?: string
    academic_year_id?: string | null
    period_mode?: 'term' | 'annual'
    config: CalculationConfig
    assignments?: Array<Omit<ProfileAssignment, 'id'>>
    create_new_version?: boolean
    updated_by?: string | null
  }): ProfileDto {
    const existing = this.get(input.school_id, input.id)
    if (!existing) throw new Error('Calculation profile not found.')
    const used = existing.used_in_results
    const mustVersion =
      Boolean(input.create_new_version) ||
      existing.profile.status === 'active' ||
      (used && existing.profile.status !== 'draft')
    const t = nowIso()
    this.db
      .prepare(
        `UPDATE result_calculation_profiles
         SET name = ?, description = ?, academic_year_id = ?, period_mode = ?,
             updated_at = ?, version = version + 1, sync_status = 'pending'
         WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .run(
        input.name.trim(),
        input.description ?? '',
        input.academic_year_id ?? null,
        input.period_mode ?? existing.profile.period_mode,
        t,
        input.id,
        input.school_id
      )
    if (mustVersion || existing.profile.status === 'draft') {
      if (mustVersion) {
        this.insertVersion(
          input.school_id,
          input.id,
          existing.version_number + 1,
          input.config,
          input.updated_by
        )
      } else {
        this.db
          .prepare(
            `UPDATE result_calculation_profile_versions
             SET config_json = ?, config_hash = ?
             WHERE profile_id = ? AND version_number = ?`
          )
          .run(
            JSON.stringify(input.config),
            hashConfig(input.config),
            input.id,
            existing.version_number
          )
      }
    } else {
      this.insertVersion(
        input.school_id,
        input.id,
        existing.version_number + 1,
        input.config,
        input.updated_by
      )
    }
    if (input.assignments) {
      this.replaceAssignments(input.school_id, input.id, input.assignments)
    }
    const dto = this.get(input.school_id, input.id)
    if (!dto) throw new Error('Failed to save calculation profile.')
    return dto
  }

  setStatus(schoolId: string, id: string, status: ProfileStatus): ProfileDto {
    const t = nowIso()
    this.db
      .prepare(
        `UPDATE result_calculation_profiles
         SET status = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
         WHERE id = ? AND school_id = ? AND deleted_at IS NULL`
      )
      .run(status, t, id, schoolId)
    const dto = this.get(schoolId, id)
    if (!dto) throw new Error('Calculation profile not found.')
    return dto
  }

  overlappingActive(
    schoolId: string,
    profileId: string,
    assignments: Array<Omit<ProfileAssignment, 'id'>>
  ): string[] {
    const names: string[] = []
    for (const a of assignments) {
      if (a.allow_overlap) continue
      const rows = this.db
        .prepare(
          `SELECT p.name FROM result_calculation_class_assignments x
           JOIN result_calculation_profiles p ON p.id = x.profile_id
           WHERE x.school_id = ? AND x.deleted_at IS NULL AND p.deleted_at IS NULL
             AND p.status = 'active' AND p.id != ?
             AND (
               (? IS NOT NULL AND x.class_id = ?)
               OR (? IS NOT NULL AND x.academic_level_id = ?)
               OR (? IS NOT NULL AND x.department_id = ?)
             )
             AND x.allow_overlap = 0`
        )
        .all(
          schoolId,
          profileId,
          a.class_id,
          a.class_id,
          a.academic_level_id,
          a.academic_level_id,
          a.department_id,
          a.department_id
        ) as Array<{ name: string }>
      for (const r of rows) names.push(r.name)
    }
    return [...new Set(names)]
  }

  resolveForClass(
    schoolId: string,
    classId: string,
    academicLevelId: string | null,
    academicYearId: string | null
  ): ProfileDto | null {
    const rows = this.db
      .prepare(
        `SELECT p.* FROM result_calculation_profiles p
         JOIN result_calculation_class_assignments a
           ON a.profile_id = p.id AND a.school_id = p.school_id
         WHERE p.school_id = ? AND p.status = 'active'
           AND p.deleted_at IS NULL AND a.deleted_at IS NULL
           AND (p.academic_year_id IS NULL OR p.academic_year_id = ?)
           AND (
             a.class_id = ?
             OR (? IS NOT NULL AND a.academic_level_id = ? AND a.class_id IS NULL)
           )
         ORDER BY CASE WHEN a.class_id IS NOT NULL THEN 0 ELSE 1 END`
      )
      .all(
        schoolId,
        academicYearId,
        classId,
        academicLevelId,
        academicLevelId
      ) as CalculationProfileRow[]
    const first = rows[0]
    return first ? this.toDto(schoolId, first) : null
  }

  ensureDemo(schoolId: string, createdBy?: string | null): void {
    const count = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM result_calculation_profiles
         WHERE school_id = ? AND deleted_at IS NULL`
      )
      .get(schoolId) as { n: number }
    if (count.n > 0) return
    this.create({
      school_id: schoolId,
      name: 'Standard Secondary - 40/60',
      description:
        'Continuous assessment 40% and final examination 60%. Pass mark 50%. Ranking on. Promotion: average at least 50% and at most two failed subjects.',
      created_by: createdBy ?? null,
      config: demoStandard4060(),
      assignments: [],
    })
    this.create({
      school_id: schoolId,
      name: 'Upper Secondary - Tests + Exam',
      description:
        'Test 1, Test 2, assignment and classwork at 10% each, plus a 60% final exam. GCE-style grades. GPA on. Promotion: average at least 60% and at most one failed subject.',
      created_by: createdBy ?? null,
      config: demoUpperSecondary(),
      assignments: [],
    })
  }
}
