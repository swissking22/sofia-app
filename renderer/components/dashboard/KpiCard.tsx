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
  /** Mini sparkline values (newest last). */
  sparkline?: number[];
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
  sparkline,
  summary,
}: KpiCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-(--sofia-primary)/10 text-(--sofia-primary)">
              <Icon icon={icon} size={18} />
            </span>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {title}
            </p>
          </div>
          {loading ? (
            <div className="mt-4 h-9 w-28 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              {value}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {trend && trend.direction !== "neutral" ? (
              <span
                className={`inline-flex items-center gap-0.5 font-semibold ${
                  trend.direction === "up" ? "text-emerald-600" : "text-red-500"
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
        </div>
        {sparkline && sparkline.length > 1 ? (
          <Sparkline values={sparkline} />
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

function Sparkline({ values }: { values: number[] }) {
  const w = 88;
  const h = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 text-emerald-500"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  );
}
