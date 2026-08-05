import type { IconSvgElement } from "@hugeicons/react";
import { TradeDownIcon, TradeUpIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: IconSvgElement;
  hint?: string;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
}

/** Metric card matching the reference dashboard KPI style. */
export function KpiCard({ title, value, icon, hint, trend }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm animate-[fadeInUp_0.45s_ease-out]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Icon icon={icon} size={18} />
          </span>
          <p className="text-sm font-medium text-slate-600">{title}</p>
        </div>
      </div>

      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
        {value}
      </p>

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
        {hint ? <span className="text-slate-400">{hint}</span> : null}
      </div>
    </div>
  );
}
