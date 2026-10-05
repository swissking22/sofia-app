import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  fetchExamPapers,
  fetchExamScores,
  saveExamScores,
  type ExamPaperDto,
} from "../../../lib/academic-mgmt";
import { handleScoreGridKeyDown } from "../../../lib/score-entry";
import { formatDisplayDate } from "../../../lib/date-format";
import { ClientPaginatedTable } from "../../../components/ui/table-pagination";
import { TableSelectionBar } from "../../../components/students/ui";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

const inputClass =
  "w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

function paperLabel(p: ExamPaperDto) {
  const subject = p.subject_name || "Subject";
  const cls = p.class_name || "Class";
  const session = p.session_name || "Session";
  return `${subject} — ${cls} — ${session}`;
}

export default function ExamScoresPage() {
  const router = useRouter();
  const queryPaperId =
    typeof router.query.paper_id === "string" ? router.query.paper_id : "";
  const querySessionId =
    typeof router.query.session_id === "string" ? router.query.session_id : "";

  const [loadingPapers, setLoadingPapers] = React.useState(true);
  const [loadingScores, setLoadingScores] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [papers, setPapers] = React.useState<ExamPaperDto[]>([]);
  const [paperId, setPaperId] = React.useState("");
  const [maxScore, setMaxScore] = React.useState(0);
  const [paperTitle, setPaperTitle] = React.useState("");
  const [scores, setScores] = React.useState<
    Array<{
      id: string;
      name: string;
      student_code: string | null;
      score: number | null;
    }>
  >([]);
  const scoreInputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const allSelected = scores.length > 0 && selectedIds.length === scores.length;
  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(scores.map((s) => s.id));
  }
  function bulkSetScore(val: number | null) {
    setScores((prev) =>
      prev.map((s) => (selectedIds.includes(s.id) ? { ...s, score: val } : s)),
    );
  }
  function exportSelected() {
    const target = scores.filter((s) => selectedIds.includes(s.id));
    if (!target.length) return;
    const csv = [
      ["Student ID", "Name", `Score (max ${maxScore})`].join(","),
      ...target.map((s) =>
        [`"${s.student_code || ""}"`, `"${s.name}"`, s.score ?? ""].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `exam-scores-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  React.useEffect(() => {
    if (!router.isReady) return;
    void (async () => {
      setLoadingPapers(true);
      setError("");
      const res = await fetchExamPapers(
        querySessionId ? { session_id: querySessionId } : undefined,
      );
      if (res.ok) {
        setPapers(res.data);
        if (queryPaperId && res.data.some((p) => p.id === queryPaperId)) {
          setPaperId(queryPaperId);
        } else if (res.data.length === 1) {
          setPaperId(res.data[0].id);
        }
      } else {
        setError(res.error);
      }
      setLoadingPapers(false);
    })();
  }, [router.isReady, queryPaperId, querySessionId]);

  const loadScores = React.useCallback(async (id: string) => {
    if (!id) return;
    setLoadingScores(true);
    setError("");
    const res = await fetchExamScores(id);
    if (res.ok) {
      setMaxScore(res.data.paper.max_score);
      const title = [res.data.paper.subject_name, res.data.paper.class_name]
        .filter(Boolean)
        .join(" — ");
      setPaperTitle(title || "Exam paper");
      setScores(
        res.data.students.map((s) => ({
          id: s.id,
          name: s.name,
          student_code: s.student_code,
          score: s.score,
        })),
      );
    } else {
      setError(res.error);
      setScores([]);
    }
    setLoadingScores(false);
  }, []);

  React.useEffect(() => {
    if (paperId) void loadScores(paperId);
    else {
      setScores([]);
      setMaxScore(0);
      setPaperTitle("");
    }
  }, [paperId, loadScores]);

  function updateScore(studentId: string, value: string) {
    setScores((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        if (value.trim() === "") return { ...s, score: null };
        const num = Number(value);
        return { ...s, score: Number.isNaN(num) ? s.score : num };
      }),
    );
  }

  async function handleSave() {
    if (!paperId) return;
    setError("");
    setSuccess("");

    for (const s of scores) {
      if (s.score !== null && (s.score < 0 || s.score > maxScore)) {
        setError(`Score for ${s.name} must be between 0 and ${maxScore}.`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await saveExamScores({
        paper_id: paperId,
        scores: scores.map((s) => ({
          student_id: s.id,
          score: s.score,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Saved scores for ${res.data.saved} student(s).`);
    } finally {
      setSaving(false);
    }
  }

  const selectedPaper = papers.find((p) => p.id === paperId);

  return (
    <AppShell
      title="Enter exam scores"
      breadcrumb={["Academic Management", "Examinations", "Enter scores"]}
      heading="Enter exam scores"
      subtitle={
        paperId && maxScore > 0
          ? `${paperTitle} — max score: ${maxScore}`
          : "Select an exam paper to enter scores."
      }
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

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <label className="block min-w-72 text-xs font-medium text-slate-500">
          Exam paper
          <select
            className={`mt-1 block w-full ${selectClass}`}
            value={paperId}
            onChange={(e) => setPaperId(e.target.value)}
            disabled={loadingPapers}
          >
            <option value="">Select paper…</option>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {paperLabel(p)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!paperId || saving || loadingScores}
            onClick={() => void handleSave()}
            className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save scores"}
          </button>
        </div>
      </div>

      {selectedPaper ? (
        <p className="mb-3 text-sm text-slate-500">
          Max score for this paper:{" "}
          <span className="font-semibold text-slate-700">
            {selectedPaper.max_score}
          </span>
          {selectedPaper.exam_date ? (
            <> · Exam date: {formatDisplayDate(selectedPaper.exam_date)}</>
          ) : null}
        </p>
      ) : null}

      {loadingPapers || loadingScores ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !paperId ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Choose an exam paper from the dropdown to load the student roster.
        </div>
      ) : (
        <>
          <ClientPaginatedTable
            head={
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            selectedIds.length > 0 && !allSelected;
                      }}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Score (max {maxScore})</th>
                </tr>
              </thead>
            }
          >
            {scores.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No students in this class.
                </td>
              </tr>
            ) : (
              scores.map((s, index) => (
                <tr key={s.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggleRow(s.id)}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {s.student_code || "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {s.name}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      ref={(el) => {
                        scoreInputRefs.current[index] = el;
                      }}
                      type="number"
                      min={0}
                      max={maxScore}
                      step="0.01"
                      className={inputClass}
                      value={s.score ?? ""}
                      onChange={(e) => updateScore(s.id, e.target.value)}
                      onKeyDown={(e) =>
                        handleScoreGridKeyDown(e, index, scoreInputRefs)
                      }
                      placeholder="—"
                    />
                  </td>
                </tr>
              ))
            )}
          </ClientPaginatedTable>

          <TableSelectionBar
            totalCount={scores.length}
            selectedCount={selectedIds.length}
            allSelected={allSelected}
            onToggleAll={toggleAll}
            onClear={() => setSelectedIds([])}
            actions={
              <>
                <button
                  type="button"
                  onClick={() => bulkSetScore(maxScore)}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Set to max ({maxScore})
                </button>
                <button
                  type="button"
                  onClick={() => bulkSetScore(null)}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  Clear scores
                </button>
                <button
                  type="button"
                  onClick={exportSelected}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Export selected ({selectedIds.length})
                </button>
              </>
            }
          />
        </>
      )}
    </AppShell>
  );
}
