import React from "react";
import Link from "next/link";
import {
  UserMultipleIcon,
  UserCheck01Icon,
  TeacherIcon,
  BanknoteIcon,
  CloudUploadIcon,
  File01Icon,
  Add01Icon,
  DollarCircleIcon,
  Megaphone01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../components/layout/AppShell";
import { KpiCard } from "../components/dashboard/KpiCard";
import {
  ChartCard,
  ChartEmpty,
  ChartSkeleton,
  SofiaAttendanceGauge,
  SofiaLineChart,
  SofiaVerticalBarChart,
} from "../components/dashboard/ChartCard";
import { SetupProgressCard } from "../components/dashboard/SetupProgressCard";
import { Icon } from "../components/ui/Icon";
import {
  fetchDashboardSummary,
  type AttendanceTrendRange,
  type DashboardSummary,
} from "../lib/dashboard";
import { syncNow } from "../lib/backup-sync";
import { formatDisplayDate, SOFIA_DATE_LOCALE } from "../lib/date-format";
import { formatCompactMoney } from "../lib/finance-mgmt";
import { useOnlineStatus } from "../lib/online";

const selectClass =
  "cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

const chipClass = (active: boolean) =>
  `cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
    active
      ? "bg-(--sofia-primary) text-white"
      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
  }`;

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

function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

function severityDot(severity: "critical" | "warning" | "info") {
  if (severity === "critical") return "bg-red-500";
  if (severity === "warning") return "bg-amber-500";
  return "bg-sky-500";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export default function HomePage() {
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
    React.useState<AttendanceTrendRange>("30d");
  const [financeTab, setFinanceTab] = React.useState<"earn" | "due">("earn");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchDashboardSummary({
        academicYearId: yearId || null,
        termId: termId || null,
        attendanceRange,
        distributionMode: "level",
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
      if (!termId && res.data.context.termId) {
        setTermId(res.data.context.termId);
      }
    } catch {
      setError("Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [yearId, termId, attendanceRange]);

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
  const attendanceSpark =
    data?.attendanceTrend.points.map((p) => p.value) ?? [];
  const feeSpark = data?.feeCollectionTrend?.points.map((p) => p.value) ?? [];

  return (
    <AppShell
      title="Dashboard"
      breadcrumb={["Dashboard", "Overview"]}
      heading=""
      subtitle=""
    >
      {/* Greeting + tools */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {loading && !data
              ? "Dashboard"
              : `${data?.greeting ?? "Welcome back"}, ${data?.userName ?? ""}`}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Here&apos;s what&apos;s happening with{" "}
            {data?.schoolName ? (
              <span className="font-medium text-slate-700">
                {data.schoolName}
              </span>
            ) : (
              "your school"
            )}{" "}
            today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-slate-400">
            Updated: {data ? formatDisplayDate(data.today) : "—"}
          </p>
          {online ? (
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncing}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-(--sofia-primary)/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncing ? (
                <span
                  className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-(--sofia-primary)"
                  aria-hidden
                />
              ) : (
                <Icon icon={CloudUploadIcon} size={16} />
              )}
              {syncing ? "Syncing…" : "Sync"}
            </button>
          ) : null}
          <select
            className={`${selectClass} print:hidden`}
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              setTermId("");
            }}
            disabled={loading && !data}
            aria-label="Academic year"
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
          <select
            className={`${selectClass} print:hidden`}
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            disabled={loading && !data}
            aria-label="Term"
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Total Students"
              value={
                data
                  ? data.students.total.toLocaleString(SOFIA_DATE_LOCALE)
                  : "—"
              }
              icon={UserMultipleIcon}
              hint={data?.students.label}
              href={data?.students.href}
              loading={loading && !data}
              sparkline={
                data?.studentDistribution.bars.map((b) => b.value) ?? []
              }
              summary={
                data ? `${data.students.total} students enrolled` : undefined
              }
            />
            <KpiCard
              title="Total Teachers"
              value={
                data
                  ? data.teachers.total.toLocaleString(SOFIA_DATE_LOCALE)
                  : "—"
              }
              icon={TeacherIcon}
              hint={data?.teachers.label}
              href={data?.teachers.href}
              loading={loading && !data}
              summary={
                data ? `${data.teachers.total} active teachers` : undefined
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
                    ? `${data.attendanceToday.present} present`
                    : "Not recorded"
              }
              href={data?.attendanceToday.href}
              loading={loading && !data}
              sparkline={attendanceSpark}
              summary={data?.attendanceToday.summary}
            />
            {caps?.showFinance !== false ? (
              <KpiCard
                title="Monthly Revenue"
                value={data?.feesCollected?.display ?? "—"}
                icon={BanknoteIcon}
                hint={data?.feesCollected?.hint}
                href={data?.feesCollected?.href ?? "/finance/payments"}
                loading={loading && !data}
                sparkline={feeSpark}
                summary={
                  data?.feesCollected
                    ? `Collected ${data.feesCollected.display}`
                    : data?.errors.finance
                }
              />
            ) : (
              <KpiCard
                title="Fees Outstanding"
                value={data?.feesOutstanding?.display ?? "—"}
                icon={BanknoteIcon}
                hint={
                  data?.feesOutstanding
                    ? `${data.feesOutstanding.studentCount} students`
                    : undefined
                }
                href="/finance/outstanding"
                loading={loading && !data}
              />
            )}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="Student Growth"
              href="/students"
              summary={data?.attendanceTrend.summary}
              action={
                <div className="flex gap-1">
                  {(
                    [
                      ["7d", "7D"],
                      ["30d", "30D"],
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
                <>
                  <p className="mb-2 text-xs text-slate-400">
                    Attendance rate trend (proxy for engagement)
                  </p>
                  <SofiaLineChart
                    data={data.attendanceTrend.points.map((p) => ({
                      label: p.label,
                      value: p.value,
                    }))}
                    valueSuffix="%"
                  />
                </>
              ) : data?.studentDistribution.available ? (
                <SofiaVerticalBarChart
                  data={data.studentDistribution.bars.map((b) => ({
                    label: b.label,
                    value: b.value,
                  }))}
                  highlightLast={false}
                />
              ) : (
                <ChartEmpty message="Not enough enrollment data yet." />
              )}
            </ChartCard>

            {caps?.showFinance !== false ? (
              <ChartCard
                title="Financial Overview"
                href="/finance/reports"
                summary={data?.feeCollectionTrend?.summary}
                action={
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={chipClass(financeTab === "earn")}
                      onClick={() => setFinanceTab("earn")}
                    >
                      Total Earn
                    </button>
                    <button
                      type="button"
                      className={chipClass(financeTab === "due")}
                      onClick={() => setFinanceTab("due")}
                    >
                      Total Due
                    </button>
                  </div>
                }
              >
                {loading && !data ? (
                  <ChartSkeleton />
                ) : data?.errors.finance ? (
                  <ChartEmpty message={data.errors.finance} />
                ) : financeTab === "earn" &&
                  data?.feeCollectionTrend?.available ? (
                  <>
                    <p className="mb-1 text-lg font-bold text-slate-900">
                      {data.feesCollected?.display ?? "—"}
                    </p>
                    <SofiaVerticalBarChart
                      data={data.feeCollectionTrend.points.map((p) => ({
                        label: p.label,
                        value: p.value,
                      }))}
                      valueFormatter={(n) =>
                        formatCompactMoney(n, data?.context.currency ?? "")
                      }
                    />
                  </>
                ) : financeTab === "due" && data?.feesOutstanding ? (
                  <div className="flex h-52 flex-col items-center justify-center rounded-xl bg-slate-50 text-center">
                    <p className="text-3xl font-bold text-slate-900">
                      {data.feesOutstanding.display}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Outstanding across {data.feesOutstanding.studentCount}{" "}
                      student
                      {data.feesOutstanding.studentCount === 1 ? "" : "s"}
                    </p>
                    <Link
                      href="/finance/outstanding"
                      className="mt-4 text-sm font-semibold text-(--sofia-primary)"
                    >
                      View outstanding fees
                    </Link>
                  </div>
                ) : (
                  <ChartEmpty message="No fee collection data yet." />
                )}
              </ChartCard>
            ) : (
              <ChartCard title="Academic snapshot" href="/academic/results">
                {loading && !data ? (
                  <ChartSkeleton />
                ) : data?.studentDistribution.available ? (
                  <SofiaVerticalBarChart
                    data={data.studentDistribution.bars.map((b) => ({
                      label: b.label,
                      value: b.value,
                    }))}
                    highlightLast={false}
                  />
                ) : (
                  <ChartEmpty message="No enrollment data yet." />
                )}
              </ChartCard>
            )}
          </div>

          {/* Bottom lists */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard title="Admission Request" href="/students/admissions">
              {loading && !data ? (
                <ChartSkeleton height={180} />
              ) : (data?.pendingAdmissions ?? []).length ? (
                <ul className="divide-y divide-slate-100">
                  {data!.pendingAdmissions.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--sofia-primary)/10 text-xs font-bold text-(--sofia-primary)">
                        {initials(row.full_name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {row.full_name}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {row.detail}
                          {row.created_at
                            ? ` · ${relativeTime(row.created_at)}`
                            : ""}
                        </p>
                      </div>
                      <Link
                        href={row.href}
                        className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        View
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <ChartEmpty message="No pending admission requests." />
              )}
              <Link
                href="/students/admissions"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-(--sofia-primary)"
              >
                View all requests
                <Icon icon={ArrowRight01Icon} size={12} />
              </Link>
            </ChartCard>

            <ChartCard title="Recent Activities">
              {loading && !data ? (
                <ChartSkeleton height={180} />
              ) : data?.errors.activity ? (
                <ChartEmpty message={data.errors.activity} />
              ) : data?.recentActivity?.length ? (
                <ul className="max-h-56 space-y-0 overflow-y-auto divide-y divide-slate-100">
                  {data.recentActivity.slice(0, 6).map((row) => (
                    <li
                      key={row.id}
                      className="flex items-start gap-3 py-2.5 text-sm first:pt-0"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <Icon icon={File01Icon} size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-700">{row.label}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatTime(row.at)} · {relativeTime(row.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <ChartEmpty message="No recent activity yet." />
              )}
            </ChartCard>

            <ChartCard
              title="Attendance Overview"
              href={data?.attendanceToday.href}
            >
              {loading && !data ? (
                <ChartSkeleton height={180} />
              ) : (
                <SofiaAttendanceGauge
                  rate={
                    data?.attendanceToday.recorded
                      ? data.attendanceToday.rate
                      : null
                  }
                  present={data?.attendanceToday.present ?? 0}
                  absent={data?.attendanceToday.absent ?? 0}
                  late={data?.attendanceToday.late ?? 0}
                />
              )}
            </ChartCard>
          </div>
        </div>

        {/* Right column */}
        <aside className="space-y-5 xl:sticky xl:top-0 xl:self-start">
          {showSetup ? (
            <SetupProgressCard progress={data.setupProgress} />
          ) : null}

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Quick Action
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <Link
                href="/students/create"
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 px-2 py-3 text-center transition hover:border-(--sofia-primary)/40 hover:bg-(--sofia-primary)/5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--sofia-primary)/10 text-(--sofia-primary)">
                  <Icon icon={Add01Icon} size={18} />
                </span>
                <span className="text-[11px] font-semibold text-slate-700">
                  Add Student
                </span>
              </Link>
              <Link
                href="/finance/payments"
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 px-2 py-3 text-center transition hover:border-(--sofia-primary)/40 hover:bg-(--sofia-primary)/5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--sofia-primary)/10 text-(--sofia-primary)">
                  <Icon icon={DollarCircleIcon} size={18} />
                </span>
                <span className="text-[11px] font-semibold text-slate-700">
                  Collect Fee
                </span>
              </Link>
              <Link
                href="/communication/announcements"
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 px-2 py-3 text-center transition hover:border-(--sofia-primary)/40 hover:bg-(--sofia-primary)/5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--sofia-primary)/10 text-(--sofia-primary)">
                  <Icon icon={Megaphone01Icon} size={18} />
                </span>
                <span className="text-[11px] font-semibold text-slate-700">
                  Add Notice
                </span>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              Attention Alert
            </h2>
            {loading && !data ? (
              <ChartSkeleton height={160} />
            ) : data?.attention?.length ? (
              <ul className="divide-y divide-slate-100">
                {data.attention.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDot(item.severity)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {item.label}
                      </p>
                      <p className="text-xs text-slate-400">
                        {item.count} item{item.count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Link
                      href={item.href}
                      className="shrink-0 text-xs font-semibold text-(--sofia-primary)"
                    >
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl bg-emerald-50/60 px-3 py-6 text-center text-sm font-medium text-emerald-700">
                Everything looks good.
              </div>
            )}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
