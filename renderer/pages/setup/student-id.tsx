import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Add01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
} from "@hugeicons/core-free-icons";
import { FormSection, SetupFooter } from "../../components/setup";
import {
  SetupShell,
  useSetupProgress,
} from "../../components/setup/SetupShell";
import { Icon } from "../../components/ui/Icon";
import {
  buildStudentIdPreview,
  DEFAULT_STUDENT_ID_PATTERN,
  fetchStudentIdSettings,
  parsePattern,
  PATTERN_PRESETS,
  saveStudentIdSettings,
  serializePattern,
  STUDENT_ID_TOKENS,
  type PatternSegment,
  type SequenceScope,
  type StudentIdToken,
} from "../../lib/student-id";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
} from "../../lib/setup";

export default function StudentIdSetupPage() {
  return (
    <SetupShell stepId="student-id" aside={<StudentIdAside />}>
      <StudentIdForm />
    </SetupShell>
  );
}

function StudentIdAside() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">How IDs work</h3>
      <p className="mt-1 text-xs text-slate-500">
        Patterns use your school short code. Changing the pattern later does not
        rewrite existing student IDs.
      </p>
      <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Unique per school
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Immutable once assigned
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Live preview as you build
        </li>
      </ul>
    </div>
  );
}

function StudentIdForm() {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [draftSaving, setDraftSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [shortCode, setShortCode] = React.useState("");
  const [segments, setSegments] = React.useState<PatternSegment[]>(() =>
    parsePattern(DEFAULT_STUDENT_ID_PATTERN),
  );
  const [presetId, setPresetId] = React.useState("school-year-seq");
  const [scope, setScope] = React.useState<SequenceScope>("year");
  const [customText, setCustomText] = React.useState("-");
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  const pattern = serializePattern(segments);
  const year = new Date().getFullYear();
  const preview = buildStudentIdPreview(pattern, {
    SCHOOL: shortCode || "SCH",
    YEAR: year,
    LEVEL: "F1",
    SECTION: "GEN",
    SPECIALIZATION: "EL",
    SEQ: 1,
  });

  React.useEffect(() => {
    void (async () => {
      const res = await fetchStudentIdSettings();
      if (res.ok) {
        setShortCode(res.data.school_short_code);
        setSegments(parsePattern(res.data.pattern));
        setScope(res.data.sequence_scope);
        const match = PATTERN_PRESETS.find(
          (p) => p.pattern && p.pattern === res.data.pattern,
        );
        setPresetId(match?.id ?? "custom");
      } else {
        setError(res.error);
      }
      setLoading(false);
    })();
  }, []);

  function applyPreset(id: string) {
    setPresetId(id);
    const preset = PATTERN_PRESETS.find((p) => p.id === id);
    if (!preset || id === "custom") return;
    setSegments(parsePattern(preset.pattern));
  }

  function markCustom() {
    setPresetId("custom");
  }

  function addToken(token: StudentIdToken) {
    markCustom();
    setSegments((prev) => {
      const next = [...prev];
      if (next.length > 0 && next[next.length - 1]!.type === "token") {
        next.push({ type: "text", value: "-" });
      }
      next.push({ type: "token", value: token });
      return next;
    });
  }

  function addCustomText() {
    const value = customText;
    if (!value) return;
    markCustom();
    setSegments((prev) => [...prev, { type: "text", value }]);
  }

  function removeSegment(index: number) {
    markCustom();
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }

  function onDragStart(index: number) {
    setDragIndex(index);
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setSegments((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragIndex, 1);
      next.splice(index, 0, item!);
      return next;
    });
    setDragIndex(index);
    markCustom();
  }

  function onDragEnd() {
    setDragIndex(null);
  }

  async function persist(): Promise<boolean> {
    if (!pattern.includes("{SEQ}")) {
      setError("Pattern must include the Sequence ({SEQ}) token.");
      return false;
    }
    const res = await saveStudentIdSettings({
      pattern,
      sequence_scope: scope,
    });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setShortCode(res.data.school_short_code);
    return true;
  }

  async function handleSaveDraft() {
    setDraftSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persist())) return;
      const draft = await saveSetupDraft("student-id");
      if (!draft.ok) {
        setError(draft.error);
        return;
      }
      await refreshProgress();
      setSuccess("Student ID settings draft saved.");
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleContinue() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persist())) return;
      const done = await completeSetupStep("student-id");
      if (!done.ok) {
        setError(done.error);
        return;
      }
      await refreshProgress();
      await router.push(getNextSetupHref("student-id"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveOnly() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persist())) return;
      setSuccess("Settings saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-slate-500">Loading student ID settings…</p>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <FormSection
        title="School code"
        description="Student IDs use this short code. Changing it does not update existing IDs."
        layout="stack"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              School code
            </p>
            <p className="mt-0.5 font-mono text-lg font-semibold text-slate-900">
              {shortCode || "—"}
            </p>
          </div>
          <Link
            href="/setup/school-profile"
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-(--sofia-primary) hover:text-(--sofia-primary)"
          >
            Edit School Profile
          </Link>
        </div>
      </FormSection>

      <FormSection
        title="Preset templates"
        description="Start from a common pattern, then customize."
        layout="stack"
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PATTERN_PRESETS.map((preset) => (
            <label
              key={preset.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition ${
                presetId === preset.id
                  ? "border-(--sofia-primary)/40 bg-(--sofia-primary)/5"
                  : "border-slate-200 bg-white"
              }`}
            >
              <input
                type="radio"
                name="id-preset"
                checked={presetId === preset.id}
                onChange={() => applyPreset(preset.id)}
                className="h-4 w-4 border-slate-300 text-(--sofia-primary)"
              />
              <span className="font-medium text-slate-900">{preset.label}</span>
            </label>
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Pattern builder"
        description="Drag chips to reorder. Add tokens or custom text separators."
        layout="stack"
      >
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-3 min-h-14">
          {segments.length === 0 ? (
            <p className="text-sm text-slate-400">
              Add tokens to build a pattern
            </p>
          ) : (
            segments.map((seg, index) => (
              <div
                key={`${seg.type}-${seg.value}-${index}`}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDragEnd={onDragEnd}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${
                  seg.type === "token"
                    ? "border-(--sofia-primary)/25 bg-white font-semibold text-slate-800"
                    : "border-slate-200 bg-white font-mono text-slate-500"
                } ${dragIndex === index ? "opacity-60" : ""}`}
              >
                <span className="cursor-grab text-slate-300 active:cursor-grabbing">
                  <Icon icon={DragDropVerticalIcon} size={14} />
                </span>
                {seg.type === "token" ? seg.value : `"${seg.value}"`}
                <button
                  type="button"
                  onClick={() => removeSegment(index)}
                  className="cursor-pointer text-slate-400 hover:text-red-500"
                  aria-label="Remove"
                >
                  <Icon icon={Delete02Icon} size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {STUDENT_ID_TOKENS.map((token) => (
            <button
              key={token.key}
              type="button"
              onClick={() => addToken(token.key)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-(--sofia-primary) hover:text-(--sofia-primary)"
            >
              <Icon icon={Add01Icon} size={12} />
              {token.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">
              Custom text
            </span>
            <input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15"
              placeholder="-"
            />
          </label>
          <button
            type="button"
            onClick={addCustomText}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-(--sofia-primary) hover:text-(--sofia-primary)"
          >
            Add text
          </button>
        </div>

        <p className="font-mono text-xs text-slate-400">Pattern: {pattern}</p>
      </FormSection>

      <FormSection title="Sequence settings" layout="stack">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-3.5 py-3 ${
              scope === "year"
                ? "border-(--sofia-primary)/40 bg-(--sofia-primary)/5"
                : "border-slate-200 bg-white"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <input
                type="radio"
                name="seq-scope"
                checked={scope === "year"}
                onChange={() => setScope("year")}
                className="h-4 w-4 text-(--sofia-primary)"
              />
              Reset every academic year
            </span>
            <span className="pl-6 text-xs text-slate-500">
              Sequence restarts each year across all levels.
            </span>
          </label>
          <label
            className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-3.5 py-3 ${
              scope === "year_level"
                ? "border-(--sofia-primary)/40 bg-(--sofia-primary)/5"
                : "border-slate-200 bg-white"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <input
                type="radio"
                name="seq-scope"
                checked={scope === "year_level"}
                onChange={() => setScope("year_level")}
                className="h-4 w-4 text-(--sofia-primary)"
              />
              Reset per level per year
            </span>
            <span className="pl-6 text-xs text-slate-500">
              Use with a Level token so IDs stay unique per form.
            </span>
          </label>
        </div>
      </FormSection>

      <FormSection title="Live preview" layout="stack">
        <div className="rounded-2xl border border-slate-200 bg-linear-to-br from-slate-50 to-white px-5 py-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Example student ID
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900">
            {preview || "—"}
          </p>
        </div>
      </FormSection>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSaveOnly()}
          disabled={saving}
          className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-(--sofia-primary) hover:text-(--sofia-primary) disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      <SetupFooter
        stepId="student-id"
        onSaveDraft={() => void handleSaveDraft()}
        onContinue={() => void handleContinue()}
        saving={saving}
        draftSaving={draftSaving}
      />
    </div>
  );
}
