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
      <h3 className="mt-1 font-semibold text-slate-900">{name || "Untitled profile"}</h3>
      <ul className="mt-3 space-y-1 text-slate-700">
        {(config.groups.length ? config.groups : config.components).map((item) => (
          <li key={item.id} className="flex justify-between gap-2">
            <span>{item.name}</span>
            <span className="font-medium">{item.weight_percent}%</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-(--sofia-primary)"
          style={{ width: `${Math.min(weightTotal, 100)}%` }}
        />
      </div>
      <p className={`mt-1 text-xs ${Math.abs(weightTotal - 100) < 0.05 ? "text-emerald-700" : "text-amber-700"}`}>
        Total {weightTotal}% {Math.abs(weightTotal - 100) < 0.05 ? "(ready)" : "(must total 100% to activate)"}
      </p>
      <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
        <p>
          Grades:{" "}
          {config.grading.map((g) => `${g.grade} ${g.min_score}–${g.max_score}`).join(" · ")}
        </p>
        <p className="mt-1">Pass mark: {config.pass_mark}%</p>
        <p className="mt-1">Ranking: {config.ranking.enabled ? "Enabled" : "Off"}</p>
        <p className="mt-1">
          Promotion: average ≥ {config.promotion.min_average ?? "—"}%, max failed{" "}
          {config.promotion.max_failed_subjects ?? "—"}
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
  const [meta, setMeta] = React.useState<Awaited<
    ReturnType<typeof fetchCalculationMeta>
  > extends { ok: true; data: infer D }
    ? D
    : null>(null);
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
    inputs: Array<{ name: string; display: string; contribution: number | null }>;
    final_score: number | null;
    grade: string | null;
    pass_fail: string;
  } | null>(null);

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
      p.assignments.map((a) => a.class_id).filter((id): id is string => !!id)
    );
    setLevelIds(
      p.assignments
        .map((a) => a.academic_level_id)
        .filter((id): id is string => !!id)
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
    setSuccess("This profile is now active. Sofia will use it when processing results.");
    setEditing(res.data);
    await reload();
  }

  return (
    <AppShell
      title="Calculation settings"
      breadcrumb={["Academic Management", "Results Processing", "Calculation Settings"]}
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
                  <h3 className="font-semibold text-slate-900">{p.profile.name}</h3>
                  <StatusBadge status={p.profile.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">{p.profile.description}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Version {p.version_number}
                  {p.used_in_results ? " · used in processed results" : ""}
                </p>
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">
            After a profile is active, process results from{" "}
            <Link className="font-medium text-(--sofia-primary)" href="/academic/results/process">
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
                <h2 className="font-semibold text-slate-900">Profile information</h2>
                <label className="block text-xs font-medium text-slate-500">
                  Name
                  <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Form 4 General" />
                </label>
                <label className="block text-xs font-medium text-slate-500">
                  Description
                  <textarea className={inputClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
                <label className="block text-xs font-medium text-slate-500">
                  How is this result organised?
                  <select
                    className={inputClass}
                    value={periodMode}
                    onChange={(e) => setPeriodMode(e.target.value as "term" | "annual")}
                  >
                    <option value="term">By term</option>
                    <option value="annual">Annual</option>
                  </select>
                </label>
              </div>
            ) : null}

            {step === 1 ? (
              <div>
                <h2 className="font-semibold text-slate-900">Which classes does this apply to?</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Choose specific classes, or a whole academic level such as Form 1–3.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Levels</p>
                    {(meta?.levels ?? []).map((l) => (
                      <label key={l.id} className="mt-1 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={levelIds.includes(l.id)}
                          onChange={(e) =>
                            setLevelIds((ids) =>
                              e.target.checked ? [...ids, l.id] : ids.filter((x) => x !== l.id)
                            )
                          }
                        />
                        {l.name}
                      </label>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Classes</p>
                    {(meta?.classes ?? []).map((c) => (
                      <label key={c.id} className="mt-1 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={classIds.includes(c.id)}
                          onChange={(e) =>
                            setClassIds((ids) =>
                              e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id)
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
                        <tr key={c.id} className="border-t border-slate-100">
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
                                next[idx] = { ...c, max_score: Number(e.target.value) };
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
                                next[idx] = { ...c, weight_percent: Number(e.target.value) };
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
                                  source: e.target.value as CalculationConfig["components"][0]["source"],
                                };
                                setConfig({ ...config, components: next });
                              }}
                            >
                              <option value="ca">Continuous assessment</option>
                              <option value="exam">Examination</option>
                              <option value="named">Named assessment</option>
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
                                  components: config.components.filter((x) => x.id !== c.id),
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
                        method: e.target.value as CalculationConfig["method"],
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
                      onChange={(e) => setConfig({ ...config, best_n: Number(e.target.value) })}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {step === 4 ? (
              <div>
                <h2 className="font-semibold text-slate-900">How are grades assigned?</h2>
                {config.grading.map((g, idx) => (
                  <div key={g.grade + idx} className="mt-2 grid grid-cols-6 gap-2">
                    <input
                      className={inputClass}
                      value={g.grade}
                      onChange={(e) => {
                        const next = [...config.grading];
                        next[idx] = { ...g, grade: e.target.value };
                        setConfig({ ...config, grading: next });
                      }}
                    />
                    <input
                      type="number"
                      className={inputClass}
                      value={g.min_score}
                      onChange={(e) => {
                        const next = [...config.grading];
                        next[idx] = { ...g, min_score: Number(e.target.value) };
                        setConfig({ ...config, grading: next });
                      }}
                    />
                    <input
                      type="number"
                      className={inputClass}
                      value={g.max_score}
                      onChange={(e) => {
                        const next = [...config.grading];
                        next[idx] = { ...g, max_score: Number(e.target.value) };
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
                          grade_point: e.target.value === "" ? null : Number(e.target.value),
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
                    onChange={(e) => setConfig({ ...config, use_gpa: e.target.checked })}
                  />
                  Calculate GPA from grade points (optional)
                </label>
              </div>
            ) : null}

            {step === 5 ? (
              <div className="space-y-3">
                <h2 className="font-semibold text-slate-900">What is a passing score?</h2>
                <label className="block text-xs font-medium text-slate-500">
                  Overall subject pass mark (%)
                  <input
                    type="number"
                    className={inputClass}
                    value={config.pass_mark}
                    onChange={(e) => setConfig({ ...config, pass_mark: Number(e.target.value) })}
                  />
                </label>
                <p className="text-sm text-slate-600">
                  Subject-specific pass marks can be added as overrides (optional subjects, practicals, and so on).
                </p>
                {(meta?.subjects ?? []).slice(0, 8).map((sub) => {
                  const ov = config.subject_overrides.find((o) => o.subject_id === sub.id);
                  return (
                    <label key={sub.id} className="flex items-center gap-2 text-sm">
                      <span className="w-40 truncate">{sub.name}</span>
                      <input
                        type="number"
                        className={inputClass}
                        placeholder="Default"
                        value={ov?.pass_mark ?? ""}
                        onChange={(e) => {
                          const value = e.target.value === "" ? null : Number(e.target.value);
                          const rest = config.subject_overrides.filter((o) => o.subject_id !== sub.id);
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
                                      include_in_average: ov?.include_in_average ?? true,
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
                <h2 className="font-semibold text-slate-900">How is the overall average calculated?</h2>
                <select
                  className={inputClass}
                  value={config.overall.method}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      overall: {
                        ...config.overall,
                        method: e.target.value as CalculationConfig["overall"]["method"],
                      },
                    })
                  }
                >
                  <option value="average">Average of subject scores</option>
                  <option value="weighted">Weighted subject average</option>
                  <option value="total_ratio">Total marks / total maximum</option>
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
                        missing_policy: e.target.value as CalculationConfig["missing_policy"],
                      })
                    }
                  >
                    <option value="incomplete">Mark as incomplete (recommended)</option>
                    <option value="exclude">Leave out of the calculation</option>
                    <option value="zero">Treat as zero</option>
                    <option value="resolve">Require a teacher or admin to resolve</option>
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
                          places: (e.target.value === "none" ? "none" : Number(e.target.value)) as CalculationConfig["rounding"]["places"],
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
                <h2 className="font-semibold text-slate-900">How are students ranked?</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.ranking.enabled}
                    onChange={(e) =>
                      setConfig({ ...config, ranking: { ...config.ranking, enabled: e.target.checked } })
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
                      ranking: { ...config.ranking, by: e.target.value as "average" | "total" },
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
                        ties: e.target.value as CalculationConfig["ranking"]["ties"],
                      },
                    })
                  }
                >
                  <option value="competition">Same rank, next is skipped (1, 1, 3)</option>
                  <option value="dense">Same rank, next is consecutive (1, 1, 2)</option>
                  <option value="sequential">Always unique ranks</option>
                </select>
              </div>
            ) : null}

            {step === 8 ? (
              <div className="space-y-3">
                <h2 className="font-semibold text-slate-900">How is promotion determined?</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.promotion.enabled}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        promotion: { ...config.promotion, enabled: e.target.checked },
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
                        promotion: { ...config.promotion, automatic: e.target.checked },
                      })
                    }
                  />
                  Automatically mark students as promoted when they meet the rules
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
                          min_average: e.target.value === "" ? null : Number(e.target.value),
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
                          max_failed_subjects: e.target.value === "" ? null : Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
            ) : null}

            {step === 9 ? (
              <div>
                <h2 className="font-semibold text-slate-900">Review and test</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Choose a class, subject, and student to see exactly how Sofia will calculate the score.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select className={inputClass} value={previewClass} onChange={(e) => setPreviewClass(e.target.value)}>
                    <option value="">Class</option>
                    {(meta?.classes ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select className={inputClass} value={previewSubject} onChange={(e) => setPreviewSubject(e.target.value)}>
                    <option value="">Subject</option>
                    {(meta?.subjects ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <select className={inputClass} value={previewStudent} onChange={(e) => setPreviewStudent(e.target.value)}>
                    <option value="">Student</option>
                    {(meta?.students ?? [])
                      .filter((s) => !previewClass || s.class_id === previewClass)
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
                            {row.contribution != null ? ` → ${row.contribution.toFixed(1)}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 font-semibold">
                      Final score: {preview.final_score ?? "Incomplete"} · Grade: {preview.grade ?? "—"} ·{" "}
                      {preview.pass_fail}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 10 ? (
              <div>
                <h2 className="font-semibold text-slate-900">Activate this profile</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Only an active profile is used when processing results. Weights must total 100%. Historical
                  results keep a snapshot of the version used, so later edits will not rewrite published work.
                </p>
                {editing?.used_in_results ? (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    This profile has already been used. Saving creates a new version so past results stay
                    reproducible.
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
                      onClick={() => void archiveCalculationProfile(editing.profile.id).then(reload)}
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
    </AppShell>
  );
}
