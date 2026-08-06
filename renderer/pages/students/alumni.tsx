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
  selectClass,
  useDebouncedValue,
} from "../../components/students/ui";
import {
  fetchAlumni,
  STATUS_LABELS,
  type StudentDto,
} from "../../lib/student-mgmt";

export default function AlumniPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [rows, setRows] = React.useState<StudentDto[]>([]);
  const [year, setYear] = React.useState("");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAlumni();
      if (res.ok) setRows(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, []);

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

  return (
    <AppShell
      title="Alumni"
      breadcrumb={["Student Management", "Alumni"]}
      heading="Alumni"
      subtitle="Former students marked as alumni."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

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
          <EmptyRow colSpan={6}>
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
    </AppShell>
  );
}
