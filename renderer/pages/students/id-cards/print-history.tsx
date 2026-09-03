import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { IdCardModuleNav } from "../../../components/id-cards/ModuleNav";
import { PageAlert } from "../../../components/students/ui";
import { fetchIdCardPrintHistory } from "../../../lib/student-id-cards";

export default function PrintHistoryPage() {
  const [error, setError] = React.useState("");
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
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Cards</th>
              <th className="px-4 py-2">Paper</th>
              <th className="px-4 py-2">By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  {new Date(r.printed_at).toLocaleString()}
                </td>
                <td className="px-4 py-2">{r.card_count}</td>
                <td className="px-4 py-2">{r.paper_size}</td>
                <td className="px-4 py-2">{r.printed_by_email || "—"}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={4}>
                  No print runs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
