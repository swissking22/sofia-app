import React from "react";
import {
  UserMultipleIcon,
  UserCheck01Icon,
  SchoolIcon,
  BookOpen01Icon,
  TeacherIcon,
  Award01Icon,
  ClipboardIcon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../components/layout/AppShell";
import { KpiCard } from "../components/dashboard/KpiCard";
import {
  ChartCard,
  ChartEmpty,
  ClassBars,
} from "../components/dashboard/ChartCard";
import { SetupProgressCard } from "../components/dashboard/SetupProgressCard";
import { fetchDashboardStats, type DashboardStats } from "../lib/dashboard";
import { DashboardConnectivityBar } from "../components/dashboard/DashboardConnectivityBar";

export default function HomePage() {
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const data = await fetchDashboardStats();
      setStats(data);
      setError("");
    } catch {
      setError("Could not load dashboard stats.");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const showSetup = stats && !stats.setupProgress.isComplete;

  return (
    <AppShell
      title="Dashboard"
      breadcrumb={["Dashboard", "Overview"]}
      heading="Dashboard Overview"
      subtitle="Monitor and streamline school administration in one place."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {!stats ? (
        <p className="text-sm text-slate-500">Loading overview…</p>
      ) : (
        <div
          className={`grid grid-cols-1 gap-5 ${
            showSetup ? "xl:grid-cols-[minmax(0,1fr)_280px]" : ""
          }`}
        >
          <div className="order-2 min-w-0 xl:order-1">
            <DashboardConnectivityBar
              pendingSync={stats.pendingSync}
              onSynced={(remaining) => {
                setStats((prev) =>
                  prev ? { ...prev, pendingSync: remaining } : prev,
                );
                void load();
              }}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title="Total Students"
                value={stats.totalStudents}
                icon={UserMultipleIcon}
                hint="All-time"
              />
              <KpiCard
                title="Active Students"
                value={stats.activeStudents}
                icon={UserCheck01Icon}
                hint="Currently enrolled"
              />
              <KpiCard
                title="Classes"
                value={stats.totalClasses}
                icon={SchoolIcon}
                hint="Active classes"
              />
              <KpiCard
                title="Average Grade"
                value={stats.averageGrade ?? "—"}
                icon={Award01Icon}
                hint={
                  stats.averageGrade != null
                    ? "From recorded scores"
                    : "No scores yet"
                }
              />
              <KpiCard
                title="Subjects"
                value={stats.totalSubjects}
                icon={BookOpen01Icon}
                hint="Across all classes"
              />
              <KpiCard
                title="Scores Recorded"
                value={stats.scoresCount}
                icon={ClipboardIcon}
                hint="Test + exam entries"
              />
              <KpiCard
                title="Total Teachers"
                value={stats.totalTeachers}
                icon={TeacherIcon}
                hint="Teacher accounts"
              />
              <KpiCard
                title="Pending Sync"
                value={stats.pendingSync}
                icon={Refresh01Icon}
                hint="Cloud-ready local changes"
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-5">
              <div className="xl:col-span-3">
                <ChartCard title="Enrollment by Class">
                  <ClassBars data={stats.studentsByClass} />
                </ChartCard>
              </div>
              <div className="xl:col-span-2">
                <ChartCard title="Gender Comparison">
                  <ChartEmpty message="Gender data will appear when student profiles include gender." />
                </ChartCard>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard title="Grade Composition">
                <ChartEmpty message="Add subjects and scores to see grade distribution." />
              </ChartCard>
              <ChartCard title="Enrollment Trend">
                <ChartEmpty message="Trends unlock as you add students over time." />
              </ChartCard>
            </div>
          </div>

          {showSetup ? (
            <div className="order-1 xl:sticky xl:top-0 xl:order-2 xl:self-start">
              <SetupProgressCard progress={stats.setupProgress} />
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
