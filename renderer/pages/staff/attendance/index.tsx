import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StaffTable,
  TableSelectionBar,
  selectClass,
} from "../../../components/staff/ui";
import {
  ATTENDANCE_LABELS,
  downloadCsv,
  exportAttendanceCsv,
  fetchAttendanceDay,
  fetchAttendanceHistory,
  fetchAttendanceMonth,
  fetchStaffMeta,
  fetchTeachers,
  saveAttendanceDay,
  type StaffAttendanceStatus,
  type StaffDto,
  type StaffMeta,
} from "../../../lib/staff-mgmt";

type TabKey = "daily" | "monthly" | "history";

type DayRow = {
  staff_id: string;
  full_name: string;
  employee_code: string | null;
  status: StaffAttendanceStatus | null;
  notes: string | null;
};

type MonthRow = {
  staff_id: string;
  full_name: string;
  present: number;
  absent: number;
  late: number;
  half_day: number;
};

type HistoryRecord = {
  id: string;
  date: string;
  status: StaffAttendanceStatus;
  notes: string | null;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Monthly" },
  { key: "history", label: "History" },
];

export default function TeacherAttendancePage() {
  const [tab, setTab] = React.useState<TabKey>("daily");
  const [meta, setMeta] = React.useState<StaffMeta | null>(null);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [date, setDate] = React.useState(todayIso);
  const [dayRows, setDayRows] = React.useState<DayRow[]>([]);
  const [dayLoading, setDayLoading] = React.useState(false);

  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [monthRows, setMonthRows] = React.useState<MonthRow[]>([]);
  const [monthLoading, setMonthLoading] = React.useState(false);

  const [teachers, setTeachers] = React.useState<StaffDto[]>([]);
  const [historyStaffId, setHistoryStaffId] = React.useState("");
  const [historyRecords, setHistoryRecords] = React.useState<HistoryRecord[]>(
    [],
  );
  const [historyLoading, setHistoryLoading] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      const [metaRes, teachersRes] = await Promise.all([
        fetchStaffMeta(),
        fetchTeachers({ status: "active" }),
      ]);
      if (metaRes.ok) setMeta(metaRes.data);
      if (teachersRes.ok) setTeachers(teachersRes.data.teachers);
    })();
  }, []);

  const loadDay = React.useCallback(async () => {
    if (!date) return;
    setDayLoading(true);
    setError("");
    const res = (await fetchAttendanceDay(date)) as Result<{
      date: string;
      rows: DayRow[];
    }>;
    if (res.ok) setDayRows(res.data.rows);
    else setError(res.error);
    setDayLoading(false);
  }, [date]);

  React.useEffect(() => {
    if (tab === "daily") void loadDay();
  }, [tab, loadDay]);

  const loadMonth = React.useCallback(async () => {
    setMonthLoading(true);
    setError("");
    const res = (await fetchAttendanceMonth(year, month)) as Result<{
      year: number;
      month: number;
      rows: MonthRow[];
    }>;
    if (res.ok) setMonthRows(res.data.rows);
    else setError(res.error);
    setMonthLoading(false);
  }, [year, month]);

  React.useEffect(() => {
    if (tab === "monthly") void loadMonth();
  }, [tab, loadMonth]);

  React.useEffect(() => {
    if (tab !== "history" || !historyStaffId) {
      setHistoryRecords([]);
      return;
    }
    void (async () => {
      setHistoryLoading(true);
      setError("");
      const res = (await fetchAttendanceHistory({
        staff_id: historyStaffId,
      })) as Result<{ records: HistoryRecord[] }>;
      if (res.ok) setHistoryRecords(res.data.records);
      else setError(res.error);
      setHistoryLoading(false);
    })();
  }, [tab, historyStaffId]);

  function setAllPresent() {
    setDayRows((prev) =>
      prev.map((r) => ({ ...r, status: "present" as const })),
    );
  }

  function setRowStatus(staffId: string, status: StaffAttendanceStatus | "") {
    setDayRows((prev) =>
      prev.map((r) =>
        r.staff_id === staffId
          ? { ...r, status: status || null }
          : r,
      ),
    );
  }

  async function saveDay() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const marks = dayRows
        .filter((r) => r.status)
        .map((r) => ({
          staff_id: r.staff_id,
          status: r.status as StaffAttendanceStatus,
          notes: r.notes,
        }));
      const res = (await saveAttendanceDay({
        date,
        marks,
      })) as Result<{ saved: number }>;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Saved ${res.data.saved} attendance mark(s).`);
      await loadDay();
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    setError("");
    try {
      const res = (await exportAttendanceCsv(year, month)) as Result<{
        filename: string;
        csv: string;
      }>;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      downloadCsv(res.data.filename, res.data.csv);
      setSuccess("CSV exported.");
    } finally {
      setBusy(false);
    }
  }

  const canManage = meta?.can_manage ?? false;
  const monthName = new Date(year, month - 1).toLocaleString(undefined, {
    month: "long",
  });

  const [selectedDay, setSelectedDay] = React.useState<string[]>([]);
  const allDaySelected =
    dayRows.length > 0 && selectedDay.length === dayRows.length;
  function toggleDay(id: string) {
    setSelectedDay((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAllDay() {
    if (allDaySelected) setSelectedDay([]);
    else setSelectedDay(dayRows.map((r) => r.staff_id));
  }
  function markSelectedStatus(status: StaffAttendanceStatus | "") {
    setDayRows((prev) =>
      prev.map((r) =>
        selectedDay.includes(r.staff_id)
          ? { ...r, status: status || null }
          : r,
      ),
    );
  }

  const [selectedMonth, setSelectedMonth] = React.useState<string[]>([]);
  const allMonthSelected =
    monthRows.length > 0 && selectedMonth.length === monthRows.length;
  function toggleMonth(id: string) {
    setSelectedMonth((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAllMonth() {
    if (allMonthSelected) setSelectedMonth([]);
    else setSelectedMonth(monthRows.map((r) => r.staff_id));
  }
  function exportSelectedMonthCsv() {
    const target = monthRows.filter((r) => selectedMonth.includes(r.staff_id));
    if (!target.length) return;
    const csv = [
      ["Teacher", "Present", "Absent", "Late", "Half day"].join(","),
      ...target.map((r) =>
        [`"${r.full_name}"`, r.present, r.absent, r.late, r.half_day].join(","),
      ),
    ].join("\n");
    downloadCsv(
      `teacher-attendance-${year}-${String(month).padStart(2, "0")}.csv`,
      csv,
    );
  }

  return (
    <AppShell
      title="Teacher Attendance"
      breadcrumb={["Staff Management", "Teacher Attendance"]}
      heading="Teacher Attendance"
      subtitle="Daily marks, monthly summaries, and history."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setError("");
              setSuccess("");
              setTab(t.key);
            }}
            className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === t.key
                ? "bg-(--sofia-primary) text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "daily" ? (
        <>
          <FilterBar
            filters={
              <FilterField label="Date">
                <input
                  type="date"
                  className={selectClass}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </FilterField>
            }
            actions={
              canManage ? (
                <>
                  <SecondaryButton onClick={setAllPresent}>
                    Mark all Present
                  </SecondaryButton>
                  <PrimaryButton
                    disabled={busy || dayLoading}
                    onClick={() => void saveDay()}
                  >
                    {busy ? "Saving…" : "Save"}
                  </PrimaryButton>
                </>
              ) : null
            }
          />

          <StaffTable
            loading={dayLoading}
            columns={[
              canManage ? (
                <input
                  key="select-all-day"
                  type="checkbox"
                  checked={allDaySelected}
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        selectedDay.length > 0 && !allDaySelected;
                  }}
                  onChange={toggleAllDay}
                  aria-label="Select all"
                />
              ) : (
                ""
              ),
              "Teacher",
              "Employee ID",
              "Status",
            ]}
          >
            {dayRows.length === 0 ? (
              <EmptyRow colSpan={4}>No active teachers to mark.</EmptyRow>
            ) : (
              dayRows.map((row) => (
                <tr key={row.staff_id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    {canManage ? (
                      <input
                        type="checkbox"
                        checked={selectedDay.includes(row.staff_id)}
                        onChange={() => toggleDay(row.staff_id)}
                      />
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {row.full_name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {row.employee_code || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <select
                        className={selectClass}
                        value={row.status ?? ""}
                        onChange={(e) =>
                          setRowStatus(
                            row.staff_id,
                            e.target.value as StaffAttendanceStatus | "",
                          )
                        }
                      >
                        <option value="">—</option>
                        {(
                          Object.keys(
                            ATTENDANCE_LABELS,
                          ) as StaffAttendanceStatus[]
                        ).map((s) => (
                          <option key={s} value={s}>
                            {ATTENDANCE_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    ) : row.status ? (
                      <StatusBadge
                        status={row.status === "absent" ? "rejected" : "active"}
                        label={ATTENDANCE_LABELS[row.status]}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </StaffTable>

          {canManage ? (
            <TableSelectionBar
              totalCount={dayRows.length}
              selectedCount={selectedDay.length}
              allSelected={allDaySelected}
              onToggleAll={toggleAllDay}
              onClear={() => setSelectedDay([])}
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => markSelectedStatus("present")}
                    className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Mark Present ({selectedDay.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => markSelectedStatus("late")}
                    className="cursor-pointer rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600"
                  >
                    Mark Late ({selectedDay.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => markSelectedStatus("absent")}
                    className="cursor-pointer rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    Mark Absent ({selectedDay.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => markSelectedStatus("half_day")}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Mark Half day ({selectedDay.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => markSelectedStatus("")}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Clear status
                  </button>
                </>
              }
            />
          ) : null}
        </>
      ) : null}

      {tab === "monthly" ? (
        <>
          <FilterBar
            filters={
              <>
                <FilterField label="Year">
                  <input
                    type="number"
                    className={selectClass}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value) || year)}
                  />
                </FilterField>
                <FilterField label="Month">
                  <select
                    className={selectClass}
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {new Date(2000, m - 1).toLocaleString(undefined, {
                          month: "long",
                        })}
                      </option>
                    ))}
                  </select>
                </FilterField>
              </>
            }
            actions={
              <>
                {canManage ? (
                  <SecondaryButton
                    disabled={busy}
                    onClick={() => void exportCsv()}
                  >
                    Export CSV
                  </SecondaryButton>
                ) : null}
                <SecondaryButton onClick={() => window.print()}>
                  Print
                </SecondaryButton>
              </>
            }
          />

          <div className="print:block">
            <div className="mb-3 hidden print:block">
              <h2 className="text-lg font-semibold">
                Teacher Attendance — {monthName} {year}
              </h2>
            </div>
            <StaffTable
              loading={monthLoading}
              columns={[
                <input
                  key="select-all-month"
                  type="checkbox"
                  checked={allMonthSelected}
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        selectedMonth.length > 0 && !allMonthSelected;
                  }}
                  onChange={toggleAllMonth}
                  aria-label="Select all"
                />,
                "Teacher",
                "Present",
                "Absent",
                "Late",
                "Half day",
              ]}
            >
              {monthRows.length === 0 ? (
                <EmptyRow colSpan={6}>No attendance for this month.</EmptyRow>
              ) : (
                monthRows.map((row) => (
                  <tr key={row.staff_id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedMonth.includes(row.staff_id)}
                        onChange={() => toggleMonth(row.staff_id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {row.full_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.present}</td>
                    <td className="px-4 py-3 text-slate-600">{row.absent}</td>
                    <td className="px-4 py-3 text-slate-600">{row.late}</td>
                    <td className="px-4 py-3 text-slate-600">{row.half_day}</td>
                  </tr>
                ))
              )}
            </StaffTable>

            <TableSelectionBar
              totalCount={monthRows.length}
              selectedCount={selectedMonth.length}
              allSelected={allMonthSelected}
              onToggleAll={toggleAllMonth}
              onClear={() => setSelectedMonth([])}
              actions={
                <button
                  type="button"
                  onClick={exportSelectedMonthCsv}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Export selected CSV ({selectedMonth.length})
                </button>
              }
            />
          </div>
        </>
      ) : null}

      {tab === "history" ? (
        <>
          <FilterBar
            filters={
              <FilterField label="Teacher" className="min-w-56">
                <select
                  className={selectClass}
                  value={historyStaffId}
                  onChange={(e) => setHistoryStaffId(e.target.value)}
                >
                  <option value="">Select teacher…</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </FilterField>
            }
          />

          <StaffTable
            loading={historyLoading}
            columns={["Date", "Status", "Notes"]}
          >
            {!historyStaffId ? (
              <EmptyRow colSpan={3}>Select a teacher to view history.</EmptyRow>
            ) : historyRecords.length === 0 ? (
              <EmptyRow colSpan={3}>No attendance records.</EmptyRow>
            ) : (
              historyRecords.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {r.date}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={r.status === "absent" ? "rejected" : "active"}
                      label={ATTENDANCE_LABELS[r.status]}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.notes || "—"}
                  </td>
                </tr>
              ))
            )}
          </StaffTable>
        </>
      ) : null}
    </AppShell>
  );
}
