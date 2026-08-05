import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Calculator01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { Icon } from "../../../components/ui/Icon";
import {
  fetchAcademicMeta,
  fetchResults,
  type AcademicMeta,
} from "../../../lib/academic-mgmt";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-slate-100 text-slate-600",
    computed: "bg-amber-50 text-amber-700",
    published: "bg-emerald-50 text-emerald-700",
    locked: "bg-indigo-50 text-indigo-700",
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

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function ResultsIndexPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [classId, setClassId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [run, setRun] = React.useState<{
    id: string;
    status: string;
    computed_at: string | null;
    published_at: string | null;
  } | null>(null);
  const [summaries, setSummaries] = React.useState<
    Array<{
      student_id: string;
      student_name: string;
      student_code: string | null;
      average: number;
      total: number;
      grade: string | null;
      position: number | null;
      remark: string | null;
    }>
  >([]);

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
      else if (res.data.classes[0]) setClassId(res.data.classes[0].id);
      if (qTerm) setTermId(qTerm);
      else if (res.data.terms[0]) setTermId(res.data.terms[0].id);
      setLoading(false);
    })();
  }, [router.query.class_id, router.query.term_id]);

  const loadResults = React.useCallback(async () => {
    if (!classId) return;
    setError("");
    const res = await fetchResults({
      class_id: classId,
      term_id: termId || null,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setRun(res.data.run);
    setSummaries(res.data.summaries);
  }, [classId, termId]);

  React.useEffect(() => {
    if (!classId || loading) return;
    void loadResults();
  }, [classId, termId, loading, loadResults]);

  const query = new URLSearchParams({
    class_id: classId,
    ...(termId ? { term_id: termId } : {}),
  }).toString();

  return (
    <AppShell
      title="Results"
      breadcrumb={["Academic Management", "Results Processing"]}
      heading="Results"
      subtitle="View computed class results by term."
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
              <option value="">Select class</option>
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

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/academic/results/process?${query}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            <Icon icon={Calculator01Icon} size={16} />
            Process results
          </Link>
          <Link
            href={`/academic/results/publish?${query}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Icon icon={Upload04Icon} size={16} />
            Publish results
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !classId ? (
        <p className="text-sm text-slate-500">Select a class to view results.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <span className="font-medium text-slate-700">Run status:</span>
            {run ? (
              <>
                <StatusBadge status={run.status} />
                {run.computed_at ? (
                  <span className="text-slate-500">
                    Computed {new Date(run.computed_at).toLocaleString()}
                  </span>
                ) : null}
                {run.published_at ? (
                  <span className="text-slate-500">
                    Published {new Date(run.published_at).toLocaleString()}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-slate-500">No results computed yet.</span>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Position</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Average</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No summaries for this class and term. Process results first.
                    </td>
                  </tr>
                ) : (
                  summaries.map((s) => (
                    <tr key={s.student_id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {s.position ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-900">
                          {s.student_name}
                        </span>
                        {s.student_code ? (
                          <span className="ml-2 font-mono text-xs text-slate-500">
                            {s.student_code}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatScore(s.average)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatScore(s.total)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {s.grade ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}
