import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { File01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  ExportBar,
  FilterBar,
  FilterField,
  MoneyText,
  PageAlert,
  PrimaryButton,
  ReportSection,
  StatGrid,
  StudentTable,
  selectClass,
} from "../../../components/reports/ui";
import {
  ReportChartGrid,
  ReportChartPanel,
  SofiaDonutChart,
  SofiaGroupedBarChart,
  SofiaLineChart,
} from "../../../components/reports/charts";
import {
  TableActionGroup,
  TableIconButton,
} from "../../../components/ui/TableActions";
import {
  downloadCsv,
  fetchReportsMeta,
  fetchStudentReport,
  searchReportStudents,
  toCsv,
  type ReportFilters,
} from "../../../lib/reports";
import { formatMoney } from "../../../lib/finance-mgmt";

type StudentHit = {
  id: string;
  name: string;
  student_code: string | null;
  class_name: string | null;
  status: string;
};

export default function StudentReportsPage() {
  const router = useRouter();
  const queryId =
    typeof router.query.student_id === "string" ? router.query.student_id : "";
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [hits, setHits] = React.useState<StudentHit[]>([]);
  const [report, setReport] = React.useState<Record<string, unknown> | null>(
    null,
  );
  const [meta, setMeta] = React.useState<
    | Extract<
        Awaited<ReturnType<typeof fetchReportsMeta>>,
        { ok: true }
      >["data"]
    | null
  >(null);

  React.useEffect(() => {
    void fetchReportsMeta().then((res) => {
      if (res.ok) setMeta(res.data);
    });
  }, []);

  const loadStudent = React.useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    const filters: ReportFilters = {};
    const res = await fetchStudentReport(id, filters);
    if (res.ok) setReport(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (queryId) void loadStudent(queryId);
  }, [queryId, loadStudent]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const res = await searchReportStudents(query, classId || null);
    if (res.ok) setHits(res.data.students);
    else setError(res.error);
  }

  const profile = (report?.profile ?? null) as {
    id: string;
    student_code: string | null;
    name: string;
    class_name: string | null;
    department: string | null;
    academic_year: string | null;
    status: string;
  } | null;
  const academic = (report?.academic ?? null) as {
    latest: {
      average: number;
      grade: string | null;
      position: number | null;
    } | null;
    subjects: Array<{
      subject_name: string;
      ca_score: number;
      exam_score: number;
      total: number;
      grade: string | null;
    }>;
    history: Array<{
      year_name: string | null;
      term_name: string | null;
      class_name: string | null;
      average: number;
      grade: string | null;
      position: number | null;
    }>;
  } | null;
  const attendance = (report?.attendance ?? null) as {
    present: number;
    absent: number;
    late: number;
    percentage: number;
  } | null;
  const finance = (report?.finance ?? null) as {
    billed: number;
    paid: number;
    outstanding: number;
  } | null;
  const promotions = (report?.promotions ?? []) as Array<{
    from_year: number;
    to_year: number;
    status: string;
  }>;

  const currency = meta?.currency ?? "XAF";

  function exportCsv() {
    if (!profile || !academic) return;
    const rows: Array<Array<string | number | null>> = [
      ...academic.subjects.map((s) => [
        s.subject_name,
        s.ca_score,
        s.exam_score,
        s.total,
        s.grade,
      ]),
    ];
    if (finance) {
      rows.push(
        [],
        ["Fee metric", "Amount", "", "", ""],
        ["Total billed", formatMoney(finance.billed, currency), "", "", ""],
        ["Total paid", formatMoney(finance.paid, currency), "", "", ""],
        ["Outstanding", formatMoney(finance.outstanding, currency), "", "", ""],
      );
    }
    downloadCsv(
      `student-report-${profile.student_code || profile.id}.csv`,
      toCsv(["Subject", "CA", "Exam", "Total", "Grade"], rows),
    );
  }

  return (
    <AppShell
      title="Student Reports"
      breadcrumb={["Reports & Analytics", "Student Reports"]}
      heading="Student Reports"
      subtitle="A 360° view drawn from the student record, results, attendance, and fees already in Sofia."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      <form onSubmit={search}>
        <FilterBar
          filters={
            <>
              <FilterField label="Name or student ID">
                <input
                  className={selectClass}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                />
              </FilterField>
              <FilterField label="Class">
                <select
                  className={selectClass}
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                >
                  <option value="">All classes</option>
                  {(meta?.classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FilterField>
            </>
          }
          actions={
            <>
              <PrimaryButton type="submit">Search</PrimaryButton>
              <ExportBar disabled={!profile} onCsv={exportCsv} />
            </>
          }
        />
      </form>

      {hits.length > 0 && !profile ? (
        <StudentTable
          columns={["Student", "Student ID", "Class", ""]}
          loading={false}
        >
          {hits.map((h) => (
            <tr key={h.id} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium">{h.name}</td>
              <td className="px-4 py-3 font-mono">{h.student_code || "—"}</td>
              <td className="px-4 py-3">{h.class_name || "—"}</td>
              <td className="px-4 py-3 text-right">
                <TableActionGroup>
                  <TableIconButton
                    icon={File01Icon}
                    label="Generate report"
                    tone="primary"
                    onClick={() => void loadStudent(h.id)}
                  />
                </TableActionGroup>
              </td>
            </tr>
          ))}
        </StudentTable>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading report…</p>
      ) : null}

      {profile && academic && attendance && finance ? (
        <>
          <ReportSection title="Profile">
            <StatGrid
              items={[
                { label: "Student ID", value: profile.student_code || "—" },
                { label: "Name", value: profile.name },
                { label: "Class", value: profile.class_name || "—" },
                { label: "Department", value: profile.department || "—" },
                { label: "Academic year", value: profile.academic_year || "—" },
                { label: "Status", value: profile.status },
              ]}
            />
            <Link
              className="text-sm font-semibold text-(--sofia-primary)"
              href={`/students/${profile.id}`}
            >
              Open student profile
            </Link>
          </ReportSection>

          <ReportSection
            title="Academic performance"
            description="From processed results for this student."
          >
            <StatGrid
              items={[
                { label: "Average", value: academic.latest?.average ?? "—" },
                { label: "Position", value: academic.latest?.position ?? "—" },
                { label: "Grade", value: academic.latest?.grade ?? "—" },
              ]}
            />
            <ReportChartPanel
              title="CA vs exam by subject"
              description="Grouped bars compare continuous assessment and exam"
              className="mb-4"
            >
              <SofiaGroupedBarChart
                data={academic.subjects.map((s) => ({
                  label:
                    s.subject_name.length > 10
                      ? `${s.subject_name.slice(0, 8)}…`
                      : s.subject_name,
                  ca: s.ca_score,
                  exam: s.exam_score,
                }))}
                series={[
                  { key: "ca", label: "CA" },
                  { key: "exam", label: "Exam" },
                ]}
              />
            </ReportChartPanel>
            <StudentTable
              columns={["Subject", "CA", "Exam", "Average", "Grade"]}
              loading={false}
            >
              {academic.subjects.length === 0 ? (
                <EmptyRow
                  colSpan={5}
                  message="No subject rows on processed results."
                />
              ) : (
                academic.subjects.map((s, i) => (
                  <tr
                    key={s.subject_name + i}
                    className="border-t border-slate-100"
                  >
                    <td className="px-4 py-3">{s.subject_name}</td>
                    <td className="px-4 py-3">{s.ca_score}</td>
                    <td className="px-4 py-3">{s.exam_score}</td>
                    <td className="px-4 py-3">{s.total}</td>
                    <td className="px-4 py-3">{s.grade || "—"}</td>
                  </tr>
                ))
              )}
            </StudentTable>
          </ReportSection>

          <ReportChartGrid>
            <ReportChartPanel
              title="Attendance mix"
              description="Donut of present / absent / late marks"
            >
              <SofiaDonutChart
                data={[
                  {
                    id: "present",
                    label: "Present",
                    value: attendance.present,
                  },
                  { id: "absent", label: "Absent", value: attendance.absent },
                  { id: "late", label: "Late", value: attendance.late },
                ].filter((d) => d.value > 0)}
                totalLabel={`${attendance.percentage}%`}
              />
            </ReportChartPanel>
            <ReportChartPanel
              title="Fee status"
              description="Donut of paid vs outstanding"
            >
              <SofiaDonutChart
                data={[
                  { id: "paid", label: "Paid", value: finance.paid },
                  {
                    id: "outstanding",
                    label: "Outstanding",
                    value: finance.outstanding,
                  },
                ].filter((d) => d.value > 0)}
                totalLabel="Fees"
              />
            </ReportChartPanel>
          </ReportChartGrid>

          <ReportSection title="Attendance">
            <StatGrid
              items={[
                { label: "Present", value: attendance.present },
                { label: "Absent", value: attendance.absent },
                { label: "Late", value: attendance.late },
                { label: "Attendance", value: `${attendance.percentage}%` },
              ]}
            />
            <Link
              className="text-sm font-semibold text-(--sofia-primary)"
              href={`/reports/attendance?student_id=${profile.id}`}
            >
              Attendance history
            </Link>
          </ReportSection>

          <ReportSection title="Finance">
            <StatGrid
              items={[
                {
                  label: "Total billed",
                  value: (
                    <MoneyText amount={finance.billed} currency={currency} />
                  ),
                },
                {
                  label: "Total paid",
                  value: (
                    <MoneyText amount={finance.paid} currency={currency} />
                  ),
                },
                {
                  label: "Outstanding",
                  value: (
                    <MoneyText
                      amount={finance.outstanding}
                      currency={currency}
                    />
                  ),
                },
              ]}
            />
            <Link
              className="text-sm font-semibold text-(--sofia-primary)"
              href={`/finance/outstanding`}
            >
              Outstanding fees
            </Link>
          </ReportSection>

          <ReportSection title="Academic history">
            <ReportChartPanel
              title="Average over terms"
              description="Line chart of historical averages"
              className="mb-4"
            >
              <SofiaLineChart
                data={[...academic.history].reverse().map((h) => ({
                  label: h.term_name || h.year_name || "—",
                  value: h.average,
                }))}
              />
            </ReportChartPanel>
            <StudentTable
              columns={[
                "Year",
                "Term",
                "Class",
                "Average",
                "Grade",
                "Position",
              ]}
              loading={false}
            >
              {academic.history.length === 0 ? (
                <EmptyRow colSpan={6} message="No previous processed terms." />
              ) : (
                academic.history.map((h, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-4 py-3">{h.year_name || "—"}</td>
                    <td className="px-4 py-3">{h.term_name || "—"}</td>
                    <td className="px-4 py-3">{h.class_name || "—"}</td>
                    <td className="px-4 py-3">{h.average}</td>
                    <td className="px-4 py-3">{h.grade || "—"}</td>
                    <td className="px-4 py-3">{h.position ?? "—"}</td>
                  </tr>
                ))
              )}
            </StudentTable>
            {promotions.length ? (
              <p className="mt-3 text-sm text-slate-600">
                Promotions:{" "}
                {promotions
                  .map((p) => `${p.from_year} → ${p.to_year}`)
                  .join("; ")}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                No completed promotion runs on file.
              </p>
            )}
          </ReportSection>
        </>
      ) : !loading && hits.length === 0 && !queryId ? (
        <p className="text-sm text-slate-500">
          Search for a student to generate a report.
        </p>
      ) : null}
    </AppShell>
  );
}
