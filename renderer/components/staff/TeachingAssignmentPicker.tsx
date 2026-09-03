import React from "react";

export type TeachingAssignmentPair = { class_id: string; subject_id: string };

export function TeachingAssignmentPicker({
  classes,
  subjects,
  value,
  onChange,
  disabled,
}: {
  classes: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string; class_ids: string[] }>;
  value: TeachingAssignmentPair[];
  onChange: (next: TeachingAssignmentPair[]) => void;
  disabled?: boolean;
}) {
  const groups = classes
    .map((cls) => ({
      ...cls,
      offered: subjects.filter((s) => s.class_ids.includes(cls.id)),
    }))
    .filter((g) => g.offered.length > 0);

  function isOn(classId: string, subjectId: string): boolean {
    return value.some(
      (a) => a.class_id === classId && a.subject_id === subjectId,
    );
  }

  function toggle(classId: string, subjectId: string) {
    if (disabled) return;
    if (isOn(classId, subjectId)) {
      onChange(
        value.filter(
          (a) => !(a.class_id === classId && a.subject_id === subjectId),
        ),
      );
      return;
    }
    onChange([...value, { class_id: classId, subject_id: subjectId }]);
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No class–subject offerings yet. Add subjects to classes in School setup,
        then assign teachers here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div
          key={g.id}
          className="rounded-xl border border-slate-200 bg-slate-50/50 p-3"
        >
          <p className="mb-2 text-sm font-semibold text-slate-800">{g.name}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.offered.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={isOn(g.id, s.id)}
                  onChange={() => toggle(g.id, s.id)}
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
