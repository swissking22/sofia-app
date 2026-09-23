import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Add01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { Icon } from "../../../components/ui/Icon";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import { ClientPaginatedTable } from "../../../components/ui/table-pagination";
import {
  fetchAcademicMeta,
  fetchReportCards,
  type AcademicMeta,
} from "../../../lib/academic-mgmt";
import { TableSelectionBar } from "../../../components/students/ui";
import { formatDisplayDateTime } from "../../../lib/date-format";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    generated: "bg-emerald-50 text-emerald-700",
    draft: "bg-slate-100 text-slate-600",
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        styles[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

export default function ReportCardsIndexPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [classId, setClassId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [cards, setCards] = React.useState<
    Array<{
      id: string;
      student_id: string;
      student_name: string | null;
      student_code: string | null;
      class_id: string;
      class_name: string | null;
      term_id: string | null;
      status: string;
      generated_at: string | null;
    }>
  >([]);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const allSelected = cards.length > 0 && selectedIds.length === cards.length;
  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(cards.map((c) => c.id));
  }
  function exportSelected() {
    const target = cards.filter((c) => selectedIds.includes(c.id));
    if (!target.length) return;
    const csv = [
      ["Student", "Code", "Class", "Status", "Generated At"].join(","),
      ...target.map((c) =>
        [
          `"${c.student_name || ""}"`,
          `"${c.student_code || ""}"`,
          `"${c.class_name || ""}"`,
          `"${c.status}"`,
          `"${c.generated_at || ""}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-cards-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAcademicMeta();
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setMeta(res.data);
      const qClass =
        typeof router.query.class_id === "string" ? router.query.class_id : "";
      const qTerm =
        typeof router.query.term_id === "string" ? router.query.term_id : "";
      if (qClass) setClassId(qClass);
      if (qTerm) setTermId(qTerm);
      setLoading(false);
    })();
  }, [router.query.class_id, router.query.term_id]);

  const loadCards = React.useCallback(async () => {
    setError("");
    const res = await fetchReportCards({
      class_id: classId || undefined,
      term_id: termId || null,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCards(res.data);
  }, [classId, termId]);

  React.useEffect(() => {
    if (loading) return;
    void loadCards();
  }, [classId, termId, loading, loadCards]);

  const generateQuery = new URLSearchParams({
    ...(classId ? { class_id: classId } : {}),
    ...(termId ? { term_id: termId } : {}),
  }).toString();

  return (
    <AppShell
      title="Report cards"
      breadcrumb={["Academic Management", "Report Cards"]}
      heading="Report cards"
      subtitle="Browse and open generated student report cards."
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
          <label className="block text-xs font-medium text-slate-500">
            Term
            <select
              className={`mt-1 block min-w-36 ${selectClass}`}
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
            >
              <option value="">All terms</option>
              {(meta?.terms ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Link
          href={`/academic/report-cards/generate${generateQuery ? `?${generateQuery}` : ""}`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Icon icon={Add01Icon} size={16} />
          Generate report cards
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
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
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Generated</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
            }
          >
            {cards.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No report cards match these filters.
                </td>
              </tr>
            ) : (
              cards.map((card) => (
                <tr key={card.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(card.id)}
                      onChange={() => toggleRow(card.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">
                      {card.student_name ?? "—"}
                    </span>
                    {card.student_code ? (
                      <span className="ml-2 font-mono text-xs text-slate-500">
                        {card.student_code}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {card.class_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={card.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDisplayDateTime(card.generated_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <TableActionGroup>
                      <TableIconButton
                        icon={ViewIcon}
                        label="View report card"
                        tone="primary"
                        href={`/academic/report-cards/view/${card.id}`}
                      />
                    </TableActionGroup>
                  </td>
                </tr>
              ))
            )}
          </ClientPaginatedTable>

          <TableSelectionBar
            totalCount={cards.length}
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
