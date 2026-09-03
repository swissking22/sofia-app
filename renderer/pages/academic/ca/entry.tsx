import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import { fetchCaScores, saveCaScores } from "../../../lib/academic-mgmt";
import { handleScoreGridKeyDown } from "../../../lib/score-entry";

const inputClass =
  "w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function CaEntryPage() {
  const router = useRouter();
  const assessmentId =
    typeof router.query.assessment_id === "string"
      ? router.query.assessment_id
      : "";

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [maxScore, setMaxScore] = React.useState(0);
  const [assessmentName, setAssessmentName] = React.useState("");
  const [subjectName, setSubjectName] = React.useState<string | null>(null);
  const [scores, setScores] = React.useState<
    Array<{
      id: string;
      name: string;
      student_code: string | null;
      score: number | null;
    }>
  >([]);
  const scoreInputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const load = React.useCallback(async () => {
    if (!assessmentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetchCaScores(assessmentId);
    if (res.ok) {
      setMaxScore(res.data.assessment.max_score);
      setAssessmentName(res.data.assessment.name);
      setSubjectName(res.data.assessment.subject_name);
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
    }
    setLoading(false);
  }, [assessmentId]);

  React.useEffect(() => {
    if (router.isReady) void load();
  }, [router.isReady, load]);

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
    if (!assessmentId) return;
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
      const res = await saveCaScores({
        assessment_id: assessmentId,
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

  if (!router.isReady) {
    return (
      <AppShell
        title="Enter CA scores"
        breadcrumb={[
          "Academic Management",
          "Continuous Assessment",
          "Enter scores",
        ]}
        heading="Enter CA scores"
      >
        <p className="text-sm text-slate-500">Loading…</p>
      </AppShell>
    );
  }

  if (!assessmentId) {
    return (
      <AppShell
        title="Enter CA scores"
        breadcrumb={[
          "Academic Management",
          "Continuous Assessment",
          "Enter scores",
        ]}
        heading="Enter CA scores"
        subtitle="Assessment ID is required."
      >
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Missing assessment_id in the URL. Select an assessment from the CA
          list.
        </div>
        <Link
          href="/academic/ca"
          className="inline-flex rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
        >
          Back to assessments
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Enter CA scores"
      breadcrumb={[
        "Academic Management",
        "Continuous Assessment",
        "Enter scores",
      ]}
      heading={assessmentName || "Enter CA scores"}
      subtitle={
        subjectName
          ? `${subjectName} — max score: ${maxScore}`
          : `Max score: ${maxScore}`
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href="/academic/ca"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
        >
          Back to assessments
        </Link>
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void handleSave()}
          className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save scores"}
        </button>
        <span className="text-sm text-slate-500">
          Enter a score from 0 to {maxScore} for each student.
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading roster…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Student ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Score (max {maxScore})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scores.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No students in this class.
                  </td>
                </tr>
              ) : (
                scores.map((s, index) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
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
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
