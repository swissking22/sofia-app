import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  fetchAcademicMeta,
  fetchAttendanceReport,
  type AcademicMeta,
} from "../../../lib/academic-mgmt";
import { ClientPaginatedTable } from "../../../components/ui/table-pagination";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

function monthStartIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AttendanceReportPage() {
  const router = useRouter();
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [classId, setClassId] = React.useState("");
  const [fromDate, setFromDate] = React.useState(monthStartIso());
  const [toDate, setToDate] = React.useState(todayIso());
  const [rows, setRows] = React.useState<
    Array<{
      student_id: string;
      student_name: string;
      student_code: string | null;
      present: number;
      absent: number;
      late: number;
      excused: number;
      total: number;
      rate: number;
    }>
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAcademicMeta();
      if (res.ok) {
        setMeta(res.data);
        const qClass =
          typeof router.query.class_id === "string"
            ? router.query.class_id
            : "";
        const initial =
          qClass && res.data.classes.some((c) => c.id === qClass)
            ? qClass
            : (res.data.classes[0]?.id ?? "");
        setClassId(initial);
      } else {
        setError(res.error);
        setLoading(false);
      }
    })();
  }, [router.query.class_id]);

  const loadReport = React.useCallback(async () => {
    if (!classId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetchAttendanceReport({
      class_id: classId,
      from_date: fromDate || null,
      to_date: toDate || null,
    });
    if (res.ok) setRows(res.data.rows);
    else setError(res.error);
    setLoading(false);
  }, [classId, fromDate, toDate]);

  React.useEffect(() => {
    if (!meta) return;
    void loadReport();
  }, [meta, loadReport]);

  const summary = React.useMemo(() => {
    if (!rows.length) {
      return { avgRate: 0, totalPresent: 0, totalAbsent: 0, studentCount: 0 };
    }
    const avgRate = rows.reduce((sum, r) => sum + r.rate, 0) / rows.length;
    const totalPresent = rows.reduce((sum, r) => sum + r.present, 0);
    const totalAbsent = rows.reduce((sum, r) => sum + r.absent, 0);
    return {
      avgRate,
      totalPresent,
      totalAbsent,
      studentCount: rows.length,
    };
  }, [rows]);

  function rateColor(rate: number) {
    if (rate >= 90) return "text-emerald-600";
    if (rate >= 75) return "text-amber-600";
    return "text-red-600";
  }

  return (
    <AppShell
      title="Attendance report"
      breadcrumb={["Academic Management", "Attendance", "Report"]}
      heading="Attendance report"
      subtitle="Per-student attendance summary for a date range."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="block text-xs font-medium text-slate-500">
          Class
          <select
            className={`mt-1 block min-w-44 ${selectClass}`}
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">Select class…</option>
            {(meta?.classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-500">
          From
          <input
            type="date"
            className={`mt-1 block ${selectClass}`}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          To
          <input
            type="date"
            className={`mt-1 block ${selectClass}`}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </label>
      </div>

      {!loading && rows.length > 0 ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Average attendance rate
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${rateColor(summary.avgRate)}`}
            >
              {summary.avgRate.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total present marks
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {summary.totalPresent}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Students tracked
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-800">
              {summary.studentCount}
            </p>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading report…</p>
      ) : !classId ? (
        <p className="text-sm text-slate-500">
          Select a class to view the report.
        </p>
      ) : (
        <ClientPaginatedTable
          head={
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Student ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-center">Present</th>
                <th className="px-4 py-3 text-center">Absent</th>
                <th className="px-4 py-3 text-center">Late</th>
                <th className="px-4 py-3 text-center">Excused</th>
                <th className="px-4 py-3 text-center">Total</th>
                <th className="px-4 py-3 text-center">Rate</th>
              </tr>
            </thead>
          }
        >
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                No attendance data for this range.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.student_id} className="hover:bg-slate-50/80">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">
                  {r.student_code || "—"}
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {r.student_name}
                </td>
                <td className="px-4 py-3 text-center text-emerald-600">
                  {r.present}
                </td>
                <td className="px-4 py-3 text-center text-red-600">
                  {r.absent}
                </td>
                <td className="px-4 py-3 text-center text-amber-600">
                  {r.late}
                </td>
                <td className="px-4 py-3 text-center text-sky-600">
                  {r.excused}
                </td>
                <td className="px-4 py-3 text-center text-slate-600">
                  {r.total}
                </td>
                <td
                  className={`px-4 py-3 text-center font-semibold ${rateColor(r.rate)}`}
                >
                  {r.rate.toFixed(1)}%
                </td>
              </tr>
            ))
          )}
        </ClientPaginatedTable>
      )}
    </AppShell>
  );
}
