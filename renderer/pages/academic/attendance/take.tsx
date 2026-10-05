import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  ATTENDANCE_MARKS,
  fetchAcademicMeta,
  fetchAttendanceRoster,
  saveAttendance,
  type AcademicMeta,
  type AttendanceMark,
} from "../../../lib/academic-mgmt";
import { ClientPaginatedTable } from "../../../components/ui/table-pagination";
import { TableSelectionBar } from "../../../components/students/ui";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const markButtonClass: Record<AttendanceMark, string> = {
  present: "border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-300",
  absent: "border-red-200 bg-red-50 text-red-700 ring-red-300",
  late: "border-amber-200 bg-amber-50 text-amber-700 ring-amber-300",
  excused: "border-sky-200 bg-sky-50 text-sky-700 ring-sky-300",
};

export default function AttendanceTakePage() {
  const router = useRouter();
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [classId, setClassId] = React.useState("");
  const [sessionDate, setSessionDate] = React.useState(todayIso());
  const [students, setStudents] = React.useState<
    Array<{
      id: string;
      name: string;
      student_code: string | null;
      status: AttendanceMark | null;
    }>
  >([]);
  const [marks, setMarks] = React.useState<Record<string, AttendanceMark>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const allSelected =
    students.length > 0 && selectedIds.length === students.length;
  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(students.map((s) => s.id));
  }
  function markSelected(mark: AttendanceMark) {
    setMarks((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        next[id] = mark;
      }
      return next;
    });
  }
  function clearSelectedMarks() {
    setMarks((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        delete next[id];
      }
      return next;
    });
  }
  function exportSelected() {
    const target = students.filter((s) => selectedIds.includes(s.id));
    if (!target.length) return;
    const csv = [
      ["Student ID", "Name", "Attendance Status"].join(","),
      ...target.map((s) =>
        [
          `"${s.student_code || ""}"`,
          `"${s.name}"`,
          `"${marks[s.id] ?? s.status ?? ""}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${sessionDate}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAcademicMeta();
      if (res.ok) {
        setMeta(res.data);
        const qClass =
          typeof router.query.class_id === "string"
            ? router.query.class_id
            : "";
        const qDate =
          typeof router.query.date === "string"
            ? router.query.date
            : todayIso();
        setSessionDate(qDate);
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
  }, [router.query.class_id, router.query.date]);

  const loadRoster = React.useCallback(async (cid: string, date: string) => {
    if (!cid || !date) {
      setStudents([]);
      setMarks({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetchAttendanceRoster({
      class_id: cid,
      session_date: date,
    });
    if (res.ok) {
      setStudents(res.data.students);
      const initial: Record<string, AttendanceMark> = {};
      for (const s of res.data.students) {
        if (s.status) initial[s.id] = s.status;
      }
      setMarks(initial);
    } else {
      setError(res.error);
      setStudents([]);
      setMarks({});
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (!classId || !sessionDate) return;
    void loadRoster(classId, sessionDate);
  }, [classId, sessionDate, loadRoster]);

  function setMark(studentId: string, status: AttendanceMark) {
    setMarks((prev) => ({ ...prev, [studentId]: status }));
    setSuccess("");
  }

  function markAllPresent() {
    const next: Record<string, AttendanceMark> = {};
    for (const s of students) {
      next[s.id] = "present";
    }
    setMarks(next);
    setSuccess("");
  }

  async function handleSave() {
    if (!classId || !sessionDate) {
      setError("Class and date are required.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    const markList = students.map((s) => ({
      student_id: s.id,
      status: marks[s.id] ?? ("absent" as AttendanceMark),
    }));
    const res = await saveAttendance({
      class_id: classId,
      session_date: sessionDate,
      marks: markList,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(`Saved attendance for ${res.data.saved} student(s).`);
    await loadRoster(classId, sessionDate);
  }

  function handleClassChange(cid: string) {
    setClassId(cid);
    void router.replace(
      {
        pathname: "/academic/attendance/take",
        query: { class_id: cid, date: sessionDate },
      },
      undefined,
      { shallow: true },
    );
  }

  function handleDateChange(date: string) {
    setSessionDate(date);
    void router.replace(
      {
        pathname: "/academic/attendance/take",
        query: { class_id: classId, date },
      },
      undefined,
      { shallow: true },
    );
  }

  return (
    <AppShell
      title="Take attendance"
      breadcrumb={["Academic Management", "Attendance", "Take"]}
      heading="Take attendance"
      subtitle="Mark each student quickly — use Mark all present, then adjust exceptions."
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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <label className="block text-xs font-medium text-slate-500">
            Class
            <select
              className={`mt-1 block min-w-44 ${selectClass}`}
              value={classId}
              onChange={(e) => handleClassChange(e.target.value)}
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
            Date
            <input
              type="date"
              className={`mt-1 block ${selectClass}`}
              value={sessionDate}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={markAllPresent}
            disabled={!students.length || loading}
            className="cursor-pointer rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 disabled:opacity-50"
          >
            Mark all present
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !students.length || loading}
            className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save attendance"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading roster…</p>
      ) : !classId ? (
        <p className="text-sm text-slate-500">Select a class to begin.</p>
      ) : students.length === 0 ? (
        <p className="text-sm text-slate-500">No students in this class.</p>
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
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
            }
          >
            {students.map((s) => {
              const current = marks[s.id];
              return (
                <tr key={s.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggleRow(s.id)}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {s.student_code || "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {s.name}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {ATTENDANCE_MARKS.map((m) => {
                        const selected = current === m.key;
                        return (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => setMark(s.id, m.key)}
                            className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 ${
                              selected
                                ? `${markButtonClass[m.key]} ring-2`
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </ClientPaginatedTable>

          <TableSelectionBar
            totalCount={students.length}
            selectedCount={selectedIds.length}
            allSelected={allSelected}
            onToggleAll={toggleAll}
            onClear={() => setSelectedIds([])}
            actions={
              <>
                <button
                  type="button"
                  onClick={() => markSelected("present")}
                  className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Mark Present ({selectedIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => markSelected("late")}
                  className="cursor-pointer rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600"
                >
                  Mark Late ({selectedIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => markSelected("absent")}
                  className="cursor-pointer rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Mark Absent ({selectedIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => markSelected("excused")}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Mark Excused ({selectedIds.length})
                </button>
                <button
                  type="button"
                  onClick={clearSelectedMarks}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  Clear marks
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
    </AppShell>
  );
}
