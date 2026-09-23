import React from "react";
import Link from "next/link";
import { Add01Icon, ChartLineData01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { Icon } from "../../../components/ui/Icon";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import { ClientPaginatedTable } from "../../../components/ui/table-pagination";
import {
  fetchAcademicMeta,
  fetchAttendanceSessions,
  type AcademicMeta,
  type AttendanceSessionDto,
} from "../../../lib/academic-mgmt";
import { TableSelectionBar } from "../../../components/students/ui";

import { formatDisplayDateWithWeekday } from "../../../lib/date-format";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

function formatDate(iso: string) {
  return formatDisplayDateWithWeekday(iso, iso);
}

export default function AttendanceIndexPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [sessions, setSessions] = React.useState<AttendanceSessionDto[]>([]);
  const [classId, setClassId] = React.useState("");
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAcademicMeta();
      if (res.ok) setMeta(res.data);
      else setError(res.error);
    })();
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetchAttendanceSessions(classId || null);
    if (res.ok) setSessions(res.data);
    else setError(res.error);
    setLoading(false);
  }, [classId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        (s.class_name ?? "").toLowerCase().includes(q) ||
        s.session_date.includes(q) ||
        formatDate(s.session_date).toLowerCase().includes(q),
    );
  }, [sessions, search]);

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
    else setSelectedIds(filtered.map((s) => s.id));
  }
  function exportSelected() {
    const target = filtered.filter((s) => selectedIds.includes(s.id));
    if (!target.length) return;
    const csv = [
      ["Date", "Class", "Present", "Absent", "Total"].join(","),
      ...target.map((s) =>
        [
          `"${formatDate(s.session_date)}"`,
          `"${s.class_name || ""}"`,
          s.present,
          s.absent,
          s.total,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title="Attendance"
      breadcrumb={["Academic Management", "Attendance"]}
      heading="Attendance"
      subtitle="Class sessions and entrance Gate Scanner."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/academic/attendance/gate-scanner"
          className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 transition hover:border-sky-300"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            Entrance
          </p>
          <p className="mt-1 text-base font-bold text-slate-900">Gate Scanner</p>
          <p className="mt-1 text-xs text-slate-500">
            USB QR scanner check-in for student ID cards.
          </p>
        </Link>
        <Link
          href="/academic/attendance/take"
          className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Classroom
          </p>
          <p className="mt-1 text-base font-bold text-slate-900">Take attendance</p>
          <p className="mt-1 text-xs text-slate-500">
            Mark present / absent / late / excused by class.
          </p>
        </Link>
        <Link
          href="/academic/attendance/report"
          className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Reports
          </p>
          <p className="mt-1 text-base font-bold text-slate-900">Class report</p>
          <p className="mt-1 text-xs text-slate-500">
            Per-student rates for a class and date range.
          </p>
        </Link>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <label className="block text-xs font-medium text-slate-500">
            Class
            <select
              className={`mt-1 block min-w-40 ${selectClass}`}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">All classes</option>
              {(meta?.classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
              placeholder="Class or date"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={
              classId
                ? `/academic/attendance/report?class_id=${encodeURIComponent(classId)}`
                : "/academic/attendance/report"
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            <Icon icon={ChartLineData01Icon} size={16} />
            Report
          </Link>
          <Link
            href={
              classId
                ? `/academic/attendance/take?class_id=${encodeURIComponent(classId)}`
                : "/academic/attendance/take"
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Icon icon={Add01Icon} size={16} />
            Take attendance
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading sessions…</p>
      ) : (
        <>
          <ClientPaginatedTable
            head={
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
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3 text-center">Present</th>
                  <th className="px-4 py-3 text-center">Absent</th>
                  <th className="px-4 py-3 text-center">Total</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
            }
          >
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No attendance sessions match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggleRow(s.id)}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDate(s.session_date)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {s.class_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-emerald-600">
                    {s.present}
                  </td>
                  <td className="px-4 py-3 text-center text-red-600">
                    {s.absent}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">
                    {s.total}
                  </td>
                  <td className="px-4 py-3">
                    <TableActionGroup>
                      <TableIconButton
                        icon={PencilEdit01Icon}
                        label="Edit attendance"
                        tone="primary"
                        href={`/academic/attendance/take?class_id=${encodeURIComponent(s.class_id)}&date=${encodeURIComponent(s.session_date)}`}
                      />
                    </TableActionGroup>
                  </td>
                </tr>
              ))
            )}
          </ClientPaginatedTable>

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
    </AppShell>
  );
}
