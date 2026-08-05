import { Delete02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";
import type { CalendarEventType } from "../../lib/academic-year";

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  min?: string;
  max?: string;
}

/** Native date picker styled to match setup form fields. */
export function DateField({
  label,
  value,
  onChange,
  required,
  min,
  max,
}: DateFieldProps) {
  return (
    <label className="mb-0 block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required ? (
          <span className="text-red-500" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15"
      />
    </label>
  );
}

interface TermCardProps {
  title: string;
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  yearStart?: string;
  yearEnd?: string;
}

export function TermCard({
  title,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  yearStart,
  yearEnd,
}: TermCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DateField
          label="Start Date"
          required
          value={startDate}
          min={yearStart}
          max={yearEnd}
          onChange={onStartChange}
        />
        <DateField
          label="End Date"
          required
          value={endDate}
          min={startDate || yearStart}
          max={yearEnd}
          onChange={onEndChange}
        />
      </div>
    </div>
  );
}

export interface CalendarEventDraft {
  localId: string;
  id: string | null;
  type: CalendarEventType;
  title: string;
  start_date: string;
  end_date: string;
}

interface CalendarEventEditorProps {
  event: CalendarEventDraft;
  onChange: (event: CalendarEventDraft) => void;
  onRemove: () => void;
  yearStart?: string;
  yearEnd?: string;
}

export function CalendarEventEditor({
  event,
  onChange,
  onRemove,
  yearStart,
  yearEnd,
}: CalendarEventEditorProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            event.type === "holiday"
              ? "bg-amber-50 text-amber-700"
              : "bg-sky-50 text-sky-700"
          }`}
        >
          {event.type === "holiday" ? "Holiday" : "Vacation"}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          aria-label="Remove period"
        >
          <Icon icon={Delete02Icon} size={16} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-1">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Title
          </span>
          <input
            type="text"
            value={event.title}
            onChange={(e) => onChange({ ...event, title: e.target.value })}
            placeholder={
              event.type === "holiday"
                ? "e.g. National Day"
                : "e.g. Christmas Break"
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15"
          />
        </label>
        <DateField
          label="Start Date"
          value={event.start_date}
          min={yearStart}
          max={yearEnd}
          onChange={(start_date) => onChange({ ...event, start_date })}
        />
        <DateField
          label="End Date"
          value={event.end_date}
          min={event.start_date || yearStart}
          max={yearEnd}
          onChange={(end_date) => onChange({ ...event, end_date })}
        />
      </div>
    </div>
  );
}

interface TimelineItem {
  label: string;
  start: string;
  end: string;
  tone: "year" | "term" | "holiday" | "vacation";
}

interface AcademicYearTimelineProps {
  items: TimelineItem[];
}

function parseDate(value: string): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function formatShort(value: string): string {
  if (!value) return "—";
  const d = new Date(value + "T00:00:00");
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const TONE_CLASS: Record<TimelineItem["tone"], string> = {
  year: "bg-(--sofia-primary)",
  term: "bg-indigo-400",
  holiday: "bg-amber-400",
  vacation: "bg-sky-400",
};

/** Visual summary of the academic year, terms, and calendar periods. */
export function AcademicYearTimeline({ items }: AcademicYearTimelineProps) {
  const dated = items
    .map((item) => ({
      ...item,
      startMs: parseDate(item.start),
      endMs: parseDate(item.end),
    }))
    .filter((i) => i.startMs !== null && i.endMs !== null) as Array<
    TimelineItem & { startMs: number; endMs: number }
  >;

  if (dated.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
        Set year and term dates to see the calendar timeline.
      </div>
    );
  }

  const min = Math.min(...dated.map((i) => i.startMs));
  const max = Math.max(...dated.map((i) => i.endMs));
  const span = Math.max(max - min, 1);

  return (
    <aside className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Calendar summary</h3>
      <p className="mt-1 text-xs text-slate-500">
        Academic year timeline — drives attendance, exams, and results.
      </p>

      <div className="mt-5 space-y-3">
        {dated.map((item) => {
          const left = ((item.startMs - min) / span) * 100;
          const width = Math.max(((item.endMs - item.startMs) / span) * 100, 2);
          return (
            <div key={`${item.tone}-${item.label}-${item.start}`}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-slate-700">{item.label}</span>
                <span className="shrink-0 text-slate-400">
                  {formatShort(item.start)} – {formatShort(item.end)}
                </span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`absolute top-0 h-full rounded-full ${TONE_CLASS[item.tone]}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-4 text-[11px] text-slate-500">
        <Legend swatch="bg-(--sofia-primary)" label="Year" />
        <Legend swatch="bg-indigo-400" label="Terms" />
        <Legend swatch="bg-amber-400" label="Holidays" />
        <Legend swatch="bg-sky-400" label="Vacations" />
      </div>

      <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
        <li>• Attendance periods follow term dates</li>
        <li>• Examination windows sit within each term</li>
        <li>• Result processing opens after term end</li>
      </ul>
    </aside>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${swatch}`} />
      {label}
    </span>
  );
}
