import React from "react";
import Link from "next/link";
import { AppShell } from "../../components/layout/AppShell";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  StatusBadge,
  StudentTable,
  TableSelectionBar,
  selectClass,
  useDebouncedValue,
} from "../../components/students/ui";
import {
  bulkUpdateStudentStatus,
  downloadCsv,
  fetchAlumni,
  STATUS_LABELS,
  type StudentDto,
  type StudentStatus,
} from "../../lib/student-mgmt";

export default function AlumniPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [rows, setRows] = React.useState<StudentDto[]>([]);
  const [year, setYear] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    const res = await fetchAlumni();
    if (res.ok) setRows(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const years = React.useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) {
      if (r.admission_year) set.add(r.admission_year);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (year && String(r.admission_year) !== year) return false;
    if (!debouncedSearch.trim()) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.student_code || "").toLowerCase().includes(q)
    );
  });

  const allSelected =
    filtered.length > 0 && selected.length === filtered.length;

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    if (allSelected) setSelected([]);
    else setSelected(filtered.map((s) => s.id));
  }

  function exportSelected() {
    const target = filtered.filter((s) => selected.includes(s.id));
    if (!target.length) return;
    const csv = [
      ["Student ID", "Name", "Last Class", "Level", "Admission Year", "Status"].join(","),
      ...target.map((s) =>
        [
          `"${s.student_code || ""}"`,
          `"${s.name}"`,
          `"${s.class_name || ""}"`,
          `"${s.level_name || ""}"`,
          s.admission_year ?? "",
          `"${s.status}"`,
        ].join(","),
      ),
    ].join("\n");
    downloadCsv(`alumni-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  async function bulkReactivate() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await bulkUpdateStudentStatus(selected, "active" as StudentStatus);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Reactivated ${res.data.updated} student(s) to active status.`);
      setSelected([]);
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Alumni"
      breadcrumb={["Student Management", "Alumni"]}
      heading="Alumni"
      subtitle="Former students marked as alumni."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={
          <>
            <FilterField label="Admission year">
              <select
                className={selectClass}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Search" className="min-w-48 flex-1">
              <input
                className={selectClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or student ID"
              />
            </FilterField>
          </>
        }
      />

      <StudentTable
        columns={[
          <input
            key="select-all-header"
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = selected.length > 0 && !allSelected;
            }}
            onChange={toggleAll}
            aria-label="Select all"
          />,
          "Student ID",
          "Name",
          "Last class",
          "Level",
          "Year",
          "Status",
        ]}
        loading={loading}
      >
        {filtered.length === 0 ? (
          <EmptyRow colSpan={7}>
            {rows.length === 0 ? (
              <>
                No alumni yet. Mark students as alumni from the{" "}
                <Link
                  href="/students"
                  className="font-semibold text-(--sofia-primary) hover:underline"
                >
                  students list
                </Link>{" "}
                or profile.
              </>
            ) : (
              "No alumni match these filters."
            )}
          </EmptyRow>
        ) : (
          filtered.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={() => toggle(s.id)}
                />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">
                {s.student_code || "—"}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/students/${s.id}`}
                  className="font-medium text-(--sofia-primary) hover:underline"
                >
                  {s.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {s.class_name || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {s.level_name || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {s.admission_year ?? "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={s.status}
                  label={STATUS_LABELS[s.status] ?? s.status}
                />
              </td>
            </tr>
          ))
        )}
      </StudentTable>

      <TableSelectionBar
        totalCount={filtered.length}
        selectedCount={selected.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setSelected([])}
        actions={
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void bulkReactivate()}
              className="cursor-pointer rounded-lg bg-(--sofia-primary) px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              Reactivate selected ({selected.length})
            </button>
            <button
              type="button"
              onClick={exportSelected}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export selected ({selected.length})
            </button>
          </>
        }
      />
    </AppShell>
  );
}
