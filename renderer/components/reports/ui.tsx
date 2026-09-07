import React from "react";
import Link from "next/link";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StudentTable,
  TableSelectionBar,
  selectClass,
} from "../students/ui";

export {
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StudentTable,
  TableSelectionBar,
  selectClass,
};

export function ShareBar({
  value,
  max = 100,
  color = "bg-(--sofia-primary)",
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  const width = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function ReportSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description ? (
          <p className="text-xs text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatGrid({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode; hint?: string }>;
}) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {item.label}
          </div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            {item.value}
          </div>
          {item.hint ? (
            <div className="mt-1 text-xs text-slate-400">{item.hint}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function InsightCard({
  severity,
  title,
  description,
  href,
}: {
  severity: string;
  title: string;
  description: string;
  href?: string | null;
}) {
  const tone =
    severity === "CRITICAL"
      ? "border-red-100 bg-red-50 text-red-800"
      : severity === "WARNING"
        ? "border-amber-100 bg-amber-50 text-amber-800"
        : "border-sky-100 bg-sky-50 text-sky-800";
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide">
        {severity}
      </div>
      <div className="mt-1 text-sm font-semibold">{title}</div>
      <p className="mt-1 text-sm">{description}</p>
      {href ? (
        <Link
          href={href}
          className="mt-2 inline-block text-xs font-semibold underline"
        >
          Open
        </Link>
      ) : null}
    </div>
  );
}

export function ExportBar({
  onCsv,
  disabled,
}: {
  onCsv?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {onCsv ? (
        <SecondaryButton disabled={disabled} onClick={onCsv}>
          Export CSV
        </SecondaryButton>
      ) : null}
      <SecondaryButton disabled={disabled} onClick={() => window.print()}>
        Print / PDF
      </SecondaryButton>
    </div>
  );
}
