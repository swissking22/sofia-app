import React from "react";
import Link from "next/link";
import { AppShell } from "../../../../components/layout/AppShell";
import {
  fetchSubjectCoefficients,
  saveSubjectCoefficients,
  type SubjectCoefficientItem,
} from "../../../../lib/results-calc";
import { fetchAcademicMeta } from "../../../../lib/academic-mgmt";
import { ClientPaginatedTable } from "../../../../components/ui/table-pagination";
import { TableSelectionBar } from "../../../../components/students/ui";

export default function SubjectCoefficientsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [classes, setClasses] = React.useState<Array<{ id: string; name: string }>>([]);
  const [years, setYears] = React.useState<Array<{ id: string; name: string }>>([]);

  const [selectedClassId, setSelectedClassId] = React.useState<string>("");
  const [selectedYearId, setSelectedYearId] = React.useState<string>("");

  const [coefficients, setCoefficients] = React.useState<SubjectCoefficientItem[]>([]);
  const [editMode, setEditMode] = React.useState(false);
  const [editingValues, setEditingValues] = React.useState<Record<string, number>>({});
  const [saving, setSaving] = React.useState(false);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const allSelected =
    coefficients.length > 0 && selectedIds.length === coefficients.length;
  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(coefficients.map((c) => c.subject_id));
  }
  function exportSelected() {
    const target = coefficients.filter((c) => selectedIds.includes(c.subject_id));
    if (!target.length) return;
    const csv = [
      ["Subject", "Code", "Department", "Coefficient", "Scope"].join(","),
      ...target.map((c) =>
        [
          `"${c.subject_name}"`,
          `"${c.subject_code || ""}"`,
          `"${c.department_name || "General"}"`,
          editingValues[c.subject_id] ?? c.effective_coefficient,
          `"${c.override_scope}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subject-coefficients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function bulkSetCoefficient(val: number) {
    setEditingValues((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        next[id] = val;
      }
      return next;
    });
    if (!editMode) setEditMode(true);
  }

  const loadData = React.useCallback(async () => {
    setError("");
    const [metaRes, coeffRes] = await Promise.all([
      fetchAcademicMeta(),
      fetchSubjectCoefficients({
        class_id: selectedClassId || null,
        academic_year_id: selectedYearId || null,
      }),
    ]);

    if (metaRes.ok) {
      setClasses(metaRes.data.classes);
      if (metaRes.data.academic_year) {
        setYears([metaRes.data.academic_year]);
      }
    }

    if (coeffRes.ok) {
      setCoefficients(coeffRes.data);
      const initialMap: Record<string, number> = {};
      for (const item of coeffRes.data) {
        initialMap[item.subject_id] = item.effective_coefficient;
      }
      setEditingValues(initialMap);
    } else {
      setError(coeffRes.error);
    }
  }, [selectedClassId, selectedYearId]);

  React.useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  function handleCoefficientChange(subjectId: string, val: string) {
    const num = parseFloat(val);
    setEditingValues((prev) => ({
      ...prev,
      [subjectId]: isNaN(num) ? 1 : num,
    }));
  }

  async function handleSaveAll() {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const itemsToSave = coefficients.map((item) => ({
        subject_id: item.subject_id,
        class_id: selectedClassId || null,
        academic_year_id: selectedYearId || null,
        coefficient: editingValues[item.subject_id] ?? item.effective_coefficient ?? 1,
      }));

      const res = await saveSubjectCoefficients(itemsToSave);
      if (!res.ok) {
        setError(res.error);
        return;
      }

      setSuccess("Subject coefficients saved successfully.");
      setEditMode(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    const initialMap: Record<string, number> = {};
    for (const item of coefficients) {
      initialMap[item.subject_id] = item.effective_coefficient;
    }
    setEditingValues(initialMap);
    setEditMode(false);
    setError("");
  }

  return (
    <AppShell
      title="Subject Coefficients"
      breadcrumb={[
        "Academic Management",
        "Results Processing",
        "Subject Coefficients",
      ]}
      heading="Subject Coefficients"
      subtitle="Define subject weighting coefficients used to compute weighted scores and term averages. Coefficients can be configured globally or overridden per class and academic year."
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

      {/* Scope Controls */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Scope / Class Override
              </label>
              <select
                className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-(--sofia-primary)"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                disabled={editMode}
              >
                <option value="">Global (School Default)</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    Class: {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Academic Year
              </label>
              <select
                className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-(--sofia-primary)"
                value={selectedYearId}
                onChange={(e) => setSelectedYearId(e.target.value)}
                disabled={editMode}
              >
                <option value="">All Academic Years</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!editMode ? (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="rounded-xl bg-(--sofia-primary) px-4 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95"
              >
                Edit Coefficients
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleCancelEdit}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveAll()}
                  className="rounded-xl bg-(--sofia-primary) px-4 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save All Changes"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Information banner */}
      <div className="mb-6 rounded-xl border border-sky-100 bg-sky-50/70 p-4 text-xs text-sky-900">
        <p className="font-semibold">Coefficient Application Hierarchy:</p>
        <p className="mt-1 text-sky-800">
          When Sofia computes results for a student, it resolves coefficients using:
          <span className="font-semibold"> Class + Academic Year</span> →
          <span className="font-semibold"> Class Specific</span> →
          <span className="font-semibold"> Academic Level</span> →
          <span className="font-semibold"> School Default (Global)</span> →
          <span className="font-semibold"> Base Subject Coefficient (or 1)</span>.
        </p>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-slate-500">Loading coefficients…</p>
      ) : (
        <>
          <ClientPaginatedTable
            wrapClassName="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
            head={
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3.5 text-center">
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
                  <th className="px-5 py-3.5">Subject</th>
                  <th className="px-4 py-3.5">Code</th>
                  <th className="px-4 py-3.5">Department</th>
                  <th className="px-4 py-3.5">Scope</th>
                  <th className="px-4 py-3.5 text-center">Coefficient</th>
                  <th className="px-5 py-3.5 text-right">Status</th>
                </tr>
              </thead>
            }
          >
            {coefficients.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                  No subjects found.
                </td>
              </tr>
            ) : (
              coefficients.map((item) => {
                const currentVal = editingValues[item.subject_id] ?? item.effective_coefficient;
                const isOverridden = item.override_scope === "class";

                return (
                  <tr
                    key={item.subject_id}
                    className={editMode ? "bg-amber-50/20" : "hover:bg-slate-50/60"}
                  >
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.subject_id)}
                        onChange={() => toggleRow(item.subject_id)}
                      />
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900">
                      {item.subject_name}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                      {item.subject_code || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {item.department_name || "General"}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {selectedClassId ? (
                        <span className="font-medium text-indigo-700">Class Override</span>
                      ) : (
                        <span className="text-slate-500">Global Default</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {editMode ? (
                        <input
                          type="number"
                          step={0.5}
                          min={0.1}
                          max={20}
                          className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center font-mono text-sm font-semibold text-slate-900 outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15"
                          value={currentVal}
                          onChange={(e) =>
                            handleCoefficientChange(item.subject_id, e.target.value)
                          }
                        />
                      ) : (
                        <span className="inline-block rounded-lg bg-slate-100 px-3 py-1 font-mono text-sm font-bold text-slate-800">
                          {item.effective_coefficient}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isOverridden
                            ? "border border-purple-200 bg-purple-50 text-purple-700"
                            : "border border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {isOverridden ? "Class Override" : "School Default"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </ClientPaginatedTable>

          <TableSelectionBar
            totalCount={coefficients.length}
            selectedCount={selectedIds.length}
            allSelected={allSelected}
            onToggleAll={toggleAll}
            onClear={() => setSelectedIds([])}
            actions={
              <>
                <button
                  type="button"
                  onClick={() => bulkSetCoefficient(1.0)}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Set to 1.0
                </button>
                <button
                  type="button"
                  onClick={() => bulkSetCoefficient(2.0)}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Set to 2.0
                </button>
                <button
                  type="button"
                  onClick={() => bulkSetCoefficient(3.0)}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Set to 3.0
                </button>
                <button
                  type="button"
                  onClick={exportSelected}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Export selected ({selectedIds.length})
                </button>
              </>
            }
          />
        </>
      )}

      <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
        <p>
          Need to change the calculation formula (CA/Exam weights, pass mark)?{" "}
          <Link
            href="/academic/results/calculation-settings"
            className="font-medium text-(--sofia-primary) hover:underline"
          >
            Calculation Settings
          </Link>
        </p>
        <Link
          href="/academic/results"
          className="font-medium text-(--sofia-primary) hover:underline"
        >
          Go to Results Processing →
        </Link>
      </div>
    </AppShell>
  );
}
