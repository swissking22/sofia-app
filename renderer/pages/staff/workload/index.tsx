import React from "react";
import { ViewIcon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import {
  FormModal,
  EmptyRow,
  PageAlert,
  SecondaryButton,
  StatusBadge,
  StaffTable,
  TableSelectionBar,
} from "../../../components/staff/ui";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import { ClientPaginatedTable } from "../../../components/ui/table-pagination";
import {
  fetchWorkloadDetail,
  fetchWorkloadSummary,
} from "../../../lib/staff-mgmt";

type WorkloadRow = {
  staff_id: string;
  full_name: string;
  employee_code: string | null;
  period_count: number;
  subject_count: number;
  class_count: number;
  over_max: boolean;
  has_conflict: boolean;
};

type WorkloadDetail = {
  staff: { full_name: string; employee_code: string | null };
  max_periods: number;
  period_count: number;
  over_max: boolean;
  conflicts: Array<{ day_of_week: number; period_number: number }>;
  slots: Array<{
    id: string;
    day_of_week: number;
    day_name: string;
    period_number: number;
    class_id: string;
    class_name: string | null;
    subject_id: string | null;
    subject_name: string | null;
    room: string | null;
  }>;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export default function TeacherWorkloadPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [maxPeriods, setMaxPeriods] = React.useState(0);
  const [rows, setRows] = React.useState<WorkloadRow[]>([]);
  const [selected, setSelected] = React.useState<WorkloadRow | null>(null);
  const [detail, setDetail] = React.useState<WorkloadDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(rows.map((r) => r.staff_id));
  }
  function exportSelected() {
    const target = rows.filter((r) => selectedIds.includes(r.staff_id));
    if (!target.length) return;
    const csv = [
      ["Teacher", "Employee ID", "Periods", "Subjects", "Classes", "Over Max", "Conflict"].join(","),
      ...target.map((r) =>
        [
          `"${r.full_name}"`,
          `"${r.employee_code || ""}"`,
          r.period_count,
          r.subject_count,
          r.class_count,
          r.over_max ? "Yes" : "No",
          r.has_conflict ? "Yes" : "No",
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teacher-workload-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  React.useEffect(() => {
    void (async () => {
      const res = await fetchWorkloadSummary();
      if (res.ok) {
        setMaxPeriods(res.data.max_periods);
        setRows(res.data.rows);
      } else {
        setError(res.error);
      }
      setLoading(false);
    })();
  }, []);

  async function openDetail(row: WorkloadRow) {
    setSelected(row);
    setDetail(null);
    setDetailLoading(true);
    setError("");
    const res = (await fetchWorkloadDetail(row.staff_id)) as Result<WorkloadDetail>;
    if (res.ok) setDetail(res.data);
    else setError(res.error);
    setDetailLoading(false);
  }

  return (
    <AppShell
      title="Teacher Workload"
      breadcrumb={["Staff Management", "Teacher Workload"]}
      heading="Teacher Workload"
      subtitle={
        maxPeriods
          ? `Period counts from the timetable. Max recommended: ${maxPeriods}.`
          : "Period counts from the timetable."
      }
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

      <StaffTable
        loading={loading}
        columns={[
          <input
            key="select-all"
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el)
                el.indeterminate = selectedIds.length > 0 && !allSelected;
            }}
            onChange={toggleAll}
            aria-label="Select all"
          />,
          "Teacher",
          "Periods",
          "Subjects",
          "Classes",
          "Flags",
          "",
        ]}
      >
        {rows.length === 0 ? (
          <EmptyRow colSpan={7}>No teaching staff with workload data.</EmptyRow>
        ) : (
          rows.map((row) => (
            <tr
              key={row.staff_id}
              className="hover:bg-slate-50/80"
            >
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(row.staff_id)}
                  onChange={() => toggleRow(row.staff_id)}
                />
              </td>
              <td
                className="cursor-pointer px-4 py-3"
                onClick={() => void openDetail(row)}
              >
                <div className="font-medium text-slate-900">{row.full_name}</div>
                <div className="font-mono text-xs text-slate-500">
                  {row.employee_code || "—"}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600">{row.period_count}</td>
              <td className="px-4 py-3 text-slate-600">{row.subject_count}</td>
              <td className="px-4 py-3 text-slate-600">{row.class_count}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {row.over_max ? (
                    <StatusBadge status="rejected" label="Over max" />
                  ) : null}
                  {row.has_conflict ? (
                    <StatusBadge status="pending" label="Conflict" />
                  ) : null}
                  {!row.over_max && !row.has_conflict ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <TableActionGroup>
                  <TableIconButton
                    icon={ViewIcon}
                    label="Details"
                    tone="primary"
                    onClick={() => void openDetail(row)}
                  />
                </TableActionGroup>
              </td>
            </tr>
          ))
        )}
      </StaffTable>

      <TableSelectionBar
        totalCount={rows.length}
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

      <FormModal
        open={!!selected}
        title={selected?.full_name ?? "Workload"}
        subtitle={
          detail
            ? `${detail.period_count} periods · max ${detail.max_periods}`
            : selected?.employee_code || undefined
        }
        onClose={() => {
          setSelected(null);
          setDetail(null);
        }}
        footer={
          <SecondaryButton
            className="w-full"
            onClick={() => {
              setSelected(null);
              setDetail(null);
            }}
          >
            Close
          </SecondaryButton>
        }
      >
        {detailLoading ? (
          <p className="text-sm text-slate-500">Loading schedule…</p>
        ) : detail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {detail.over_max ? (
                <StatusBadge status="rejected" label="Over max" />
              ) : null}
              {detail.conflicts.length > 0 ? (
                <StatusBadge status="pending" label="Has conflicts" />
              ) : null}
            </div>
            <ClientPaginatedTable
              head={
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Day</th>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Class</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">Room</th>
                  </tr>
                </thead>
              }
            >
              {detail.slots.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    No timetable slots assigned.
                  </td>
                </tr>
              ) : (
                detail.slots.map((slot) => (
                  <tr key={slot.id}>
                    <td className="px-3 py-2">{slot.day_name}</td>
                    <td className="px-3 py-2">{slot.period_number}</td>
                    <td className="px-3 py-2">{slot.class_name || "—"}</td>
                    <td className="px-3 py-2">{slot.subject_name || "—"}</td>
                    <td className="px-3 py-2">{slot.room || "—"}</td>
                  </tr>
                ))
              )}
            </ClientPaginatedTable>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No detail available.</p>
        )}
      </FormModal>
    </AppShell>
  );
}
