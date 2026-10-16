import React from "react";
import Link from "next/link";
import { AppShell } from "../../../components/layout/AppShell";
import {
  fetchAcademicMeta,
  fetchSequenceSheet,
  type AcademicMeta,
  type SequenceSheetKind,
  type SequenceSheetPayload,
  type SequenceSortMode,
} from "../../../lib/academic-mgmt";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(decimals);
}

function schoolLines(school: SequenceSheetPayload["school"]): string[] {
  return [school.address, school.phone, school.email, school.region]
    .map((x) => (x ?? "").trim())
    .filter(Boolean);
}

function SequenceSheetView({
  payload,
  sheet,
}: {
  payload: SequenceSheetPayload;
  sheet: SequenceSheetPayload["classes"][number];
}) {
  const isFinal = payload.sheet_kind === "final";
  const title = isFinal
    ? `${payload.sequence_name.toUpperCase()} RESULT SHEET (Final — for publishing)`
    : `${payload.sequence_name.toUpperCase()} RESULT SHEET (Correction sheet)`;
  const lines = schoolLines(payload.school);
  const subjects = sheet.subjects;

  const colCount = isFinal ? 1 + subjects.length + 4 : 1 + subjects.length;

  return (
    <section className="seq-sheet">
      <table className="seq-table w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <td colSpan={colCount} className="border-0 p-0">
              <header className="seq-letterhead border-b-2 border-slate-900 pb-3 text-center">
                {payload.school.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={payload.school.logo_url}
                    alt=""
                    className="mx-auto mb-2 h-16 w-16 object-contain"
                  />
                ) : null}
                <p className="text-base font-bold uppercase tracking-wide text-slate-900">
                  {payload.school.name}
                </p>
                {lines.map((line) => (
                  <p key={line} className="mt-0.5 text-[10px] text-slate-600">
                    {line}
                  </p>
                ))}
                <h2 className="mt-3 text-sm font-bold uppercase tracking-[0.1em] text-slate-900">
                  {title}
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {sheet.class_name}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-600">
                  {[
                    payload.academic_year
                      ? `Academic year ${payload.academic_year.name}`
                      : null,
                    payload.term ? payload.term.name : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {sheet.class_average != null ? (
                  <p className="mt-0.5 text-[10px] text-slate-600">
                    Class average: {fmt(sheet.class_average)}
                  </p>
                ) : null}
              </header>
            </td>
          </tr>
          <tr>
            <th className="border border-slate-800 bg-slate-50 px-1.5 py-1.5 text-left text-[10px] font-semibold uppercase">
              Name
            </th>
            {subjects.map((s) => (
              <th
                key={s.subject_id}
                className="border border-slate-800 bg-slate-50 px-1 py-1.5 text-center text-[9px] font-semibold uppercase leading-tight"
              >
                {s.subject_name}
                <span className="block font-normal normal-case">
                  ({s.coefficient})
                </span>
              </th>
            ))}
            {isFinal ? (
              <>
                <th className="border border-slate-800 bg-slate-50 px-1 py-1.5 text-center text-[9px] font-semibold uppercase">
                  Total WM
                </th>
                <th className="border border-slate-800 bg-slate-50 px-1 py-1.5 text-center text-[9px] font-semibold uppercase">
                  Total Coeff.
                </th>
                <th className="border border-slate-800 bg-slate-50 px-1 py-1.5 text-center text-[9px] font-semibold uppercase">
                  Average
                </th>
                <th className="border border-slate-800 bg-slate-50 px-1 py-1.5 text-center text-[9px] font-semibold uppercase">
                  Pos.
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {sheet.students.map((st) => (
            <tr key={st.student_id}>
              <td className="border border-slate-800 px-1.5 py-1 text-left font-medium whitespace-nowrap">
                {st.student_name}
              </td>
              {subjects.map((s) => {
                const cell = st.cells.find(
                  (c) => c.subject_id === s.subject_id,
                );
                const value = isFinal ? cell?.weighted_mark : cell?.mark;
                return (
                  <td
                    key={s.subject_id}
                    className="border border-slate-800 px-1 py-1 text-center tabular-nums"
                  >
                    {fmt(value, isFinal ? 2 : 1)}
                  </td>
                );
              })}
              {isFinal ? (
                <>
                  <td className="border border-slate-800 px-1 py-1 text-center tabular-nums font-semibold">
                    {fmt(st.total_weighted_marks)}
                  </td>
                  <td className="border border-slate-800 px-1 py-1 text-center tabular-nums">
                    {fmt(st.total_coefficients, 0)}
                  </td>
                  <td className="border border-slate-800 px-1 py-1 text-center tabular-nums font-semibold">
                    {fmt(st.average_rounded)}
                  </td>
                  <td className="border border-slate-800 px-1 py-1 text-center tabular-nums">
                    {st.position ?? "—"}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function SequenceResultsPage() {
  const [loading, setLoading] = React.useState(true);
  const [building, setBuilding] = React.useState(false);
  const [error, setError] = React.useState("");
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [termId, setTermId] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [allClasses, setAllClasses] = React.useState(false);
  const [sequenceName, setSequenceName] = React.useState("Sequence 1");
  const [sheetKind, setSheetKind] =
    React.useState<SequenceSheetKind>("correction");
  const [sort, setSort] = React.useState<SequenceSortMode>("name");
  const [payload, setPayload] = React.useState<SequenceSheetPayload | null>(
    null,
  );

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAcademicMeta();
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setMeta(res.data);
      if (res.data.terms[0]) setTermId(res.data.terms[0].id);
      if (res.data.classes[0]) setClassId(res.data.classes[0].id);
      setLoading(false);
    })();
  }, []);

  async function buildSheet() {
    if (!termId) {
      setError("Select a term.");
      return;
    }
    if (!allClasses && !classId) {
      setError("Select a class or choose All classes.");
      return;
    }
    setError("");
    setBuilding(true);
    setPayload(null);
    try {
      const res = await fetchSequenceSheet({
        term_id: termId,
        sequence_name: sequenceName,
        sheet_kind: sheetKind,
        sort: sheetKind === "final" ? sort : "name",
        all_classes: allClasses,
        class_id: allClasses ? null : classId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPayload(res.data);
    } finally {
      setBuilding(false);
    }
  }

  return (
    <AppShell
      title="Sequence results"
      breadcrumb={["Academic Management", "Results", "Sequences"]}
      heading="Sequence result sheets"
      subtitle="Correction sheet (raw /20 marks) or Final sheet (weighted marks, averages, positions). Print → Save as PDF."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 print:hidden">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500 print:hidden">Loading…</p>
      ) : (
        <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
          <div className="flex flex-wrap gap-3">
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
            <label className="block text-xs font-medium text-slate-500">
              Sequence
              <select
                className={`mt-1 block min-w-40 ${selectClass}`}
                value={sequenceName}
                onChange={(e) => setSequenceName(e.target.value)}
              >
                <option value="Sequence 1">Sequence 1</option>
                <option value="Sequence 2">Sequence 2</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-500">
              Sheet type
              <select
                className={`mt-1 block min-w-48 ${selectClass}`}
                value={sheetKind}
                onChange={(e) =>
                  setSheetKind(e.target.value as SequenceSheetKind)
                }
              >
                <option value="correction">Correction (raw scores /20)</option>
                <option value="final">
                  Final (weighted + average + position)
                </option>
              </select>
            </label>
            {sheetKind === "final" ? (
              <label className="block text-xs font-medium text-slate-500">
                Sort
                <select
                  className={`mt-1 block min-w-36 ${selectClass}`}
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SequenceSortMode)}
                >
                  <option value="name">By name</option>
                  <option value="merit">By merit (position)</option>
                </select>
              </label>
            ) : null}
            <label className="block text-xs font-medium text-slate-500">
              Class
              <select
                className={`mt-1 block min-w-44 ${selectClass}`}
                value={allClasses ? "__all__" : classId}
                onChange={(e) => {
                  if (e.target.value === "__all__") {
                    setAllClasses(true);
                  } else {
                    setAllClasses(false);
                    setClassId(e.target.value);
                  }
                }}
              >
                <option value="__all__">All classes</option>
                {(meta?.classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={building}
              onClick={() => void buildSheet()}
              className="rounded-xl bg-(--sofia-primary) px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {building ? "Building…" : "Build sheet"}
            </button>
            <button
              type="button"
              disabled={!payload}
              onClick={() => window.print()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Print / Save PDF
            </button>
            <Link
              href="/academic/results"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Term results
            </Link>
          </div>
          <p className="text-xs text-slate-500">
            Correction: student names + subject scores on /20 (header = Subject
            (coeff)). Final: sequence weighted marks, total weighted, total
            coeff., average, position.
          </p>
        </div>
      )}

      {payload ? (
        <div className="seq-doc mx-auto bg-white px-6 py-6 shadow-sm print:mx-0 print:max-w-none print:px-0 print:py-0 print:shadow-none">
          {payload.classes.map((sheet) => (
            <SequenceSheetView
              key={sheet.class_id}
              payload={payload}
              sheet={sheet}
            />
          ))}
        </div>
      ) : null}

      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 10mm;
        }
        @media print {
          html,
          body,
          #__next {
            background: white !important;
            height: auto !important;
            overflow: visible !important;
          }
          .seq-doc {
            max-width: none !important;
            box-shadow: none !important;
          }
          .seq-sheet {
            break-after: page;
            page-break-after: always;
          }
          .seq-sheet:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .seq-table thead {
            display: table-header-group;
          }
          .seq-letterhead {
            break-inside: avoid;
          }
        }
      `}</style>
    </AppShell>
  );
}
