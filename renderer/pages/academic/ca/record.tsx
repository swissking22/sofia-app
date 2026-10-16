import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  fetchCaScores,
  fetchCaSequence,
  saveCaScores,
  type CaSequenceDetailDto,
} from "../../../lib/academic-mgmt";
import {
  clampScoreInput,
  handleScoreGridKeyDown,
} from "../../../lib/score-entry";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

const inputClassBase =
  "w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

/** Below half of max → red; half or above → black. Empty stays neutral. */
function scoreInputClass(score: number | null, max: number) {
  if (score === null || !(max > 0)) {
    return `${inputClassBase} text-slate-900`;
  }
  if (score < max / 2) {
    return `${inputClassBase} text-red-600`;
  }
  return `${inputClassBase} text-slate-900`;
}

export default function CaRecordMarksPage() {
  const router = useRouter();
  const sequenceName =
    typeof router.query.name === "string" ? router.query.name : "";
  const termId =
    typeof router.query.term_id === "string" ? router.query.term_id : "";

  const [loadingSeq, setLoadingSeq] = React.useState(true);
  const [loadingScores, setLoadingScores] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [sequence, setSequence] = React.useState<CaSequenceDetailDto | null>(
    null,
  );
  const [classId, setClassId] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [assessmentId, setAssessmentId] = React.useState("");
  const [maxScore, setMaxScore] = React.useState(0);
  const [teacherName, setTeacherName] = React.useState<string | null>(null);
  const [scores, setScores] = React.useState<
    Array<{
      id: string;
      name: string;
      student_code: string | null;
      score: number | null;
    }>
  >([]);
  const scoreInputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const loadSequence = React.useCallback(async () => {
    if (!sequenceName || !termId) {
      setLoadingSeq(false);
      return;
    }
    setLoadingSeq(true);
    setError("");
    const res = await fetchCaSequence({ name: sequenceName, term_id: termId });
    if (res.ok) {
      setSequence(res.data);
      setClassId((prev) => {
        if (prev && res.data.classes.some((c) => c.id === prev)) return prev;
        return res.data.classes[0]?.id ?? "";
      });
    } else {
      setError(res.error);
      setSequence(null);
    }
    setLoadingSeq(false);
  }, [sequenceName, termId]);

  React.useEffect(() => {
    if (router.isReady) void loadSequence();
  }, [router.isReady, loadSequence]);

  const subjectsForClass = React.useMemo(() => {
    if (!sequence || !classId) return [];
    const seen = new Set<string>();
    const out: Array<{
      id: string;
      name: string;
      assessmentId: string;
      max: number;
    }> = [];
    for (const sheet of sequence.sheets) {
      if (sheet.class_id !== classId) continue;
      if (seen.has(sheet.subject_id)) continue;
      seen.add(sheet.subject_id);
      out.push({
        id: sheet.subject_id,
        name: sheet.subject_name || "Subject",
        assessmentId: sheet.id,
        max: sheet.max_score,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [sequence, classId]);

  React.useEffect(() => {
    setSubjectId((prev) => {
      if (prev && subjectsForClass.some((s) => s.id === prev)) return prev;
      return subjectsForClass[0]?.id ?? "";
    });
  }, [subjectsForClass]);

  const loadScores = React.useCallback(async () => {
    const sheet = subjectsForClass.find((s) => s.id === subjectId);
    if (!sheet) {
      setAssessmentId("");
      setScores([]);
      setMaxScore(0);
      setTeacherName(null);
      return;
    }
    setLoadingScores(true);
    setError("");
    setSuccess("");
    const res = await fetchCaScores(sheet.assessmentId);
    if (res.ok) {
      setAssessmentId(res.data.assessment.id);
      setMaxScore(res.data.assessment.max_score);
      setTeacherName(res.data.assessment.teacher_name);
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
      setAssessmentId("");
      setScores([]);
      setTeacherName(null);
    }
    setLoadingScores(false);
  }, [subjectsForClass, subjectId]);

  React.useEffect(() => {
    if (subjectId) void loadScores();
  }, [subjectId, loadScores]);

  function updateScore(studentId: string, value: string) {
    setScores((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        if (value.trim() === "") return { ...s, score: null };
        if (Number.isNaN(Number(value))) return s;
        return { ...s, score: clampScoreInput(value, maxScore) };
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
      setSuccess(`Saved marks for ${res.data.saved} student(s).`);
      await loadSequence();
    } finally {
      setSaving(false);
    }
  }

  if (!router.isReady) {
    return (
      <AppShell
        title="Record marks"
        breadcrumb={[
          "Academic Management",
          "Continuous Assessment",
          "Record marks",
        ]}
        heading="Record marks"
        backHref="/academic/ca"
      >
        <p className="text-sm text-slate-500">Loading…</p>
      </AppShell>
    );
  }

  if (!sequenceName || !termId) {
    return (
      <AppShell
        title="Record marks"
        breadcrumb={[
          "Academic Management",
          "Continuous Assessment",
          "Record marks",
        ]}
        heading="Record marks"
        backHref="/academic/ca"
      >
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Open a sequence from Continuous Assessment and choose Record marks.
        </div>
        <Link
          href="/academic/ca"
          className="inline-flex rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
        >
          Back to sequences
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Record marks"
      breadcrumb={[
        "Academic Management",
        "Continuous Assessment",
        "Record marks",
      ]}
      heading={sequence?.name || sequenceName}
      subtitle={
        sequence
          ? `${sequence.term_name ?? "Term"} · max ${sequence.max_score} · choose class, then subject, then enter marks`
          : "Loading sequence…"
      }
      backHref="/academic/ca"
      actions={
        <button
          type="button"
          disabled={saving || loadingScores || !assessmentId}
          onClick={() => void handleSave()}
          className="cursor-pointer rounded-lg bg-(--sofia-primary) px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save marks"}
        </button>
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

      {loadingSeq ? (
        <p className="text-sm text-slate-500">Loading sequence…</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Class
              </span>
              <select
                className={selectClass}
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setSubjectId("");
                  setSuccess("");
                }}
              >
                {(sequence?.classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Subject
              </span>
              <select
                className={selectClass}
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setSuccess("");
                }}
                disabled={!classId || subjectsForClass.length === 0}
              >
                {subjectsForClass.length === 0 ? (
                  <option value="">No subjects</option>
                ) : (
                  subjectsForClass.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            {subjectId ? (
              <div className="flex flex-col justify-end gap-1 self-end pb-0.5">
                <p className="text-sm text-slate-700">
                  Teacher:{" "}
                  <span className="font-semibold text-slate-900">
                    {loadingScores
                      ? "…"
                      : teacherName?.trim() || "Not assigned"}
                  </span>
                </p>
              </div>
            ) : null}
          </div>

          <p className="mb-3 text-sm text-slate-500">
            Type a mark, then press{" "}
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1">
              ↓
            </kbd>{" "}
            or{" "}
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1">
              Enter
            </kbd>{" "}
            for the next student,{" "}
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1">
              ↑
            </kbd>{" "}
            for the previous. Max score: {maxScore || "—"}.
          </p>

          {loadingScores ? (
            <p className="text-sm text-slate-500">Loading students…</p>
          ) : !subjectId ? (
            <p className="text-sm text-slate-500">
              Select a subject to enter marks.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Student ID</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Mark (/{maxScore})</th>
                  </tr>
                </thead>
                <tbody>
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
                      <tr
                        key={s.id}
                        className="border-t border-slate-100 hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-2.5 text-slate-400">
                          {index + 1}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                          {s.student_code || "—"}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {s.name}
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            ref={(el) => {
                              scoreInputRefs.current[index] = el;
                            }}
                            type="number"
                            min={0}
                            max={maxScore}
                            step="0.01"
                            inputMode="decimal"
                            className={scoreInputClass(s.score, maxScore)}
                            value={s.score ?? ""}
                            onChange={(e) => updateScore(s.id, e.target.value)}
                            onKeyDown={(e) =>
                              handleScoreGridKeyDown(e, index, scoreInputRefs)
                            }
                            placeholder="—"
                            aria-label={`Mark for ${s.name}`}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
