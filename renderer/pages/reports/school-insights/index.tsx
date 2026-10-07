import React from "react";
import Link from "next/link";
import { AppShell } from "../../../components/layout/AppShell";
import {
  ExportBar,
  FilterBar,
  FilterField,
  InsightCard,
  MoneyText,
  PageAlert,
  ReportSection,
  StatGrid,
  selectClass,
} from "../../../components/reports/ui";
import {
  ReportChartGrid,
  ReportChartPanel,
  SofiaDonutChart,
  SofiaGroupedBarChart,
  SofiaHorizontalBarChart,
  SofiaPercentGauge,
} from "../../../components/reports/charts";
import {
  downloadCsv,
  fetchReportsMeta,
  fetchSchoolInsights,
  toCsv,
  type ReportFilters,
} from "../../../lib/reports";
import { formatCompactMoney } from "../../../lib/finance-mgmt";

export default function SchoolInsightsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [yearId, setYearId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [meta, setMeta] = React.useState<
    | Extract<
        Awaited<ReturnType<typeof fetchReportsMeta>>,
        { ok: true }
      >["data"]
    | null
  >(null);
  const [data, setData] = React.useState<Record<string, unknown> | null>(null);

  const load = React.useCallback(async () => {
    const metaRes = await fetchReportsMeta();
    if (!metaRes.ok) {
      setError(metaRes.error);
      setLoading(false);
      return;
    }
    setMeta(metaRes.data);
    const year =
      yearId ||
      metaRes.data.years.find((y) => y.is_current)?.id ||
      metaRes.data.years[0]?.id ||
      "";
    if (!yearId && year) setYearId(year);
    const filters: ReportFilters = {
      academic_year_id: year || undefined,
      term_id: termId || undefined,
    };
    const res = await fetchSchoolInsights(filters);
    if (res.ok) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, [yearId, termId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const insights = (data?.insights ?? []) as Array<{
    type: string;
    severity: string;
    title: string;
    description: string;
    href?: string | null;
  }>;
  const students = (data?.students ?? null) as {
    total: number;
    new_admissions: number;
    withdrawals: number;
    per_class: Array<{ name: string; n: number }>;
    per_department: Array<{ name: string; n: number }>;
  } | null;
  const academic = (data?.academic ?? null) as {
    overall_average: number;
    pass_rate: number;
    best_class: { class_name: string; average: number } | null;
    lowest_class: { class_name: string; average: number } | null;
    weak_subject: { subject_name: string } | null;
  } | null;
  const financial = (data?.financial ?? null) as {
    collection_rate: number;
    outstanding: number;
    revenue: number;
    expenses: number;
    net: number;
    budget_utilization: number;
  } | null;
  const attendance = (data?.attendance ?? null) as {
    overall: number;
    absence_rate: number;
    lowest_classes: Array<{ class_name: string; attendance_rate: number }>;
    below_threshold: number;
    threshold: number;
  } | null;
  const staff = (data?.staff ?? null) as {
    teachers: number;
    staff: number;
    timetable_periods: number;
    active_leave: number;
    attendance_rate: number;
  } | null;

  const currency = meta?.currency ?? "XAF";
  const canFinance = meta?.can_view_finance ?? false;
  const terms = (meta?.terms ?? []).filter(
    (t) => !yearId || t.academic_year_id === yearId,
  );

  function exportCsv() {
    downloadCsv(
      "school-insights.csv",
      toCsv(
        ["Severity", "Type", "Title", "Description"],
        insights.map((i) => [i.severity, i.type, i.title, i.description]),
      ),
    );
  }

  return (
    <AppShell
      title="School Insights"
      breadcrumb={["Reports & Analytics", "School Insights"]}
      heading="School Insights"
      subtitle="Executive overview plus generated insights from live academic, finance, attendance, and staff data."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      <FilterBar
        filters={
          <>
            <FilterField label="Year">
              <select
                className={selectClass}
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
              >
                {(meta?.years ?? []).map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Term">
              <select
                className={selectClass}
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              >
                <option value="">All terms</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FilterField>
          </>
        }
        actions={<ExportBar disabled={!data} onCsv={exportCsv} />}
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : data ? (
        <>
          <ReportSection
            title="Generated insights"
            description="Only shown when the underlying numbers actually change."
          >
            {insights.length === 0 ? (
              <p className="text-sm text-slate-500">
                No warning conditions right now. Keep taking attendance,
                publishing results, and recording fees to feed this feed.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {insights.map((i) => (
                  <InsightCard
                    key={i.title + i.severity}
                    severity={i.severity}
                    title={i.title}
                    description={i.description}
                    href={i.href}
                  />
                ))}
              </div>
            )}
          </ReportSection>

          {students ? (
            <ReportSection title="Student insights">
              <StatGrid
                items={[
                  { label: "Total students", value: students.total },
                  { label: "New admissions", value: students.new_admissions },
                  { label: "Withdrawals", value: students.withdrawals },
                ]}
              />
              <ReportChartGrid>
                <ReportChartPanel
                  title="Enrolment by department"
                  description="Donut of headcount mix"
                >
                  <SofiaDonutChart
                    data={students.per_department.map((d, i) => ({
                      id: `${d.name}-${i}`,
                      label: d.name,
                      value: d.n,
                    }))}
                    totalLabel="Students"
                  />
                </ReportChartPanel>
                <ReportChartPanel
                  title="Enrolment by class"
                  description="Horizontal bars for class sizes"
                >
                  <SofiaHorizontalBarChart
                    data={students.per_class.map((c, i) => ({
                      id: `${c.name}-${i}`,
                      label: c.name,
                      value: c.n,
                    }))}
                  />
                </ReportChartPanel>
              </ReportChartGrid>
            </ReportSection>
          ) : null}

          {academic ? (
            <ReportSection title="Academic insights">
              <ReportChartGrid>
                <ReportChartPanel
                  title="Pass rate"
                  description="Gauge of students meeting the pass mark"
                >
                  <SofiaPercentGauge
                    rate={academic.pass_rate}
                    label="Pass rate"
                  />
                </ReportChartPanel>
                <ReportChartPanel
                  title="Class spotlight"
                  description="Best vs lowest class averages"
                >
                  <SofiaHorizontalBarChart
                    data={[
                      academic.best_class
                        ? {
                            id: "best",
                            label: academic.best_class.class_name,
                            value: academic.best_class.average,
                          }
                        : null,
                      academic.lowest_class &&
                      academic.lowest_class.class_name !==
                        academic.best_class?.class_name
                        ? {
                            id: "lowest",
                            label: academic.lowest_class.class_name,
                            value: academic.lowest_class.average,
                          }
                        : null,
                    ].filter(
                      (
                        row,
                      ): row is { id: string; label: string; value: number } =>
                        row != null,
                    )}
                  />
                </ReportChartPanel>
              </ReportChartGrid>
              <StatGrid
                items={[
                  { label: "Overall average", value: academic.overall_average },
                  { label: "Pass rate", value: `${academic.pass_rate}%` },
                  {
                    label: "Best class",
                    value: academic.best_class?.class_name ?? "—",
                  },
                  {
                    label: "Lowest class",
                    value: academic.lowest_class?.class_name ?? "—",
                  },
                  {
                    label: "Subject needing attention",
                    value: academic.weak_subject?.subject_name ?? "—",
                  },
                ]}
              />
              <Link
                className="text-sm font-semibold text-(--sofia-primary)"
                href="/reports/academic-performance"
              >
                Academic performance
              </Link>
            </ReportSection>
          ) : null}

          {canFinance && financial ? (
            <ReportSection title="Financial insights">
              <ReportChartGrid>
                <ReportChartPanel
                  title="Collection rate"
                  description="Gauge of fees collected"
                >
                  <SofiaPercentGauge
                    rate={financial.collection_rate}
                    label="Collected"
                  />
                </ReportChartPanel>
                <ReportChartPanel
                  title="Revenue vs expenses"
                  description="Grouped bars for cash flow snapshot"
                >
                  <SofiaGroupedBarChart
                    data={[
                      {
                        label: "Period",
                        revenue: financial.revenue,
                        expenses: financial.expenses,
                      },
                    ]}
                    series={[
                      { key: "revenue", label: "Revenue" },
                      { key: "expenses", label: "Expenses" },
                    ]}
                    valueFormatter={(n) => formatCompactMoney(n, currency)}
                    heightClass="h-48"
                  />
                </ReportChartPanel>
              </ReportChartGrid>
              <StatGrid
                items={[
                  {
                    label: "Collection rate",
                    value: `${financial.collection_rate}%`,
                  },
                  {
                    label: "Outstanding",
                    value: (
                      <MoneyText
                        amount={financial.outstanding}
                        currency={currency}
                      />
                    ),
                  },
                  {
                    label: "Revenue",
                    value: (
                      <MoneyText
                        amount={financial.revenue}
                        currency={currency}
                      />
                    ),
                  },
                  {
                    label: "Expenses",
                    value: (
                      <MoneyText
                        amount={financial.expenses}
                        currency={currency}
                      />
                    ),
                  },
                  {
                    label: "Net position",
                    value: (
                      <MoneyText amount={financial.net} currency={currency} />
                    ),
                  },
                  {
                    label: "Budget utilization",
                    value: `${financial.budget_utilization}%`,
                  },
                ]}
              />
              <Link
                className="text-sm font-semibold text-(--sofia-primary)"
                href="/reports/financial"
              >
                Financial analytics
              </Link>
            </ReportSection>
          ) : null}

          {attendance ? (
            <ReportSection title="Attendance insights">
              <ReportChartGrid>
                <ReportChartPanel
                  title="Overall attendance"
                  description="Gauge of school attendance"
                >
                  <SofiaPercentGauge
                    rate={attendance.overall}
                    label="Present"
                  />
                </ReportChartPanel>
                <ReportChartPanel
                  title="Lowest attendance classes"
                  description="Horizontal bars for risk classes"
                >
                  <SofiaHorizontalBarChart
                    data={attendance.lowest_classes.map((c, i) => ({
                      id: `${c.class_name}-${i}`,
                      label: c.class_name,
                      value: c.attendance_rate,
                    }))}
                    valueFormatter={(n) => `${n}%`}
                  />
                </ReportChartPanel>
              </ReportChartGrid>
              <StatGrid
                items={[
                  {
                    label: "Overall attendance",
                    value: `${attendance.overall}%`,
                  },
                  {
                    label: "Absence rate",
                    value: `${attendance.absence_rate}%`,
                  },
                  {
                    label: "Below threshold",
                    value: attendance.below_threshold,
                    hint: `${attendance.threshold}%`,
                  },
                ]}
              />
              <Link
                className="text-sm font-semibold text-(--sofia-primary)"
                href="/reports/attendance?risk=1"
              >
                Students below threshold
              </Link>
            </ReportSection>
          ) : null}

          {staff ? (
            <ReportSection title="Staff insights">
              <ReportChartGrid>
                <ReportChartPanel
                  title="Staff attendance"
                  description="Gauge from teacher registers"
                >
                  <SofiaPercentGauge
                    rate={staff.attendance_rate}
                    label="Staff present"
                  />
                </ReportChartPanel>
                <ReportChartPanel
                  title="Workforce mix"
                  description="Donut of teachers vs other staff"
                >
                  <SofiaDonutChart
                    data={[
                      {
                        id: "teachers",
                        label: "Teachers",
                        value: staff.teachers,
                      },
                      {
                        id: "other",
                        label: "Other staff",
                        value: Math.max(0, staff.staff - staff.teachers),
                      },
                    ].filter((d) => d.value > 0)}
                    totalLabel="Staff"
                  />
                </ReportChartPanel>
              </ReportChartGrid>
              <StatGrid
                items={[
                  { label: "Teachers", value: staff.teachers },
                  { label: "Total staff", value: staff.staff },
                  {
                    label: "Timetable periods",
                    value: staff.timetable_periods,
                    hint: "Assigned periods",
                  },
                  {
                    label: "Staff attendance",
                    value: `${staff.attendance_rate}%`,
                  },
                  { label: "Active leave", value: staff.active_leave },
                ]}
              />
              <Link
                className="text-sm font-semibold text-(--sofia-primary)"
                href="/staff/workload"
              >
                Teacher workload
              </Link>
            </ReportSection>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
