import React from "react";
import { useRouter } from "next/router";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { FormField, FormSection, SetupFooter } from "../../components/setup";
import {
  SetupShell,
  useSetupProgress,
} from "../../components/setup/SetupShell";
import {
  AcademicYearTimeline,
  CalendarEventEditor,
  DateField,
  TermCard,
  type CalendarEventDraft,
} from "../../components/setup/AcademicYearFields";
import { Icon } from "../../components/ui/Icon";
import {
  fetchAcademicYearSetup,
  saveAcademicYearSetup,
  TERM_LABELS,
  type AcademicYearSetup,
  type AcademicYearSetupInput,
  type CalendarEventType,
} from "../../lib/academic-year";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
} from "../../lib/setup";

function newLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function ensureThreeTerms(setup: AcademicYearSetup) {
  return [1, 2, 3].map((n) => {
    const existing = setup.terms.find((t) => t.term_number === n);
    return {
      id: existing?.id ?? "",
      term_number: n,
      name: existing?.name || TERM_LABELS[n - 1],
      start_date: existing?.start_date ?? "",
      end_date: existing?.end_date ?? "",
    };
  });
}

export default function AcademicYearSetupPage() {
  const [asideData, setAsideData] = React.useState<{
    yearName: string;
    yearStart: string;
    yearEnd: string;
    terms: Array<{ name: string; start: string; end: string }>;
    events: Array<{
      type: CalendarEventType;
      title: string;
      start: string;
      end: string;
    }>;
  }>({
    yearName: "",
    yearStart: "",
    yearEnd: "",
    terms: [],
    events: [],
  });

  const timelineItems = React.useMemo(() => {
    const items = [];
    if (asideData.yearStart && asideData.yearEnd) {
      items.push({
        label: asideData.yearName || "Academic Year",
        start: asideData.yearStart,
        end: asideData.yearEnd,
        tone: "year" as const,
      });
    }
    for (const term of asideData.terms) {
      if (term.start && term.end) {
        items.push({
          label: term.name,
          start: term.start,
          end: term.end,
          tone: "term" as const,
        });
      }
    }
    for (const ev of asideData.events) {
      if (ev.start && ev.end) {
        items.push({
          label: ev.title || (ev.type === "holiday" ? "Holiday" : "Vacation"),
          start: ev.start,
          end: ev.end,
          tone: ev.type,
        });
      }
    }
    return items;
  }, [asideData]);

  return (
    <SetupShell
      stepId="academic-year"
      aside={<AcademicYearTimeline items={timelineItems} />}
    >
      <AcademicYearForm onPreviewChange={setAsideData} />
    </SetupShell>
  );
}

function AcademicYearForm({
  onPreviewChange,
}: {
  onPreviewChange: (data: {
    yearName: string;
    yearStart: string;
    yearEnd: string;
    terms: Array<{ name: string; start: string; end: string }>;
    events: Array<{
      type: CalendarEventType;
      title: string;
      start: string;
      end: string;
    }>;
  }) => void;
}) {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [draftSaving, setDraftSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [name, setName] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [terms, setTerms] = React.useState<
    Array<{
      id: string;
      term_number: number;
      name: string;
      start_date: string;
      end_date: string;
    }>
  >(() =>
    [1, 2, 3].map((n) => ({
      id: "",
      term_number: n,
      name: TERM_LABELS[n - 1],
      start_date: "",
      end_date: "",
    })),
  );
  const [events, setEvents] = React.useState<CalendarEventDraft[]>([]);

  React.useEffect(() => {
    onPreviewChange({
      yearName: name,
      yearStart: startDate,
      yearEnd: endDate,
      terms: terms.map((t) => ({
        name: t.name,
        start: t.start_date,
        end: t.end_date,
      })),
      events: events.map((e) => ({
        type: e.type,
        title: e.title,
        start: e.start_date,
        end: e.end_date,
      })),
    });
  }, [name, startDate, endDate, terms, events, onPreviewChange]);

  React.useEffect(() => {
    void (async () => {
      try {
        const result = await fetchAcademicYearSetup();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (!result.setup) return;
        const setup = result.setup;
        setName(setup.name);
        setStartDate(setup.start_date);
        setEndDate(setup.end_date);
        setTerms(ensureThreeTerms(setup));
        setEvents(
          setup.events.map((e) => ({
            localId: e.id || newLocalId(),
            id: e.id || null,
            type: e.type,
            title: e.title,
            start_date: e.start_date,
            end_date: e.end_date,
          })),
        );
      } catch {
        setError("Could not load academic year.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function updateTerm(
    termNumber: number,
    patch: Partial<{ start_date: string; end_date: string }>,
  ) {
    setTerms((prev) =>
      prev.map((t) => (t.term_number === termNumber ? { ...t, ...patch } : t)),
    );
  }

  function addEvent(type: CalendarEventType) {
    setEvents((prev) => [
      ...prev,
      {
        localId: newLocalId(),
        id: null,
        type,
        title: "",
        start_date: "",
        end_date: "",
      },
    ]);
  }

  function buildPayload(): AcademicYearSetupInput {
    return {
      name,
      start_date: startDate,
      end_date: endDate,
      terms: terms.map((t) => ({
        term_number: t.term_number,
        name: t.name,
        start_date: t.start_date,
        end_date: t.end_date,
      })),
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        start_date: e.start_date,
        end_date: e.end_date,
      })),
    };
  }

  function validateForContinue(): string | null {
    if (!name.trim()) return "Academic year name is required.";
    if (!startDate) return "Academic year start date is required.";
    if (!endDate) return "Academic year end date is required.";
    if (endDate < startDate) {
      return "Academic year end date must be after the start date.";
    }
    for (const term of terms) {
      if (!term.start_date || !term.end_date) {
        return `${term.name}: start and end dates are required.`;
      }
      if (term.end_date < term.start_date) {
        return `${term.name}: end date must be after the start date.`;
      }
    }
    const filledEvents = events.filter(
      (e) => e.title.trim() || e.start_date || e.end_date,
    );
    for (const ev of filledEvents) {
      if (!ev.title.trim()) {
        return "Every holiday/vacation needs a title.";
      }
      if (!ev.start_date || !ev.end_date) {
        return `"${ev.title}": start and end dates are required.`;
      }
      if (ev.end_date < ev.start_date) {
        return `"${ev.title}": end date must be after the start date.`;
      }
    }
    return null;
  }

  async function persist() {
    const result = await saveAcademicYearSetup(buildPayload());
    if (!result.ok) throw new Error(result.error);
    setName(result.setup.name);
    setStartDate(result.setup.start_date);
    setEndDate(result.setup.end_date);
    setTerms(ensureThreeTerms(result.setup));
    setEvents(
      result.setup.events.map((e) => ({
        localId: e.id,
        id: e.id,
        type: e.type,
        title: e.title,
        start_date: e.start_date,
        end_date: e.end_date,
      })),
    );
  }

  async function handleSaveDraft() {
    setError("");
    setSuccess("");
    if (!name.trim()) {
      setError("Academic year name is required to save a draft.");
      return;
    }
    setDraftSaving(true);
    try {
      await persist();
      const draft = await saveSetupDraft("academic-year");
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
    const validationError = validateForContinue();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      await persist();
      const done = await completeSetupStep("academic-year");
      if (!done.ok) {
        setError(done.error);
        return;
      }
      await refreshProgress();
      await router.push(getNextSetupHref("academic-year"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading academic year…</p>;
  }

  return (
    <>
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

      <div className="space-y-5">
        <FormSection
          title="Current Academic Year"
          description="Name and date range for the active school year."
        >
          <FormField
            label="Academic Year Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="2026/2027"
            fullWidth
          />
          <div className="mb-4 sm:col-span-1">
            <DateField
              label="Start Date"
              required
              value={startDate}
              max={endDate || undefined}
              onChange={setStartDate}
            />
          </div>
          <div className="mb-4 sm:col-span-1">
            <DateField
              label="End Date"
              required
              value={endDate}
              min={startDate || undefined}
              onChange={setEndDate}
            />
          </div>
        </FormSection>

        <FormSection
          title="Term Configuration"
          description="Set the three terms that structure attendance and exams."
          layout="stack"
        >
          {terms.map((term) => (
            <TermCard
              key={term.term_number}
              title={term.name}
              startDate={term.start_date}
              endDate={term.end_date}
              yearStart={startDate || undefined}
              yearEnd={endDate || undefined}
              onStartChange={(value) =>
                updateTerm(term.term_number, { start_date: value })
              }
              onEndChange={(value) =>
                updateTerm(term.term_number, { end_date: value })
              }
            />
          ))}
        </FormSection>

        <FormSection
          title="School Calendar"
          description="Add holidays and vacation periods within the academic year."
          layout="stack"
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => addEvent("holiday")}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
            >
              <Icon icon={Add01Icon} size={16} />
              Add Holiday
            </button>
            <button
              type="button"
              onClick={() => addEvent("vacation")}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
            >
              <Icon icon={Add01Icon} size={16} />
              Add Vacation Period
            </button>
          </div>

          {events.length === 0 ? (
            <p className="text-sm text-slate-500">
              No holidays or vacations yet. Optional — add them as needed.
            </p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <CalendarEventEditor
                  key={event.localId}
                  event={event}
                  yearStart={startDate || undefined}
                  yearEnd={endDate || undefined}
                  onChange={(next) =>
                    setEvents((prev) =>
                      prev.map((e) => (e.localId === event.localId ? next : e)),
                    )
                  }
                  onRemove={() =>
                    setEvents((prev) =>
                      prev.filter((e) => e.localId !== event.localId),
                    )
                  }
                />
              ))}
            </div>
          )}
        </FormSection>

        <SetupFooter
          stepId="academic-year"
          onSaveDraft={() => void handleSaveDraft()}
          onContinue={() => void handleContinue()}
          saving={saving}
          draftSaving={draftSaving}
        />
      </div>
    </>
  );
}
