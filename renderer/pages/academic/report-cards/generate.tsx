import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  fetchAcademicMeta,
  generateReportCards,
  type AcademicMeta,
} from "../../../lib/academic-mgmt";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function ReportCardsGeneratePage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [classId, setClassId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [generated, setGenerated] = React.useState<number | null>(null);

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

  async function handleGenerate() {
    if (!classId) {
      setError("Select a class first.");
      return;
    }
    setError("");
    setSuccess("");
    setGenerated(null);
    setGenerating(true);
    try {
      const res = await generateReportCards({
        class_id: classId,
        term_id: termId || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setGenerated(res.data.generated);
      setSuccess(`Generated ${res.data.generated} report card(s).`);
    } finally {
      setGenerating(false);
    }
  }

  const listQuery = new URLSearchParams({
    class_id: classId,
    ...(termId ? { term_id: termId } : {}),
  }).toString();

  return (
    <AppShell
      title="Generate report cards"
      breadcrumb={["Academic Management", "Report Cards", "Generate"]}
      heading="Generate term report cards"
      subtitle="One bulletin per student for the selected class and term (after that term’s results are calculated)."
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
          <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Pick the <strong>term</strong> (Term 1, 2, or 3). Report cards need
            processed results for that class and term — run Results → Calculate
            first. For year-end promotion averages see{" "}
            <Link
              href="/academic/results/annual"
              className="font-semibold underline"
            >
              Annual results
            </Link>
            .
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
                <option value="">All terms</option>
                {(meta?.terms ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {generated != null ? (
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Generated
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {generated}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={generating || !classId}
              onClick={() => void handleGenerate()}
              className="cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {generating ? "Generating…" : "Generate report cards"}
            </button>
            {generated != null && generated > 0 ? (
              <Link
                href={`/academic/report-cards?${listQuery}`}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
              >
                View report cards
              </Link>
            ) : null}
          </div>
        </>
      )}
    </AppShell>
  );
}
