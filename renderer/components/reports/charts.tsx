import React from "react";
import {
  ChartCard,
  ChartEmpty,
  SofiaAreaChart,
  SofiaDonutChart,
  SofiaGroupedBarChart,
  SofiaHorizontalBarChart,
  SofiaLineChart,
  SofiaPercentGauge,
  SofiaVerticalBarChart,
} from "../dashboard/ChartCard";

export {
  ChartEmpty,
  SofiaAreaChart,
  SofiaDonutChart,
  SofiaGroupedBarChart,
  SofiaHorizontalBarChart,
  SofiaLineChart,
  SofiaPercentGauge,
  SofiaVerticalBarChart,
};

/** Chart panel for Reports & Analytics (same visual language as the dashboard). */
export function ReportChartPanel({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <ChartCard
        title={title}
        summary={description}
        action={
          description ? (
            <p className="max-w-xs text-right text-xs text-slate-400">
              {description}
            </p>
          ) : undefined
        }
      >
        {children}
      </ChartCard>
    </div>
  );
}

export function ReportChartGrid({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid gap-4 lg:grid-cols-2">{children}</div>;
}
