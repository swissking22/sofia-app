import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { IdCardModuleNav } from "../../../components/id-cards/ModuleNav";
import { PageAlert, TableSelectionBar } from "../../../components/students/ui";
import { formatDisplayDateTime } from "../../../lib/date-format";
import { fetchIdCardPrintHistory } from "../../../lib/student-id-cards";

export default function PrintHistoryPage() {
  const [error, setError] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<
    Extract<
      Awaited<ReturnType<typeof fetchIdCardPrintHistory>>,
      { ok: true }
    >["data"]["rows"]
  >([]);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchIdCardPrintHistory();
      if (res.ok) setRows(res.data.rows);
      else setError(res.error);
    })();
  }, []);

  const allSelected = rows.length > 0 && selected.length === rows.length;
  function toggleAll() {
    if (allSelected) setSelected([]);
    else setSelected(rows.map((r) => r.id));
  }

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function exportSelected() {
    const target = rows.filter((r) => selected.includes(r.id));
    if (!target.length) return;
    const csv = [
      ["Date", "Cards", "Paper", "By"].join(","),
      ...target.map((r) =>
        [
          `"${formatDisplayDateTime(r.printed_at, "")}"`,
          r.card_count,
          `"${r.paper_size}"`,
          `"${r.printed_by_email || ""}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `print-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title="Print history"
      breadcrumb={["Student Management", "ID Cards", "Print history"]}
      heading="Print history"
      subtitle="Each print run is recorded locally and synced as metadata when the school is online."
    >
      <IdCardModuleNav />
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        selected.length > 0 && !allSelected;
                  }}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Cards</th>
              <th className="px-4 py-2">Paper</th>
              <th className="px-4 py-2">By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td className="px-4 py-2">
                  {formatDisplayDateTime(r.printed_at)}
                </td>
                <td className="px-4 py-2">{r.card_count}</td>
                <td className="px-4 py-2">{r.paper_size}</td>
                <td className="px-4 py-2">{r.printed_by_email || "—"}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  No print runs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <TableSelectionBar
        totalCount={rows.length}
        selectedCount={selected.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setSelected([])}
        actions={
          <button
            type="button"
            onClick={exportSelected}
            className="cursor-pointer rounded-lg bg-(--sofia-primary) px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
          >
            Export selected ({selected.length})
          </button>
        }
      />
    </AppShell>
  );
}
