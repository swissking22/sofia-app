import React from "react";
import { AppShell } from "../../components/layout/AppShell";
import { FormSection } from "../../components/setup";
import {
  AcademicYearTimeline,
  TermCard,
} from "../../components/setup/AcademicYearFields";
import {
  fetchAcademicYearSetup,
  saveAcademicYearSetup,
  TERM_LABELS,
  type AcademicYearSetup,
  type AcademicYearSetupInput,
  type CalendarEventDto,
} from "../../lib/academic-year";

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

export default function SchoolTermsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [yearName, setYearName] = React.useState("");
  const [yearStart, setYearStart] = React.useState("");
  const [yearEnd, setYearEnd] = React.useState("");
  const [events, setEvents] = React.useState<CalendarEventDto[]>([]);
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

  React.useEffect(() => {
    void (async () => {
      try {
        const result = await fetchAcademicYearSetup();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (!result.setup) {
          setError("Set up an academic year first.");
          return;
        }
        setYearName(result.setup.name);
        setYearStart(result.setup.start_date);
        setYearEnd(result.setup.end_date);
        setEvents(result.setup.events);
        setTerms(ensureThreeTerms(result.setup));
      } catch {
        setError("Could not load terms.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const timelineItems = React.useMemo(() => {
    const items = [];
    if (yearStart && yearEnd) {
      items.push({
        label: yearName || "Academic Year",
        start: yearStart,
        end: yearEnd,
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
    return items;
  }, [yearName, yearStart, yearEnd, terms]);

  function updateTerm(
    termNumber: number,
    patch: Partial<{ start_date: string; end_date: string }>,
  ) {
    setTerms((prev) =>
      prev.map((t) => (t.term_number === termNumber ? { ...t, ...patch } : t)),
    );
  }

  function buildPayload(): AcademicYearSetupInput {
    return {
      name: yearName,
      start_date: yearStart,
      end_date: yearEnd,
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
    if (!yearName.trim() || !yearStart || !yearEnd) {
      return "Configure the academic year before editing terms.";
    }
    for (const term of terms) {
      if (!term.start_date || !term.end_date) {
        return `${term.name}: start and end dates are required.`;
      }
      if (term.end_date < term.start_date) {
        return `${term.name}: end date must be after the start date.`;
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
      setTerms(ensureThreeTerms(result.setup));
      setEvents(result.setup.events);
      setSuccess("Terms saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save terms.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Terms & Sessions"
      breadcrumb={["School Management", "Terms & Sessions"]}
      heading="Terms & Sessions"
      subtitle={
        yearName
          ? `Term dates for ${yearName}.`
          : "Set the three terms for the current academic year."
      }
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading terms…</p>
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
              title="Term Configuration"
              description="First, Second, and Third Term dates structure attendance and exams."
              layout="stack"
            >
              {terms.map((term) => (
                <TermCard
                  key={term.term_number}
                  title={term.name}
                  startDate={term.start_date}
                  endDate={term.end_date}
                  yearStart={yearStart || undefined}
                  yearEnd={yearEnd || undefined}
                  onStartChange={(value) =>
                    updateTerm(term.term_number, { start_date: value })
                  }
                  onEndChange={(value) =>
                    updateTerm(term.term_number, { end_date: value })
                  }
                />
              ))}
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
