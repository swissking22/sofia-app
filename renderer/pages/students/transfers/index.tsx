import React from "react";
import Link from "next/link";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  StatusBadge,
  StudentTable,
  selectClass,
} from "../../../components/students/ui";
import { Icon } from "../../../components/ui/Icon";
import { fetchTransfers, type TransferDto } from "../../../lib/student-mgmt";

type StatusFilter = "all" | string;

export default function TransfersIndexPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [rows, setRows] = React.useState<TransferDto[]>([]);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");

  React.useEffect(() => {
    void (async () => {
      const res = await fetchTransfers();
      if (res.ok) setRows(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, []);

  const statusOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.status) set.add(r.status);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.student_name || "").toLowerCase().includes(q) ||
        (r.student_code || "").toLowerCase().includes(q) ||
        r.to_school_name.toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  return (
    <AppShell
      title="Transfers"
      breadcrumb={["Student Management", "Transfers"]}
      heading="Student transfers"
      subtitle="Outgoing transfers to other schools."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

      <FilterBar
        filters={
          <>
            <FilterField label="Status">
              <select
                className={selectClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Search" className="min-w-56 flex-1">
              <input
                className={`w-full ${selectClass}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Student or destination"
              />
            </FilterField>
          </>
        }
        actions={
          <PrimaryButton href="/students/transfers/create">
            <Icon icon={Add01Icon} size={16} />
            New transfer
          </PrimaryButton>
        }
      />

      <StudentTable
        loading={loading}
        columns={["Student", "ID", "To school", "Date", "Status", "Reason"]}
      >
        {filtered.length === 0 ? (
          <EmptyRow colSpan={6}>
            No transfers match these filters.{" "}
            <Link
              href="/students/transfers/create"
              className="font-semibold text-(--sofia-primary)"
            >
              Record a transfer
            </Link>
          </EmptyRow>
        ) : (
          filtered.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 font-medium text-slate-800">
                {r.student_id ? (
                  <Link
                    href={`/students/${r.student_id}`}
                    className="text-(--sofia-primary) hover:underline"
                  >
                    {r.student_name || "—"}
                  </Link>
                ) : (
                  r.student_name || "—"
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">
                {r.student_code || "—"}
              </td>
              <td className="px-4 py-3 text-slate-700">{r.to_school_name}</td>
              <td className="px-4 py-3 text-slate-600">{r.transfer_date}</td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-3 text-slate-500">{r.reason || "—"}</td>
            </tr>
          ))
        )}
      </StudentTable>
    </AppShell>
  );
}
