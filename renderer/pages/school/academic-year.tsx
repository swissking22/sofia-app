import React from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../components/layout/AppShell";
import { FormField, FormSection } from "../../components/setup";
import {
  AcademicYearTimeline,
  CalendarEventEditor,
  DateField,
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

export default function SchoolAcademicYearPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
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
    void (async () => {
      try {
        const result = await fetchAcademicYearSetup();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (!result.setup) return;
        setName(result.setup.name);
        setStartDate(result.setup.start_date);
        setEndDate(result.setup.end_date);
        setTerms(ensureThreeTerms(result.setup));
        setEvents(
          result.setup.events.map((e) => ({
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

  const timelineItems = React.useMemo(() => {
    const items = [];
    if (startDate && endDate) {
      items.push({
        label: name || "Academic Year",
        start: startDate,
        end: endDate,
        tone: "year" as const,
      });
    }
    for (const term of terms) {
      if (term.start_date && term.end_date) {
        items.push({
          label: term.name,
          start: term.start_date,
          end: term.end_date,
          tone: "term" as const,
        });
      }
    }
    for (const ev of events) {
      if (ev.start_date && ev.end_date) {
        items.push({
          label: ev.title || (ev.type === "holiday" ? "Holiday" : "Vacation"),
          start: ev.start_date,
          end: ev.end_date,
          tone: ev.type,
        });
      }
    }
    return items;
  }, [name, startDate, endDate, terms, events]);

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

  function validate(): string | null {
    if (!name.trim()) return "Academic year name is required.";
    if (!startDate) return "Academic year start date is required.";
    if (!endDate) return "Academic year end date is required.";
    if (endDate < startDate) {
      return "Academic year end date must be after the start date.";
    }
    const filledEvents = events.filter(
      (e) => e.title.trim() || e.start_date || e.end_date,
    );
    for (const ev of filledEvents) {
      if (!ev.title.trim()) return "Every holiday/vacation needs a title.";
      if (!ev.start_date || !ev.end_date) {
        return `"${ev.title}": start and end dates are required.`;
      }
      if (ev.end_date < ev.start_date) {
        return `"${ev.title}": end date must be after the start date.`;
      }
    }
    return null;
  }

  async function handleSave() {
    setError("");
    setSuccess("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const result = await saveAcademicYearSetup(buildPayload());
      if (!result.ok) {
        setError(result.error);
        return;
      }
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
      setSuccess("Academic year saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Academic Year"
      breadcrumb={["School Management", "Academic Year"]}
      heading="Academic Year"
      subtitle="Configure the active school year and calendar events."
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading academic year…</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-5">
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
              title="School Calendar"
              description="Holidays and vacation periods within this academic year."
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
                  No holidays or vacations yet.
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
                          prev.map((e) =>
                            e.localId === event.localId ? next : e,
                          ),
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

            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>

          <div className="hidden xl:block">
            <div className="sticky top-4">
              <AcademicYearTimeline items={timelineItems} />
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
