import React from "react";
import { Add01Icon, Cancel01Icon, Copy01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";
import {
  ConfirmModal,
  FormModal,
  PrimaryButton,
  SecondaryButton,
  fieldClass,
} from "./ui";
import {
  buildOfferedBySubjectMap,
  copySubjectsToClasses,
  groupAssignmentsByClass,
  sectionSortRank,
  subjectsOfferedInClass,
  summarizeTeachingAssignments,
  upsertClassAssignment,
  type TeachingAssignment,
} from "../../lib/teaching-assignments";

export type TeachingAssignmentPair = TeachingAssignment;

export type AssignmentClassOption = {
  id: string;
  name: string;
  academic_level_id?: string | null;
  academic_level_name?: string | null;
  level_sort_order?: number | null;
  section_id?: string | null;
  section_name?: string | null;
};

export type AssignmentSubjectOption = {
  id: string;
  name: string;
  class_ids: string[];
};

type DialogMode =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; classId: string }
  | { kind: "copy"; classId: string }
  | { kind: "remove"; classId: string };

function classGroupLabel(cls: AssignmentClassOption): string {
  const section = cls.section_name?.trim();
  if (section) return section.toUpperCase();
  const level = cls.academic_level_name?.trim();
  if (level) return level.toUpperCase();
  return "CLASSES";
}

function groupClassesForPicker(classes: AssignmentClassOption[]): Array<{
  label: string;
  classes: AssignmentClassOption[];
}> {
  const sorted = [...classes].sort((a, b) => {
    const levelA = a.level_sort_order ?? 9999;
    const levelB = b.level_sort_order ?? 9999;
    if (levelA !== levelB) return levelA - levelB;
    const sectionA = sectionSortRank(a.section_name);
    const sectionB = sectionSortRank(b.section_name);
    if (sectionA !== sectionB) return sectionA - sectionB;
    return a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });

  const groups: Array<{ label: string; classes: AssignmentClassOption[] }> = [];
  for (const cls of sorted) {
    const label = classGroupLabel(cls);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.classes.push(cls);
    else groups.push({ label, classes: [cls] });
  }
  return groups;
}

export function TeachingAssignmentPicker({
  classes,
  subjects,
  value,
  onChange,
  disabled,
}: {
  classes: AssignmentClassOption[];
  subjects: AssignmentSubjectOption[];
  value: TeachingAssignmentPair[];
  onChange: (next: TeachingAssignmentPair[]) => void;
  disabled?: boolean;
}) {
  const [dialog, setDialog] = React.useState<DialogMode>({ kind: "closed" });
  const [classId, setClassId] = React.useState("");
  const [classQuery, setClassQuery] = React.useState("");
  const [subjectQuery, setSubjectQuery] = React.useState("");
  const [selectedSubjectIds, setSelectedSubjectIds] = React.useState<string[]>(
    [],
  );
  const [copySubjectIds, setCopySubjectIds] = React.useState<string[]>([]);
  const [copyClassIds, setCopyClassIds] = React.useState<string[]>([]);
  const [formError, setFormError] = React.useState("");

  const offeredBySubject = React.useMemo(
    () => buildOfferedBySubjectMap(subjects),
    [subjects],
  );

  const classById = React.useMemo(() => {
    const map = new Map(classes.map((c) => [c.id, c]));
    return map;
  }, [classes]);

  const subjectById = React.useMemo(() => {
    const map = new Map(subjects.map((s) => [s.id, s]));
    return map;
  }, [subjects]);

  const groups = React.useMemo(
    () => groupAssignmentsByClass(value),
    [value],
  );

  const summary = React.useMemo(
    () => summarizeTeachingAssignments(value),
    [value],
  );

  const classesWithOfferings = React.useMemo(
    () =>
      classes.filter((c) =>
        subjects.some((s) => s.class_ids.includes(c.id)),
      ),
    [classes, subjects],
  );

  const assignedClassIds = React.useMemo(
    () => new Set(groups.map((g) => g.class_id)),
    [groups],
  );

  function openAdd() {
    setFormError("");
    setClassId("");
    setClassQuery("");
    setSubjectQuery("");
    setSelectedSubjectIds([]);
    setDialog({ kind: "add" });
  }

  function openEdit(editClassId: string) {
    const existing = groups.find((g) => g.class_id === editClassId);
    setFormError("");
    setClassId(editClassId);
    setClassQuery("");
    setSubjectQuery("");
    setSelectedSubjectIds(existing?.subject_ids ?? []);
    setDialog({ kind: "edit", classId: editClassId });
  }

  function openCopy(sourceClassId: string) {
    const existing = groups.find((g) => g.class_id === sourceClassId);
    setFormError("");
    setCopySubjectIds(existing?.subject_ids ?? []);
    setCopyClassIds([]);
    setDialog({ kind: "copy", classId: sourceClassId });
  }

  function closeDialog() {
    setDialog({ kind: "closed" });
    setFormError("");
  }

  function toggleSubject(id: string) {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function saveAssignment() {
    if (!classId) {
      setFormError("Select a class.");
      return;
    }
    if (selectedSubjectIds.length === 0) {
      setFormError("Select at least one subject for this class.");
      return;
    }
    const offered = subjectsOfferedInClass(classId, subjects);
    const offeredIds = new Set(offered.map((s) => s.id));
    const invalid = selectedSubjectIds.filter((id) => !offeredIds.has(id));
    if (invalid.length > 0) {
      setFormError(
        "One or more selected subjects are not offered in this class.",
      );
      return;
    }
    const previousClassId =
      dialog.kind === "edit"
        ? dialog.classId
        : assignedClassIds.has(classId)
          ? classId
          : null;
    const next = upsertClassAssignment(
      value,
      previousClassId,
      { class_id: classId, subject_ids: selectedSubjectIds },
      offeredBySubject,
    );
    onChange(next);
    closeDialog();
  }

  function applyCopy() {
    if (copySubjectIds.length === 0) {
      setFormError("Select at least one subject to copy.");
      return;
    }
    if (copyClassIds.length === 0) {
      setFormError("Select at least one target class.");
      return;
    }
    const next = copySubjectsToClasses(
      value,
      copySubjectIds,
      copyClassIds,
      offeredBySubject,
    );
    onChange(next);
    closeDialog();
  }

  function confirmRemove() {
    if (dialog.kind !== "remove") return;
    onChange(value.filter((p) => p.class_id !== dialog.classId));
    closeDialog();
  }

  const offeredSubjects = subjectsOfferedInClass(classId, subjects);
  const filteredSubjects = offeredSubjects.filter((s) => {
    const q = subjectQuery.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q);
  });

  const classPickerGroups = React.useMemo(() => {
    const q = classQuery.trim().toLowerCase();
    const filtered = classesWithOfferings.filter((c) => {
      if (dialog.kind === "add" && assignedClassIds.has(c.id) && c.id !== classId)
        return true; // still show so they can merge via edit; hide from add? Spec: duplicate prevention at subject level. Allow selecting existing class to merge.
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.section_name || "").toLowerCase().includes(q) ||
        (c.academic_level_name || "").toLowerCase().includes(q)
      );
    });
    return groupClassesForPicker(filtered);
  }, [
    classesWithOfferings,
    classQuery,
    dialog.kind,
    assignedClassIds,
    classId,
  ]);

  const copyTargets = React.useMemo(() => {
    if (dialog.kind !== "copy") return [];
    return classesWithOfferings.filter((c) => {
      if (c.id === dialog.classId) return false;
      return copySubjectIds.some((sid) =>
        (offeredBySubject.get(sid) ?? []).includes(c.id),
      );
    });
  }, [dialog, classesWithOfferings, copySubjectIds, offeredBySubject]);

  if (classesWithOfferings.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No class–subject offerings yet. Add subjects to classes in School setup,
        then assign teachers here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <span className="font-semibold text-slate-900">{summary.classes}</span>{" "}
        {summary.classes === 1 ? "Class" : "Classes"}
        <span className="mx-2 text-slate-300">·</span>
        <span className="font-semibold text-slate-900">{summary.subjects}</span>{" "}
        {summary.subjects === 1 ? "Subject" : "Subjects"}
        <span className="mx-2 text-slate-300">·</span>
        <span className="font-semibold text-slate-900">
          {summary.assignments}
        </span>{" "}
        {summary.assignments === 1 ? "Assignment" : "Assignments"}
      </div>

      {!disabled ? (
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-(--sofia-primary) hover:border-(--sofia-primary) hover:bg-(--sofia-primary)/5"
        >
          <Icon icon={Add01Icon} size={18} />
          Add Assignment
        </button>
      ) : null}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center">
          <p className="text-sm font-medium text-slate-800">
            No teaching assignments yet
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Add the classes and subjects this teacher teaches.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => {
            const cls = classById.get(g.class_id);
            const className = cls?.name ?? "Class";
            return (
              <li
                key={g.class_id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-900">
                      {className}
                    </p>
                    {cls?.section_name || cls?.academic_level_name ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[cls.academic_level_name, cls.section_name]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  {!disabled ? (
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(g.class_id)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        aria-label={`Edit assignment for ${className}`}
                      >
                        <Icon icon={PencilEdit01Icon} size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => openCopy(g.class_id)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        aria-label={`Copy subjects from ${className}`}
                      >
                        <Icon icon={Copy01Icon} size={14} />
                        Copy to other classes
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDialog({ kind: "remove", classId: g.class_id })
                        }
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        aria-label={`Remove assignment for ${className}`}
                      >
                        <Icon icon={Cancel01Icon} size={14} />
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {g.subject_ids.map((sid) => (
                    <span
                      key={sid}
                      className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                    >
                      {subjectById.get(sid)?.name ?? "Subject"}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <FormModal
        open={dialog.kind === "add" || dialog.kind === "edit"}
        title={
          dialog.kind === "edit"
            ? "Edit Teaching Assignment"
            : "Add Teaching Assignment"
        }
        subtitle="Choose a class, then select the subjects this teacher teaches in that class."
        onClose={closeDialog}
        size="lg"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <SecondaryButton onClick={closeDialog}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={saveAssignment}
              disabled={!classId || selectedSubjectIds.length === 0}
            >
              {dialog.kind === "edit" ? "Save Changes" : "Add Assignment"}
            </PrimaryButton>
          </div>
        }
      >
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Class
          </span>
          <input
            type="search"
            className={`${fieldClass} mb-2`}
            placeholder="Search or select class…"
            value={classQuery}
            onChange={(e) => setClassQuery(e.target.value)}
            aria-label="Search classes"
            disabled={dialog.kind === "edit"}
          />
          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
            {classPickerGroups.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">
                No matching classes.
              </p>
            ) : (
              classPickerGroups.map((group) => (
                <div key={group.label}>
                  <p className="sticky top-0 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {group.label}
                  </p>
                  <ul>
                    {group.classes.map((c) => {
                      const already = assignedClassIds.has(c.id);
                      const selected = classId === c.id;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            disabled={dialog.kind === "edit"}
                            onClick={() => {
                              setClassId(c.id);
                              if (already && dialog.kind === "add") {
                                const existing = groups.find(
                                  (g) => g.class_id === c.id,
                                );
                                setSelectedSubjectIds(
                                  existing?.subject_ids ?? [],
                                );
                              } else if (dialog.kind === "add") {
                                setSelectedSubjectIds([]);
                              }
                              setSubjectQuery("");
                              setFormError("");
                            }}
                            className={`flex w-full cursor-pointer items-center justify-between px-3 py-2.5 text-left text-sm disabled:cursor-default ${
                              selected
                                ? "bg-(--sofia-primary)/10 font-semibold text-(--sofia-primary)"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span>{c.name}</span>
                            {already && dialog.kind === "add" ? (
                              <span className="text-xs font-medium text-slate-400">
                                Assigned
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </label>

        {classId ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700">
                Subjects
              </span>
              <span className="text-xs text-slate-500">
                Selected: {selectedSubjectIds.length}
              </span>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Select the subjects this teacher teaches in this class.
            </p>
            <input
              type="search"
              className={`${fieldClass} mb-2`}
              placeholder="Search subjects…"
              value={subjectQuery}
              onChange={(e) => setSubjectQuery(e.target.value)}
              aria-label="Search subjects"
            />
            {offeredSubjects.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                This class has no subjects configured yet.
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 p-2">
                <div className="grid gap-1 sm:grid-cols-2">
                  {filteredSubjects.map((s) => {
                    const checked = selectedSubjectIds.includes(s.id);
                    return (
              <label
                key={s.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${
                          checked
                            ? "bg-(--sofia-primary)/10 text-slate-900"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
              >
                <input
                  type="checkbox"
                          checked={checked}
                          onChange={() => toggleSubject(s.id)}
                          className="size-4 accent-(--sofia-primary)"
                />
                {s.name}
              </label>
                    );
                  })}
                </div>
                {filteredSubjects.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-slate-500">
                    No subjects match your search.
                  </p>
                ) : null}
              </div>
            )}
            {selectedSubjectIds.length > 0 ? (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium text-slate-500">
                  Selected subjects
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSubjectIds.map((sid) => (
                    <button
                      key={sid}
                      type="button"
                      onClick={() => toggleSubject(sid)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                      aria-label={`Remove ${subjectById.get(sid)?.name ?? "subject"}`}
                    >
                      {subjectById.get(sid)?.name ?? "Subject"}
                      <Icon icon={Cancel01Icon} size={12} />
                    </button>
            ))}
          </div>
        </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Select a class to see its available subjects.
          </p>
        )}

        {formError ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {formError}
          </p>
        ) : null}
      </FormModal>

      <FormModal
        open={dialog.kind === "copy"}
        title="Copy subjects"
        subtitle="Apply the same subjects to other classes that offer them."
        onClose={closeDialog}
        size="md"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <SecondaryButton onClick={closeDialog}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={applyCopy}
              disabled={
                copySubjectIds.length === 0 || copyClassIds.length === 0
              }
            >
              Apply
            </PrimaryButton>
          </div>
        }
      >
        {dialog.kind === "copy" ? (
          <>
            <p className="mb-2 text-sm font-medium text-slate-700">
              These subjects will be copied
            </p>
            <div className="mb-4 space-y-1">
              {(groups.find((g) => g.class_id === dialog.classId)?.subject_ids ??
                []
              ).map((sid) => (
                <label
                  key={sid}
                  className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={copySubjectIds.includes(sid)}
                    onChange={() =>
                      setCopySubjectIds((prev) =>
                        prev.includes(sid)
                          ? prev.filter((x) => x !== sid)
                          : [...prev, sid],
                      )
                    }
                    className="size-4 accent-(--sofia-primary)"
                  />
                  {subjectById.get(sid)?.name ?? "Subject"}
                </label>
              ))}
            </div>
            <p className="mb-2 text-sm font-medium text-slate-700">Apply to</p>
            {copyTargets.length === 0 ? (
              <p className="text-sm text-slate-500">
                No other classes offer the selected subjects.
              </p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                {copyTargets.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={copyClassIds.includes(c.id)}
                      onChange={() =>
                        setCopyClassIds((prev) =>
                          prev.includes(c.id)
                            ? prev.filter((x) => x !== c.id)
                            : [...prev, c.id],
                        )
                      }
                      className="size-4 accent-(--sofia-primary)"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
            {formError ? (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {formError}
              </p>
            ) : null}
          </>
        ) : null}
      </FormModal>

      <ConfirmModal
        open={dialog.kind === "remove"}
        title="Remove Assignment?"
        danger
        confirmLabel="Remove"
        onCancel={closeDialog}
        onConfirm={confirmRemove}
        description={
          dialog.kind === "remove" ? (
            <div>
              <p>
                Remove this teacher&apos;s teaching assignments for:{" "}
                <strong>{classById.get(dialog.classId)?.name ?? "Class"}</strong>
              </p>
              <p className="mt-2">This will remove:</p>
              <ul className="mt-1 list-disc pl-5">
                {(
                  groups.find((g) => g.class_id === dialog.classId)
                    ?.subject_ids ?? []
                ).map((sid) => (
                  <li key={sid}>
                    {subjectById.get(sid)?.name ?? "Subject"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        }
      />
    </div>
  );
}
