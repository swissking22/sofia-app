import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Calculator01Icon,
  Upload04Icon,
  CheckmarkCircle02Icon,
  Alert02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { Icon } from "../../../components/ui/Icon";
import {
  fetchAcademicMeta,
  fetchResults,
  processResults,
  approveResults,
  publishResults,
  lockResults,
  type AcademicMeta,
} from "../../../lib/academic-mgmt";
import {
  validateResultsCalculation,
  fetchCalculationBreakdown,
  fetchStudentTermSummary,
  type CalculationBreakdownData,
  type StudentTermSummaryData,
  type CalculationValidationResponse,
} from "../../../lib/results-calc";
import { TableSelectionBar } from "../../../components/students/ui";

const selectClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-slate-100 text-slate-600 border-slate-200",
    computed: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-sky-50 text-sky-700 border-sky-200",
    published: "bg-emerald-50 text-emerald-700 border-emerald-200",
    locked: "bg-purple-50 text-purple-700 border-purple-200",
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        styles[status] ?? "border-slate-200 bg-slate-100 text-slate-600"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

function formatScore(value: number | null | undefined, decimals = 2) {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(decimals);
}

export default function ResultsIndexPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);

  const [classId, setClassId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"class_overview" | "subject_sheet">(
    "class_overview",
  );

  const [run, setRun] = React.useState<{
    id: string;
    status: string;
    computed_at: string | null;
    published_at: string | null;
    calculation_version?: number | null;
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
      total_coefficients?: number | null;
      total_weighted_marks?: number | null;
      passed_subjects?: number | null;
      status?: string | null;
    }>
  >([]);

  const [subjectRows, setSubjectRows] = React.useState<
    Array<{
      student_id: string;
      subject_id: string;
      subject_name: string | null;
      ca_score: number;
      exam_score: number;
      total: number;
      grade: string | null;
      ca_average?: number | null;
      subject_mark?: number | null;
      coefficient?: number;
      weighted_mark?: number;
      sequence_scores?: Array<{
        name: string;
        raw: number | null;
        max: number;
        normalized: number | null;
        status: string;
        included: boolean;
      }>;
      remark?: string | null;
    }>
  >([]);

  const [classSummary, setClassSummary] = React.useState<{
    total_students: number;
    processed_students: number;
    incomplete_students: number;
    passed_students: number;
    failed_students: number;
    class_average: number | null;
    highest_average: number | null;
    lowest_average: number | null;
  } | null>(null);

  const [calcProfile, setCalcProfile] = React.useState<{
    id: string;
    name: string;
    version: number;
    ca_weight: number;
    exam_weight: number;
    pass_mark: number;
    sequence_method: string;
    rounding_places: number | string;
    scale: number;
    status: string;
  } | null>(null);

  // Modals & Drawers
  const [showConfirmModal, setShowConfirmModal] = React.useState(false);
  const [showValidationModal, setShowValidationModal] = React.useState(false);
  const [validationResult, setValidationResult] = React.useState<CalculationValidationResponse | null>(
    null,
  );
  const [validating, setValidating] = React.useState(false);
  const [calculating, setCalculating] = React.useState(false);

  // Breakdown drawer state
  const [breakdown, setBreakdown] = React.useState<CalculationBreakdownData | null>(null);
  const [breakdownStudentName, setBreakdownStudentName] = React.useState("");
  const [breakdownSubjectName, setBreakdownSubjectName] = React.useState("");
  const [loadingBreakdown, setLoadingBreakdown] = React.useState(false);

  // Student summary drawer state
  const [studentSummary, setStudentSummary] = React.useState<StudentTermSummaryData | null>(null);
  const [loadingSummary, setLoadingSummary] = React.useState(false);

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
    setSubjectRows(res.data.subject_rows);
    setClassSummary(res.data.class_summary ?? null);
    setCalcProfile(res.data.calculation_profile ?? null);

    // Default subjectId if not set
    if (!subjectId && res.data.subject_rows.length > 0) {
      setSubjectId(res.data.subject_rows[0].subject_id);
    }
  }, [classId, termId, subjectId]);

  React.useEffect(() => {
    if (!classId || loading) return;
    void loadResults();
  }, [classId, termId, loading, loadResults]);

  // Unique subjects available in subject_rows or meta
  const availableSubjects = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of subjectRows) {
      if (r.subject_id && r.subject_name) {
        map.set(r.subject_id, r.subject_name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [subjectRows]);

  // Rows filtered by chosen subject
  const currentSubjectRows = React.useMemo(() => {
    if (!subjectId) return [];
    return subjectRows.filter((r) => r.subject_id === subjectId);
  }, [subjectRows, subjectId]);

  // Max sequence count in current subject rows for table headers
  const maxSequences = React.useMemo(() => {
    let max = 0;
    for (const r of currentSubjectRows) {
      if (r.sequence_scores && r.sequence_scores.length > max) {
        max = r.sequence_scores.length;
      }
    }
    return max > 0 ? max : 3;
  }, [currentSubjectRows]);

  const [selectedSummaries, setSelectedSummaries] = React.useState<string[]>([]);
  const allSummariesSelected =
    summaries.length > 0 && selectedSummaries.length === summaries.length;
  function toggleSummary(id: string) {
    setSelectedSummaries((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAllSummaries() {
    if (allSummariesSelected) setSelectedSummaries([]);
    else setSelectedSummaries(summaries.map((s) => s.student_id));
  }
  function exportSelectedSummaries() {
    const target = summaries.filter((s) => selectedSummaries.includes(s.student_id));
    if (!target.length) return;
    const csv = [
      ["Rank", "Student", "Code", "Total Weighted", "Total Coeff", "Average", "Grade", "Status"].join(","),
      ...target.map((s) =>
        [
          s.position ?? "",
          `"${s.student_name}"`,
          `"${s.student_code || ""}"`,
          s.total_weighted_marks ?? s.total,
          s.total_coefficients ?? "",
          s.average,
          `"${s.grade || ""}"`,
          `"${s.status || ""}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `results-summaries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const [selectedSubjectRows, setSelectedSubjectRows] = React.useState<string[]>([]);
  const allSubjectRowsSelected =
    currentSubjectRows.length > 0 &&
    selectedSubjectRows.length === currentSubjectRows.length;
  function toggleSubjectRow(id: string) {
    setSelectedSubjectRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAllSubjectRows() {
    if (allSubjectRowsSelected) setSelectedSubjectRows([]);
    else setSelectedSubjectRows(currentSubjectRows.map((r) => r.student_id));
  }
  function exportSelectedSubjectRows() {
    const target = currentSubjectRows.filter((r) =>
      selectedSubjectRows.includes(r.student_id),
    );
    if (!target.length) return;
    const csv = [
      ["Student", "CA Avg", "Exam", "Subject Mark", "Coeff", "Weighted", "Grade"].join(","),
      ...target.map((r) => {
        const studentSummaryObj = summaries.find((s) => s.student_id === r.student_id);
        const studentName = studentSummaryObj?.student_name ?? "Student";
        return [
          `"${studentName}"`,
          r.ca_average ?? r.ca_score,
          r.exam_score,
          r.subject_mark ?? r.total,
          r.coefficient ?? 1,
          r.weighted_mark ?? "",
          `"${r.grade || ""}"`,
        ].join(",");
      }),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subject-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleStartCalculate() {
    setError("");
    setSuccess("");
    setValidating(true);
    const valRes = await validateResultsCalculation({
      class_id: classId,
      term_id: termId || null,
    });
    setValidating(false);
    if (!valRes.ok) {
      setError(valRes.error);
      return;
    }
    setValidationResult(valRes.data);
    if (!valRes.data.validation.ok) {
      setShowValidationModal(true);
    } else {
      setShowConfirmModal(true);
    }
  }

  async function handleConfirmCalculate() {
    setShowConfirmModal(false);
    setCalculating(true);
    setError("");
    setSuccess("");
    try {
      const res = await processResults({
        class_id: classId,
        term_id: termId || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `Results successfully calculated for ${res.data.students} student(s) across ${res.data.subjects} subject(s).`,
      );
      await loadResults();
    } finally {
      setCalculating(false);
    }
  }

  async function handleApprove() {
    setError("");
    setSuccess("");
    const res = await approveResults({
      class_id: classId,
      term_id: termId || null,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess("Results approved successfully.");
    await loadResults();
  }

  async function handlePublish() {
    setError("");
    setSuccess("");
    const res = await publishResults({
      class_id: classId,
      term_id: termId || null,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess("Results published successfully.");
    await loadResults();
  }

  async function handleLock() {
    if (!confirm("Are you sure you want to lock these results? Locked results cannot be modified or recomputed.")) {
      return;
    }
    setError("");
    setSuccess("");
    const res = await lockResults({
      class_id: classId,
      term_id: termId || null,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess("Results locked successfully.");
    await loadResults();
  }

  async function openBreakdown(studentId: string, subjId: string, sName: string, subName: string) {
    setBreakdownStudentName(sName);
    setBreakdownSubjectName(subName);
    setLoadingBreakdown(true);
    setBreakdown(null);
    const res = await fetchCalculationBreakdown({
      class_id: classId,
      term_id: termId || null,
      student_id: studentId,
      subject_id: subjId,
    });
    setLoadingBreakdown(false);
    if (res.ok) {
      setBreakdown(res.data);
    } else {
      setError(res.error);
    }
  }

  async function openStudentSummary(studentId: string) {
    setLoadingSummary(true);
    setStudentSummary(null);
    const res = await fetchStudentTermSummary({
      class_id: classId,
      term_id: termId || null,
      student_id: studentId,
    });
    setLoadingSummary(false);
    if (res.ok) {
      setStudentSummary(res.data);
    } else {
      setError(res.error);
    }
  }

  const selectedClassObj = meta?.classes.find((c) => c.id === classId);
  const selectedTermObj = meta?.terms.find((t) => t.id === termId);

  return (
    <AppShell
      title="Results Processing"
      breadcrumb={["Academic Management", "Results Processing"]}
      heading="Results Processing"
      subtitle="View, compute, review, and approve student results with school-configurable formulas."
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

      {/* Filter controls bar */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Class
              </label>
              <select
                className={`mt-1 min-w-44 ${selectClass}`}
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
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Term
              </label>
              <select
                className={`mt-1 min-w-36 ${selectClass}`}
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
            </div>

            {viewMode === "subject_sheet" ? (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Subject
                </label>
                <select
                  className={`mt-1 min-w-44 ${selectClass}`}
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  <option value="">Select Subject</option>
                  {availableSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/academic/results/calculation-settings"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300"
            >
              Calculation Settings
            </Link>
            <Link
              href="/academic/results/coefficients"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300"
            >
              Subject Coefficients
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading results…</p>
      ) : !classId ? (
        <p className="text-sm text-slate-500">Select a class to view and process results.</p>
      ) : (
        <>
          {/* Top Section: Class Summary Header & Calculation Method Compact Card */}
          <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_300px]">
            {/* Class Summary Header */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                    {selectedClassObj?.name ?? "Class"} — {selectedTermObj?.name ?? "Term"} Results
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Academic Year 2026/2027 · Formula: CA {calcProfile?.ca_weight ?? 40}% + Exam {calcProfile?.exam_weight ?? 60}% · Pass Mark: {calcProfile?.pass_mark ?? 10}/20
                  </p>
                </div>
                <div>
                  {run ? (
                    <div className="flex items-center gap-2">
                      <StatusBadge status={run.status} />
                      {run.calculation_version ? (
                        <span className="text-xs text-slate-400 font-mono">v{run.calculation_version}</span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400">Not Computed</span>
                  )}
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8 text-center">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                  <p className="text-[11px] font-medium uppercase text-slate-500">Students</p>
                  <p className="mt-0.5 text-base font-bold text-slate-900">
                    {classSummary?.total_students ?? summaries.length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                  <p className="text-[11px] font-medium uppercase text-slate-500">Processed</p>
                  <p className="mt-0.5 text-base font-bold text-slate-900">
                    {classSummary?.processed_students ?? (run ? summaries.length : 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                  <p className="text-[11px] font-medium uppercase text-slate-500">Incomplete</p>
                  <p className="mt-0.5 text-base font-bold text-amber-600">
                    {classSummary?.incomplete_students ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5">
                  <p className="text-[11px] font-medium uppercase text-emerald-700">Passed</p>
                  <p className="mt-0.5 text-base font-bold text-emerald-800">
                    {classSummary?.passed_students ?? summaries.filter((s) => s.average >= (calcProfile?.pass_mark ?? 10)).length}
                  </p>
                </div>
                <div className="rounded-xl border border-red-100 bg-red-50/60 p-2.5">
                  <p className="text-[11px] font-medium uppercase text-red-700">Failed</p>
                  <p className="mt-0.5 text-base font-bold text-red-800">
                    {classSummary?.failed_students ?? summaries.filter((s) => s.average < (calcProfile?.pass_mark ?? 10)).length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                  <p className="text-[11px] font-medium uppercase text-slate-500">Class Avg</p>
                  <p className="mt-0.5 text-base font-bold text-(--sofia-primary)">
                    {classSummary?.class_average != null ? `${formatScore(classSummary.class_average)}/20` : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                  <p className="text-[11px] font-medium uppercase text-slate-500">Highest</p>
                  <p className="mt-0.5 text-base font-bold text-slate-900">
                    {classSummary?.highest_average != null ? formatScore(classSummary.highest_average) : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                  <p className="text-[11px] font-medium uppercase text-slate-500">Lowest</p>
                  <p className="mt-0.5 text-base font-bold text-slate-900">
                    {classSummary?.lowest_average != null ? formatScore(classSummary.lowest_average) : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Calculation Method Card */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-xs text-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                  <h3 className="font-bold uppercase tracking-wider text-slate-700 text-[11px]">
                    CALCULATION METHOD
                  </h3>
                  <Link
                    href="/academic/results/calculation-settings"
                    className="text-[11px] font-semibold text-(--sofia-primary) hover:underline"
                  >
                    Edit Settings
                  </Link>
                </div>
                <div className="mt-3 space-y-1.5 text-slate-600">
                  <div className="flex justify-between">
                    <span>Continuous Assessment:</span>
                    <span className="font-bold text-slate-900">{calcProfile?.ca_weight ?? 40}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Examination:</span>
                    <span className="font-bold text-slate-900">{calcProfile?.exam_weight ?? 60}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pass Mark:</span>
                    <span className="font-bold text-slate-900">{calcProfile?.pass_mark ?? 10}/20</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sequence Method:</span>
                    <span className="font-semibold text-slate-900 capitalize">
                      {calcProfile?.sequence_method?.replace("_", " ") ?? "Simple Average"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rounding:</span>
                    <span className="font-semibold text-slate-900">
                      {calcProfile?.rounding_places ?? 2} decimals
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                <span>Profile: {calcProfile?.name ?? "Standard 40/60"}</span>
                <span className="font-mono">v{calcProfile?.version ?? 1}</span>
              </div>
            </div>
          </div>

          {/* Action and Workflow Bar */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViewMode("class_overview")}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  viewMode === "class_overview"
                    ? "bg-(--sofia-primary) text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Class Results Overview ({summaries.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode("subject_sheet")}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  viewMode === "subject_sheet"
                    ? "bg-(--sofia-primary) text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Subject Assessment Sheet
              </button>
            </div>

            {/* Workflow Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={calculating || validating || run?.status === "locked"}
                onClick={() => void handleStartCalculate()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-95 disabled:opacity-50"
              >
                <Icon icon={Calculator01Icon} size={14} />
                {calculating ? "Calculating…" : "Calculate Results"}
              </button>

              <button
                type="button"
                disabled={!run || run.status === "locked" || run.status === "approved" || run.status === "published"}
                onClick={() => void handleApprove()}
                className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Approve Results
              </button>

              <button
                type="button"
                disabled={!run || run.status === "locked" || run.status === "published"}
                onClick={() => void handlePublish()}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Icon icon={Upload04Icon} size={14} />
                Publish Results
              </button>

              <button
                type="button"
                disabled={!run || run.status === "locked"}
                onClick={() => void handleLock()}
                className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-50"
              >
                Lock Results
              </button>
            </div>
          </div>

          {/* VIEW 1: Class Results Overview Table */}
          {viewMode === "class_overview" ? (
            <>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={allSummariesSelected}
                          ref={(el) => {
                            if (el)
                              el.indeterminate =
                                selectedSummaries.length > 0 && !allSummariesSelected;
                          }}
                          onChange={toggleAllSummaries}
                          aria-label="Select all"
                        />
                      </th>
                      <th className="px-4 py-3.5 text-center">Rank</th>
                      <th className="px-5 py-3.5">Student</th>
                      <th className="px-4 py-3.5 text-right">Total Weighted</th>
                      <th className="px-4 py-3.5 text-center">Total Coeff</th>
                      <th className="px-4 py-3.5 text-right">Term Average</th>
                      <th className="px-4 py-3.5 text-center">Grade</th>
                      <th className="px-4 py-3.5 text-center">Status</th>
                      <th className="px-5 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summaries.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-5 py-12 text-center text-slate-500">
                          No processed results found for this class and term.
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => void handleStartCalculate()}
                              className="inline-flex items-center gap-1 rounded-xl bg-(--sofia-primary) px-4 py-2 text-xs font-semibold text-white shadow-xs"
                            >
                              <Icon icon={Calculator01Icon} size={14} />
                              Calculate Results Now
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      summaries.map((s) => {
                        const isPass =
                          s.status === "PASSED" ||
                          (s.status == null && s.average >= (calcProfile?.pass_mark ?? 10));
                        return (
                          <tr
                            key={s.student_id}
                            className="hover:bg-slate-50/70 transition cursor-pointer"
                            onClick={() => void openStudentSummary(s.student_id)}
                          >
                            <td
                              className="px-4 py-3.5 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={selectedSummaries.includes(s.student_id)}
                                onChange={() => toggleSummary(s.student_id)}
                              />
                            </td>
                            <td className="px-4 py-3.5 text-center font-bold text-slate-700">
                              {s.position != null ? (
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-800">
                                  {s.position}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="font-semibold text-slate-900 hover:text-(--sofia-primary)">
                                {s.student_name}
                              </span>
                              {s.student_code ? (
                                <span className="ml-2 font-mono text-xs text-slate-400">
                                  {s.student_code}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3.5 text-right font-medium text-slate-700">
                              {formatScore(s.total_weighted_marks ?? s.total)}
                            </td>
                            <td className="px-4 py-3.5 text-center font-mono text-xs text-slate-600">
                              {s.total_coefficients != null ? formatScore(s.total_coefficients, 1) : "—"}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-(--sofia-primary)">
                              {formatScore(s.average)} <span className="text-xs font-normal text-slate-400">/20</span>
                            </td>
                            <td className="px-4 py-3.5 text-center font-bold text-slate-800">
                              {s.grade ?? "—"}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  isPass
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-red-50 text-red-700 border border-red-200"
                                }`}
                              >
                                {s.status ?? (isPass ? "PASSED" : "FAILED")}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openStudentSummary(s.student_id);
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300"
                              >
                                Term Summary →
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <TableSelectionBar
                totalCount={summaries.length}
                selectedCount={selectedSummaries.length}
                allSelected={allSummariesSelected}
                onToggleAll={toggleAllSummaries}
                onClear={() => setSelectedSummaries([])}
                actions={
                  <button
                    type="button"
                    onClick={exportSelectedSummaries}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Export selected summaries ({selectedSummaries.length})
                  </button>
                }
              />
            </>
          ) : (
            /* VIEW 2: Subject Results Sheet Table with Sequence Columns */
            <>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5 sticky left-0 bg-slate-50 z-20 text-center">
                        <input
                          type="checkbox"
                          checked={allSubjectRowsSelected}
                          ref={(el) => {
                            if (el)
                              el.indeterminate =
                                selectedSubjectRows.length > 0 &&
                                !allSubjectRowsSelected;
                          }}
                          onChange={toggleAllSubjectRows}
                          aria-label="Select all"
                        />
                      </th>
                      <th className="px-5 py-3.5 sticky left-12 bg-slate-50 z-10">Student</th>
                      {Array.from({ length: maxSequences }).map((_, i) => (
                        <th key={i} className="px-3 py-3.5 text-center">
                          Seq {i + 1}
                        </th>
                      ))}
                      <th className="px-4 py-3.5 text-right">CA Avg</th>
                      <th className="px-4 py-3.5 text-right">Exam</th>
                      <th className="px-4 py-3.5 text-right">Subject Mark</th>
                      <th className="px-3 py-3.5 text-center">Coeff</th>
                      <th className="px-4 py-3.5 text-right">Weighted</th>
                      <th className="px-4 py-3.5 text-center">Grade</th>
                      <th className="px-5 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentSubjectRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={maxSequences + 8}
                          className="px-5 py-12 text-center text-slate-500"
                        >
                          {subjectId
                            ? "No marks recorded for this subject yet."
                            : "Please select a subject from the filter bar above."}
                        </td>
                      </tr>
                    ) : (
                      currentSubjectRows.map((r) => {
                        const studentSummaryObj = summaries.find(
                          (s) => s.student_id === r.student_id,
                        );
                        const studentName = studentSummaryObj?.student_name ?? "Student";

                        return (
                          <tr
                            key={r.student_id}
                            className="hover:bg-slate-50/70 transition cursor-pointer"
                            onClick={() =>
                              void openBreakdown(
                                r.student_id,
                                r.subject_id,
                                studentName,
                                r.subject_name ?? "Subject",
                              )
                            }
                          >
                            <td
                              className="px-4 py-3.5 sticky left-0 bg-white z-20 text-center shadow-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={selectedSubjectRows.includes(r.student_id)}
                                onChange={() => toggleSubjectRow(r.student_id)}
                              />
                            </td>
                            <td className="px-5 py-3.5 sticky left-12 bg-white font-medium text-slate-900 z-10 shadow-xs">
                              <span className="hover:text-(--sofia-primary)">{studentName}</span>
                            </td>
                            {Array.from({ length: maxSequences }).map((_, i) => {
                              const seq = r.sequence_scores?.[i];
                              return (
                                <td key={i} className="px-3 py-3.5 text-center text-slate-600 font-mono text-xs">
                                  {seq ? (
                                    seq.status === "absent" ? (
                                      <span className="text-amber-600 font-sans text-[11px]">Abs</span>
                                    ) : seq.raw != null ? (
                                      formatScore(seq.raw, 1)
                                    ) : (
                                      "—"
                                    )
                                  ) : (
                                    "—"
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3.5 text-right font-medium text-slate-800">
                              {formatScore(r.ca_average ?? r.ca_score)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-medium text-slate-800">
                              {formatScore(r.exam_score)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                              {formatScore(r.subject_mark ?? r.total)}
                            </td>
                            <td className="px-3 py-3.5 text-center font-mono text-xs text-slate-600">
                              {r.coefficient ?? 1}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-(--sofia-primary)">
                              {formatScore(r.weighted_mark ?? (r.total * (r.coefficient ?? 1)))}
                            </td>
                            <td className="px-4 py-3.5 text-center font-bold text-slate-700">
                              {r.grade ?? "—"}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openBreakdown(
                                    r.student_id,
                                    r.subject_id,
                                    studentName,
                                    r.subject_name ?? "Subject",
                                  );
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300"
                              >
                                Breakdown →
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <TableSelectionBar
                totalCount={currentSubjectRows.length}
                selectedCount={selectedSubjectRows.length}
                allSelected={allSubjectRowsSelected}
                onToggleAll={toggleAllSubjectRows}
                onClear={() => setSelectedSubjectRows([])}
                actions={
                  <button
                    type="button"
                    onClick={exportSelectedSubjectRows}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Export selected marks ({selectedSubjectRows.length})
                  </button>
                }
              />
            </>
          )}
        </>
      )}

      {/* CONFIRMATION MODAL */}
      {showConfirmModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Calculate Results?</h3>
            <p className="mt-2 text-xs text-slate-500">
              Sofia will calculate results using the active formula:
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Continuous Assessment:</span>
                <span className="font-bold text-slate-900">{calcProfile?.ca_weight ?? 40}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Examination:</span>
                <span className="font-bold text-slate-900">{calcProfile?.exam_weight ?? 60}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Pass Mark:</span>
                <span className="font-bold text-slate-900">{calcProfile?.pass_mark ?? 10} / 20</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Sequence Method:</span>
                <span className="font-semibold text-slate-900 capitalize">
                  {calcProfile?.sequence_method?.replace("_", " ") ?? "Simple Average"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Rounding:</span>
                <span className="font-semibold text-slate-900">
                  {calcProfile?.rounding_places ?? 2} decimal places
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200/80 flex justify-between font-semibold">
                <span className="text-slate-700">Class & Term:</span>
                <span className="text-slate-900">
                  {selectedClassObj?.name} · {selectedTermObj?.name}
                </span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Scope:</span>
                <span>
                  {validationResult?.validation.total_students ?? summaries.length} students · {validationResult?.validation.total_subjects ?? availableSubjects.length} subjects
                </span>
              </div>
            </div>

            {run && (run.status === "approved" || run.status === "locked") ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                ⚠ Warning: This run is currently <strong>{run.status}</strong>. Calculating will update the computed dataset.
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmCalculate()}
                className="rounded-xl bg-(--sofia-primary) px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-95"
              >
                Calculate Results
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* VALIDATION MODAL */}
      {showValidationModal && validationResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                RESULT PROCESSING VALIDATION
              </h3>
              <button
                type="button"
                onClick={() => setShowValidationModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <Icon icon={Cancel01Icon} size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 text-emerald-700">
                <Icon icon={CheckmarkCircle02Icon} size={16} />
                <span>{validationResult.validation.total_students} students enrolled</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-700">
                <Icon icon={CheckmarkCircle02Icon} size={16} />
                <span>{validationResult.validation.total_subjects} subjects configured</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-700">
                <Icon icon={CheckmarkCircle02Icon} size={16} />
                <span>Assessment weights = {validationResult.validation.assessment_weights_total}%</span>
              </div>

              {[...validationResult.validation.blocking_issues, ...validationResult.validation.warnings].length > 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="font-semibold text-slate-700">Identified Issues:</p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {[...validationResult.validation.blocking_issues, ...validationResult.validation.warnings].map((issue: { type: string; message: string }, idx: number) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-2 rounded-xl p-2.5 text-xs ${
                          issue.type === "blocking"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}
                      >
                        <Icon icon={Alert02Icon} size={16} className="shrink-0 mt-0.5" />
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex justify-between items-center pt-3 border-t border-slate-100">
              <Link
                href="/academic/results/coefficients"
                className="text-xs font-semibold text-(--sofia-primary) hover:underline"
              >
                Configure Coefficients →
              </Link>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowValidationModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                {validationResult.validation.ok ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowValidationModal(false);
                      setShowConfirmModal(true);
                    }}
                    className="rounded-xl bg-(--sofia-primary) px-4 py-2 text-xs font-semibold text-white shadow-xs"
                  >
                    Proceed to Calculate
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* CALCULATION BREAKDOWN MODAL / DRAWER */}
      {breakdown || loadingBreakdown ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 uppercase">
                  {breakdownStudentName}
                </h3>
                <p className="text-xs font-semibold text-(--sofia-primary)">
                  {breakdownSubjectName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBreakdown(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <Icon icon={Cancel01Icon} size={18} />
              </button>
            </div>

            {loadingBreakdown ? (
              <p className="py-8 text-center text-xs text-slate-500">Loading breakdown…</p>
            ) : breakdown ? (
              <div className="mt-4 space-y-4 text-xs">
                {/* Sequences */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <h4 className="font-bold uppercase tracking-wider text-slate-600 text-[11px]">
                    SEQUENCE SCORES
                  </h4>
                  <div className="mt-2 space-y-1">
                    {breakdown.sequence_details.map((seq: { name: string; status: string; raw: number | null; max: number }, i: number) => (
                      <div key={i} className="flex justify-between text-slate-700">
                        <span>{seq.name}:</span>
                        <span className="font-mono font-semibold">
                          {seq.status === "absent" ? "Absent" : `${formatScore(seq.raw, 1)} / ${seq.max}`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900">
                    <span>CA Average:</span>
                    <span className="font-mono text-(--sofia-primary)">
                      {formatScore(breakdown.ca_average)} / 20
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[11px] mt-1">
                    <span>CA Weight ({breakdown.ca_weight}%):</span>
                    <span className="font-mono font-semibold">
                      +{formatScore(breakdown.ca_contribution)}
                    </span>
                  </div>
                </div>

                {/* Exam */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <h4 className="font-bold uppercase tracking-wider text-slate-600 text-[11px]">
                    EXAM
                  </h4>
                  <div className="mt-2 flex justify-between text-slate-700">
                    <span>Exam Score:</span>
                    <span className="font-mono font-semibold">
                      {formatScore(breakdown.exam_normalized ?? breakdown.exam_raw)} / 20
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[11px] mt-1">
                    <span>Exam Weight ({breakdown.exam_weight}%):</span>
                    <span className="font-mono font-semibold">
                      +{formatScore(breakdown.exam_contribution)}
                    </span>
                  </div>
                </div>

                {/* Subject Mark */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                  <div className="flex justify-between text-xs font-bold text-slate-900">
                    <span>SUBJECT MARK:</span>
                    <span className="font-mono text-base text-(--sofia-primary)">
                      {formatScore(breakdown.subject_mark)} / 20
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ({formatScore(breakdown.ca_contribution)} CA + {formatScore(breakdown.exam_contribution)} Exam)
                  </p>
                </div>

                {/* Coefficient & Weighted Score */}
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-indigo-900">
                  <div className="flex justify-between text-xs">
                    <span>Subject Coefficient:</span>
                    <span className="font-mono font-bold">{breakdown.coefficient}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-indigo-200/60 flex justify-between text-xs font-bold">
                    <span>WEIGHTED SCORE:</span>
                    <span className="font-mono text-base text-indigo-950">
                      {formatScore(breakdown.weighted_mark)}
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-700/80 mt-0.5">
                    ({formatScore(breakdown.subject_mark)} × {breakdown.coefficient})
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setBreakdown(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* STUDENT TERM SUMMARY MODAL */}
      {studentSummary || loadingSummary ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 uppercase">
                  {studentSummary?.student_name ?? "Student Result"}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedClassObj?.name} · {selectedTermObj?.name} Summary
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStudentSummary(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <Icon icon={Cancel01Icon} size={18} />
              </button>
            </div>

            {loadingSummary ? (
              <p className="py-8 text-center text-xs text-slate-500">Loading summary…</p>
            ) : studentSummary ? (
              <div className="mt-4 space-y-5 text-xs">
                {/* Overall Score Box */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[11px] text-slate-500 uppercase font-medium">Total Weighted</p>
                    <p className="mt-0.5 font-mono text-base font-bold text-slate-900">
                      {formatScore(studentSummary.total_weighted_marks)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[11px] text-slate-500 uppercase font-medium">Total Coeffs</p>
                    <p className="mt-0.5 font-mono text-base font-bold text-slate-900">
                      {formatScore(studentSummary.total_coefficients, 1)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[11px] text-slate-500 uppercase font-medium">Term Average</p>
                    <p className="mt-0.5 font-mono text-base font-bold text-(--sofia-primary)">
                      {formatScore(studentSummary.term_average)} / 20
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[11px] text-slate-500 uppercase font-medium">Status</p>
                    <p className="mt-0.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                          studentSummary.status === "PASSED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {studentSummary.status}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Subjects breakdown */}
                <div>
                  <h4 className="font-bold uppercase tracking-wider text-slate-700 text-[11px] mb-2">
                    SUBJECT SCORES
                  </h4>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
                        <tr>
                          <th className="px-3 py-2">Subject</th>
                          <th className="px-2 py-2 text-right">CA</th>
                          <th className="px-2 py-2 text-right">Exam</th>
                          <th className="px-2 py-2 text-right">Mark</th>
                          <th className="px-2 py-2 text-center">Coeff</th>
                          <th className="px-2 py-2 text-right">Weighted</th>
                          <th className="px-2 py-2 text-center">Grade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {studentSummary.subjects.map((sub: { subject_name: string; ca_average: number | null; exam_score: number | null; subject_mark: number | null; coefficient: number; weighted_mark: number | null; grade: string | null }, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-900">{sub.subject_name}</td>
                            <td className="px-2 py-2 text-right text-slate-600">{formatScore(sub.ca_average)}</td>
                            <td className="px-2 py-2 text-right text-slate-600">{formatScore(sub.exam_score)}</td>
                            <td className="px-2 py-2 text-right font-bold text-slate-900">{formatScore(sub.subject_mark)}</td>
                            <td className="px-2 py-2 text-center font-mono">{sub.coefficient}</td>
                            <td className="px-2 py-2 text-right font-bold text-(--sofia-primary)">
                              {formatScore(sub.weighted_mark)}
                            </td>
                            <td className="px-2 py-2 text-center font-bold">{sub.grade ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setStudentSummary(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
