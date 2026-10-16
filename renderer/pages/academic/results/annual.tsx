import React from "react";
import Link from "next/link";
import { AppShell } from "../../../components/layout/AppShell";
import {
  fetchAcademicMeta,
  fetchAnnualResultsSummary,
  type AcademicMeta,
} from "../../../lib/academic-mgmt";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

type AnnualSummary = Extract<
  Awaited<ReturnType<typeof fetchAnnualResultsSummary>>,
  { ok: true }
>["data"];

function formatAvg(v: number | null) {
  if (v == null) return "—";
  return v.toFixed(2);
}

export default function AnnualResultsPage() {
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [classId, setClassId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [data, setData] = React.useState<AnnualSummary | null>(null);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAcademicMeta();
      if (res.ok) {
        setMeta(res.data);
        if (res.data.classes[0]) setClassId(res.data.classes[0].id);
      } else setError(res.error);
      setLoading(false);
    })();
  }, []);

  React.useEffect(() => {
    if (!classId) return;
    void (async () => {
      setError("");
      const res = await fetchAnnualResultsSummary({ class_id: classId });
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res.data);
    })();
  }, [classId]);

  return (
    <AppShell
      title="Annual results"
      breadcrumb={["Academic Management", "Results", "Annual"]}
      heading="Annual (promotional) average"
      subtitle="MINESEC: (Term 1 + Term 2 + Term 3) ÷ 3. Process each term’s results first, then review annual averages for promotion (pass mark usually 10/20)."
      actions={
        <Link
          href="/academic/results"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Term results
        </Link>
      }
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          className={selectClass}
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          disabled={loading}
        >
          {(meta?.classes ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {data ? (
          <span className="text-sm text-slate-600">
            Pass mark: <strong>{data.pass_mark}/20</strong>
          </span>
        ) : null}
      </div>

      {data ? (
        <>
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            {data.terms.map((t) => (
              <div
                key={t.term_id ?? t.term_number}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <div className="font-semibold text-slate-900">
                  {t.term_name}
                </div>
                <div className="text-xs text-slate-500">
                  {t.run_status
                    ? `Results: ${t.run_status} (${t.student_count} students)`
                    : "No results yet — calculate this term first"}
                </div>
                {t.term_id ? (
                  <Link
                    href={`/academic/report-cards/generate?class_id=${classId}&term_id=${t.term_id}`}
                    className="mt-1 inline-block text-xs font-semibold text-(--sofia-primary) hover:underline"
                  >
                    Term report cards →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  {data.terms.map((t) => (
                    <th key={t.term_id ?? t.term_number} className="px-4 py-3">
                      T{t.term_number}
                    </th>
                  ))}
                  <th className="px-4 py-3">Annual</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.students.length === 0 ? (
                  <tr>
                    <td
                      colSpan={data.terms.length + 3}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No term results yet for this class.
                    </td>
                  </tr>
                ) : (
                  data.students.map((s) => (
                    <tr
                      key={s.student_id}
                      className="border-t border-slate-100"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {s.student_name}
                        {s.student_code ? (
                          <span className="ml-2 text-xs text-slate-400">
                            {s.student_code}
                          </span>
                        ) : null}
                      </td>
                      {s.term_averages.map((t) => (
                        <td
                          key={t.term_id ?? t.term_number}
                          className="px-4 py-3 text-slate-700"
                        >
                          {formatAvg(t.average)}
                        </td>
                      ))}
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {formatAvg(s.annual_average)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            s.status === "PASSED"
                              ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                              : s.status === "FAILED"
                                ? "rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700"
                                : "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800"
                          }
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : null}
    </AppShell>
  );
}
