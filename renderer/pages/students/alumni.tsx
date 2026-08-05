import React from "react";
import Link from "next/link";
import { AppShell } from "../../components/layout/AppShell";
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
    if (!search.trim()) return true;
    const q = search.toLowerCase();
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
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="block text-xs font-medium text-slate-500">
          Admission year
          <select
            className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15"
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
        </label>
        <label className="block min-w-48 flex-1 text-xs font-medium text-slate-500">
          Search
          <input
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or student ID"
          />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading alumni…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Student ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Last class</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No alumni yet. Mark students as alumni from the students
                    list or profile.
                  </td>
                </tr>
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
                    <td className="px-4 py-3 text-slate-600">
                      {STATUS_LABELS[s.status] ?? s.status}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
