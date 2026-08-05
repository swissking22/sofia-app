import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  fetchAcademicMeta,
  fetchResults,
  publishResults,
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

export default function ResultsPublishPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [publishing, setPublishing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [classId, setClassId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [run, setRun] = React.useState<{
    id: string;
    status: string;
    computed_at: string | null;
    published_at: string | null;
  } | null>(null);
  const [summaryCount, setSummaryCount] = React.useState(0);

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

  const loadStatus = React.useCallback(async () => {
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
    setSummaryCount(res.data.summaries.length);
  }, [classId, termId]);

  React.useEffect(() => {
    if (!classId || loading) return;
    void loadStatus();
  }, [classId, termId, loading, loadStatus]);

  async function handlePublish(lock: boolean) {
    if (!classId) {
      setError("Select a class first.");
      return;
    }
    setError("");
    setSuccess("");
    setPublishing(true);
    try {
      const res = await publishResults({
        class_id: classId,
        term_id: termId || null,
        lock,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        lock
          ? "Results published and locked. They can no longer be recomputed."
          : "Results published successfully.",
      );
      await loadStatus();
    } finally {
      setPublishing(false);
    }
  }

  const isLocked = run?.status === "locked";
  const canPublish =
    run &&
    (run.status === "computed" || run.status === "published") &&
    !isLocked;

  const viewQuery = new URLSearchParams({
    class_id: classId,
    ...(termId ? { term_id: termId } : {}),
  }).toString();

  return (
    <AppShell
      title="Publish results"
      breadcrumb={["Academic Management", "Results", "Publish"]}
      heading="Publish results"
      subtitle="Make computed results visible and optionally lock them from changes."
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

      {isLocked ? (
        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          These results are locked. They cannot be recomputed or republished.
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
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
                <option value="">All terms</option>
                {(meta?.terms ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium text-slate-700">Current status:</span>
              {run ? (
                <>
                  <StatusBadge status={run.status} />
                  <span className="text-slate-500">
                    {summaryCount} student summary(ies)
                  </span>
                  {run.computed_at ? (
                    <span className="text-slate-500">
                      Computed {new Date(run.computed_at).toLocaleString()}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-slate-500">
                  No computed run found. Process results first.
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={publishing || !canPublish}
              onClick={() => void handlePublish(false)}
              className="cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
            <button
              type="button"
              disabled={publishing || !canPublish}
              onClick={() => void handlePublish(true)}
              className="cursor-pointer rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-700 disabled:opacity-60"
            >
              Publish &amp; lock
            </button>
            <Link
              href={`/academic/results?${viewQuery}`}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
            >
              View results
            </Link>
            <Link
              href="/academic/results"
              className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-500"
            >
              Back to results
            </Link>
          </div>
        </>
      )}
    </AppShell>
  );
}
