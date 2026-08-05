import React from "react";
import {
  Award01Icon,
  BookOpen01Icon,
  CalendarCheckIn01Icon,
  ClipboardIcon,
  File01Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { KpiCard } from "../../../components/dashboard/KpiCard";
import { fetchAcademicDashboard } from "../../../lib/academic-mgmt";

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function AcademicReportsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [data, setData] = React.useState<{
    attendance_sessions: number;
    ca_assessments: number;
    exam_sessions: number;
    published_results: number;
    report_cards: number;
    class_averages: Array<{
      class_id: string;
      class_name: string;
      average: number;
      students: number;
    }>;
  } | null>(null);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAcademicDashboard();
      if (!res.ok) {
        setError(res.error);
      } else {
        setData(res.data);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell
      title="Academic reports"
      breadcrumb={["Academic Management", "Academic Reports"]}
      heading="Academic reports"
      subtitle="Overview of academic activity and class performance."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading dashboard…</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              title="Attendance sessions"
              value={data.attendance_sessions}
              icon={CalendarCheckIn01Icon}
              hint="Recorded this year"
            />
            <KpiCard
              title="CA assessments"
              value={data.ca_assessments}
              icon={ClipboardIcon}
              hint="Continuous assessment"
            />
            <KpiCard
              title="Exam sessions"
              value={data.exam_sessions}
              icon={BookOpen01Icon}
              hint="Scheduled exams"
            />
            <KpiCard
              title="Published results"
              value={data.published_results}
              icon={Award01Icon}
              hint="Published or locked"
            />
            <KpiCard
              title="Report cards"
              value={data.report_cards}
              icon={File01Icon}
              hint="Generated cards"
            />
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Class averages
              </h2>
              <p className="text-xs text-slate-500">
                Mean student average per class from processed results.
              </p>
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-white text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Students</th>
                  <th className="px-4 py-3">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.class_averages.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No class averages yet. Process and publish results first.
                    </td>
                  </tr>
                ) : (
                  data.class_averages.map((row) => (
                    <tr key={row.class_id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.class_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.students}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {formatScore(row.average)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
