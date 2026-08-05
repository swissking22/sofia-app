import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import { Icon } from "../../../components/ui/Icon";
import {
  createExamSession,
  fetchAcademicMeta,
  type AcademicMeta,
} from "../../../lib/academic-mgmt";

const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

const STATUS_OPTIONS = [
  { key: "draft", label: "Draft" },
  { key: "active", label: "Active" },
  { key: "closed", label: "Closed" },
] as const;

interface PaperRow {
  key: string;
  subject_id: string;
  class_id: string;
  max_score: string;
  exam_date: string;
}

function emptyPaper(): PaperRow {
  return {
    key: String(Date.now()) + Math.random(),
    subject_id: "",
    class_id: "",
    max_score: "100",
    exam_date: "",
  };
}

export default function CreateExamSessionPage() {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);

  const [name, setName] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [status, setStatus] = React.useState("draft");
  const [papers, setPapers] = React.useState<PaperRow[]>([emptyPaper()]);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAcademicMeta();
      if (res.ok) setMeta(res.data);
      else setError(res.error);
    })();
  }, []);

  function subjectsForClass(classId: string) {
    if (!meta || !classId) return meta?.subjects ?? [];
    return meta.subjects.filter((s) => s.class_ids.includes(classId));
  }

  function updatePaper(key: string, patch: Partial<PaperRow>) {
    setPapers((prev) =>
      prev.map((p) => (p.key === key ? { ...p, ...patch } : p)),
    );
  }

  function removePaper(key: string) {
    setPapers((prev) =>
      prev.length <= 1 ? prev : prev.filter((p) => p.key !== key),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Session name is required.");
      return;
    }

    const validPapers = papers.filter(
      (p) => p.subject_id && p.class_id && Number(p.max_score) > 0,
    );
    if (validPapers.length === 0) {
      setError("Add at least one paper with subject, class, and max score.");
      return;
    }

    for (const p of papers) {
      const hasPartial =
        (p.subject_id || p.class_id || p.exam_date) &&
        !(p.subject_id && p.class_id && Number(p.max_score) > 0);
      if (hasPartial) {
        setError("Complete all paper rows or remove incomplete ones.");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await createExamSession({
        name: name.trim(),
        term_id: termId || null,
        start_date: startDate || null,
        end_date: endDate || null,
        status,
        papers: validPapers.map((p) => ({
          subject_id: p.subject_id,
          class_id: p.class_id,
          max_score: Number(p.max_score),
          exam_date: p.exam_date || null,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.push("/academic/exams");
    } catch {
      setError("Could not create exam session.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Create exam session"
      breadcrumb={["Academic Management", "Examinations", "Create"]}
      heading="Create exam session"
      subtitle="Define the session schedule and add exam papers per subject and class."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <FormSection
          title="Session details"
          description="Name, term, dates, and status for this examination period."
        >
          <FormField
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. End of Term 1 Exams"
            fullWidth
          />
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Term
            </span>
            <select
              className={fieldClass}
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
            >
              <option value="">Select term…</option>
              {(meta?.terms ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <FormField
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <FormField
            label="End date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Status
            </span>
            <select
              className={fieldClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </FormSection>

        <FormSection
          title="Exam papers"
          description="Add one row per subject and class combination."
          layout="stack"
        >
          <div className="space-y-3">
            {papers.map((paper, index) => {
              const subjects = subjectsForClass(paper.class_id);
              return (
                <div
                  key={paper.key}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">
                      Paper {index + 1}
                    </p>
                    {papers.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removePaper(paper.key)}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                      >
                        <Icon icon={Delete02Icon} size={14} />
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">
                        Class
                      </span>
                      <select
                        className={fieldClass}
                        value={paper.class_id}
                        onChange={(e) =>
                          updatePaper(paper.key, {
                            class_id: e.target.value,
                            subject_id: "",
                          })
                        }
                      >
                        <option value="">Select class…</option>
                        {(meta?.classes ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">
                        Subject
                      </span>
                      <select
                        className={fieldClass}
                        value={paper.subject_id}
                        onChange={(e) =>
                          updatePaper(paper.key, {
                            subject_id: e.target.value,
                          })
                        }
                        disabled={!paper.class_id}
                      >
                        <option value="">Select subject…</option>
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">
                        Max score
                      </span>
                      <input
                        type="number"
                        min={1}
                        className={fieldClass}
                        value={paper.max_score}
                        onChange={(e) =>
                          updatePaper(paper.key, {
                            max_score: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">
                        Exam date
                      </span>
                      <input
                        type="date"
                        className={fieldClass}
                        value={paper.exam_date}
                        onChange={(e) =>
                          updatePaper(paper.key, {
                            exam_date: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setPapers((prev) => [...prev, emptyPaper()])}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:border-(--sofia-primary) hover:text-(--sofia-primary)"
          >
            <Icon icon={Add01Icon} size={16} />
            Add paper
          </button>
        </FormSection>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create session"}
          </button>
          <Link
            href="/academic/exams"
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
          >
            Cancel
          </Link>
        </div>
      </form>
    </AppShell>
  );
}
