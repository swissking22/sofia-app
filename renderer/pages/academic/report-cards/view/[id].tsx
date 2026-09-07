import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../../components/layout/AppShell";
import { fetchReportCard } from "../../../../lib/academic-mgmt";

interface ReportSubject {
  subject_name?: string;
  ca_score?: number;
  exam_score?: number;
  subject_mark?: number;
  total?: number;
  coefficient?: number;
  weighted_mark?: number;
  grade?: string | null;
  remark?: string | null;
}

interface ReportPayload {
  school_name?: string;
  header?: string;
  footer?: string;
  student_name?: string;
  student_code?: string | null;
  class_name?: string;
  term_name?: string;
  year_name?: string | null;
  total_weighted_marks?: number;
  total_coefficients?: number;
  average?: number;
  total?: number;
  grade?: string | null;
  position?: number | null;
  status?: string | null;
  remark?: string | null;
  subjects?: ReportSubject[];
}

function formatScore(value: number | undefined) {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function asPayload(raw: Record<string, unknown> | null): ReportPayload {
  if (!raw) return {};
  const subjects = Array.isArray(raw.subjects)
    ? (raw.subjects as ReportSubject[])
    : [];
  return {
    school_name: typeof raw.school_name === "string" ? raw.school_name : undefined,
    header: typeof raw.header === "string" ? raw.header : undefined,
    footer: typeof raw.footer === "string" ? raw.footer : undefined,
    student_name:
      typeof raw.student_name === "string" ? raw.student_name : undefined,
    student_code:
      typeof raw.student_code === "string" || raw.student_code === null
        ? (raw.student_code as string | null)
        : undefined,
    class_name: typeof raw.class_name === "string" ? raw.class_name : undefined,
    term_name: typeof raw.term_name === "string" ? raw.term_name : undefined,
    year_name:
      typeof raw.year_name === "string" || raw.year_name === null
        ? (raw.year_name as string | null)
        : undefined,
    total_weighted_marks:
      typeof raw.total_weighted_marks === "number"
        ? raw.total_weighted_marks
        : typeof raw.total === "number"
          ? raw.total
          : undefined,
    total_coefficients:
      typeof raw.total_coefficients === "number"
        ? raw.total_coefficients
        : undefined,
    average: typeof raw.average === "number" ? raw.average : undefined,
    total: typeof raw.total === "number" ? raw.total : undefined,
    grade:
      typeof raw.grade === "string" || raw.grade === null
        ? (raw.grade as string | null)
        : undefined,
    position:
      typeof raw.position === "number" || raw.position === null
        ? (raw.position as number | null)
        : undefined,
    status:
      typeof raw.status === "string" || raw.status === null
        ? (raw.status as string | null)
        : undefined,
    remark:
      typeof raw.remark === "string" || raw.remark === null
        ? (raw.remark as string | null)
        : undefined,
    subjects,
  };
}

export default function ReportCardViewPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [payload, setPayload] = React.useState<ReportPayload | null>(null);
  const [generatedAt, setGeneratedAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await fetchReportCard(id);
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setPayload(asPayload(res.data.payload));
      setGeneratedAt(res.data.generated_at);
      setLoading(false);
    })();
  }, [id]);

  function handlePrint() {
    window.print();
  }

  return (
    <AppShell
      title="Report card"
      breadcrumb={["Academic Management", "Report Cards", "View"]}
      heading="Report card"
      subtitle="Printable student term report."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={handlePrint}
          className="cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white"
        >
          Print
        </button>
        <Link
          href="/academic/report-cards"
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
        >
          Back to list
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading report card…</p>
      ) : !payload ? (
        <p className="text-sm text-slate-500">Report card data not available.</p>
      ) : (
        <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
          <header className="border-b border-slate-200 pb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {payload.school_name ?? "School"}
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              {payload.header ?? "Official Term Report Card"}
            </h2>
            {payload.year_name ? (
              <p className="mt-1 text-sm text-slate-600">
                Academic year: {payload.year_name}
              </p>
            ) : null}
          </header>

          <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Student
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {payload.student_name ?? "—"}
              </p>
              {payload.student_code ? (
                <p className="font-mono text-xs text-slate-500">
                  {payload.student_code}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Class / Term
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {payload.class_name ?? "—"}
              </p>
              <p className="text-slate-600">{payload.term_name ?? "—"}</p>
            </div>
          </section>

          <section className="mt-8 overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3 text-right">CA Avg</th>
                  <th className="px-4 py-3 text-right">Exam</th>
                  <th className="px-4 py-3 text-right">Subject Mark</th>
                  <th className="px-4 py-3 text-center">Coeff</th>
                  <th className="px-4 py-3 text-right">Weighted</th>
                  <th className="px-4 py-3 text-center">Grade</th>
                  <th className="px-4 py-3 text-left">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(payload.subjects ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-6 text-center text-slate-500"
                    >
                      No subject scores recorded.
                    </td>
                  </tr>
                ) : (
                  (payload.subjects ?? []).map((subject, index) => (
                    <tr key={`${subject.subject_name ?? "subject"}-${index}`}>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {subject.subject_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatScore(subject.ca_score)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatScore(subject.exam_score)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        {formatScore(subject.subject_mark ?? subject.total)}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 font-mono text-xs">
                        {subject.coefficient ?? 1}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatScore(subject.weighted_mark ?? (subject.total ? subject.total * (subject.coefficient ?? 1) : undefined))}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-800">
                        {subject.grade ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-left text-xs text-slate-600">
                        {subject.remark || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5 text-sm">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Total Weighted
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatScore(payload.total_weighted_marks ?? payload.total)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Total Coeff
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {payload.total_coefficients != null ? formatScore(payload.total_coefficients) : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Term Average
              </p>
              <p className="mt-1 text-lg font-bold text-(--sofia-primary)">
                {formatScore(payload.average)} <span className="text-xs font-normal text-slate-500">/ 20</span>
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Rank
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {payload.position != null ? `${payload.position}${payload.position === 1 ? 'st' : payload.position === 2 ? 'nd' : payload.position === 3 ? 'rd' : 'th'}` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Status
              </p>
              <p className="mt-1">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    payload.status === "PASSED" || (payload.average != null && payload.average >= 10 && payload.status !== "FAILED")
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {payload.status ?? (payload.average != null && payload.average >= 10 ? "PASSED" : "FAILED")}
                </span>
              </p>
            </div>
          </section>

          {payload.remark ? (
            <section className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Remark
              </p>
              <p className="mt-1 text-slate-700">{payload.remark}</p>
            </section>
          ) : null}

          <footer className="mt-8 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
            {payload.footer ? (
              <p>{payload.footer}</p>
            ) : (
              <p>Official school record — keep for your files.</p>
            )}
            {generatedAt ? (
              <p className="mt-2 text-slate-400">
                Generated {new Date(generatedAt).toLocaleString()}
              </p>
            ) : null}
          </footer>
        </article>
      )}
    </AppShell>
  );
}
