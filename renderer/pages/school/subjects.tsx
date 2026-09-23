import React from "react";
import {
  Add01Icon,
  Delete02Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../components/layout/AppShell";
import { FormField, FormSection } from "../../components/setup";
import { Icon } from "../../components/ui/Icon";
import { TableActionGroup, TableIconButton } from "../../components/ui/TableActions";
import { ClientPaginatedTable } from "../../components/ui/table-pagination";
import {
  createSubject,
  deleteSubject,
  fetchSubjectsSetup,
  updateSubject,
  type SubjectDto,
  type SubjectsSetup,
} from "../../lib/subjects";

const selectClass =
  "w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function SchoolSubjectsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [setup, setSetup] = React.useState<SubjectsSetup | null>(null);

  const [levelId, setLevelId] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [coefficient, setCoefficient] = React.useState("1");
  const [classIds, setClassIds] = React.useState<string[]>([]);

  function applySetup(data: SubjectsSetup) {
    setSetup(data);
    setLevelId((prev) => {
      if (prev && data.levels.some((l) => l.id === prev)) return prev;
      return data.levels[0]?.id ?? "";
    });
    setDepartmentId((prev) => {
      if (prev && data.departments.some((d) => d.id === prev)) return prev;
      return data.departments[0]?.id ?? "";
    });
  }

  React.useEffect(() => {
    void (async () => {
      const res = await fetchSubjectsSetup();
      if (res.ok) applySetup(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, []);

  const levelClasses = React.useMemo(() => {
    if (!setup || !levelId) return [];
    return setup.classes.filter((c) => c.academic_level_id === levelId);
  }, [setup, levelId]);

  const levelSubjects = React.useMemo(() => {
    if (!setup || !levelId) return [];
    return setup.subjects.filter((s) => s.academic_level_id === levelId);
  }, [setup, levelId]);

  const selectedLevelName =
    setup?.levels.find((l) => l.id === levelId)?.name ?? "this level";

  function resetForm(keepLevel = true) {
    setEditingId(null);
    setName("");
    setDepartmentId(setup?.departments[0]?.id ?? "");
    setCoefficient("1");
    // Default: all classes at the selected level
    setClassIds(
      keepLevel && levelId
        ? (setup?.classes
            .filter((c) => c.academic_level_id === levelId)
            .map((c) => c.id) ?? [])
        : [],
    );
  }

  React.useEffect(() => {
    if (editingId) return;
    // When switching level, default new subject to all classes in that level
    setClassIds(levelClasses.map((c) => c.id));
  }, [levelId, levelClasses, editingId]);

  function startEdit(subject: SubjectDto) {
    setEditingId(subject.id);
    if (subject.academic_level_id) setLevelId(subject.academic_level_id);
    setName(subject.name);
    setDepartmentId(subject.department_id ?? "");
    setCoefficient(String(subject.coefficient));
    setClassIds(subject.class_ids);
    setError("");
    setSuccess("");
  }

  function toggleClass(id: string) {
    setClassIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function selectAllLevelClasses() {
    setClassIds(levelClasses.map((c) => c.id));
  }

  async function handleSubmit() {
    setError("");
    setSuccess("");
    if (!levelId) {
      setError("Select an academic level first.");
      return;
    }
    if (!name.trim()) {
      setError("Subject name is required.");
      return;
    }
    if (!departmentId) {
      setError("Select a department.");
      return;
    }
    if (!classIds.length) {
      setError("Assign the subject to at least one class in this level.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        department_id: departmentId,
        coefficient: Number(coefficient) || 1,
        academic_level_id: levelId,
        class_ids: classIds,
      };
      const res = editingId
        ? await updateSubject({ id: editingId, ...payload })
        : await createSubject(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      applySetup(res.data);
      setSuccess(editingId ? "Subject updated." : "Subject added.");
      resetForm(true);
    } catch {
      setError("Could not save subject.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError("");
    setSuccess("");
    const res = await deleteSubject(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    applySetup(res.data);
    if (editingId === id) resetForm(true);
    setSuccess("Subject removed.");
  }

  return (
    <AppShell
      title="Subjects"
      breadcrumb={["School Management", "Subjects"]}
      heading="Subjects"
      subtitle="Create subjects by academic level, then assign them across classes in that level."
    >
      {loading || !setup ? (
        <p className="text-sm text-slate-500">
          {loading ? "Loading subjects…" : "Unable to load subjects."}
        </p>
      ) : (
        <div className="space-y-5">
          {error ? (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          <FormSection
            title="Academic Level"
            description="Choose a level first. Subjects are managed per level (e.g. all of Form 1)."
            layout="stack"
          >
            {setup.levels.length === 0 ? (
              <p className="text-sm text-slate-500">
                No academic levels yet. Add levels under School Management →
                Classes first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {setup.levels.map((level) => {
                  const selected = levelId === level.id;
                  const count = setup.subjects.filter(
                    (s) => s.academic_level_id === level.id,
                  ).length;
                  return (
                    <button
                      key={level.id}
                      type="button"
                      onClick={() => {
                        setLevelId(level.id);
                        if (editingId) {
                          setEditingId(null);
                          setName("");
                          setCoefficient("1");
                        }
                        setError("");
                        setSuccess("");
                      }}
                      className={`cursor-pointer rounded-xl border px-3.5 py-2 text-left text-sm transition ${
                        selected
                          ? "border-(--sofia-primary)/40 bg-(--sofia-primary)/5 font-semibold text-(--sofia-primary)"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <span className="block">{level.name}</span>
                      <span className="text-[10px] font-medium text-slate-400">
                        {count} subject{count === 1 ? "" : "s"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </FormSection>

          {levelId ? (
            <>
              <FormSection
                title={
                  editingId
                    ? "Edit Subject"
                    : `Add Subject — ${selectedLevelName}`
                }
                description={`Applies to classes in ${selectedLevelName}. All classes in the level are selected by default.`}
                layout="stack"
              >
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                  <FormField
                    label="Subject Name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Mathematics"
                  />
                  <label className="mb-4 block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Department{" "}
                      <span className="text-red-500" aria-hidden>
                        *
                      </span>
                    </span>
                    <select
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Select department</option>
                      {setup.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <FormField
                    label="Coefficient"
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={coefficient}
                    onChange={(e) => setCoefficient(e.target.value)}
                    hint="Weight used in averages (typically 1–3)."
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-700">
                      Classes in {selectedLevelName}{" "}
                      <span className="text-red-500" aria-hidden>
                        *
                      </span>
                    </p>
                    {levelClasses.length > 0 ? (
                      <button
                        type="button"
                        onClick={selectAllLevelClasses}
                        className="cursor-pointer text-xs font-semibold text-(--sofia-primary) hover:underline"
                      >
                        Select all
                      </button>
                    ) : null}
                  </div>
                  {levelClasses.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No classes for {selectedLevelName} yet. Create them under
                      School Management → Classes.
                    </p>
                  ) : (
                    <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                      {levelClasses.map((c) => {
                        const checked = classIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                              checked
                                ? "border-(--sofia-primary)/40 bg-(--sofia-primary)/5 font-medium text-(--sofia-primary)"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleClass(c.id)}
                              className="h-4 w-4 rounded border-slate-300 text-(--sofia-primary)"
                            />
                            {c.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving || levelClasses.length === 0}
                    onClick={() => void handleSubmit()}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  >
                    <Icon icon={Add01Icon} size={16} />
                    {saving
                      ? "Saving…"
                      : editingId
                        ? "Update Subject"
                        : "Add Subject"}
                  </button>
                  {editingId ? (
                    <button
                      type="button"
                      onClick={() => resetForm(true)}
                      className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </FormSection>

              <FormSection
                title={`Subjects — ${selectedLevelName}`}
                layout="stack"
              >
                {levelSubjects.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No subjects for {selectedLevelName} yet.
                  </p>
                ) : (
                  <ClientPaginatedTable
                    tableClassName="w-full text-left text-sm"
                    head={
                      <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Subject</th>
                          <th className="px-4 py-3">Department</th>
                          <th className="px-4 py-3">Coeff.</th>
                          <th className="px-4 py-3">Classes</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                    }
                  >
                    {levelSubjects.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {s.name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {s.department_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {s.coefficient}
                        </td>
                        <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                          {s.class_names.join(", ") || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <TableActionGroup>
                            <TableIconButton
                              icon={PencilEdit01Icon}
                              label={`Edit ${s.name}`}
                              onClick={() => startEdit(s)}
                            />
                            <TableIconButton
                              icon={Delete02Icon}
                              label={`Delete ${s.name}`}
                              tone="danger"
                              onClick={() => void handleDelete(s.id)}
                            />
                          </TableActionGroup>
                        </td>
                      </tr>
                    ))}
                  </ClientPaginatedTable>
                )}
              </FormSection>
            </>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
