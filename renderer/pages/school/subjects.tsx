import React from "react";
import {
  Add01Icon,
  Delete02Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../components/layout/AppShell";
import { FormField, FormSection } from "../../components/setup";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  FormModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  selectClass,
  useDebouncedValue,
} from "../../components/students/ui";
import { Icon } from "../../components/ui/Icon";
import {
  TableActionGroup,
  TableIconButton,
} from "../../components/ui/TableActions";
import { ClientPaginatedTable } from "../../components/ui/table-pagination";
import {
  createSubject,
  deleteSubject,
  fetchSubjectsSetup,
  updateSubject,
  type SubjectDto,
  type SubjectsSetup,
} from "../../lib/subjects";

export default function SchoolSubjectsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [setup, setSetup] = React.useState<SubjectsSetup | null>(null);

  const [levelId, setLevelId] = React.useState("");
  const [deptFilter, setDeptFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 250);

  const [formOpen, setFormOpen] = React.useState(false);
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

  const filteredSubjects = React.useMemo(() => {
    if (!setup || !levelId) return [];
    const q = debouncedSearch.trim().toLowerCase();
    return setup.subjects.filter((s) => {
      if (s.academic_level_id !== levelId) return false;
      if (deptFilter && s.department_id !== deptFilter) return false;
      if (!q) return true;
      const hay =
        `${s.name} ${s.department_name ?? ""} ${s.class_names.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [setup, levelId, deptFilter, debouncedSearch]);

  const selectedLevelName =
    setup?.levels.find((l) => l.id === levelId)?.name ?? "this level";

  function resetForm(keepLevel = true) {
    setEditingId(null);
    setName("");
    setDepartmentId(setup?.departments[0]?.id ?? "");
    setCoefficient("1");
    setClassIds(
      keepLevel && levelId
        ? (setup?.classes
            .filter((c) => c.academic_level_id === levelId)
            .map((c) => c.id) ?? [])
        : [],
    );
  }

  function openCreate() {
    resetForm(true);
    setError("");
    setSuccess("");
    setFormOpen(true);
  }

  function startEdit(subject: SubjectDto) {
    setEditingId(subject.id);
    if (subject.academic_level_id) setLevelId(subject.academic_level_id);
    setName(subject.name);
    setDepartmentId(subject.department_id ?? "");
    setCoefficient(String(subject.coefficient));
    setClassIds(subject.class_ids);
    setError("");
    setSuccess("");
    setFormOpen(true);
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
      setFormOpen(false);
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
    if (editingId === id) {
      setFormOpen(false);
      resetForm(true);
    }
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
          {error ? <PageAlert tone="error">{error}</PageAlert> : null}
          {success ? <PageAlert tone="success">{success}</PageAlert> : null}

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
                        setDeptFilter("");
                        setSearch("");
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
              <FilterBar
                filters={
                  <>
                    <FilterField label="Search" className="min-w-48 flex-1">
                      <input
                        className={`w-full ${selectClass}`}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Subject, department, class"
                      />
                    </FilterField>
                    <FilterField label="Department">
                      <select
                        className={selectClass}
                        value={deptFilter}
                        onChange={(e) => setDeptFilter(e.target.value)}
                      >
                        <option value="">All departments</option>
                        {setup.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </FilterField>
                    <span className="self-end pb-2 text-sm text-slate-500">
                      {filteredSubjects.length} subject
                      {filteredSubjects.length === 1 ? "" : "s"}
                    </span>
                  </>
                }
                actions={
                  <PrimaryButton
                    onClick={openCreate}
                    disabled={levelClasses.length === 0}
                  >
                    <Icon icon={Add01Icon} size={16} />
                    Add new subject
                  </PrimaryButton>
                }
              />

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
                {filteredSubjects.length === 0 ? (
                  <EmptyRow
                    colSpan={5}
                    message={`No subjects for ${selectedLevelName} match these filters.`}
                  />
                ) : (
                  filteredSubjects.map((s) => (
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
                  ))
                )}
              </ClientPaginatedTable>
            </>
          ) : null}

          <FormModal
            open={formOpen}
            title={
              editingId
                ? `Edit subject — ${selectedLevelName}`
                : `Add subject — ${selectedLevelName}`
            }
            onClose={() => {
              if (saving) return;
              setFormOpen(false);
              resetForm(true);
            }}
            footer={
              <div className="flex justify-end gap-2">
                <SecondaryButton
                  disabled={saving}
                  onClick={() => {
                    setFormOpen(false);
                    resetForm(true);
                  }}
                >
                  Cancel
                </SecondaryButton>
                <PrimaryButton
                  disabled={saving || levelClasses.length === 0}
                  onClick={() => void handleSubmit()}
                >
                  {saving
                    ? "Saving…"
                    : editingId
                      ? "Update subject"
                      : "Add subject"}
                </PrimaryButton>
              </div>
            }
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
                  {(setup?.departments ?? []).map((d) => (
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
                <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
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
          </FormModal>
        </div>
      )}
    </AppShell>
  );
}
