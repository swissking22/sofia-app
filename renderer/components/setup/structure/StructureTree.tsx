import { RowActions } from "../DataTable";
import type {
  StructureClass,
  StructureLevel,
  StructureSection,
  StructureSpecialization,
} from "../../../lib/academic-structure";
import { EmptyState } from "./LevelCards";

interface StructureTreeProps {
  levels: StructureLevel[];
  sections: StructureSection[];
  specializations: StructureSpecialization[];
  classes: StructureClass[];
  onEditClass: (cls: StructureClass) => void;
  onDeleteClass: (id: string) => Promise<string | null>;
}

export function StructureTree({
  levels,
  sections,
  specializations,
  classes,
  onEditClass,
  onDeleteClass,
}: StructureTreeProps) {
  if (classes.length === 0) {
    return (
      <EmptyState message="No classes yet. Use the Class Builder above to create your first class." />
    );
  }

  const activeLevels = levels.filter((l) => l.is_active === 1);

  return (
    <div className="space-y-4">
      {activeLevels.map((level) => {
        const levelClasses = classes.filter(
          (c) => c.academic_level_id === level.id && c.is_active === 1,
        );
        if (levelClasses.length === 0) return null;

        const sectionIds = [
          ...new Set(
            levelClasses
              .map((c) => c.section_id)
              .filter((id): id is string => Boolean(id)),
          ),
        ];

        return (
          <div
            key={level.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <p className="font-semibold text-slate-900">{level.name}</p>
              <p className="text-xs text-slate-500">
                {levelClasses.length} class
                {levelClasses.length === 1 ? "" : "es"}
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {sectionIds.map((sectionId) => {
                const section = sections.find((s) => s.id === sectionId);
                const sectionClasses = levelClasses.filter(
                  (c) => c.section_id === sectionId,
                );
                const specIds = [
                  ...new Set(
                    sectionClasses.map(
                      (c) => c.specialization_id || "__none__",
                    ),
                  ),
                ];

                return (
                  <div key={sectionId} className="px-4 py-3">
                    <p className="mb-2 text-sm font-medium text-slate-700">
                      {section?.name ?? "Section"}
                    </p>
                    <div className="space-y-3 pl-3">
                      {specIds.map((specKey) => {
                        const specId = specKey === "__none__" ? null : specKey;
                        const spec = specId
                          ? specializations.find((s) => s.id === specId)
                          : null;
                        const groupClasses = sectionClasses.filter(
                          (c) => (c.specialization_id || null) === specId,
                        );

                        return (
                          <div key={specKey}>
                            {spec ? (
                              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                {spec.name}
                                {spec.abbreviation
                                  ? ` (${spec.abbreviation})`
                                  : ""}
                              </p>
                            ) : null}
                            <ul className="space-y-1">
                              {groupClasses.map((cls) => (
                                <li
                                  key={cls.id}
                                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50/80 px-3 py-2"
                                >
                                  <div>
                                    <p className="text-sm font-medium text-slate-900">
                                      {cls.name}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      0 students
                                      {cls.capacity != null
                                        ? ` · capacity ${cls.capacity}`
                                        : ""}
                                    </p>
                                  </div>
                                  <RowActions
                                    onEdit={() => onEditClass(cls)}
                                    onDelete={() => {
                                      void onDeleteClass(cls.id);
                                    }}
                                  />
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
