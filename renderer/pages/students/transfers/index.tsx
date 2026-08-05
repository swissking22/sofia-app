import React from "react";
import Link from "next/link";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { Icon } from "../../../components/ui/Icon";
import { fetchTransfers, type TransferDto } from "../../../lib/student-mgmt";

export default function TransfersIndexPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [rows, setRows] = React.useState<TransferDto[]>([]);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    void (async () => {
      const res = await fetchTransfers();
      if (res.ok) setRows(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.student_name || "").toLowerCase().includes(q) ||
      (r.student_code || "").toLowerCase().includes(q) ||
      r.to_school_name.toLowerCase().includes(q)
    );
  });

  return (
    <AppShell
      title="Transfers"
      breadcrumb={["Student Management", "Transfers"]}
      heading="Student transfers"
      subtitle="Outgoing transfers to other schools."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block min-w-56 text-xs font-medium text-slate-500">
          Search
          <input
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Student or destination"
          />
        </label>
        <Link
          href="/students/transfers/create"
          className="inline-flex items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Icon icon={Add01Icon} size={16} />
          New transfer
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading transfers…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">To school</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No transfers recorded.
                  </td>
                </tr>
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
                    <td className="px-4 py-3 text-slate-700">
                      {r.to_school_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.transfer_date}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">
                      {r.status}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.reason || "—"}
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
