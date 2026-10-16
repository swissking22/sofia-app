import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  bulkProcessResults,
  fetchAcademicMeta,
  processResults,
  type AcademicMeta,
} from "../../../lib/academic-mgmt";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function ResultsProcessPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [classId, setClassId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [result, setResult] = React.useState<{
    run_id: string;
    students: number;
    subjects: number;
  } | null>(null);
  const [bulkSummary, setBulkSummary] = React.useState<{
    succeeded: number;
    failed: number;
    skipped: number;
    results: Array<{ class_name: string; error?: string; students?: number }>;
  } | null>(null);

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

  async function runComputation() {
    if (!classId) {
      setError("Select a class first.");
      return;
    }
    setError("");
    setSuccess("");
    setResult(null);
    setBulkSummary(null);
    setProcessing(true);
    try {
      const res = await processResults({
        class_id: classId,
        term_id: termId || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.data);
      setSuccess(
        `Term results computed for ${res.data.students} student(s) across ${res.data.subjects} subject(s).`,
      );
    } finally {
      setProcessing(false);
    }
  }

  async function runBulk() {
    if (
      !confirm(
        "Process term results for every class in this school for the selected term? Locked classes will be skipped.",
      )
    ) {
      return;
    }
    setError("");
    setSuccess("");
    setResult(null);
    setBulkSummary(null);
    setProcessing(true);
    try {
      const res = await bulkProcessResults({ term_id: termId || null });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBulkSummary(res.data);
      setSuccess(
        `Bulk done: ${res.data.succeeded} class(es) computed, ${res.data.failed} failed, ${res.data.skipped} locked/skipped.`,
      );
    } finally {
      setProcessing(false);
    }
  }

  const viewQuery = new URLSearchParams({
    class_id: classId,
    ...(termId ? { term_id: termId } : {}),
  }).toString();

  return (
    <AppShell
      title="Process results"
      breadcrumb={["Academic Management", "Results", "Process"]}
      heading="Process term results"
      subtitle="Subject average of sequences → × coefficient → term average. Or process every class at once."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <h3 className="font-semibold text-slate-900">Term formula</h3>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-slate-600">
              <li>
                Subject average = sum of sequence scores for that subject ÷
                number of sequences.
              </li>
              <li>Subject weighted score = subject average × coefficient.</li>
              <li>
                Term average = sum of weighted scores ÷ sum of coefficients.
              </li>
            </ol>
            <p className="mt-2 text-xs text-slate-500">
              With MINESEC (exam weight 0), subject mark = sequence average.
              Sequence sheets (correction / final) are under{" "}
              <Link
                className="font-medium text-(--sofia-primary)"
                href="/academic/results/sequences"
              >
                Sequence results
              </Link>
              .
            </p>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
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
                {(meta?.terms ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {result ? (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Run ID
                </p>
                <p className="mt-1 truncate font-mono text-xs text-slate-700">
                  {result.run_id}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Students
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {result.students}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Subjects
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {result.subjects}
                </p>
              </div>
            </div>
          ) : null}

          {bulkSummary ? (
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <p className="font-semibold text-slate-900">
                Bulk: {bulkSummary.succeeded} ok · {bulkSummary.failed} failed ·{" "}
                {bulkSummary.skipped} skipped
              </p>
              {bulkSummary.results.some((r) => r.error) ? (
                <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto text-xs text-red-600">
                  {bulkSummary.results
                    .filter((r) => r.error)
                    .map((r) => (
                      <li key={r.class_name}>
                        {r.class_name}: {r.error}
                      </li>
                    ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={processing || !classId}
              onClick={() => void runComputation()}
              className="cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {processing ? "Running…" : "Process this class"}
            </button>
            <button
              type="button"
              disabled={processing || !termId}
              onClick={() => void runBulk()}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              {processing ? "Running…" : "Process all classes"}
            </button>
            {result ? (
              <Link
                href={`/academic/results?${viewQuery}`}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
              >
                View results
              </Link>
            ) : null}
            <Link
              href="/academic/results/sequences"
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
            >
              Sequence sheets
            </Link>
          </div>
        </>
      )}
    </AppShell>
  );
}
