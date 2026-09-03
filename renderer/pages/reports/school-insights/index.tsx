import React from "react";
import Link from "next/link";
import { AppShell } from "../../../components/layout/AppShell";
import {
  ExportBar,
  FilterBar,
  FilterField,
  InsightCard,
  PageAlert,
  ReportSection,
  StatGrid,
  selectClass,
} from "../../../components/reports/ui";
import {
  downloadCsv,
  fetchReportsMeta,
  fetchSchoolInsights,
  toCsv,
  type ReportFilters,
} from "../../../lib/reports";
import { formatMoney } from "../../../lib/finance-mgmt";

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
    best_class: { class_name: string } | null;
    lowest_class: { class_name: string } | null;
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
              <p className="text-xs font-semibold uppercase text-slate-500">
                Per department
              </p>
              <ul className="mt-2 text-sm text-slate-700">
                {students.per_department.map((d) => (
                  <li key={d.name}>
                    {d.name}: {d.n}
                  </li>
                ))}
              </ul>
            </ReportSection>
          ) : null}

          {academic ? (
            <ReportSection title="Academic insights">
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
              <StatGrid
                items={[
                  {
                    label: "Collection rate",
                    value: `${financial.collection_rate}%`,
                  },
                  {
                    label: "Outstanding",
                    value: formatMoney(financial.outstanding, currency),
                  },
                  {
                    label: "Revenue",
                    value: formatMoney(financial.revenue, currency),
                  },
                  {
                    label: "Expenses",
                    value: formatMoney(financial.expenses, currency),
                  },
                  {
                    label: "Net position",
                    value: formatMoney(financial.net, currency),
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
              <p className="text-sm text-slate-600">
                Lowest attendance:{" "}
                {attendance.lowest_classes
                  .map((c) => `${c.class_name} (${c.attendance_rate}%)`)
                  .join(", ") || "—"}
              </p>
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
