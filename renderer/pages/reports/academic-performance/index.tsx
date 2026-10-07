import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import { KpiCard } from "../../../components/dashboard/KpiCard";
import {
  Award01Icon,
  BookOpen01Icon,
  StudentIcon,
  TeacherIcon,
} from "@hugeicons/core-free-icons";
import {
  EmptyRow,
  ExportBar,
  FilterBar,
  FilterField,
  PageAlert,
  StudentTable,
  selectClass,
} from "../../../components/reports/ui";
import {
  ReportChartGrid,
  ReportChartPanel,
  SofiaHorizontalBarChart,
  SofiaLineChart,
  SofiaVerticalBarChart,
} from "../../../components/reports/charts";
import {
  downloadCsv,
  fetchAcademicReport,
  fetchReportsMeta,
  toCsv,
  type ReportFilters,
} from "../../../lib/reports";

export default function AcademicPerformancePage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [yearId, setYearId] = React.useState("");
  const [termId, setTermId] = React.useState(
    typeof router.query.term_id === "string" ? router.query.term_id : "",
  );
  const [deptId, setDeptId] = React.useState("");
  const [classId, setClassId] = React.useState(
    typeof router.query.class_id === "string" ? router.query.class_id : "",
  );
  const [subjectId, setSubjectId] = React.useState(
    typeof router.query.subject_id === "string" ? router.query.subject_id : "",
  );
  const [gender, setGender] = React.useState("");
  const [assessment, setAssessment] = React.useState<"results" | "ca" | "exam">(
    "results",
  );
  const [meta, setMeta] = React.useState<
    | Extract<
        Awaited<ReturnType<typeof fetchReportsMeta>>,
        { ok: true }
      >["data"]
    | null
  >(null);
  const [data, setData] = React.useState<
    | Extract<
        Awaited<ReturnType<typeof fetchAcademicReport>>,
        { ok: true }
      >["data"]
    | null
  >(null);

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
      department_id: deptId || undefined,
      class_id: classId || undefined,
      subject_id: subjectId || undefined,
      gender: gender || undefined,
      assessment,
    };
    const res = await fetchAcademicReport(filters);
    if (res.ok) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, [yearId, termId, deptId, classId, subjectId, gender, assessment]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const terms = (meta?.terms ?? []).filter(
    (t) => !yearId || t.academic_year_id === yearId,
  );

  function exportCsv() {
    if (!data) return;
    const csv = [
      toCsv(
        ["Metric", "Value"],
        [
          ["Overall average", data.overall_average],
          ["Pass rate", data.pass_rate],
          ["Students", data.students],
          ["Subjects", data.subjects],
        ],
      ),
      "",
      toCsv(
        ["Class", "Students", "Average", "Pass rate", "Highest", "Lowest"],
        data.by_class.map((r) => [
          r.class_name,
          r.students,
          r.average,
          r.pass_rate,
          r.highest,
          r.lowest,
        ]),
      ),
    ].join("\n");
    downloadCsv("academic-performance.csv", csv);
  }

  return (
    <AppShell
      title="Academic Performance"
      breadcrumb={["Reports & Analytics", "Academic Performance"]}
      heading="Academic Performance"
      subtitle="Averages, pass rates, and rankings from processed results — not a second marks register."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      <FilterBar
        filters={
          <>
            <FilterField label="Academic year">
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
                <option value="">All classes</option>
                {(meta?.classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Subject">
              <select
                className={selectClass}
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                <option value="">All subjects</option>
                {(meta?.subjects ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Gender">
              <select
                className={selectClass}
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">All</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </FilterField>
            <FilterField label="Assessment">
              <select
                className={selectClass}
                value={assessment}
                onChange={(e) =>
                  setAssessment(e.target.value as "results" | "ca" | "exam")
                }
              >
                <option value="results">Official results</option>
                <option value="ca">Continuous assessment</option>
                <option value="exam">Exams</option>
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
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              title="Overall average"
              value={data.overall_average}
              icon={Award01Icon}
              hint={`Pass mark ${data.pass_mark}`}
            />
            <KpiCard
              title="Pass rate"
              value={`${data.pass_rate}%`}
              icon={BookOpen01Icon}
            />
            <KpiCard
              title="Students"
              value={data.students}
              icon={StudentIcon}
            />
            <KpiCard
              title="Subjects"
              value={data.subjects}
              icon={TeacherIcon}
            />
            <KpiCard
              title="Best performing class"
              value={data.best_class?.class_name ?? "—"}
              icon={Award01Icon}
              hint={data.best_class ? `${data.best_class.average}` : undefined}
            />
            <KpiCard
              title="Lowest performing class"
              value={data.lowest_class?.class_name ?? "—"}
              icon={Award01Icon}
              hint={
                data.lowest_class ? `${data.lowest_class.average}` : undefined
              }
            />
          </div>

          <ReportChartGrid>
            <ReportChartPanel
              title="Average by class"
              description="Horizontal bars for comparing class means"
            >
              <SofiaHorizontalBarChart
                data={data.by_class.map((r) => ({
                  id: r.class_id,
                  label: r.class_name,
                  value: r.average,
                }))}
                onBarClick={(id) => setClassId(id)}
              />
            </ReportChartPanel>
            <ReportChartPanel
              title="Average by subject"
              description="Horizontal bars for subject comparison"
            >
              <SofiaHorizontalBarChart
                data={data.by_subject.map((r) => ({
                  id: r.subject_id,
                  label: r.subject_name,
                  value: r.average,
                }))}
                onBarClick={(id) => setSubjectId(id)}
              />
            </ReportChartPanel>
            <ReportChartPanel
              title="Term trend"
              description="Line chart of averages across terms"
            >
              <SofiaLineChart
                data={data.trend.map((t) => ({
                  label: t.term_name,
                  value: t.average,
                }))}
              />
            </ReportChartPanel>
            <ReportChartPanel
              title="Grade distribution"
              description="Vertical bars for A–F counts"
            >
              <SofiaVerticalBarChart
                data={["A", "B", "C", "D", "E", "F"].map((g) => ({
                  label: g,
                  value: data.grade_distribution[g] ?? 0,
                }))}
                highlightLast={false}
              />
            </ReportChartPanel>
          </ReportChartGrid>

          <h2 className="mb-2 text-sm font-semibold">Performance by class</h2>
          <StudentTable
            columns={[
              "Class",
              "Students",
              "Average",
              "Pass rate",
              "Highest",
              "Lowest",
            ]}
            loading={false}
          >
            {data.by_class.length === 0 ? (
              <EmptyRow
                colSpan={6}
                message="No processed results for these filters."
              />
            ) : (
              data.by_class.map((r) => (
                <tr key={r.class_id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="font-medium text-(--sofia-primary)"
                      onClick={() => setClassId(r.class_id)}
                    >
                      {r.class_name}
                    </button>
                  </td>
                  <td className="px-4 py-3">{r.students}</td>
                  <td className="px-4 py-3">{r.average}</td>
                  <td className="px-4 py-3">{r.pass_rate}%</td>
                  <td className="px-4 py-3">{r.highest}</td>
                  <td className="px-4 py-3">{r.lowest}</td>
                </tr>
              ))
            )}
          </StudentTable>

          <h2 className="mb-2 mt-6 text-sm font-semibold">
            Performance by subject
          </h2>
          <StudentTable
            columns={["Subject", "Average", "Pass rate", "Highest", "Lowest"]}
            loading={false}
          >
            {data.by_subject.length === 0 ? (
              <EmptyRow colSpan={5} message="No subject scores yet." />
            ) : (
              data.by_subject.map((r) => (
                <tr key={r.subject_id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="font-medium text-(--sofia-primary)"
                      onClick={() => setSubjectId(r.subject_id)}
                    >
                      {r.subject_name}
                    </button>
                  </td>
                  <td className="px-4 py-3">{r.average}</td>
                  <td className="px-4 py-3">{r.pass_rate}%</td>
                  <td className="px-4 py-3">{r.highest}</td>
                  <td className="px-4 py-3">{r.lowest}</td>
                </tr>
              ))
            )}
          </StudentTable>

          <h2 className="mb-2 text-sm font-semibold">Student ranking</h2>
          <StudentTable
            columns={["Position", "Student", "Class", "Average", "Grade"]}
            loading={false}
          >
            {data.ranking.length === 0 ? (
              <EmptyRow colSpan={5} message="No rankings yet." />
            ) : (
              data.ranking.map((r) => (
                <tr
                  key={r.student_id + r.position}
                  className="border-t border-slate-100"
                >
                  <td className="px-4 py-3">{r.position}</td>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-(--sofia-primary)"
                      href={`/reports/students?student_id=${r.student_id}`}
                    >
                      {r.student_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.class_name}</td>
                  <td className="px-4 py-3">{r.average}</td>
                  <td className="px-4 py-3">{r.grade || "—"}</td>
                </tr>
              ))
            )}
          </StudentTable>
        </>
      ) : null}
    </AppShell>
  );
}
