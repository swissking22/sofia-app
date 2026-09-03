import React from "react";
import Link from "next/link";
import { Add01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { Icon } from "../../../components/ui/Icon";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import {
  fetchExamSessions,
  type ExamSessionDto,
} from "../../../lib/academic-mgmt";

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    active: "Active",
    closed: "Closed",
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "closed") return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-700";
}

export default function ExamsIndexPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [sessions, setSessions] = React.useState<ExamSessionDto[]>([]);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchExamSessions();
      if (res.ok) setSessions(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell
      title="Examinations"
      breadcrumb={["Academic Management", "Examinations"]}
      heading="Examinations"
      subtitle="Manage exam sessions and enter paper scores."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Link
          href="/academic/exams/scores"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
        >
          Enter scores
        </Link>
        <Link
          href="/academic/exams/create"
          className="inline-flex items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Icon icon={Add01Icon} size={16} />
          Create session
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading exam sessions…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">End</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Papers</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No exam sessions yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.term_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(s.start_date)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(s.end_date)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(s.status)}`}
                      >
                        {statusLabel(s.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.paper_count}
                    </td>
                    <td className="px-4 py-3">
                      <TableActionGroup>
                        <TableIconButton
                          icon={PencilEdit01Icon}
                          label="Enter scores"
                          tone="primary"
                          href={`/academic/exams/scores?session_id=${s.id}`}
                        />
                      </TableActionGroup>
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
