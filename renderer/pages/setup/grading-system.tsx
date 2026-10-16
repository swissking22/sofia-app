import React from "react";
import { useRouter } from "next/router";
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { FormField, FormSection, SetupFooter } from "../../components/setup";
import {
  SetupShell,
  useSetupProgress,
} from "../../components/setup/SetupShell";
import { Icon } from "../../components/ui/Icon";
import { TableIconButton } from "../../components/ui/TableActions";
import {
  DEFAULT_ASSESSMENT_TYPES,
  DEFAULT_GRADE_BANDS,
  applyMinesecGradingPreset,
  fetchGradingSystemSetup,
  saveGradingSystemSetup,
  type GradingSystemSetupInput,
} from "../../lib/grading-system";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
} from "../../lib/setup";

function newLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type AssessmentDraft = {
  localId: string;
  id: string;
  name: string;
  weight_percent: string;
};

type BandDraft = {
  localId: string;
  id: string;
  grade: string;
  min_score: string;
  max_score: string;
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function GradingSystemSetupPage() {
  return (
    <SetupShell stepId="grading-system" aside={<GradingSystemAside />}>
      <GradingSystemForm />
    </SetupShell>
  );
}

function GradingSystemAside() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">
          Cameroon secondary
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          MINESEC / MINEDUB: 3 terms × 2 sequences. Subject mark = average of
          the two sequences (/20). Term average uses subject coefficients.
          Annual = mean of three term averages. Pass mark 10/20.
        </p>
        <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
            Marks calculation
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
            Term report cards
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
            Academic reports
          </li>
        </ul>
      </div>
    </div>
  );
}

function GradingSystemForm() {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [draftSaving, setDraftSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [enableRanking, setEnableRanking] = React.useState(true);
  const [showClassAverage, setShowClassAverage] = React.useState(true);
  const [showTeacherRemarks, setShowTeacherRemarks] = React.useState(true);
  const [assessments, setAssessments] = React.useState<AssessmentDraft[]>([]);
  const [bands, setBands] = React.useState<BandDraft[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await fetchGradingSystemSetup();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setAssessments(
          DEFAULT_ASSESSMENT_TYPES.map((t) => ({
            localId: newLocalId(),
            id: "",
            name: t.name,
            weight_percent: String(t.weight_percent),
          })),
        );
        setBands(
          DEFAULT_GRADE_BANDS.map((b) => ({
            localId: newLocalId(),
            id: "",
            grade: b.grade,
            min_score: String(b.min_score),
            max_score: String(b.max_score),
          })),
        );
      } else {
        setEnableRanking(result.setup.enable_ranking);
        setShowClassAverage(result.setup.show_class_average);
        setShowTeacherRemarks(result.setup.show_teacher_remarks);
        setAssessments(
          result.setup.assessment_types.map((t) => ({
            localId: t.id || newLocalId(),
            id: t.id,
            name: t.name,
            weight_percent: String(t.weight_percent),
          })),
        );
        setBands(
          result.setup.grade_bands.map((b) => ({
            localId: b.id || newLocalId(),
            id: b.id,
            grade: b.grade,
            min_score: String(b.min_score),
            max_score: String(b.max_score),
          })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const weightTotal = assessments.reduce(
    (sum, a) => sum + (Number(a.weight_percent) || 0),
    0,
  );

  function buildPayload(): GradingSystemSetupInput {
    return {
      enable_ranking: enableRanking,
      show_class_average: showClassAverage,
      show_teacher_remarks: showTeacherRemarks,
      assessment_types: assessments.map((a) => ({
        id: a.id || null,
        name: a.name,
        weight_percent: Number(a.weight_percent) || 0,
      })),
      grade_bands: bands.map((b) => ({
        id: b.id || null,
        grade: b.grade,
        min_score: Number(b.min_score),
        max_score: Number(b.max_score),
      })),
    };
  }

  async function persist() {
    const result = await saveGradingSystemSetup(buildPayload());
    if (!result.ok) throw new Error(result.error);
    setEnableRanking(result.setup.enable_ranking);
    setShowClassAverage(result.setup.show_class_average);
    setShowTeacherRemarks(result.setup.show_teacher_remarks);
    setAssessments(
      result.setup.assessment_types.map((t) => ({
        localId: t.id || newLocalId(),
        id: t.id,
        name: t.name,
        weight_percent: String(t.weight_percent),
      })),
    );
    setBands(
      result.setup.grade_bands.map((b) => ({
        localId: b.id || newLocalId(),
        id: b.id,
        grade: b.grade,
        min_score: String(b.min_score),
        max_score: String(b.max_score),
      })),
    );
  }

  async function handleSaveDraft() {
    setError("");
    setSuccess("");
    setDraftSaving(true);
    try {
      await persist();
      const draft = await saveSetupDraft("grading-system");
      if (!draft.ok) {
        setError(draft.error);
        return;
      }
      await refreshProgress();
      setSuccess("Draft saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save draft.");
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleContinue() {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await persist();
      const done = await completeSetupStep("grading-system");
      if (!done.ok) {
        setError(done.error);
        return;
      }
      await refreshProgress();
      await router.push(getNextSetupHref("grading-system"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading grading system…</p>;
  }

  return (
    <div className="space-y-5 pb-4">
      {error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-4">
        <h3 className="text-sm font-semibold text-slate-900">
          Cameroon MINESEC preset
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Sets Sequence 1 &amp; 2 (50% each for display), /20 grade bands (pass
          at 10), and activates the calculation profile: two sequences per term,
          coefficient-weighted term average, annual mean of three terms.
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void (async () => {
              setError("");
              setSuccess("");
              setSaving(true);
              try {
                const result = await applyMinesecGradingPreset();
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setAssessments(
                  result.setup.assessment_types.map((t) => ({
                    localId: newLocalId(),
                    id: t.id,
                    name: t.name,
                    weight_percent: String(t.weight_percent),
                  })),
                );
                setBands(
                  result.setup.grade_bands.map((b) => ({
                    localId: newLocalId(),
                    id: b.id,
                    grade: b.grade,
                    min_score: String(b.min_score),
                    max_score: String(b.max_score),
                  })),
                );
                setEnableRanking(result.setup.enable_ranking);
                setShowClassAverage(result.setup.show_class_average);
                setShowTeacherRemarks(result.setup.show_teacher_remarks);
                setSuccess(
                  "MINESEC preset applied. Save & continue when ready.",
                );
              } finally {
                setSaving(false);
              }
            })();
          }}
          className="mt-3 inline-flex cursor-pointer items-center rounded-xl bg-(--sofia-primary) px-3.5 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
        >
          Apply MINESEC (3 terms × 2 sequences)
        </button>
      </div>

      <FormSection
        title="1. Assessment Types"
        description="Define the assessment categories used when scoring students."
        layout="stack"
      >
        <div className="space-y-3">
          {assessments.map((item, index) => (
            <div
              key={item.localId}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:flex-row sm:items-end"
            >
              <div className="min-w-0 flex-1">
                <FormField
                  label={index === 0 ? "Assessment name" : "Assessment name"}
                  required
                  value={item.name}
                  onChange={(e) =>
                    setAssessments((prev) =>
                      prev.map((a) =>
                        a.localId === item.localId
                          ? { ...a, name: e.target.value }
                          : a,
                      ),
                    )
                  }
                  placeholder="e.g. Continuous Assessment"
                />
              </div>
              <TableIconButton
                icon={Delete02Icon}
                label="Remove assessment type"
                tone="danger"
                disabled={assessments.length <= 1}
                onClick={() =>
                  setAssessments((prev) =>
                    prev.filter((a) => a.localId !== item.localId),
                  )
                }
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setAssessments((prev) => [
              ...prev,
              {
                localId: newLocalId(),
                id: "",
                name: "",
                weight_percent: "0",
              },
            ])
          }
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-(--sofia-primary) hover:text-(--sofia-primary)"
        >
          <Icon icon={Add01Icon} size={16} />
          Add assessment type
        </button>
      </FormSection>

      <FormSection
        title="2. Weight Distribution"
        description="Set how much each assessment type contributes to the final mark. Total must be 100%."
        layout="stack"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {assessments.map((item) => (
            <label
              key={item.localId}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                {item.name.trim() || "Untitled assessment"}
              </span>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={item.weight_percent}
                  onChange={(e) =>
                    setAssessments((prev) =>
                      prev.map((a) =>
                        a.localId === item.localId
                          ? { ...a, weight_percent: e.target.value }
                          : a,
                      ),
                    )
                  }
                  className={`${inputClass} pr-10`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  %
                </span>
              </div>
            </label>
          ))}
        </div>
        <p
          className={`text-sm font-medium ${
            Math.abs(weightTotal - 100) < 0.01
              ? "text-emerald-700"
              : "text-amber-700"
          }`}
        >
          Total: {weightTotal}%
          {Math.abs(weightTotal - 100) >= 0.01
            ? " — must equal 100%"
            : " — balanced"}
        </p>
      </FormSection>

      <FormSection
        title="3. Grade Scale"
        description="Map score ranges to letter grades. Ranges must cover 0–100 without gaps or overlaps."
        layout="stack"
      >
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3">Minimum Score</th>
                <th className="px-4 py-3">Maximum Score</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {bands.map((band) => (
                <tr key={band.localId}>
                  <td className="px-4 py-2">
                    <input
                      value={band.grade}
                      onChange={(e) =>
                        setBands((prev) =>
                          prev.map((b) =>
                            b.localId === band.localId
                              ? {
                                  ...b,
                                  grade: e.target.value.toUpperCase(),
                                }
                              : b,
                          ),
                        )
                      }
                      className={`${inputClass} max-w-20 text-center font-semibold`}
                      maxLength={3}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={band.min_score}
                      onChange={(e) =>
                        setBands((prev) =>
                          prev.map((b) =>
                            b.localId === band.localId
                              ? { ...b, min_score: e.target.value }
                              : b,
                          ),
                        )
                      }
                      className={inputClass}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={band.max_score}
                      onChange={(e) =>
                        setBands((prev) =>
                          prev.map((b) =>
                            b.localId === band.localId
                              ? { ...b, max_score: e.target.value }
                              : b,
                          ),
                        )
                      }
                      className={inputClass}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <TableIconButton
                      icon={Delete02Icon}
                      label="Remove grade"
                      tone="danger"
                      disabled={bands.length <= 1}
                      onClick={() =>
                        setBands((prev) =>
                          prev.filter((b) => b.localId !== band.localId),
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() =>
            setBands((prev) => [
              ...prev,
              {
                localId: newLocalId(),
                id: "",
                grade: "",
                min_score: "0",
                max_score: "0",
              },
            ])
          }
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-(--sofia-primary) hover:text-(--sofia-primary)"
        >
          <Icon icon={Add01Icon} size={16} />
          Add grade
        </button>
      </FormSection>

      <FormSection
        title="4. Report Card Settings"
        description="Choose what appears on student report cards."
        layout="stack"
      >
        <div className="space-y-3">
          <ToggleRow
            label="Enable ranking"
            description="Show student position in class on report cards."
            checked={enableRanking}
            onChange={setEnableRanking}
          />
          <ToggleRow
            label="Show class average"
            description="Display the class average alongside each subject mark."
            checked={showClassAverage}
            onChange={setShowClassAverage}
          />
          <ToggleRow
            label="Show teacher remarks"
            description="Include space for teacher comments on report cards."
            checked={showTeacherRemarks}
            onChange={setShowTeacherRemarks}
          />
        </div>
      </FormSection>

      <SetupFooter
        stepId="grading-system"
        onSaveDraft={handleSaveDraft}
        onContinue={handleContinue}
        saving={saving}
        draftSaving={draftSaving}
      />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300 text-(--sofia-primary) focus:ring-(--sofia-primary)/30"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-900">
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}
