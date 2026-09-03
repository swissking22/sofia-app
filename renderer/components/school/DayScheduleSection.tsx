import React from "react";
import { Delete02Icon, Add01Icon } from "@hugeicons/core-free-icons";
import { FormField } from "../setup";
import { Icon } from "../ui/Icon";
import {
  fetchDaySchedule,
  saveDaySchedule,
  type DayBreakDto,
  type DayScheduleDto,
} from "../../lib/day-schedule";
import { TableIconButton } from "../ui/TableActions";

type BreakDraft = DayBreakDto & { key: string };

function toDraftBreaks(breaks: DayBreakDto[]): BreakDraft[] {
  return breaks.map((b, i) => ({
    ...b,
    key: `b-${i}-${b.after_period}-${b.name}`,
  }));
}

/** Edit school-day start/end, period length, and break periods. */
export function DayScheduleSection({
  onFlash,
  onError,
}: {
  onFlash: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [dayStart, setDayStart] = React.useState("08:00");
  const [dayEnd, setDayEnd] = React.useState("15:00");
  const [duration, setDuration] = React.useState(45);
  const [periods, setPeriods] = React.useState(8);
  const [breaks, setBreaks] = React.useState<BreakDraft[]>([]);
  const [preview, setPreview] = React.useState<DayScheduleDto | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fetchDaySchedule();
      if (cancelled) return;
      if (!res.ok) {
        onError(res.error);
        setLoading(false);
        return;
      }
      applyDto(res.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // Load once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyDto(data: DayScheduleDto) {
    setDayStart(data.day_start_time);
    setDayEnd(data.day_end_time);
    setDuration(data.period_duration_minutes);
    setPeriods(data.periods_per_day);
    setBreaks(toDraftBreaks(data.breaks));
    setPreview(data);
  }

  function updateBreak(key: string, patch: Partial<DayBreakDto>) {
    setBreaks((prev) =>
      prev.map((b) => (b.key === key ? { ...b, ...patch } : b)),
    );
  }

  function addBreak() {
    setBreaks((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        name: prev.length === 0 ? "Break" : "Lunch",
        after_period: Math.min(periods, Math.max(1, Math.floor(periods / 2))),
        duration_minutes: 15,
      },
    ]);
  }

  async function handleSave() {
    setSaving(true);
    onError("");
    const res = await saveDaySchedule({
      day_start_time: dayStart,
      day_end_time: dayEnd,
      period_duration_minutes: duration,
      periods_per_day: periods,
      breaks: breaks.map(({ name, after_period, duration_minutes }) => ({
        name,
        after_period: Number(after_period),
        duration_minutes: Number(duration_minutes),
      })),
    });
    setSaving(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    applyDto(res.data);
    onFlash("School day schedule saved. Timetable grids will use these times.");
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading day schedule…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField
          label="Classes start"
          type="time"
          value={dayStart}
          onChange={(e) => setDayStart(e.target.value)}
          required
        />
        <FormField
          label="Classes close"
          type="time"
          value={dayEnd}
          onChange={(e) => setDayEnd(e.target.value)}
          required
        />
        <FormField
          label="Period duration (minutes)"
          type="number"
          min={15}
          max={180}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value) || 0)}
          required
        />
        <FormField
          label="Periods per day"
          type="number"
          min={1}
          max={16}
          value={periods}
          onChange={(e) => setPeriods(Number(e.target.value) || 0)}
          required
          hint="Used as rows on the timetable grid."
        />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-700">Break periods</p>
            <p className="text-xs text-slate-400">
              Placed after a teaching period (e.g. after period 2). Clock times
              on the timetable account for these gaps.
            </p>
          </div>
          <button
            type="button"
            onClick={addBreak}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Icon icon={Add01Icon} size={16} />
            Add break
          </button>
        </div>

        {breaks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-sm text-slate-500">
            No breaks configured. Teaching periods run back-to-back from start
            time.
          </p>
        ) : (
          <ul className="space-y-2">
            {breaks.map((b) => (
              <li
                key={b.key}
                className="grid items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_8rem_8rem_auto]"
              >
                <FormField
                  label="Name"
                  value={b.name}
                  onChange={(e) => updateBreak(b.key, { name: e.target.value })}
                />
                <FormField
                  label="After period"
                  type="number"
                  min={1}
                  max={periods}
                  value={b.after_period}
                  onChange={(e) =>
                    updateBreak(b.key, {
                      after_period: Number(e.target.value) || 1,
                    })
                  }
                />
                <FormField
                  label="Minutes"
                  type="number"
                  min={1}
                  max={180}
                  value={b.duration_minutes}
                  onChange={(e) =>
                    updateBreak(b.key, {
                      duration_minutes: Number(e.target.value) || 1,
                    })
                  }
                />
                <div className="mb-4 flex items-center pb-0.5">
                  <TableIconButton
                    icon={Delete02Icon}
                    label="Remove break"
                    tone="danger"
                    onClick={() =>
                      setBreaks((prev) => prev.filter((x) => x.key !== b.key))
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {preview?.blocks?.length ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Preview · day ends {preview.computed_end_time}
          </p>
          <ol className="flex flex-wrap gap-2 text-xs text-slate-600">
            {preview.blocks.map((block, i) =>
              block.kind === "period" ? (
                <li
                  key={`p-${block.period_number}`}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1"
                >
                  P{block.period_number} {block.start_time}–{block.end_time}
                </li>
              ) : (
                <li
                  key={`br-${i}`}
                  className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900"
                >
                  {block.name} {block.start_time}–{block.end_time}
                </li>
              ),
            )}
          </ol>
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="cursor-pointer rounded-lg bg-(--sofia-primary) px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save day schedule"}
        </button>
      </div>
    </div>
  );
}
