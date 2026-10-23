import React from "react";
import Link from "next/link";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../../components/layout/AppShell";
import {
  activateCalculationProfile,
  archiveCalculationProfile,
  createCalculationProfile,
  fetchCalculationDefaults,
  fetchCalculationMeta,
  listCalculationProfiles,
  previewCalculation,
  saveCalculationProfile,
  type CalculationConfig,
  type ProfileDto,
} from "../../../../lib/results-calc";
import { TableIconButton } from "../../../../components/ui/TableActions";
import {
  GRADE_LABEL_MAX_LENGTH,
  normalizeGradeLabel,
} from "../../../../lib/grading-system";

const STEPS = [
  "Profile",
  "Classes",
  "Assessments",
  "Weights",
  "Grades",
  "Pass mark",
  "Overall average",
  "Ranking",
  "Promotion",
  "Review & test",
  "Activate",
];

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-slate-100 text-slate-600",
    active: "bg-emerald-50 text-emerald-700",
    archived: "bg-indigo-50 text-indigo-700",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? "bg-slate-100"}`}
    >
      {status}
    </span>
  );
}

function newId() {
  return crypto.randomUUID();
}

function LiveSummary({
  name,
  config,
}: {
  name: string;
  config: CalculationConfig;
}) {
  const weightTotal = config.groups.length
    ? config.groups.reduce((s, g) => s + g.weight_percent, 0)
    : config.components.reduce((s, c) => s + c.weight_percent, 0);
  return (
    <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Live summary
      </p>
      <h3 className="mt-1 font-semibold text-slate-900">
        {name || "Untitled profile"}
      </h3>
      <ul className="mt-3 space-y-1 text-slate-700">
        {(config.groups.length ? config.groups : config.components).map(
          (item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span>{item.name}</span>
              <span className="font-medium">{item.weight_percent}%</span>
            </li>
          ),
        )}
      </ul>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-(--sofia-primary)"
          style={{ width: `${Math.min(weightTotal, 100)}%` }}
        />
      </div>
      <p
        className={`mt-1 text-xs ${Math.abs(weightTotal - 100) < 0.05 ? "text-emerald-700" : "text-amber-700"}`}
      >
        Total {weightTotal}%{" "}
        {Math.abs(weightTotal - 100) < 0.05
          ? "(ready)"
          : "(must total 100% to activate)"}
      </p>
      <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
        <p>
          Grades:{" "}
          {config.grading
            .map((g) => `${g.grade} ${g.min_score}–${g.max_score}`)
            .join(" · ")}
        </p>
        <p className="mt-1">Pass mark: {config.pass_mark}%</p>
        <p className="mt-1">
          Ranking: {config.ranking.enabled ? "Enabled" : "Off"}
        </p>
        <p className="mt-1">
          Promotion: average ≥ {config.promotion.min_average ?? "—"}%, max
          failed {config.promotion.max_failed_subjects ?? "—"}
        </p>
      </div>
    </aside>
  );
}

export default function CalculationSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [profiles, setProfiles] = React.useState<ProfileDto[]>([]);
  const [meta, setMeta] = React.useState<
    | Extract<
        Awaited<ReturnType<typeof fetchCalculationMeta>>,
        { ok: true }
      >["data"]
    | null
  >(null);
  const [editing, setEditing] = React.useState<ProfileDto | null>(null);
  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [periodMode, setPeriodMode] = React.useState<"term" | "annual">("term");
  const [config, setConfig] = React.useState<CalculationConfig | null>(null);
  const [classIds, setClassIds] = React.useState<string[]>([]);
  const [levelIds, setLevelIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [previewClass, setPreviewClass] = React.useState("");
  const [previewSubject, setPreviewSubject] = React.useState("");
  const [previewStudent, setPreviewStudent] = React.useState("");
  const [preview, setPreview] = React.useState<{
    inputs: Array<{
      name: string;
      display: string;
      contribution: number | null;
    }>;
    final_score: number | null;
    grade: string | null;
    pass_fail: string;
  } | null>(null);

  const [viewMode, setViewMode] = React.useState<"formula" | "advanced">(
    "formula",
  );
  const [formulaCaWeight, setFormulaCaWeight] = React.useState(40);
  const [formulaExamWeight, setFormulaExamWeight] = React.useState(60);
  const [formulaPassMark, setFormulaPassMark] = React.useState(10);
  const [formulaRounding, setFormulaRounding] = React.useState<
    "none" | 0 | 1 | 2
  >(2);
  const [formulaSeqMethod, setFormulaSeqMethod] = React.useState<
    "simple_average" | "weighted" | "best_n"
  >("simple_average");
  const [formulaExpectedSeqs, setFormulaExpectedSeqs] = React.useState(3);
  const [formulaAbsentPolicy, setFormulaAbsentPolicy] = React.useState<
    "exclude" | "zero" | "separate"
  >("exclude");
  const [formulaMissingPolicy, setFormulaMissingPolicy] = React.useState<
    "exclude" | "zero" | "incomplete" | "resolve"
  >("exclude");

  const reload = React.useCallback(async () => {
    const [list, m] = await Promise.all([
      listCalculationProfiles(),
      fetchCalculationMeta(),
    ]);
    if (!list.ok) {
      setError(list.error);
      return;
    }
    setProfiles(list.data);
    if (m.ok) setMeta(m.data);

    const active =
      list.data.find((p) => p.profile.status === "active") || list.data[0];
    if (active?.config) {
      const caComp = active.config.components?.find(
        (c) => c.source === "ca" || c.type === "continuous_assessment",
      );
      const examComp = active.config.components?.find(
        (c) => c.source === "exam" || c.type === "final_exam",
      );
      setFormulaCaWeight(
        active.config.ca_weight ?? caComp?.weight_percent ?? 40,
      );
      setFormulaExamWeight(
        active.config.exam_weight ?? examComp?.weight_percent ?? 60,
      );
      setFormulaPassMark(active.config.pass_mark ?? 10);
      setFormulaRounding(active.config.rounding?.places ?? 2);
      setFormulaSeqMethod(
        (active.config.sequence_method as any) ?? "simple_average",
      );
      setFormulaExpectedSeqs(active.config.expected_sequences ?? 3);
      setFormulaAbsentPolicy(active.config.absent_policy ?? "exclude");
      setFormulaMissingPolicy(active.config.missing_policy ?? "exclude");
    }
  }, []);

  React.useEffect(() => {
    void (async () => {
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  function assignmentsFromState() {
    const assignments: ProfileDto["assignments"] = [];
    for (const id of classIds) {
      assignments.push({
        id: "",
        class_id: id,
        academic_level_id: null,
        department_id: null,
        allow_overlap: 0,
      });
    }
    for (const id of levelIds) {
      assignments.push({
        id: "",
        class_id: null,
        academic_level_id: id,
        department_id: null,
        allow_overlap: 0,
      });
    }
    return assignments;
  }

  async function startNew() {
    setError("");
    const defaults = await fetchCalculationDefaults();
    if (!defaults.ok) {
      setError(defaults.error);
      return;
    }
    setEditing(null);
    setName("");
    setDescription("");
    setPeriodMode("term");
    setConfig(defaults.data.config);
    setClassIds([]);
    setLevelIds([]);
    setStep(0);
    setPreview(null);
  }

  function openProfile(p: ProfileDto) {
    setEditing(p);
    setName(p.profile.name);
    setDescription(p.profile.description);
    setPeriodMode(p.profile.period_mode);
    setConfig(p.config);
    setClassIds(
      p.assignments.map((a) => a.class_id).filter((id): id is string => !!id),
    );
    setLevelIds(
      p.assignments
        .map((a) => a.academic_level_id)
        .filter((id): id is string => !!id),
    );
    setStep(0);
    setPreview(null);
    setError("");
    setSuccess("");
  }

  async function persist(createVersion = false) {
    if (!config) return null;
    if (!name.trim()) {
      setError("Give this profile a name.");
      return null;
    }
    setSaving(true);
    setError("");
    try {
      if (!editing) {
        const created = await createCalculationProfile({
          name,
          description,
          period_mode: periodMode,
          config,
        });
        if (!created.ok) {
          setError(created.error);
          return null;
        }
        const saved = await saveCalculationProfile({
          id: created.data.profile.id,
          name,
          description,
          period_mode: periodMode,
          config,
          assignments: assignmentsFromState(),
        });
        if (!saved.ok) {
          setError(saved.error);
          return null;
        }
        setEditing(saved.data);
        await reload();
        return saved.data;
      }
      const saved = await saveCalculationProfile({
        id: editing.profile.id,
        name,
        description,
        period_mode: periodMode,
        config,
        assignments: assignmentsFromState(),
        create_new_version: createVersion || editing.used_in_results,
      });
      if (!saved.ok) {
        setError(saved.error);
        return null;
      }
      setEditing(saved.data);
      await reload();
      setSuccess("Saved.");
      return saved.data;
    } finally {
      setSaving(false);
    }
  }

  async function runPreview() {
    if (!config) return;
    setError("");
    const res = await previewCalculation({
      config,
      profile_id: editing?.profile.id,
      class_id: previewClass || undefined,
      subject_id: previewSubject || undefined,
      student_id: previewStudent || undefined,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPreview(res.data);
  }

  async function activate() {
    const saved = await persist(true);
    if (!saved) return;
    const res = await activateCalculationProfile(saved.profile.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(
      "This profile is now active. Sofia will use it when processing results.",
    );
    setEditing(res.data);
    await reload();
  }

  async function saveFormula() {
    setError("");
    setSuccess("");
    const totalWeights = formulaCaWeight + formulaExamWeight;
    if (Math.abs(totalWeights - 100) > 0.05) {
      setError(
        `Assessment weights must total 100%. Current total: ${totalWeights}%.`,
      );
      return;
    }
    setSaving(true);
    try {
      const active =
        profiles.find((p) => p.profile.status === "active") || profiles[0];
      const defaultsRes = await fetchCalculationDefaults();
      const baseCfg: CalculationConfig =
        active?.config ??
        (defaultsRes.ok ? defaultsRes.data.config : (null as any));

      const updatedComponents = [...(baseCfg.components || [])];
      let caIdx = updatedComponents.findIndex(
        (c) => c.source === "ca" || c.type === "continuous_assessment",
      );
      let examIdx = updatedComponents.findIndex(
        (c) => c.source === "exam" || c.type === "final_exam",
      );

      if (caIdx >= 0) {
        updatedComponents[caIdx] = {
          ...updatedComponents[caIdx],
          weight_percent: formulaCaWeight,
          max_score: 20,
        };
      } else {
        updatedComponents.push({
          id: "ca",
          name: "Continuous Assessment",
          code: "CA",
          type: "continuous_assessment",
          source: "ca",
          max_score: 20,
          weight_percent: formulaCaWeight,
          order: 1,
          required: true,
          group_id: null,
        });
      }

      if (examIdx >= 0) {
        updatedComponents[examIdx] = {
          ...updatedComponents[examIdx],
          weight_percent: formulaExamWeight,
          max_score: 20,
          required: formulaExamWeight > 0,
        };
      } else {
        updatedComponents.push({
          id: "exam",
          name: "Final Examination",
          code: "EXAM",
          type: "final_exam",
          source: "exam",
          max_score: 20,
          weight_percent: formulaExamWeight,
          order: 2,
          required: formulaExamWeight > 0,
          group_id: null,
        });
      }

      const newConfig: CalculationConfig = {
        ...baseCfg,
        scale: 20,
        ca_weight: formulaCaWeight,
        exam_weight: formulaExamWeight,
        pass_mark: formulaPassMark,
        sequence_method: formulaSeqMethod,
        expected_sequences: formulaExpectedSeqs,
        absent_policy: formulaAbsentPolicy,
        missing_policy: formulaMissingPolicy,
        rounding: { places: formulaRounding, half: "standard" },
        components: updatedComponents.map((c) =>
          c.source === "exam"
            ? {
                ...c,
                required: formulaExamWeight > 0,
                weight_percent: formulaExamWeight,
              }
            : c.source === "ca"
              ? { ...c, weight_percent: formulaCaWeight }
              : c,
        ),
      };

      let savedProfile: ProfileDto;
      if (active) {
        const res = await saveCalculationProfile({
          id: active.profile.id,
          name: active.profile.name,
          description: active.profile.description,
          period_mode: active.profile.period_mode,
          config: newConfig,
          create_new_version: active.used_in_results,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        savedProfile = res.data;
      } else {
        const res = await createCalculationProfile({
          name:
            formulaCaWeight === 100 && formulaExamWeight === 0
              ? "Cameroon MINESEC (3 terms × 2 sequences)"
              : "Cameroon Secondary Standard (40% CA + 60% Exam)",
          description: "Configured school calculation formula",
          period_mode: "term",
          config: newConfig,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        savedProfile = res.data;
      }

      if (savedProfile.profile.status !== "active") {
        await activateCalculationProfile(savedProfile.profile.id);
      }

      await reload();
      setSuccess("Result calculation formula saved and active.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Calculation settings"
      breadcrumb={[
        "Academic Management",
        "Results Processing",
        "Calculation Settings",
      ]}
      heading="Result calculation settings"
      subtitle="Tell Sofia how this school calculates results. Those rules are applied every time — no developer change is required."
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
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setViewMode("formula");
                  setConfig(null);
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  viewMode === "formula" && !config
                    ? "bg-(--sofia-primary) text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                Formula Settings
              </button>
              <button
                type="button"
                onClick={() => setViewMode("advanced")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  viewMode === "advanced" || config
                    ? "bg-(--sofia-primary) text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                Profiles & Advanced Wizard ({profiles.length})
              </button>
            </div>
            <Link
              href="/academic/results/coefficients"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300"
            >
              Manage Subject Coefficients →
            </Link>
          </div>

          {viewMode === "formula" && !config ? (
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-base font-bold text-slate-900">
                    RESULT CALCULATION SETTINGS
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Configure sequences, optional exam weight, pass mark, and
                    rounding. MINESEC default: CA 100% / Exam 0%, two sequences
                    per term, pass 10/20.
                  </p>
                  <button
                    type="button"
                    className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setFormulaCaWeight(100);
                      setFormulaExamWeight(0);
                      setFormulaExpectedSeqs(2);
                      setFormulaSeqMethod("simple_average");
                      setFormulaPassMark(10);
                      setFormulaRounding(2);
                      setFormulaMissingPolicy("exclude");
                      setFormulaAbsentPolicy("exclude");
                    }}
                  >
                    Load MINESEC (2 sequences, no exam weight)
                  </button>
                </div>

                {/* Continuous Assessment Section */}
                <div className="mt-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    CONTINUOUS ASSESSMENT / SEQUENCES
                  </h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        CA Weight (%)
                      </label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className={inputClass}
                          value={formulaCaWeight}
                          onChange={(e) =>
                            setFormulaCaWeight(Number(e.target.value) || 0)
                          }
                        />
                        <span className="text-sm font-medium text-slate-500">
                          %
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Sequence Calculation Method
                      </label>
                      <select
                        className={inputClass}
                        value={formulaSeqMethod}
                        onChange={(e) =>
                          setFormulaSeqMethod(e.target.value as any)
                        }
                      >
                        <option value="simple_average">
                          Simple Average (Default)
                        </option>
                        <option value="weighted">Weighted Average</option>
                        <option value="best_n">Best N Sequences</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Number of Sequences Expected
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        className={inputClass}
                        value={formulaExpectedSeqs}
                        onChange={(e) =>
                          setFormulaExpectedSeqs(Number(e.target.value) || 3)
                        }
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        The calculation engine will use actual configured
                        sequence records for each student.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Missing / Absent Sequence Scores
                      </label>
                      <select
                        className={inputClass}
                        value={formulaAbsentPolicy}
                        onChange={(e) => {
                          setFormulaAbsentPolicy(e.target.value as any);
                          setFormulaMissingPolicy(e.target.value as any);
                        }}
                      >
                        <option value="exclude">
                          Exclude absent score (Default)
                        </option>
                        <option value="zero">Treat absent as zero</option>
                        <option value="separate">Mark result incomplete</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Examination Section */}
                <div className="mt-8 border-t border-slate-100 pt-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    END-OF-TERM EXAMINATION
                  </h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 items-start">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Exam Weight (%)
                      </label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className={inputClass}
                          value={formulaExamWeight}
                          onChange={(e) =>
                            setFormulaExamWeight(Number(e.target.value) || 0)
                          }
                        />
                        <span className="text-sm font-medium text-slate-500">
                          %
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Quick Percentage Presets
                      </label>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {[
                          { ca: 40, ex: 60, label: "40 / 60 (Standard)" },
                          { ca: 30, ex: 70, label: "30 / 70" },
                          { ca: 50, ex: 50, label: "50 / 50" },
                          { ca: 20, ex: 80, label: "20 / 80" },
                        ].map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => {
                              setFormulaCaWeight(p.ca);
                              setFormulaExamWeight(p.ex);
                            }}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                              formulaCaWeight === p.ca &&
                              formulaExamWeight === p.ex
                                ? "bg-(--sofia-primary) text-white font-semibold"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    {Math.abs(formulaCaWeight + formulaExamWeight - 100) <
                    0.05 ? (
                      <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                        <span>
                          Weights Total 100% ✓ ({formulaCaWeight}% CA +{" "}
                          {formulaExamWeight}% Exam)
                        </span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                        <span>
                          ⚠ Assessment weights must total 100%. Current total:{" "}
                          {formulaCaWeight + formulaExamWeight}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pass Mark & Rounding Section */}
                <div className="mt-8 border-t border-slate-100 pt-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    PASS THRESHOLD & ROUNDING
                  </h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Pass Mark
                      </label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={20}
                          step={0.5}
                          className={inputClass}
                          value={formulaPassMark}
                          onChange={(e) =>
                            setFormulaPassMark(Number(e.target.value) || 10)
                          }
                        />
                        <span className="text-sm font-medium text-slate-500">
                          / 20
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Configurable per school (default: 10/20).
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Rounding
                      </label>
                      <select
                        className={inputClass}
                        value={String(formulaRounding)}
                        onChange={(e) => {
                          const val =
                            e.target.value === "none"
                              ? "none"
                              : Number(e.target.value);
                          setFormulaRounding(val as any);
                        }}
                      >
                        <option value="2">2 decimal places (Default)</option>
                        <option value="1">1 decimal place</option>
                        <option value="0">0 decimal places</option>
                        <option value="none">No rounding</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Subject Coefficients Notice */}
                <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-slate-900 text-sm">
                        SUBJECT COEFFICIENTS
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Subjects determine their own coefficients. Supports
                        class-specific and academic-year overrides.
                      </p>
                    </div>
                    <Link
                      href="/academic/results/coefficients"
                      className="shrink-0 rounded-xl bg-white border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:border-slate-300 shadow-2xs"
                    >
                      Configure Coefficients →
                    </Link>
                  </div>
                </div>

                {/* Save button */}
                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    disabled={
                      saving ||
                      Math.abs(formulaCaWeight + formulaExamWeight - 100) > 0.05
                    }
                    onClick={() => void saveFormula()}
                    className="rounded-xl bg-(--sofia-primary) px-6 py-2.5 text-sm font-semibold text-white shadow-xs hover:opacity-95 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save Configuration"}
                  </button>
                </div>
              </div>

              {/* Summary sidebar */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    CALCULATION METHOD
                  </p>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-600">
                        Continuous Assessment:
                      </span>
                      <span className="font-semibold text-slate-900">
                        {formulaCaWeight}%
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-600">Examination:</span>
                      <span className="font-semibold text-slate-900">
                        {formulaExamWeight}%
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-600">Pass Mark:</span>
                      <span className="font-semibold text-slate-900">
                        {formulaPassMark} / 20
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-600">Sequence Method:</span>
                      <span className="font-semibold text-slate-900">
                        {formulaSeqMethod === "simple_average"
                          ? "Simple Average"
                          : formulaSeqMethod === "best_n"
                            ? "Best N"
                            : "Weighted"}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-600">Rounding:</span>
                      <span className="font-semibold text-slate-900">
                        {formulaRounding === "none"
                          ? "None"
                          : `${formulaRounding} decimals`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-2xs">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                    CALCULATION PIPELINE
                  </h4>
                  <div className="mt-3 space-y-2 text-[11px] leading-relaxed">
                    <p className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-slate-100 font-bold text-center leading-5 text-slate-700 shrink-0">
                        1
                      </span>
                      <span>Sequences → CA Average ({formulaCaWeight}%)</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-slate-100 font-bold text-center leading-5 text-slate-700 shrink-0">
                        2
                      </span>
                      <span>
                        + Exam Score ({formulaExamWeight}%) = Subject Mark
                      </span>
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-slate-100 font-bold text-center leading-5 text-slate-700 shrink-0">
                        3
                      </span>
                      <span>× Subject Coefficient = Weighted Score</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-slate-100 font-bold text-center leading-5 text-slate-700 shrink-0">
                        4
                      </span>
                      <span>SUM(Weighted) ÷ SUM(Coeffs) = Term Avg</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-slate-100 font-bold text-center leading-5 text-slate-700 shrink-0">
                        5
                      </span>
                      <span>Term Avg ≥ {formulaPassMark} → PASSED</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : !config ? (
            <>
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => void startNew()}
                  className="rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
                >
                  New calculation profile
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {profiles.map((p) => (
                  <button
                    key={p.profile.id}
                    type="button"
                    onClick={() => openProfile(p)}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-(--sofia-primary)/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {p.profile.name}
                      </h3>
                      <StatusBadge status={p.profile.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {p.profile.description}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Version {p.version_number}
                      {p.used_in_results ? " · used in processed results" : ""}
                    </p>
                  </button>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-500">
                After a profile is active, process results from{" "}
                <Link
                  className="font-medium text-(--sofia-primary)"
                  href="/academic/results"
                >
                  Results processing
                </Link>
                .
              </p>
            </>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex flex-wrap gap-1">
                  {STEPS.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setStep(i)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        i === step
                          ? "bg-(--sofia-primary) text-white"
                          : i < step
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {i + 1}. {label}
                    </button>
                  ))}
                </div>

                {step === 0 ? (
                  <div className="space-y-3">
                    <h2 className="font-semibold text-slate-900">
                      Profile information
                    </h2>
                    <label className="block text-xs font-medium text-slate-500">
                      Name
                      <input
                        className={inputClass}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Form 4 General"
                      />
                    </label>
                    <label className="block text-xs font-medium text-slate-500">
                      Description
                      <textarea
                        className={inputClass}
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </label>
                    <label className="block text-xs font-medium text-slate-500">
                      How is this result organised?
                      <select
                        className={inputClass}
                        value={periodMode}
                        onChange={(e) =>
                          setPeriodMode(e.target.value as "term" | "annual")
                        }
                      >
                        <option value="term">By term</option>
                        <option value="annual">Annual</option>
                      </select>
                    </label>
                  </div>
                ) : null}

                {step === 1 ? (
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Which classes does this apply to?
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Choose specific classes, or a whole academic level such as
                      Form 1–3.
                    </p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Levels
                        </p>
                        {(meta?.levels ?? []).map((l) => (
                          <label
                            key={l.id}
                            className="mt-1 flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={levelIds.includes(l.id)}
                              onChange={(e) =>
                                setLevelIds((ids) =>
                                  e.target.checked
                                    ? [...ids, l.id]
                                    : ids.filter((x) => x !== l.id),
                                )
                              }
                            />
                            {l.name}
                          </label>
                        ))}
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Classes
                        </p>
                        {(meta?.classes ?? []).map((c) => (
                          <label
                            key={c.id}
                            className="mt-1 flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={classIds.includes(c.id)}
                              onChange={(e) =>
                                setClassIds((ids) =>
                                  e.target.checked
                                    ? [...ids, c.id]
                                    : ids.filter((x) => x !== c.id),
                                )
                              }
                            />
                            {c.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {step === 2 || step === 3 ? (
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      {step === 2
                        ? "Which assessments contribute to the final score?"
                        : "How much does each assessment count?"}
                    </h2>
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-left text-xs uppercase text-slate-500">
                          <tr>
                            <th className="py-2">Name</th>
                            <th>Maximum</th>
                            <th>Weight %</th>
                            <th>Source</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {config.components.map((c, idx) => (
                            <tr
                              key={c.id}
                              className="border-t border-slate-100"
                            >
                              <td className="py-2 pr-2">
                                <input
                                  className={inputClass}
                                  value={c.name}
                                  onChange={(e) => {
                                    const next = [...config.components];
                                    next[idx] = { ...c, name: e.target.value };
                                    setConfig({ ...config, components: next });
                                  }}
                                />
                              </td>
                              <td className="pr-2">
                                <input
                                  type="number"
                                  className={inputClass}
                                  value={c.max_score}
                                  onChange={(e) => {
                                    const next = [...config.components];
                                    next[idx] = {
                                      ...c,
                                      max_score: Number(e.target.value),
                                    };
                                    setConfig({ ...config, components: next });
                                  }}
                                />
                              </td>
                              <td className="pr-2">
                                <input
                                  type="number"
                                  className={inputClass}
                                  value={c.weight_percent}
                                  onChange={(e) => {
                                    const next = [...config.components];
                                    next[idx] = {
                                      ...c,
                                      weight_percent: Number(e.target.value),
                                    };
                                    setConfig({ ...config, components: next });
                                  }}
                                />
                              </td>
                              <td className="pr-2">
                                <select
                                  className={inputClass}
                                  value={c.source}
                                  onChange={(e) => {
                                    const next = [...config.components];
                                    next[idx] = {
                                      ...c,
                                      source: e.target
                                        .value as CalculationConfig["components"][0]["source"],
                                    };
                                    setConfig({ ...config, components: next });
                                  }}
                                >
                                  <option value="ca">
                                    Continuous assessment
                                  </option>
                                  <option value="exam">Examination</option>
                                  <option value="named">
                                    Named assessment
                                  </option>
                                </select>
                              </td>
                              <td>
                                <TableIconButton
                                  icon={Delete02Icon}
                                  label="Remove"
                                  tone="danger"
                                  onClick={() =>
                                    setConfig({
                                      ...config,
                                      components: config.components.filter(
                                        (x) => x.id !== c.id,
                                      ),
                                    })
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
                      className="mt-3 text-sm font-medium text-(--sofia-primary)"
                      onClick={() =>
                        setConfig({
                          ...config,
                          components: [
                            ...config.components,
                            {
                              id: newId(),
                              name: "New assessment",
                              code: "NEW",
                              type: "other",
                              source: "named",
                              max_score: 100,
                              weight_percent: 0,
                              order: config.components.length + 1,
                              required: true,
                              group_id: null,
                            },
                          ],
                        })
                      }
                    >
                      Add assessment
                    </button>
                    <label className="mt-4 block text-xs font-medium text-slate-500">
                      How should this result be calculated?
                      <select
                        className={inputClass}
                        value={config.method}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            method: e.target
                              .value as CalculationConfig["method"],
                          })
                        }
                      >
                        <option value="weighted">Weighted average</option>
                        <option value="simple_average">Simple average</option>
                        <option value="sum">Sum of scores</option>
                        <option value="best_n">Best N scores</option>
                      </select>
                    </label>
                    {config.method === "best_n" ? (
                      <label className="mt-2 block text-xs font-medium text-slate-500">
                        How many of the best scores count?
                        <input
                          type="number"
                          className={inputClass}
                          value={config.best_n ?? 2}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              best_n: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {step === 4 ? (
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      How are grades assigned?
                    </h2>
                    {config.grading.map((g, idx) => (
                      <div
                        key={g.grade + idx}
                        className="mt-2 grid grid-cols-6 gap-2"
                      >
                        <input
                          className={inputClass}
                          value={g.grade}
                          maxLength={GRADE_LABEL_MAX_LENGTH}
                          title="Up to 5 letters or digits, no spaces"
                          spellCheck={false}
                          onChange={(e) => {
                            const next = [...config.grading];
                            next[idx] = {
                              ...g,
                              grade: normalizeGradeLabel(e.target.value),
                            };
                            setConfig({ ...config, grading: next });
                          }}
                        />
                        <input
                          type="number"
                          className={inputClass}
                          value={g.min_score}
                          onChange={(e) => {
                            const next = [...config.grading];
                            next[idx] = {
                              ...g,
                              min_score: Number(e.target.value),
                            };
                            setConfig({ ...config, grading: next });
                          }}
                        />
                        <input
                          type="number"
                          className={inputClass}
                          value={g.max_score}
                          onChange={(e) => {
                            const next = [...config.grading];
                            next[idx] = {
                              ...g,
                              max_score: Number(e.target.value),
                            };
                            setConfig({ ...config, grading: next });
                          }}
                        />
                        <input
                          type="number"
                          className={inputClass}
                          placeholder="Point"
                          value={g.grade_point ?? ""}
                          onChange={(e) => {
                            const next = [...config.grading];
                            next[idx] = {
                              ...g,
                              grade_point:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            };
                            setConfig({ ...config, grading: next });
                          }}
                        />
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={g.is_pass}
                            onChange={(e) => {
                              const next = [...config.grading];
                              next[idx] = { ...g, is_pass: e.target.checked };
                              setConfig({ ...config, grading: next });
                            }}
                          />
                          Pass
                        </label>
                        <input
                          className={inputClass}
                          value={g.remark}
                          onChange={(e) => {
                            const next = [...config.grading];
                            next[idx] = { ...g, remark: e.target.value };
                            setConfig({ ...config, grading: next });
                          }}
                        />
                      </div>
                    ))}
                    <label className="mt-3 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={config.use_gpa}
                        onChange={(e) =>
                          setConfig({ ...config, use_gpa: e.target.checked })
                        }
                      />
                      Calculate GPA from grade points (optional)
                    </label>
                  </div>
                ) : null}

                {step === 5 ? (
                  <div className="space-y-3">
                    <h2 className="font-semibold text-slate-900">
                      What is a passing score?
                    </h2>
                    <label className="block text-xs font-medium text-slate-500">
                      Overall subject pass mark (%)
                      <input
                        type="number"
                        className={inputClass}
                        value={config.pass_mark}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            pass_mark: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <p className="text-sm text-slate-600">
                      Subject-specific pass marks can be added as overrides
                      (optional subjects, practicals, and so on).
                    </p>
                    {(meta?.subjects ?? []).slice(0, 8).map((sub) => {
                      const ov = config.subject_overrides.find(
                        (o) => o.subject_id === sub.id,
                      );
                      return (
                        <label
                          key={sub.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span className="w-40 truncate">{sub.name}</span>
                          <input
                            type="number"
                            className={inputClass}
                            placeholder="Default"
                            value={ov?.pass_mark ?? ""}
                            onChange={(e) => {
                              const value =
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value);
                              const rest = config.subject_overrides.filter(
                                (o) => o.subject_id !== sub.id,
                              );
                              setConfig({
                                ...config,
                                subject_overrides:
                                  value == null
                                    ? rest
                                    : [
                                        ...rest,
                                        {
                                          subject_id: sub.id,
                                          pass_mark: value,
                                          credit: ov?.credit ?? null,
                                          optional: ov?.optional ?? false,
                                          include_in_average:
                                            ov?.include_in_average ?? true,
                                        },
                                      ],
                              });
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                ) : null}

                {step === 6 ? (
                  <div className="space-y-3">
                    <h2 className="font-semibold text-slate-900">
                      How is the overall average calculated?
                    </h2>
                    <select
                      className={inputClass}
                      value={config.overall.method}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          overall: {
                            ...config.overall,
                            method: e.target
                              .value as CalculationConfig["overall"]["method"],
                          },
                        })
                      }
                    >
                      <option value="average">Average of subject scores</option>
                      <option value="weighted">Weighted subject average</option>
                      <option value="total_ratio">
                        Total marks / total maximum
                      </option>
                      <option value="credit">Credit-weighted average</option>
                    </select>
                    <label className="block text-xs font-medium text-slate-500">
                      Missing scores
                      <select
                        className={inputClass}
                        value={config.missing_policy}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            missing_policy: e.target
                              .value as CalculationConfig["missing_policy"],
                          })
                        }
                      >
                        <option value="incomplete">
                          Mark as incomplete (recommended)
                        </option>
                        <option value="exclude">
                          Leave out of the calculation
                        </option>
                        <option value="zero">Treat as zero</option>
                        <option value="resolve">
                          Require a teacher or admin to resolve
                        </option>
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-slate-500">
                      Rounding for displayed scores
                      <select
                        className={inputClass}
                        value={String(config.rounding.places)}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            rounding: {
                              ...config.rounding,
                              places: (e.target.value === "none"
                                ? "none"
                                : Number(
                                    e.target.value,
                                  )) as CalculationConfig["rounding"]["places"],
                            },
                          })
                        }
                      >
                        <option value="none">No rounding</option>
                        <option value="0">Nearest whole number</option>
                        <option value="1">1 decimal place</option>
                        <option value="2">2 decimal places</option>
                      </select>
                    </label>
                  </div>
                ) : null}

                {step === 7 ? (
                  <div className="space-y-3">
                    <h2 className="font-semibold text-slate-900">
                      How are students ranked?
                    </h2>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={config.ranking.enabled}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            ranking: {
                              ...config.ranking,
                              enabled: e.target.checked,
                            },
                          })
                        }
                      />
                      Rank students
                    </label>
                    <select
                      className={inputClass}
                      value={config.ranking.by}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          ranking: {
                            ...config.ranking,
                            by: e.target.value as "average" | "total",
                          },
                        })
                      }
                    >
                      <option value="average">By overall average</option>
                      <option value="total">By total marks</option>
                    </select>
                    <select
                      className={inputClass}
                      value={config.ranking.ties}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          ranking: {
                            ...config.ranking,
                            ties: e.target
                              .value as CalculationConfig["ranking"]["ties"],
                          },
                        })
                      }
                    >
                      <option value="competition">
                        Same rank, next is skipped (1, 1, 3)
                      </option>
                      <option value="dense">
                        Same rank, next is consecutive (1, 1, 2)
                      </option>
                      <option value="sequential">Always unique ranks</option>
                    </select>
                  </div>
                ) : null}

                {step === 8 ? (
                  <div className="space-y-3">
                    <h2 className="font-semibold text-slate-900">
                      How is promotion determined?
                    </h2>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={config.promotion.enabled}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            promotion: {
                              ...config.promotion,
                              enabled: e.target.checked,
                            },
                          })
                        }
                      />
                      Evaluate promotion after annual / term results
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={config.promotion.automatic}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            promotion: {
                              ...config.promotion,
                              automatic: e.target.checked,
                            },
                          })
                        }
                      />
                      Automatically mark students as promoted when they meet the
                      rules
                    </label>
                    <label className="block text-xs font-medium text-slate-500">
                      Minimum overall average
                      <input
                        type="number"
                        className={inputClass}
                        value={config.promotion.min_average ?? ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            promotion: {
                              ...config.promotion,
                              min_average:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label className="block text-xs font-medium text-slate-500">
                      Maximum failed subjects
                      <input
                        type="number"
                        className={inputClass}
                        value={config.promotion.max_failed_subjects ?? ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            promotion: {
                              ...config.promotion,
                              max_failed_subjects:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                ) : null}

                {step === 9 ? (
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Review and test
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Choose a class, subject, and student to see exactly how
                      Sofia will calculate the score.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <select
                        className={inputClass}
                        value={previewClass}
                        onChange={(e) => setPreviewClass(e.target.value)}
                      >
                        <option value="">Class</option>
                        {(meta?.classes ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className={inputClass}
                        value={previewSubject}
                        onChange={(e) => setPreviewSubject(e.target.value)}
                      >
                        <option value="">Subject</option>
                        {(meta?.subjects ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className={inputClass}
                        value={previewStudent}
                        onChange={(e) => setPreviewStudent(e.target.value)}
                      >
                        <option value="">Student</option>
                        {(meta?.students ?? [])
                          .filter(
                            (s) => !previewClass || s.class_id === previewClass,
                          )
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void runPreview()}
                        className="rounded-xl bg-(--sofia-primary) px-4 py-2 text-sm font-semibold text-white"
                      >
                        Test calculation
                      </button>
                    </div>
                    {preview ? (
                      <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm">
                        <p className="font-semibold text-slate-900">Inputs</p>
                        <ul className="mt-2 space-y-1">
                          {preview.inputs.map((row) => (
                            <li key={row.name} className="flex justify-between">
                              <span>{row.name}</span>
                              <span>
                                {row.display}
                                {row.contribution != null
                                  ? ` → ${row.contribution.toFixed(1)}`
                                  : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-3 font-semibold">
                          Final score: {preview.final_score ?? "Incomplete"} ·
                          Grade: {preview.grade ?? "—"} · {preview.pass_fail}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {step === 10 ? (
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Activate this profile
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                      Only an active profile is used when processing results.
                      Weights must total 100%. Historical results keep a
                      snapshot of the version used, so later edits will not
                      rewrite published work.
                    </p>
                    {editing?.used_in_results ? (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        This profile has already been used. Saving creates a new
                        version so past results stay reproducible.
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void persist(true)}
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold"
                      >
                        Save as new version
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void activate()}
                        className="rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
                      >
                        Activate
                      </button>
                      {editing ? (
                        <button
                          type="button"
                          onClick={() =>
                            void archiveCalculationProfile(
                              editing.profile.id,
                            ).then(reload)
                          }
                          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500"
                        >
                          Archive
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="mt-6 flex justify-between">
                  <button
                    type="button"
                    className="text-sm font-medium text-slate-500"
                    onClick={() => {
                      if (step === 0) {
                        setConfig(null);
                        setEditing(null);
                        return;
                      }
                      setStep((s) => Math.max(0, s - 1));
                    }}
                  >
                    Back
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void persist()}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                    >
                      Save draft
                    </button>
                    {step < STEPS.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => setStep((s) => s + 1)}
                        className="rounded-xl bg-(--sofia-primary) px-4 py-2 text-sm font-semibold text-white"
                      >
                        Continue
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <LiveSummary name={name} config={config} />
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
