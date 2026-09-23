import Link from "next/link";
import type { IconSvgElement } from "@hugeicons/react";
import { TradeDownIcon, TradeUpIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: IconSvgElement;
  hint?: string;
  href?: string;
  loading?: boolean;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
  /** Optional radial progress 0–100 (e.g. attendance). */
  progress?: number | null;
  /** Accessible description for screen readers. */
  summary?: string;
}

/** Metric card matching the Sofia dashboard KPI style. */
export function KpiCard({
  title,
  value,
  icon,
  hint,
  href,
  loading,
  trend,
  progress,
  summary,
}: KpiCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-(--sofia-primary)/10 text-(--sofia-primary)">
            <Icon icon={icon} size={18} />
          </span>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </p>
        </div>
        {progress != null && progress >= 0 ? (
          <RadialProgress value={progress} />
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 h-9 w-28 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
          {value}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2 text-xs">
        {trend && trend.direction !== "neutral" ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${
              trend.direction === "up"
                ? "bg-emerald-50 text-emerald-600"
                : "bg-red-50 text-red-500"
            }`}
          >
            <Icon
              icon={trend.direction === "up" ? TradeUpIcon : TradeDownIcon}
              size={12}
            />
            {trend.value}
          </span>
        ) : null}
        {loading ? (
          <span className="h-3 w-24 animate-pulse rounded bg-slate-100" />
        ) : hint ? (
          <span className="text-slate-400">{hint}</span>
        ) : null}
      </div>
      {summary ? <span className="sr-only">{summary}</span> : null}
    </>
  );

  const className =
    "block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--sofia-primary)/30";

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

function RadialProgress({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = 14;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="3"
      />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="var(--sofia-primary)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}
