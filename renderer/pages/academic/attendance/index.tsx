import React from "react";
import Link from "next/link";
import { Add01Icon, ChartLineData01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { Icon } from "../../../components/ui/Icon";
import {
  fetchAcademicMeta,
  fetchAttendanceSessions,
  type AcademicMeta,
  type AttendanceSessionDto,
} from "../../../lib/academic-mgmt";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

function formatDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
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

  return (
    <AppShell
      title="Attendance"
      breadcrumb={["Academic Management", "Attendance"]}
      heading="Attendance"
      subtitle="View sessions and take daily attendance."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

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
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3 text-center">Present</th>
                <th className="px-4 py-3 text-center">Absent</th>
                <th className="px-4 py-3 text-center">Total</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No attendance sessions match these filters.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
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
                      <Link
                        href={`/academic/attendance/take?class_id=${encodeURIComponent(s.class_id)}&date=${encodeURIComponent(s.session_date)}`}
                        className="text-sm font-medium text-(--sofia-primary) hover:underline"
                      >
                        Edit
                      </Link>
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
