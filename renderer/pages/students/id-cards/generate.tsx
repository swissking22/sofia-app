import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import { IdCardModuleNav } from "../../../components/id-cards/ModuleNav";
import { CardSurface } from "../../../components/id-cards/CardSurface";
import {
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  selectClass,
} from "../../../components/students/ui";
import {
  fetchIdCardMeta,
  fetchIdCardTemplates,
  previewIdCard,
  runIdCardJob,
  validateIdCardSelection,
  type CardDesign,
} from "../../../lib/student-id-cards";

export default function GenerateCardsPage() {
  const router = useRouter();
  const [error, setError] = React.useState("");
  const [step, setStep] = React.useState(1);
  const [templates, setTemplates] = React.useState<
    Array<{ id: string; name: string; status: string }>
  >([]);
  const [templateId, setTemplateId] = React.useState("");
  const [yearId, setYearId] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [kind, setKind] = React.useState<"new" | "replacement" | "renewal">(
    "new",
  );
  const [reason, setReason] = React.useState("lost");
  const [meta, setMeta] = React.useState<
    | Extract<Awaited<ReturnType<typeof fetchIdCardMeta>>, { ok: true }>["data"]
    | null
  >(null);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [validation, setValidation] = React.useState<
    | Extract<
        Awaited<ReturnType<typeof validateIdCardSelection>>,
        { ok: true }
      >["data"]
    | null
  >(null);
  const [preview, setPreview] = React.useState<CardDesign | null>(null);
  const [job, setJob] = React.useState<
    | Extract<Awaited<ReturnType<typeof runIdCardJob>>, { ok: true }>["data"]
    | null
  >(null);
  const [busy, setBusy] = React.useState(false);
  const [policy, setPolicy] = React.useState<"generate_without" | "skip">(
    "generate_without",
  );
  const [paper, setPaper] = React.useState<"A4" | "A3" | "Letter">("A4");
  const [perRow, setPerRow] = React.useState(2);

  React.useEffect(() => {
    void (async () => {
      const m = await fetchIdCardMeta();
      if (m.ok) {
        setMeta(m.data);
        const y =
          m.data.years.find((x) => x.is_current)?.id ||
          m.data.years[0]?.id ||
          "";
        setYearId(y);
      } else setError(m.error);
      const t = await fetchIdCardTemplates();
      if (t.ok) {
        setTemplates(t.data.templates);
        const q =
          typeof router.query.template === "string"
            ? router.query.template
            : "";
        const active =
          t.data.templates.find((x) => x.id === q) ||
          t.data.templates.find((x) => x.status === "active") ||
          t.data.templates[0];
        if (active) setTemplateId(active.id);
      }
    })();
  }, [router.query.template]);

  const students = (meta?.students || []).filter(
    (s) => !classId || s.class_id === classId,
  );
  const ids = Object.keys(selected).filter((k) => selected[k]);

  async function goPreview() {
    const v = await validateIdCardSelection({
      template_id: templateId,
      student_ids: ids,
    });
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setValidation(v.data);
    const p = await previewIdCard({
      template_id: templateId,
      student_id: ids[0],
      academic_year_id: yearId,
    });
    if (p.ok) setPreview(p.data.design);
    setStep(5);
  }

  async function generate() {
    setBusy(true);
    const skipBlocked = new Set(validation?.blocked.map((b) => b.id) || []);
    const student_ids = ids.filter((id) => !skipBlocked.has(id));
    const res = await runIdCardJob({
      template_id: templateId,
      academic_year_id: yearId,
      student_ids,
      card_kind: kind,
      replacement_reason: kind === "replacement" ? reason : undefined,
      paper_size: paper,
      cards_per_row: perRow,
      missing_photo_policy: policy,
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setJob(res.data);
      setStep(6);
    }
  }

  return (
    <AppShell
      title="Generate ID cards"
      breadcrumb={["Student Management", "ID Cards", "Generate"]}
      heading="Generate cards"
      subtitle="Choose a template and students. Sofia fills names, photos, IDs, and codes automatically."
    >
      <IdCardModuleNav />
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

      {step === 1 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">1. Template</h2>
          <select
            className={`${selectClass} mt-3`}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.status})
              </option>
            ))}
          </select>
          <div className="mt-4">
            <PrimaryButton onClick={() => setStep(2)} disabled={!templateId}>
              Continue
            </PrimaryButton>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">2. Academic year</h2>
          <select
            className={`${selectClass} mt-3`}
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
          >
            {(meta?.years || []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
          <div className="mt-4 flex gap-2">
            <SecondaryButton onClick={() => setStep(1)}>Back</SecondaryButton>
            <PrimaryButton onClick={() => setStep(3)}>Continue</PrimaryButton>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">3. Students</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              className={selectClass}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">Entire school (active)</option>
              {(meta?.classes || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <SecondaryButton
              onClick={() => {
                const next: Record<string, boolean> = {};
                students.forEach((s) => {
                  next[s.id] = true;
                });
                setSelected(next);
              }}
            >
              Select listed students ({students.length})
            </SecondaryButton>
          </div>
          <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-100">
            {students.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 border-b border-slate-50 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={Boolean(selected[s.id])}
                  onChange={(e) =>
                    setSelected((cur) => ({ ...cur, [s.id]: e.target.checked }))
                  }
                />
                <span className="font-medium">{s.name}</span>
                <span className="text-slate-400">
                  {s.student_code || "No ID"} · {s.class_name}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-slate-500">{ids.length} selected</p>
          <div className="mt-4 flex gap-2">
            <SecondaryButton onClick={() => setStep(2)}>Back</SecondaryButton>
            <PrimaryButton onClick={() => setStep(4)} disabled={!ids.length}>
              Continue
            </PrimaryButton>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">4. Card type</h2>
          <select
            className={`${selectClass} mt-3`}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="new">New card</option>
            <option value="replacement">Replacement</option>
            <option value="renewal">Renewal</option>
          </select>
          {kind === "replacement" ? (
            <select
              className={`${selectClass} mt-3`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="lost">Lost</option>
              <option value="damaged">Damaged</option>
              <option value="incorrect_information">
                Incorrect information
              </option>
              <option value="name_change">Name change</option>
              <option value="class_change">Class change</option>
              <option value="other">Other</option>
            </select>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <select
              className={selectClass}
              value={paper}
              onChange={(e) => setPaper(e.target.value as typeof paper)}
            >
              <option>A4</option>
              <option>A3</option>
              <option>Letter</option>
            </select>
            <select
              className={selectClass}
              value={perRow}
              onChange={(e) => setPerRow(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} per row
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={policy}
              onChange={(e) => setPolicy(e.target.value as typeof policy)}
            >
              <option value="generate_without">
                Generate without missing photo
              </option>
              <option value="skip">Skip students without photo</option>
            </select>
          </div>
          <div className="mt-4 flex gap-2">
            <SecondaryButton onClick={() => setStep(3)}>Back</SecondaryButton>
            <PrimaryButton onClick={() => void goPreview()}>
              Preview & check
            </PrimaryButton>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">5. Check before generating</h2>
          <p className="mt-2 text-sm text-slate-600">
            {validation?.total} selected · {validation?.ready.length} ready
            {validation?.warnings.length
              ? ` · ${validation.warnings.length} missing photo`
              : ""}
            {validation?.blocked.length
              ? ` · ${validation.blocked.length} missing required information`
              : ""}
          </p>
          {validation?.blocked.length ? (
            <ul className="mt-2 text-sm text-amber-800">
              {validation.blocked.map((b) => (
                <li key={b.id}>
                  {b.name}: missing {b.missing.join(", ")} (will be skipped)
                </li>
              ))}
            </ul>
          ) : null}
          {validation?.warnings.length ? (
            <ul className="mt-2 text-sm text-slate-600">
              {validation.warnings.map((w) => (
                <li key={w.id}>
                  {w.name}: {w.warnings.join(", ")}
                </li>
              ))}
            </ul>
          ) : null}
          {preview ? (
            <div className="mt-4 flex gap-4 overflow-auto">
              <CardSurface design={preview} side="front" unit="px" />
              <CardSurface design={preview} side="back" unit="px" />
            </div>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            Print sheet: {paper}, {perRow} cards per row. Exact millimetre sizes
            are kept when you print.
          </p>
          <div className="mt-4 flex gap-2">
            <SecondaryButton onClick={() => setStep(4)}>Back</SecondaryButton>
            <PrimaryButton onClick={() => void generate()} disabled={busy}>
              {busy ? "Generating…" : "Generate"}
            </PrimaryButton>
          </div>
        </section>
      ) : null}

      {step === 6 && job ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-emerald-800">
            {job.successful} cards generated
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Job {job.job_number} · {job.successful} ok · {job.failed} failed ·{" "}
            {job.skipped} skipped
          </p>
          <ul className="mt-3 max-h-48 overflow-auto text-sm">
            {job.items.map((item) => (
              <li
                key={item.student_id}
                className="border-b border-slate-50 py-1"
              >
                {item.student_name}: {item.status}
                {item.error ? ` — ${item.error}` : ""}
                {item.warning ? ` (${item.warning})` : ""}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <PrimaryButton
              onClick={() => {
                const idsPrint = job.items
                  .map((i) => i.card_id)
                  .filter(Boolean)
                  .join(",");
                void router.push(`/students/id-cards/print?ids=${idsPrint}`);
              }}
            >
              Print / download PDF
            </PrimaryButton>
            <SecondaryButton
              onClick={() => router.push("/students/id-cards/issued")}
            >
              View cards
            </SecondaryButton>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
