import React from "react";

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

/** White chart panel used on the dashboard overview. */
export function ChartCard({ title, children, action }: ChartCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm animate-[fadeInUp_0.5s_ease-out]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Simple empty-state chart placeholder until modules have data. */
export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-52 flex-col items-center justify-center rounded-xl bg-slate-50 text-center">
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-100">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
          <rect x="4" y="14" width="4" height="10" rx="1" fill="#93c5fd" />
          <rect x="12" y="8" width="4" height="16" rx="1" fill="#3b82f6" />
          <rect x="20" y="11" width="4" height="13" rx="1" fill="#1e40af" />
        </svg>
      </div>
      <p className="max-w-55 text-sm text-slate-500">{message}</p>
    </div>
  );
}

/** Mini bar chart from academic level → student count. */
export function ClassBars({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  if (data.length === 0) {
    return (
      <ChartEmpty message="Add classes and students to see enrollment by class." />
    );
  }

  return (
    <div className="flex h-52 items-end gap-3 px-2 pb-2 pt-4">
      {data.map((d, index) => {
        const heightPx = Math.max((d.value / max) * 140, 8);
        return (
          <div
            key={`${d.label}-${index}`}
            className="flex flex-1 flex-col items-center gap-2"
          >
            <span className="text-xs font-semibold text-slate-600">
              {d.value}
            </span>
            <div
              className="w-full max-w-12 rounded-t-lg bg-linear-to-t from-blue-700 to-blue-400"
              style={{ height: `${heightPx}px` }}
            />
            <span
              className="max-w-full truncate text-[11px] text-slate-500"
              title={d.label}
            >
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
