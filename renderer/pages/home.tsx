import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  UserMultipleIcon,
  UserCheck01Icon,
  BanknoteIcon,
  AddInvoiceIcon,
  CloudUploadIcon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../components/layout/AppShell";
import { KpiCard } from "../components/dashboard/KpiCard";
import {
  ChartCard,
  ChartEmpty,
  ChartSkeleton,
  SofiaDonutChart,
  SofiaHorizontalBarChart,
  SofiaLineChart,
} from "../components/dashboard/ChartCard";
import { SetupProgressCard } from "../components/dashboard/SetupProgressCard";
import { Icon } from "../components/ui/Icon";
import {
  fetchDashboardSummary,
  type AttendanceTrendRange,
  type DashboardDistributionMode,
  type DashboardSummary,
} from "../lib/dashboard";
import { syncNow } from "../lib/backup-sync";
import {
  formatDisplayDateWithWeekday,
  SOFIA_DATE_LOCALE,
} from "../lib/date-format";
import { useOnlineStatus } from "../lib/online";

const selectClass =
  "cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

const chipClass = (active: boolean) =>
  `cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
    active
      ? "bg-(--sofia-primary) text-white"
      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
  }`;

function formatDay(iso: string): string {
  return formatDisplayDateWithWeekday(iso, iso);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(SOFIA_DATE_LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(11, 16) || iso;
  }
}

function severityDot(severity: "critical" | "warning" | "info") {
  if (severity === "critical") return "bg-red-500";
  if (severity === "warning") return "bg-amber-500";
  return "bg-sky-500";
}

export default function HomePage() {
  const router = useRouter();
  const online = useOnlineStatus();
  const [data, setData] = React.useState<DashboardSummary | null>(null);
  const [error, setError] = React.useState("");
  const [syncMessage, setSyncMessage] = React.useState("");
  const [syncError, setSyncError] = React.useState("");
  const [syncing, setSyncing] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [yearId, setYearId] = React.useState<string>("");
  const [termId, setTermId] = React.useState<string>("");
  const [attendanceRange, setAttendanceRange] =
    React.useState<AttendanceTrendRange>("7d");
  const [distributionMode, setDistributionMode] =
    React.useState<DashboardDistributionMode>("level");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchDashboardSummary({
        academicYearId: yearId || null,
        termId: termId || null,
        attendanceRange,
        distributionMode,
      });
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res.data);
      if (!yearId && res.data.context.academicYearId) {
        setYearId(res.data.context.academicYearId);
      }
      // Seed term only on first load (empty). Keep explicit "all".
      if (!termId && res.data.context.termId) {
        setTermId(res.data.context.termId);
      }
    } catch {
      setError("Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [yearId, termId, attendanceRange, distributionMode]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSync = React.useCallback(async () => {
    if (!online || syncing) return;
    setSyncing(true);
    setSyncError("");
    setSyncMessage("");
    try {
      const res = await syncNow();
      if (!res.ok) {
        setSyncError(res.error);
        return;
      }
      const pushed = Number(res.data.successful ?? res.data.processed ?? 0);
      const failed = Number(res.data.failed ?? 0);
      const hasMore = Boolean(res.data.has_more || res.data.message);
      if (res.data.message) {
        setSyncMessage(String(res.data.message));
      } else if (hasMore) {
        setSyncMessage(
          `Synced ${pushed} item(s). More remain — sync again when ready.`,
        );
      } else if (failed > 0) {
        setSyncMessage(
          `Sync finished: ${pushed} pushed, ${failed} failed. Check Backup & Sync for details.`,
        );
      } else {
        setSyncMessage(
          pushed > 0
            ? `Sync finished — pushed ${pushed} pending item(s).`
            : "Sync finished (up to date).",
        );
      }
      void load();
    } catch {
      setSyncError("Sync failed unexpectedly.");
    } finally {
      setSyncing(false);
    }
  }, [online, syncing, load]);

  const showSetup = data && !data.setupProgress.isComplete;
  const caps = data?.capabilities;

  return (
    <AppShell
      title="Dashboard"
      breadcrumb={["Dashboard", "Overview"]}
      heading=""
      subtitle=""
    >
      <div className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {loading && !data
                ? "Dashboard"
                : `${data?.greeting ?? "Hello"}, ${data?.userName ?? ""}`}
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {data?.schoolName ?? "—"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {data ? formatDay(data.today) : "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {online ? (
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={syncing}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-(--sofia-primary) px-3 py-1.5 text-sm font-semibold text-white outline-none transition hover:opacity-95 focus:ring-2 focus:ring-(--sofia-primary)/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncing ? (
                  <span
                    className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    aria-hidden
                  />
                ) : (
                  <Icon icon={CloudUploadIcon} size={16} />
                )}
                {syncing ? "Syncing…" : "Sync"}
              </button>
            ) : null}
            <label className="sr-only" htmlFor="dash-year">
              Academic year
            </label>
            <select
              id="dash-year"
              className={selectClass}
              value={yearId}
              onChange={(e) => {
                setYearId(e.target.value);
                setTermId("");
              }}
              disabled={loading && !data}
            >
              {(data?.context.years ?? []).map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
              {!data?.context.years?.length ? (
                <option value="">No academic year</option>
              ) : null}
            </select>
            <label className="sr-only" htmlFor="dash-term">
              Term
            </label>
            <select
              id="dash-term"
              className={selectClass}
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              disabled={loading && !data}
            >
              {(data?.context.terms ?? []).length > 0 ? (
                <option value="all">All terms</option>
              ) : null}
              {(data?.context.terms ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              {!data?.context.terms?.length ? (
                <option value="">No term</option>
              ) : null}
            </select>
          </div>
        </div>
      </div>

      {syncError ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {syncError}
        </div>
      ) : null}
      {syncMessage ? (
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {syncMessage}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
          <button
            type="button"
            className="ml-3 font-semibold underline"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div
        className={`grid grid-cols-1 gap-5 ${
          showSetup ? "xl:grid-cols-[minmax(0,1fr)_280px]" : ""
        }`}
      >
        <div className="order-2 min-w-0 space-y-5 xl:order-1">
          {/* Level 1 — KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Total Students"
              value={data?.students.total ?? "—"}
              icon={UserMultipleIcon}
              hint={data?.students.label}
              href={data?.students.href}
              loading={loading && !data}
              summary={
                data ? `${data.students.total} students enrolled` : undefined
              }
            />
            <KpiCard
              title="Today's Attendance"
              value={
                !data
                  ? "—"
                  : data.attendanceToday.recorded &&
                      data.attendanceToday.rate != null
                    ? `${data.attendanceToday.rate}%`
                    : "—"
              }
              icon={UserCheck01Icon}
              hint={
                !data
                  ? undefined
                  : data.attendanceToday.recorded
                    ? `${data.attendanceToday.present} Present · ${data.attendanceToday.late} Late · ${data.attendanceToday.absent} Absent`
                    : "Attendance not recorded"
              }
              href={data?.attendanceToday.href}
              loading={loading && !data}
              progress={
                data?.attendanceToday.recorded
                  ? data.attendanceToday.rate
                  : null
              }
              summary={data?.attendanceToday.summary}
            />
            {caps?.showFinance !== false ? (
              <KpiCard
                title="Fees Collected"
                value={data?.feesCollected?.display ?? "—"}
                icon={BanknoteIcon}
                hint={data?.feesCollected?.hint}
                href={data?.feesCollected?.href ?? "/finance/payments"}
                loading={loading && !data}
                summary={
                  data?.feesCollected
                    ? `Collected ${data.feesCollected.display}`
                    : data?.errors.finance
                }
              />
            ) : null}
            {caps?.showFinance !== false ? (
              <KpiCard
                title="Fees Outstanding"
                value={data?.feesOutstanding?.display ?? "—"}
                icon={AddInvoiceIcon}
                hint={
                  data?.feesOutstanding
                    ? `${data.feesOutstanding.studentCount} students`
                    : undefined
                }
                href={data?.feesOutstanding?.href ?? "/finance/outstanding"}
                loading={loading && !data}
                summary={
                  data?.feesOutstanding
                    ? `${data.feesOutstanding.display} outstanding across ${data.feesOutstanding.studentCount} students`
                    : undefined
                }
              />
            ) : null}
          </div>

          {data?.errors.finance ? (
            <p className="text-xs text-amber-700">{data.errors.finance}</p>
          ) : null}

          {/* Level 2 — Trends */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard
              title="Attendance Trend"
              href={data?.attendanceTrend.href}
              summary={data?.attendanceTrend.summary}
              action={
                <div className="flex gap-1">
                  {(
                    [
                      ["7d", "7 Days"],
                      ["30d", "30 Days"],
                      ["term", "Term"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={chipClass(attendanceRange === key)}
                      onClick={() => setAttendanceRange(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            >
              {loading && !data ? (
                <ChartSkeleton />
              ) : data?.errors.attendance ? (
                <ChartEmpty message={data.errors.attendance} />
              ) : data?.attendanceTrend.available ? (
                <SofiaLineChart
                  data={data.attendanceTrend.points.map((p) => ({
                    label: p.label,
                    value: p.value,
                  }))}
                  valueSuffix="%"
                />
              ) : (
                <ChartEmpty
                  message={
                    data?.attendanceTrend.summary ||
                    "Not enough attendance data"
                  }
                />
              )}
            </ChartCard>

            {caps?.showFinance !== false ? (
              <ChartCard
                title="Fee Collection Trend"
                href={data?.feeCollectionTrend?.href}
                summary={data?.feeCollectionTrend?.summary}
              >
                {loading && !data ? (
                  <ChartSkeleton />
                ) : data?.errors.finance ? (
                  <ChartEmpty message={data.errors.finance} />
                ) : data?.feeCollectionTrend?.available ? (
                  <SofiaLineChart
                    data={data.feeCollectionTrend.points.map((p) => ({
                      label: p.label,
                      value: p.value,
                    }))}
                    valueFormatter={(n) =>
                      n >= 1_000_000
                        ? `${(n / 1_000_000).toFixed(1)}M`
                        : n >= 1_000
                          ? `${(n / 1_000).toFixed(0)}K`
                          : String(Math.round(n))
                    }
                  />
                ) : (
                  <ChartEmpty
                    message={
                      data?.feeCollectionTrend?.summary ||
                      "No fee collection data yet."
                    }
                  />
                )}
              </ChartCard>
            ) : null}
          </div>

          {/* Level 3 — Distribution + Academic */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard
              title="Student Distribution"
              summary={data?.studentDistribution.summary}
              action={
                <div className="flex gap-1">
                  {(
                    [
                      ["level", "Level"],
                      ["department", "Department"],
                      ["class", "Class"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={chipClass(distributionMode === key)}
                      onClick={() => setDistributionMode(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            >
              {loading && !data ? (
                <ChartSkeleton />
              ) : data?.studentDistribution.available ? (
                <SofiaHorizontalBarChart
                  data={data.studentDistribution.bars}
                  onBarClick={(_id, href) => {
                    if (href) void router.push(href);
                  }}
                />
              ) : (
                <ChartEmpty message="No students enrolled yet." />
              )}
            </ChartCard>

            <ChartCard
              title="Academic Performance"
              href={data?.academicPerformance.href}
              summary={data?.academicPerformance.summary}
            >
              {loading && !data ? (
                <ChartSkeleton />
              ) : data?.errors.academic ? (
                <ChartEmpty message={data.errors.academic} />
              ) : data?.academicPerformance.available ? (
                <SofiaHorizontalBarChart
                  data={data.academicPerformance.bars.map((b) => ({
                    id: b.id,
                    label: b.label,
                    value: b.average,
                    href: b.href,
                  }))}
                  valueFormatter={(n) => `${n}%`}
                  onBarClick={(_id, href) => {
                    if (href) void router.push(href);
                  }}
                />
              ) : (
                <ChartEmpty message="No academic results available yet." />
              )}
            </ChartCard>
          </div>

          {/* Optional department donut + attendance by level */}
          {(data?.departmentComposition?.available ||
            data?.attendanceByLevel.available) && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {data?.departmentComposition?.available ? (
                <ChartCard
                  title="Department Composition"
                  summary={data.departmentComposition.summary}
                >
                  <SofiaDonutChart
                    data={data.departmentComposition.bars}
                    totalLabel="Total students"
                  />
                </ChartCard>
              ) : null}
              {data?.attendanceByLevel.available ? (
                <ChartCard
                  title="Attendance by Level"
                  summary={data.attendanceByLevel.summary}
                >
                  <SofiaHorizontalBarChart
                    data={data.attendanceByLevel.bars.map((b) => ({
                      id: b.id,
                      label: b.label,
                      value: b.rate,
                    }))}
                    valueFormatter={(n) => `${n}%`}
                  />
                </ChartCard>
              ) : null}
            </div>
          )}

          {/* Level 3/4 — Attention + Activity */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Needs Attention">
              {loading && !data ? (
                <ChartSkeleton height={160} />
              ) : data?.attention?.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.attention.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 px-1 py-3 text-sm transition hover:bg-slate-50"
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${severityDot(item.severity)}`}
                          title={item.severity}
                        />
                        <span className="font-semibold text-slate-900">
                          {item.count}
                        </span>
                        <span className="text-slate-600">{item.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex h-36 items-center justify-center rounded-xl bg-emerald-50/60 text-sm font-medium text-emerald-700">
                  Everything looks good.
                </div>
              )}
            </ChartCard>

            <ChartCard title="Recent Activity">
              {loading && !data ? (
                <ChartSkeleton height={160} />
              ) : data?.errors.activity ? (
                <ChartEmpty message={data.errors.activity} />
              ) : data?.recentActivity?.length ? (
                <ul className="max-h-64 space-y-0 overflow-y-auto divide-y divide-slate-100">
                  {data.recentActivity.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-start gap-3 px-1 py-2.5 text-sm"
                    >
                      <span className="w-12 shrink-0 tabular-nums text-xs font-medium text-slate-400">
                        {formatTime(row.at)}
                      </span>
                      <span className="text-slate-700">{row.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ChartEmpty message="No recent activity yet." />
              )}
            </ChartCard>
          </div>
        </div>

        {showSetup ? (
          <div className="order-1 xl:sticky xl:top-0 xl:order-2 xl:self-start">
            <SetupProgressCard progress={data.setupProgress} />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
