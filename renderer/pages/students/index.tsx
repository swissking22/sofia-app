import React from "react";
import Link from "next/link";
import { Add01Icon, Upload04Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../components/layout/AppShell";
import { Icon } from "../../components/ui/Icon";
import {
  bulkUpdateStudentStatus,
  deleteStudent,
  fetchStudentList,
  STATUS_LABELS,
  type StudentDto,
  type StudentListResult,
} from "../../lib/student-mgmt";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function StudentsIndexPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [data, setData] = React.useState<StudentListResult | null>(null);
  const [year, setYear] = React.useState("");
  const [levelId, setLevelId] = React.useState("");
  const [sectionId, setSectionId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await fetchStudentList({
      status: "active",
      admissionYear: year ? Number(year) : null,
      academicLevelId: levelId || null,
      sectionId: sectionId || null,
      search: search || null,
    });
    if (res.ok) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, [year, levelId, sectionId, search]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAll(students: StudentDto[]) {
    if (selected.length === students.length) setSelected([]);
    else setSelected(students.map((s) => s.id));
  }

  async function runBulk(action: "alumni" | "delete") {
    setError("");
    setSuccess("");
    if (!selected.length) return;
    if (action === "alumni") {
      const res = await bulkUpdateStudentStatus(selected, "alumni");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Marked ${res.data.updated} student(s) as alumni.`);
    } else {
      for (const id of selected) {
        const res = await deleteStudent(id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }
      setSuccess(`Removed ${selected.length} student(s).`);
    }
    setSelected([]);
    setBulkOpen(false);
    await load();
  }

  const students = data?.students ?? [];

  return (
    <AppShell
      title="Students"
      breadcrumb={["Student Management", "Students"]}
      heading="Students"
      subtitle="Browse, filter, and manage enrolled students."
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
            Year
            <select
              className={`mt-1 block ${selectClass}`}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="">All years</option>
              {(data?.filters.years ?? []).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Level
            <select
              className={`mt-1 block ${selectClass}`}
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
            >
              <option value="">All levels</option>
              {(data?.filters.levels ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Department
            <select
              className={`mt-1 block ${selectClass}`}
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">All departments</option>
              {(data?.filters.sections ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-48 flex-1 text-xs font-medium text-slate-500">
            Search
            <input
              className={`mt-1 block w-full ${selectClass}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or student ID"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              Bulk ({selected.length})
            </button>
          ) : null}
          <Link
            href="/setup/students"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            <Icon icon={Upload04Icon} size={16} />
            Import
          </Link>
          <Link
            href="/students/create"
            className="inline-flex items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Icon icon={Add01Icon} size={16} />
            Add student
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading students…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      students.length > 0 && selected.length === students.length
                    }
                    onChange={() => toggleAll(students)}
                  />
                </th>
                <th className="px-4 py-3">Student ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No students match these filters.
                  </td>
                </tr>
              ) : (
                students.map((s) => (
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

      {bulkOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              Bulk actions
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {selected.length} student(s) selected.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void runBulk("alumni")}
                className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-(--sofia-primary)"
              >
                Mark as alumni
              </button>
              <button
                type="button"
                onClick={() => void runBulk("delete")}
                className="cursor-pointer rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                Delete selected
              </button>
              <button
                type="button"
                onClick={() => setBulkOpen(false)}
                className="cursor-pointer rounded-xl px-4 py-2 text-sm font-medium text-slate-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
