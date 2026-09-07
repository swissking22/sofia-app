import React from "react";
import { Add01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField } from "../../../components/setup";
import { Icon } from "../../../components/ui/Icon";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import {
  createCaAssessment,
  fetchAcademicMeta,
  fetchCaList,
  type AcademicMeta,
  type CaAssessmentDto,
} from "../../../lib/academic-mgmt";
import { TableSelectionBar } from "../../../components/students/ui";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CaIndexPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [assessments, setAssessments] = React.useState<CaAssessmentDto[]>([]);
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [classFilter, setClassFilter] = React.useState("");
  const [subjectFilter, setSubjectFilter] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [weight, setWeight] = React.useState("20");
  const [maxScore, setMaxScore] = React.useState("20");
  const [assessmentDate, setAssessmentDate] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    const [listRes, metaRes] = await Promise.all([
      fetchCaList(),
      fetchAcademicMeta(),
    ]);
    if (listRes.ok) setAssessments(listRes.data);
    else setError(listRes.error);
    if (metaRes.ok) setMeta(metaRes.data);
    else if (!listRes.ok) setError(metaRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const subjectOptions = React.useMemo(() => {
    if (!meta) return [];
    if (!classFilter) return meta.subjects;
    return meta.subjects.filter((s) => s.class_ids.includes(classFilter));
  }, [meta, classFilter]);

  const filtered = React.useMemo(() => {
    return assessments.filter((a) => {
      if (classFilter && a.class_id !== classFilter) return false;
      if (subjectFilter && a.subject_id !== subjectFilter) return false;
      return true;
    });
  }, [assessments, classFilter, subjectFilter]);

  const formSubjects = React.useMemo(() => {
    if (!meta) return [];
    if (!classId) return meta.subjects;
    return meta.subjects.filter((s) => s.class_ids.includes(classId));
  }, [meta, classId]);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const allSelected =
    filtered.length > 0 && selectedIds.length === filtered.length;
  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(filtered.map((a) => a.id));
  }
  function exportSelected() {
    const target = filtered.filter((a) => selectedIds.includes(a.id));
    if (!target.length) return;
    const csv = [
      ["Assessment", "Subject", "Class", "Weight %", "Max Score", "Date"].join(","),
      ...target.map((a) =>
        [
          `"${a.name}"`,
          `"${a.subject_name || ""}"`,
          `"${a.class_name || ""}"`,
          a.weight_percent,
          a.max_score,
          `"${formatDate(a.assessment_date)}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ca-assessments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetForm() {
    setName("");
    setSubjectId("");
    setClassId("");
    setTermId("");
    setWeight("20");
    setMaxScore("20");
    setAssessmentDate("");
  }

  function openCreate() {
    resetForm();
    setCreateOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!name.trim()) {
      setError("Assessment name is required.");
      return;
    }
    if (!subjectId || !classId) {
      setError("Subject and class are required.");
      return;
    }
    const weightNum = Number(weight);
    const maxNum = Number(maxScore);
    if (!weightNum || weightNum <= 0 || weightNum > 100) {
      setError("Weight must be between 1 and 100.");
      return;
    }
    if (!maxNum || maxNum <= 0) {
      setError("Max score must be greater than zero.");
      return;
    }

    setSaving(true);
    try {
      const res = await createCaAssessment({
        name: name.trim(),
        subject_id: subjectId,
        class_id: classId,
        term_id: termId || null,
        weight_percent: weightNum,
        max_score: maxNum,
        assessment_date: assessmentDate || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Assessment created.");
      setCreateOpen(false);
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Continuous Assessment"
      breadcrumb={["Academic Management", "Continuous Assessment"]}
      heading="Continuous Assessment"
      subtitle="Manage CA assessments and enter student scores."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <label className="block text-xs font-medium text-slate-500">
            Class
            <select
              className={`mt-1 block ${selectClass}`}
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setSubjectFilter("");
              }}
            >
              <option value="">All classes</option>
              {(meta?.classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Subject
            <select
              className={`mt-1 block ${selectClass}`}
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="">All subjects</option>
              {subjectOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Icon icon={Add01Icon} size={16} />
          Add assessment
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading assessments…</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            selectedIds.length > 0 && !allSelected;
                      }}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Weight %</th>
                  <th className="px-4 py-3">Max score</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No assessments match these filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(a.id)}
                          onChange={() => toggleRow(a.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {a.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {a.subject_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {a.class_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {a.weight_percent}%
                      </td>
                      <td className="px-4 py-3 text-slate-600">{a.max_score}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(a.assessment_date)}
                      </td>
                      <td className="px-4 py-3">
                        <TableActionGroup>
                          <TableIconButton
                            icon={PencilEdit01Icon}
                            label="Enter scores"
                            tone="primary"
                            href={`/academic/ca/entry?assessment_id=${a.id}`}
                          />
                        </TableActionGroup>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <TableSelectionBar
            totalCount={filtered.length}
            selectedCount={selectedIds.length}
            allSelected={allSelected}
            onToggleAll={toggleAll}
            onClear={() => setSelectedIds([])}
            actions={
              <button
                type="button"
                onClick={exportSelected}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Export selected ({selectedIds.length})
              </button>
            }
          />
        </>
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              Add CA assessment
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Create a new continuous assessment for a class and subject.
            </p>

            <form
              onSubmit={(e) => void handleCreate(e)}
              className="mt-4 space-y-1"
            >
              <FormField
                label="Name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Test 1, Quiz 2"
                fullWidth
              />
              <label className="mb-4 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Class <span className="text-red-500">*</span>
                </span>
                <select
                  className={fieldClass}
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setSubjectId("");
                  }}
                  required
                >
                  <option value="">Select class…</option>
                  {(meta?.classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mb-4 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Subject <span className="text-red-500">*</span>
                </span>
                <select
                  className={fieldClass}
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  required
                  disabled={!classId}
                >
                  <option value="">Select subject…</option>
                  {formSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mb-4 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Term
                </span>
                <select
                  className={fieldClass}
                  value={termId}
                  onChange={(e) => setTermId(e.target.value)}
                >
                  <option value="">Select term…</option>
                  {(meta?.terms ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <FormField
                label="Weight %"
                type="number"
                min={1}
                max={100}
                required
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <FormField
                label="Max score"
                type="number"
                min={1}
                required
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
              />
              <FormField
                label="Date"
                type="date"
                value={assessmentDate}
                onChange={(e) => setAssessmentDate(e.target.value)}
                fullWidth
              />

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={saving}
                  className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Create assessment"}
                </button>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
