import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  ExportBar,
  FilterBar,
  FilterField,
  PageAlert,
  ReportSection,
  StatGrid,
  StudentTable,
  selectClass,
} from "../../../components/reports/ui";
import {
  ReportChartGrid,
  ReportChartPanel,
  SofiaAreaChart,
  SofiaDonutChart,
  SofiaHorizontalBarChart,
  SofiaLineChart,
  SofiaPercentGauge,
} from "../../../components/reports/charts";
import {
  downloadCsv,
  fetchAttendanceAnalytics,
  fetchReportsMeta,
  toCsv,
  type ReportFilters,
} from "../../../lib/reports";
import { formatDisplayDate } from "../../../lib/date-format";

export default function AttendanceAnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [yearId, setYearId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [deptId, setDeptId] = React.useState("");
  const [studentId] = React.useState(
    typeof router.query.student_id === "string" ? router.query.student_id : "",
  );
  const [threshold, setThreshold] = React.useState("75");
  const [meta, setMeta] = React.useState<
    | Extract<
        Awaited<ReturnType<typeof fetchReportsMeta>>,
        { ok: true }
      >["data"]
    | null
  >(null);
  const [data, setData] = React.useState<Record<string, unknown> | null>(null);
  const riskOnly = router.query.risk === "1";

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
    if (threshold === "75" && metaRes.data.attendance_threshold) {
      setThreshold(String(metaRes.data.attendance_threshold));
    }
    const filters: ReportFilters = {
      academic_year_id: year || undefined,
      term_id: termId || undefined,
      from: from || undefined,
      to: to || undefined,
      class_id: classId || undefined,
      department_id: deptId || undefined,
      student_id: studentId || undefined,
      attendance_threshold: Number(threshold) || 75,
    };
    const res = await fetchAttendanceAnalytics(filters);
    if (res.ok) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, [yearId, termId, from, to, classId, deptId, studentId, threshold]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const overall = data as {
    overall_rate?: number;
    present?: number;
    absent?: number;
    late?: number;
    at_risk_count?: number;
    threshold?: number;
    by_class?: Array<{
      class_id: string;
      class_name: string;
      students: number;
      attendance_rate: number;
      absence_rate: number;
    }>;
    at_risk?: Array<{
      student_id: string;
      student_name: string;
      class_name: string;
      attendance_pct: number;
      days_absent: number;
      days_late: number;
    }>;
    daily?: Array<{ date: string; rate: number }>;
    weekly?: Array<{ week: string; rate: number }>;
    monthly?: Array<{ month: string; rate: number }>;
    staff?: { rate: number; present: number; absent: number };
  } | null;

  const atRisk = overall?.at_risk ?? [];

  function exportCsv() {
    if (!overall) return;
    downloadCsv(
      "attendance-analytics.csv",
      toCsv(
        ["Student", "Class", "Attendance %", "Absent", "Late"],
        atRisk.map((r) => [
          r.student_name,
          r.class_name,
          r.attendance_pct,
          r.days_absent,
          r.days_late,
        ]),
      ),
    );
  }

  const terms = (meta?.terms ?? []).filter(
    (t) => !yearId || t.academic_year_id === yearId,
  );

  return (
    <AppShell
      title="Attendance Analytics"
      breadcrumb={["Reports & Analytics", "Attendance Analytics"]}
      heading="Attendance Analytics"
      subtitle="Rates and at-risk lists from existing attendance registers. Threshold defaults to 75%."
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
                <option value="">All</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="From">
              <input
                type="date"
                className={selectClass}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </FilterField>
            <FilterField label="To">
              <input
                type="date"
                className={selectClass}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </FilterField>
            <FilterField label="Department">
              <select
                className={selectClass}
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
              >
                <option value="">All</option>
                {(meta?.departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Class">
              <select
                className={selectClass}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">All</option>
                {(meta?.classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Risk threshold %">
              <input
                className={selectClass}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </FilterField>
          </>
        }
        actions={<ExportBar disabled={!data} onCsv={exportCsv} />}
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : overall ? (
        <>
          <StatGrid
            items={[
              {
                label: "Overall attendance",
                value: `${overall.overall_rate ?? 0}%`,
              },
              { label: "Present", value: overall.present ?? 0 },
              { label: "Absent", value: overall.absent ?? 0 },
              { label: "Late", value: overall.late ?? 0 },
              {
                label: "Students at risk",
                value: overall.at_risk_count ?? 0,
                hint: `Below ${overall.threshold}%`,
              },
            ]}
          />

          <ReportChartGrid>
            <ReportChartPanel
              title="Overall rate"
              description="Gauge of school attendance"
            >
              <SofiaPercentGauge
                rate={overall.overall_rate ?? null}
                label="Attendance"
              />
            </ReportChartPanel>
            <ReportChartPanel
              title="Mark mix"
              description="Donut of present / absent / late"
            >
              <SofiaDonutChart
                data={[
                  {
                    id: "present",
                    label: "Present",
                    value: overall.present ?? 0,
                  },
                  {
                    id: "absent",
                    label: "Absent",
                    value: overall.absent ?? 0,
                  },
                  { id: "late", label: "Late", value: overall.late ?? 0 },
                ].filter((d) => d.value > 0)}
                totalLabel="Marks"
              />
            </ReportChartPanel>
          </ReportChartGrid>

          <ReportSection title="Class attendance">
            <ReportChartPanel
              title="Attendance by class"
              description="Horizontal bars for class rates"
              className="mb-4"
            >
              <SofiaHorizontalBarChart
                data={(overall.by_class ?? []).map((r) => ({
                  id: r.class_id,
                  label: r.class_name,
                  value: r.attendance_rate,
                }))}
                valueFormatter={(n) => `${n}%`}
                onBarClick={(id) => setClassId(id)}
              />
            </ReportChartPanel>
            <StudentTable
              columns={["Class", "Students", "Attendance rate", "Absence rate"]}
              loading={false}
            >
              {(overall.by_class ?? []).length === 0 ? (
                <EmptyRow
                  colSpan={4}
                  message="No attendance sessions in this period."
                />
              ) : (
                (overall.by_class ?? []).map((r) => (
                  <tr key={r.class_id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-(--sofia-primary)"
                        onClick={() => setClassId(r.class_id)}
                      >
                        {r.class_name}
                      </button>
                    </td>
                    <td className="px-4 py-3">{r.students}</td>
                    <td className="px-4 py-3">{r.attendance_rate}%</td>
                    <td className="px-4 py-3">{r.absence_rate}%</td>
                  </tr>
                ))
              )}
            </StudentTable>
          </ReportSection>

          <ReportSection title="Trends">
            <ReportChartGrid>
              <ReportChartPanel
                title="Monthly attendance"
                description="Area chart of rate over months"
              >
                <SofiaAreaChart
                  data={(overall.monthly ?? []).map((m) => ({
                    label: m.month,
                    value: m.rate,
                  }))}
                  valueSuffix="%"
                />
              </ReportChartPanel>
              <ReportChartPanel
                title="Recent daily rates"
                description="Line chart of the last 14 days"
              >
                <SofiaLineChart
                  data={(overall.daily ?? []).slice(-14).map((d) => ({
                    label: formatDisplayDate(d.date),
                    value: d.rate,
                  }))}
                  valueSuffix="%"
                />
              </ReportChartPanel>
            </ReportChartGrid>
          </ReportSection>

          <ReportSection
            title={`At-risk students (below ${overall.threshold}%)`}
          >
            <StudentTable
              columns={[
                "Student",
                "Class",
                "Attendance %",
                "Days absent",
                "Days late",
              ]}
              loading={false}
            >
              {(riskOnly ? atRisk : atRisk).length === 0 ? (
                <EmptyRow
                  colSpan={5}
                  message="No students below the attendance threshold."
                />
              ) : (
                atRisk.map((r) => (
                  <tr key={r.student_id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <Link
                        className="text-(--sofia-primary)"
                        href={`/reports/students?student_id=${r.student_id}`}
                      >
                        {r.student_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{r.class_name}</td>
                    <td className="px-4 py-3">{r.attendance_pct}%</td>
                    <td className="px-4 py-3">{r.days_absent}</td>
                    <td className="px-4 py-3">{r.days_late}</td>
                  </tr>
                ))
              )}
            </StudentTable>
          </ReportSection>

          {overall.staff ? (
            <ReportSection title="Staff attendance">
              <ReportChartGrid>
                <ReportChartPanel
                  title="Staff attendance rate"
                  description="Gauge for teacher registers"
                >
                  <SofiaPercentGauge
                    rate={overall.staff.rate}
                    label="Staff present"
                  />
                </ReportChartPanel>
                <ReportChartPanel
                  title="Staff mark mix"
                  description="Donut of present vs absent"
                >
                  <SofiaDonutChart
                    data={[
                      {
                        id: "present",
                        label: "Present",
                        value: overall.staff.present,
                      },
                      {
                        id: "absent",
                        label: "Absent",
                        value: overall.staff.absent,
                      },
                    ].filter((d) => d.value > 0)}
                    totalLabel="Marks"
                  />
                </ReportChartPanel>
              </ReportChartGrid>
              <StatGrid
                items={[
                  {
                    label: "Staff attendance rate",
                    value: `${overall.staff.rate}%`,
                  },
                  { label: "Present marks", value: overall.staff.present },
                  { label: "Absent marks", value: overall.staff.absent },
                ]}
              />
              <Link
                className="text-sm font-semibold text-(--sofia-primary)"
                href="/staff/attendance"
              >
                Open teacher attendance
              </Link>
            </ReportSection>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
