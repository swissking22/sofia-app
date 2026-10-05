import React from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  href?: string;
  summary?: string;
}

/** White chart panel used on the dashboard overview. */
export function ChartCard({
  title,
  children,
  action,
  href,
  summary,
}: ChartCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {href ? (
            <Link
              href={href}
              className="text-base font-semibold text-slate-900 hover:text-(--sofia-primary)"
            >
              {title}
            </Link>
          ) : (
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          )}
          {summary ? <p className="sr-only">{summary}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-52 flex-col items-center justify-center rounded-xl bg-slate-50 text-center px-4">
      <p className="max-w-xs text-sm text-slate-500">{message}</p>
    </div>
  );
}

export function ChartSkeleton({ height = 208 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded-xl bg-slate-100"
      style={{ height }}
      aria-hidden
    />
  );
}

const TOOLTIP_STYLE = {
  backgroundColor: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
};

const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 };
const GRID = "#f1f5f9";
const PRIMARY = "var(--sofia-primary, #4f46e5)";
const DONUT_COLORS = ["#4f46e5", "#0d9488", "#f59e0b", "#6366f1", "#14b8a6"];

export function SofiaLineChart({
  data,
  valueSuffix = "",
  valueFormatter,
}: {
  data: Array<{ label: string; value: number }>;
  valueSuffix?: string;
  valueFormatter?: (n: number) => string;
}) {
  if (!data.length) return <ChartEmpty message="Not enough data" />;
  const fmt = valueFormatter ?? ((n: number) => `${n}${valueSuffix}`);
  return (
    <div className="h-52 w-full" role="img" aria-label="Line chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v) => fmt(Number(v))}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [fmt(Number(value)), ""]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={PRIMARY}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SofiaHorizontalBarChart({
  data,
  valueFormatter,
  onBarClick,
}: {
  data: Array<{
    id: string;
    label: string;
    value: number;
    href?: string | null;
  }>;
  valueFormatter?: (n: number) => string;
  onBarClick?: (id: string, href?: string | null) => void;
}) {
  if (!data.length) return <ChartEmpty message="No data available." />;
  const fmt = valueFormatter ?? ((n: number) => String(n));
  const chartData = data.map((d) => ({
    ...d,
    short: d.label.length > 14 ? `${d.label.slice(0, 12)}…` : d.label,
  }));
  return (
    <div className="h-56 w-full" role="img" aria-label="Bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
        >
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="short"
            width={88}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [fmt(Number(value)), ""]}
            labelFormatter={(_, payload) => {
              const item = payload?.[0]?.payload as
                | { label?: string }
                | undefined;
              return item?.label ?? "";
            }}
          />
          <Bar
            dataKey="value"
            fill={PRIMARY}
            radius={[0, 6, 6, 0]}
            barSize={14}
            isAnimationActive={false}
            cursor={onBarClick ? "pointer" : undefined}
            onClick={(entry) => {
              const row = entry as unknown as {
                id?: string;
                href?: string | null;
              };
              if (row?.id && onBarClick) onBarClick(row.id, row.href);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SofiaDonutChart({
  data,
  totalLabel,
}: {
  data: Array<{ id: string; label: string; value: number }>;
  totalLabel: string;
}) {
  if (!data.length) return <ChartEmpty message="No composition data." />;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative h-52 w-full" role="img" aria-label="Donut chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="58%"
            outerRadius="80%"
            paddingAngle={2}
            isAnimationActive={false}
          >
            {data.map((entry, i) => (
              <Cell
                key={entry.id}
                fill={DONUT_COLORS[i % DONUT_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-bold text-slate-900">{total}</p>
        <p className="text-xs text-slate-500">{totalLabel}</p>
      </div>
      <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-600">
        {data.map((d, i) => (
          <li key={d.id} className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
            />
            {d.label} ({d.value})
          </li>
        ))}
      </ul>
    </div>
  );
}

/** @deprecated legacy vertical bars — prefer SofiaHorizontalBarChart */
export function ClassBars({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  return (
    <SofiaHorizontalBarChart
      data={data.map((d, i) => ({
        id: `${d.label}-${i}`,
        label: d.label,
        value: d.value,
      }))}
    />
  );
}

/** Vertical monthly-style bars (financial overview). */
export function SofiaVerticalBarChart({
  data,
  valueFormatter,
  highlightLast = true,
}: {
  data: Array<{ label: string; value: number }>;
  valueFormatter?: (n: number) => string;
  highlightLast?: boolean;
}) {
  if (!data.length) return <ChartEmpty message="No data available." />;
  const fmt = valueFormatter ?? ((n: number) => String(Math.round(n)));
  return (
    <div className="h-52 w-full" role="img" aria-label="Bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v) => fmt(Number(v))}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [fmt(Number(value)), ""]}
          />
          <Bar
            dataKey="value"
            radius={[6, 6, 0, 0]}
            barSize={18}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={
                  highlightLast && i === data.length - 1
                    ? PRIMARY
                    : "rgba(79, 70, 229, 0.25)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Semi-circle gauge for today's attendance. */
export function SofiaAttendanceGauge({
  rate,
  present,
  absent,
  late,
}: {
  rate: number | null;
  present: number;
  absent: number;
  late: number;
}) {
  if (rate == null) {
    return <ChartEmpty message="Attendance not recorded today." />;
  }
  const clamped = Math.max(0, Math.min(100, rate));
  const data = [
    { name: "present", value: clamped },
    { name: "rest", value: 100 - clamped },
  ];
  const total = present + absent + late;
  const pct = (n: number) =>
    total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0%";

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative h-40 w-full max-w-xs"
        role="img"
        aria-label="Attendance gauge"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              startAngle={180}
              endAngle={0}
              innerRadius="70%"
              outerRadius="95%"
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={PRIMARY} />
              <Cell fill="#e2e8f0" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-2">
          <p className="text-3xl font-bold text-slate-900">{clamped}%</p>
          <p className="text-xs font-medium text-slate-400">
            Today&apos;s Attendance
          </p>
        </div>
      </div>
      <ul className="mt-2 w-full space-y-1.5 text-xs">
        <li className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-(--sofia-primary)" />
            Present
          </span>
          <span className="font-semibold text-slate-800">
            {present} ({pct(present)})
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-slate-800" />
            Absent
          </span>
          <span className="font-semibold text-slate-800">
            {absent} ({pct(absent)})
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            Late
          </span>
          <span className="font-semibold text-slate-800">
            {late} ({pct(late)})
          </span>
        </li>
      </ul>
    </div>
  );
}
