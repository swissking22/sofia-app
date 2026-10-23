import type Database from "better-sqlite3";
import { enqueueSync } from "../../sync/queue";
import type { AssessmentType, GradeBand, GradingSystem } from "../types";
import { BaseRepository, type CreateInput, type UpdateInput } from "./base";

export interface GradingSystemSetupInput {
  enable_ranking: boolean;
  show_class_average: boolean;
  show_teacher_remarks: boolean;
  assessment_types: Array<{
    id?: string | null;
    name: string;
    weight_percent: number;
  }>;
  grade_bands: Array<{
    id?: string | null;
    grade: string;
    min_score: number;
    max_score: number;
  }>;
}

export interface GradingSystemSetupDto {
  id: string;
  school_id: string;
  enable_ranking: boolean;
  show_class_average: boolean;
  show_teacher_remarks: boolean;
  assessment_types: Array<{
    id: string;
    name: string;
    weight_percent: number;
    sort_order: number;
  }>;
  grade_bands: Array<{
    id: string;
    grade: string;
    min_score: number;
    max_score: number;
    sort_order: number;
  }>;
}

export const DEFAULT_ASSESSMENT_TYPES: Array<{
  name: string;
  weight_percent: number;
}> = [
  { name: "Continuous Assessment", weight_percent: 30 },
  { name: "Examination", weight_percent: 70 },
];

export const DEFAULT_GRADE_BANDS: Array<{
  grade: string;
  min_score: number;
  max_score: number;
}> = [
  { grade: "A", min_score: 80, max_score: 100 },
  { grade: "B", min_score: 70, max_score: 79 },
  { grade: "C", min_score: 60, max_score: 69 },
  { grade: "D", min_score: 50, max_score: 59 },
  { grade: "E", min_score: 40, max_score: 49 },
  { grade: "F", min_score: 0, max_score: 39 },
];

/** Grade labels: up to 5 letters/digits, no spaces (e.g. A, A1, DIST). */
export const GRADE_LABEL_MAX_LENGTH = 5;

export function normalizeGradeLabel(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, GRADE_LABEL_MAX_LENGTH);
}

export function isValidGradeLabel(raw: string): boolean {
  return /^[A-Z0-9]{1,5}$/.test(normalizeGradeLabel(raw));
}

export function defaultGradingSetup(schoolId = ""): GradingSystemSetupDto {
  return {
    id: "",
    school_id: schoolId,
    enable_ranking: true,
    show_class_average: true,
    show_teacher_remarks: true,
    assessment_types: DEFAULT_ASSESSMENT_TYPES.map((t, i) => ({
      id: "",
      name: t.name,
      weight_percent: t.weight_percent,
      sort_order: i + 1,
    })),
    grade_bands: DEFAULT_GRADE_BANDS.map((b, i) => ({
      id: "",
      grade: b.grade,
      min_score: b.min_score,
      max_score: b.max_score,
      sort_order: i + 1,
    })),
  };
}

export function validateGradingSetup(
  input: GradingSystemSetupInput,
): string | null {
  const types = input.assessment_types
    .map((t) => ({
      name: t.name?.trim() ?? "",
      weight_percent: Number(t.weight_percent),
    }))
    .filter((t) => t.name || t.weight_percent);

  if (types.length === 0) {
    return "Add at least one assessment type.";
  }
  for (const t of types) {
    if (!t.name) return "Every assessment type needs a name.";
    if (!Number.isFinite(t.weight_percent) || t.weight_percent < 0) {
      return `"${t.name}": weight must be 0 or greater.`;
    }
  }
  const weightSum = types.reduce((sum, t) => sum + t.weight_percent, 0);
  if (Math.abs(weightSum - 100) > 0.01) {
    return `Assessment weights must total 100% (currently ${weightSum}%).`;
  }

  const bands = input.grade_bands.map((b) => ({
    grade: normalizeGradeLabel(b.grade ?? ""),
    min_score: Number(b.min_score),
    max_score: Number(b.max_score),
  }));

  if (bands.length === 0) {
    return "Add at least one grade band.";
  }

  for (const b of bands) {
    if (!b.grade) {
      return "Every grade band needs a grade label (letters/digits, no spaces).";
    }
    if (!isValidGradeLabel(b.grade)) {
      return `Grade "${b.grade}" must be 1–${GRADE_LABEL_MAX_LENGTH} letters or digits with no spaces.`;
    }
    if (!Number.isFinite(b.min_score) || !Number.isFinite(b.max_score)) {
      return `Grade ${b.grade || "?"}: scores must be numbers.`;
    }
    if (b.min_score < 0 || b.max_score > 100) {
      return `Grade ${b.grade}: scores must be between 0 and 100.`;
    }
    if (b.min_score > b.max_score) {
      return `Grade ${b.grade}: minimum cannot exceed maximum.`;
    }
  }

  const sorted = [...bands].sort((a, b) => b.max_score - a.max_score);
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (next.max_score >= current.min_score) {
      return `Grade ranges overlap between ${current.grade} and ${next.grade}.`;
    }
    // Allow whole-number edges (89 / 90) or decimal edges (15.99 / 16)
    const gap = current.min_score - next.max_score;
    if (gap > 1 + 1e-9) {
      return `Grade ranges must be contiguous (gap between ${current.grade} and ${next.grade}).`;
    }
  }
  const top = Math.max(...bands.map((b) => b.max_score));
  const bottom = Math.min(...bands.map((b) => b.min_score));
  if (bottom !== 0 || (top !== 100 && top !== 20)) {
    return "Grade scale must start at 0 and end at 20 or 100.";
  }

  return null;
}

export class GradingSystemRepository extends BaseRepository<GradingSystem> {
  constructor(db: Database.Database) {
    super(db, "grading_systems");
  }

  findForSchool(schoolId: string): GradingSystem | undefined {
    return this.db
      .prepare(
        `SELECT * FROM grading_systems
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(schoolId) as GradingSystem | undefined;
  }

  getSetupDto(schoolId: string): GradingSystemSetupDto | null {
    const system = this.findForSchool(schoolId);
    if (!system) return null;

    const assessment_types = this.db
      .prepare(
        `SELECT * FROM assessment_types
         WHERE grading_system_id = ? AND deleted_at IS NULL
         ORDER BY sort_order ASC, name ASC`,
      )
      .all(system.id) as AssessmentType[];

    const grade_bands = this.db
      .prepare(
        `SELECT * FROM grade_bands
         WHERE grading_system_id = ? AND deleted_at IS NULL
         ORDER BY sort_order ASC, max_score DESC`,
      )
      .all(system.id) as GradeBand[];

    return {
      id: system.id,
      school_id: system.school_id,
      enable_ranking: system.enable_ranking === 1,
      show_class_average: system.show_class_average === 1,
      show_teacher_remarks: system.show_teacher_remarks === 1,
      assessment_types: assessment_types.map((t) => ({
        id: t.id,
        name: t.name,
        weight_percent: t.weight_percent,
        sort_order: t.sort_order,
      })),
      grade_bands: grade_bands.map((b) => ({
        id: b.id,
        grade: b.grade,
        min_score: b.min_score,
        max_score: b.max_score,
        sort_order: b.sort_order,
      })),
    };
  }

  saveSetup(
    schoolId: string,
    input: GradingSystemSetupInput,
  ): GradingSystemSetupDto {
    const validationError = validateGradingSetup(input);
    if (validationError) throw new Error(validationError);

    const existing = this.findForSchool(schoolId);

    const tx = this.db.transaction(() => {
      const system = existing
        ? this.update(existing.id, {
            enable_ranking: input.enable_ranking ? 1 : 0,
            show_class_average: input.show_class_average ? 1 : 0,
            show_teacher_remarks: input.show_teacher_remarks ? 1 : 0,
          })!
        : this.create({
            school_id: schoolId,
            enable_ranking: input.enable_ranking ? 1 : 0,
            show_class_average: input.show_class_average ? 1 : 0,
            show_teacher_remarks: input.show_teacher_remarks ? 1 : 0,
          });

      this.replaceAssessmentTypes(system.id, input.assessment_types);
      this.replaceGradeBands(system.id, input.grade_bands);
    });
    tx();

    const dto = this.getSetupDto(schoolId);
    if (!dto) throw new Error("Could not load grading system after save.");
    return dto;
  }

  create(input: CreateInput<GradingSystem>): GradingSystem {
    const record: GradingSystem = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      enable_ranking: input.enable_ranking ?? 1,
      show_class_average: input.show_class_average ?? 1,
      show_teacher_remarks: input.show_teacher_remarks ?? 1,
    };

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO grading_systems (
             id, school_id, enable_ranking, show_class_average, show_teacher_remarks,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @school_id, @enable_ranking, @show_class_average, @show_teacher_remarks,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`,
        )
        .run(record);

      enqueueSync(
        this.db,
        this.tableName,
        record.id,
        "INSERT",
        record as unknown as Record<string, unknown>,
      );
    });
    tx();
    return record;
  }

  update(
    id: string,
    input: UpdateInput<GradingSystem>,
  ): GradingSystem | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    const record: GradingSystem = {
      ...existing,
      ...input,
      ...this.applyUpdateMeta(existing),
    };

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE grading_systems
           SET school_id = @school_id,
               enable_ranking = @enable_ranking,
               show_class_average = @show_class_average,
               show_teacher_remarks = @show_teacher_remarks,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`,
        )
        .run(record);

      enqueueSync(
        this.db,
        this.tableName,
        record.id,
        "UPDATE",
        record as unknown as Record<string, unknown>,
      );
    });
    tx();
    return record;
  }

  private replaceAssessmentTypes(
    gradingSystemId: string,
    types: GradingSystemSetupInput["assessment_types"],
  ): void {
    const existing = this.db
      .prepare(
        `SELECT * FROM assessment_types
         WHERE grading_system_id = ? AND deleted_at IS NULL`,
      )
      .all(gradingSystemId) as AssessmentType[];

    const keptIds = new Set(
      types.map((t) => t.id).filter((id): id is string => Boolean(id)),
    );

    for (const row of existing) {
      if (!keptIds.has(row.id)) {
        this.softDeleteChild("assessment_types", row);
      }
    }

    types.forEach((t, index) => {
      const name = t.name.trim();
      const weight_percent = Number(t.weight_percent);
      const sort_order = index + 1;

      if (t.id) {
        const current = existing.find((e) => e.id === t.id);
        if (!current) return;
        const updated: AssessmentType = {
          ...current,
          name,
          weight_percent,
          sort_order,
          ...this.applyUpdateMeta(current),
        };
        this.db
          .prepare(
            `UPDATE assessment_types
             SET name = @name,
                 weight_percent = @weight_percent,
                 sort_order = @sort_order,
                 updated_at = @updated_at,
                 version = @version,
                 sync_status = @sync_status
             WHERE id = @id`,
          )
          .run(updated);
        enqueueSync(
          this.db,
          "assessment_types",
          updated.id,
          "UPDATE",
          updated as unknown as Record<string, unknown>,
        );
        return;
      }

      const record: AssessmentType = {
        ...this.buildBaseFields(),
        grading_system_id: gradingSystemId,
        name,
        weight_percent,
        sort_order,
      };
      this.db
        .prepare(
          `INSERT INTO assessment_types (
             id, grading_system_id, name, weight_percent, sort_order,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @grading_system_id, @name, @weight_percent, @sort_order,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`,
        )
        .run(record);
      enqueueSync(
        this.db,
        "assessment_types",
        record.id,
        "INSERT",
        record as unknown as Record<string, unknown>,
      );
    });
  }

  private replaceGradeBands(
    gradingSystemId: string,
    bands: GradingSystemSetupInput["grade_bands"],
  ): void {
    const existing = this.db
      .prepare(
        `SELECT * FROM grade_bands
         WHERE grading_system_id = ? AND deleted_at IS NULL`,
      )
      .all(gradingSystemId) as GradeBand[];

    const keptIds = new Set(
      bands.map((b) => b.id).filter((id): id is string => Boolean(id)),
    );

    for (const row of existing) {
      if (!keptIds.has(row.id)) {
        this.softDeleteChild("grade_bands", row);
      }
    }

    bands.forEach((b, index) => {
      const grade = normalizeGradeLabel(b.grade);
      const min_score = Number(b.min_score);
      const max_score = Number(b.max_score);
      const sort_order = index + 1;

      if (b.id) {
        const current = existing.find((e) => e.id === b.id);
        if (!current) return;
        const updated: GradeBand = {
          ...current,
          grade,
          min_score,
          max_score,
          sort_order,
          ...this.applyUpdateMeta(current),
        };
        this.db
          .prepare(
            `UPDATE grade_bands
             SET grade = @grade,
                 min_score = @min_score,
                 max_score = @max_score,
                 sort_order = @sort_order,
                 updated_at = @updated_at,
                 version = @version,
                 sync_status = @sync_status
             WHERE id = @id`,
          )
          .run(updated);
        enqueueSync(
          this.db,
          "grade_bands",
          updated.id,
          "UPDATE",
          updated as unknown as Record<string, unknown>,
        );
        return;
      }

      const record: GradeBand = {
        ...this.buildBaseFields(),
        grading_system_id: gradingSystemId,
        grade,
        min_score,
        max_score,
        sort_order,
      };
      this.db
        .prepare(
          `INSERT INTO grade_bands (
             id, grading_system_id, grade, min_score, max_score, sort_order,
             created_at, updated_at, deleted_at, sync_status, version
           ) VALUES (
             @id, @grading_system_id, @grade, @min_score, @max_score, @sort_order,
             @created_at, @updated_at, @deleted_at, @sync_status, @version
           )`,
        )
        .run(record);
      enqueueSync(
        this.db,
        "grade_bands",
        record.id,
        "INSERT",
        record as unknown as Record<string, unknown>,
      );
    });
  }

  private softDeleteChild(
    tableName: "assessment_types" | "grade_bands",
    row: AssessmentType | GradeBand,
  ): void {
    const now = new Date().toISOString();
    const updated = {
      ...row,
      deleted_at: now,
      updated_at: now,
      version: row.version + 1,
      sync_status: "pending" as const,
    };
    this.db
      .prepare(
        `UPDATE ${tableName}
         SET deleted_at = @deleted_at,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`,
      )
      .run(updated);
    enqueueSync(
      this.db,
      tableName,
      row.id,
      "DELETE",
      updated as unknown as Record<string, unknown>,
    );
  }
}
