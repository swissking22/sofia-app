import React from "react";
import Link from "next/link";
import { AppShell } from "../../../components/layout/AppShell";
import {
  fetchGateTodaySummary,
  GATE_RESULT_DISPLAY_MS,
  submitGateScan,
  type GateScanOutcome,
  type GateScanResultDto,
  type GateTodaySummaryDto,
} from "../../../lib/gate-attendance";
import { playScannerFeedback } from "../../../lib/scanner-feedback";
import { formatDisplayDateWithWeekday } from "../../../lib/date-format";

type UiPhase = "ready" | "processing" | GateScanOutcome;

function formatClock(d: Date) {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatDay(iso: string) {
  return formatDisplayDateWithWeekday(iso, iso);
}

function outcomeTitle(outcome: GateScanOutcome): string {
  switch (outcome) {
    case "recorded":
      return "ATTENDANCE RECORDED";
    case "duplicate":
      return "ALREADY RECORDED";
    case "not_found":
      return "STUDENT NOT FOUND";
    case "invalid":
      return "INVALID STUDENT ID";
    case "inactive":
      return "STUDENT NOT ACTIVE";
    default:
      return "SCAN ERROR";
  }
}

export default function GateScannerPage() {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = React.useRef(false);

  const [accessDenied, setAccessDenied] = React.useState(false);
  const [phase, setPhase] = React.useState<UiPhase>("ready");
  const [result, setResult] = React.useState<GateScanResultDto | null>(null);
  const [summary, setSummary] = React.useState<GateTodaySummaryDto | null>(
    null,
  );
  const [now, setNow] = React.useState(() => new Date());
  const [focusLost, setFocusLost] = React.useState(false);
  const [entranceMode, setEntranceMode] = React.useState(false);

  const focusInput = React.useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    setFocusLost(false);
  }, []);

  const loadSummary = React.useCallback(async () => {
    const res = await fetchGateTodaySummary();
    if (res.ok) setSummary(res.data);
    else if (res.error === "Access denied.") setAccessDenied(true);
  }, []);

  React.useEffect(() => {
    void (async () => {
      await loadSummary();
      requestAnimationFrame(() => focusInput());
    })();
  }, [loadSummary, focusInput]);

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") focusInput();
    };
    window.addEventListener("focus", focusInput);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", focusInput);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [focusInput]);

  function scheduleReady() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setPhase("ready");
      setResult(null);
      processingRef.current = false;
      if (inputRef.current) inputRef.current.value = "";
      focusInput();
    }, GATE_RESULT_DISPLAY_MS);
  }

  async function processRaw(raw: string) {
    if (processingRef.current) return;
    processingRef.current = true;
    setPhase("processing");
    if (inputRef.current) inputRef.current.value = "";

    try {
      const res = await submitGateScan(raw);
      if (!res.ok) {
        const failed: GateScanResultDto = {
          outcome: "error",
          message: res.error || "Could not process scan.",
          tone: "error",
          student: null,
          attendance: null,
          school_day: summary?.local_day || "",
        };
        setResult(failed);
        setPhase("error");
        playScannerFeedback("error");
        scheduleReady();
        return;
      }

      setResult(res.data);
      setPhase(res.data.outcome);
      playScannerFeedback(
        res.data.tone === "success"
          ? "success"
          : res.data.tone === "warning"
            ? "warning"
            : "error",
      );
      if (res.data.outcome === "recorded") void loadSummary();
      scheduleReady();
    } catch {
      setResult({
        outcome: "error",
        message: "Could not process scan.",
        tone: "error",
        student: null,
        attendance: null,
        school_day: summary?.local_day || "",
      });
      setPhase("error");
      playScannerFeedback("error");
      scheduleReady();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void processRaw(e.currentTarget.value);
  }

  const isReady = phase === "ready" || phase === "processing";

  return (
    <AppShell
      title="Gate Scanner"
      breadcrumb={["Academic Management", "Attendance", "Gate Scanner"]}
      heading="Gate Scanner"
      subtitle="USB QR scanner entrance check-in. Keep this page focused while scanning."
    >
      {accessDenied ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-6 text-center">
          <p className="text-base font-semibold text-slate-800">
            Access denied
          </p>
          <p className="mt-1 text-sm text-slate-500">
            You need attendance permission to use the Gate Scanner.
          </p>
          <Link
            href="/academic/attendance"
            className="mt-3 inline-block text-sm font-semibold text-(--sofia-primary)"
          >
            Back to Attendance
          </Link>
        </div>
      ) : (
        <div
          className={`rounded-3xl ${
            entranceMode ? "bg-slate-950 px-4 py-6 text-white sm:px-8" : ""
          }`}
          onMouseDown={(e) => {
            const t = e.target as HTMLElement;
            if (t.closest("button, a, input, select, textarea")) return;
            focusInput();
          }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p
              className={`text-sm font-semibold uppercase tracking-[0.2em] ${
                entranceMode ? "text-sky-300/70" : "text-slate-400"
              }`}
            >
              School Attendance
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEntranceMode((v) => !v);
                  requestAnimationFrame(() => focusInput());
                }}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  entranceMode
                    ? "border-white/20 text-white/80"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {entranceMode ? "Exit entrance look" : "Entrance look"}
              </button>
              <Link
                href="/academic/attendance"
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  entranceMode
                    ? "border-white/20 text-white/80"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                Class attendance
              </Link>
            </div>
          </div>

          <div className="mx-auto flex max-w-3xl flex-col items-center">
            <div
              className={`w-full rounded-3xl border p-8 text-center shadow-sm ${
                entranceMode
                  ? "border-white/10 bg-white/5"
                  : "border-slate-200 bg-white"
              }`}
            >
              {isReady ? (
                <>
                  <p
                    className={`text-xs font-bold uppercase tracking-widest ${
                      focusLost
                        ? "text-amber-500"
                        : entranceMode
                          ? "text-emerald-300"
                          : "text-emerald-600"
                    }`}
                  >
                    {focusLost
                      ? "Scanner Waiting — click to focus"
                      : "Scanner Ready"}
                  </p>
                  <h2
                    className={`mt-4 text-4xl font-black tracking-tight sm:text-5xl ${
                      entranceMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    READY TO SCAN
                  </h2>
                  <p
                    className={`mt-3 text-base ${
                      entranceMode ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    Scan Student ID Card
                  </p>
                </>
              ) : result ? (
                <ScanResultPanel
                  result={result}
                  entranceMode={entranceMode}
                  title={outcomeTitle(result.outcome)}
                />
              ) : null}

              <label className="sr-only" htmlFor="gate-scanner-input">
                Scanner input
              </label>
              <input
                id="gate-scanner-input"
                ref={inputRef}
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className={`mt-8 w-full max-w-md rounded-xl border px-4 py-3 text-center font-mono text-sm outline-none focus:ring-2 ${
                  entranceMode
                    ? "border-white/20 bg-black/30 text-white focus:ring-sky-400/40"
                    : "border-slate-200 bg-slate-50 text-slate-800 focus:border-(--sofia-primary) focus:ring-(--sofia-primary)/20"
                }`}
                placeholder="Waiting for scan…"
                onKeyDown={onKeyDown}
                onBlur={() => {
                  setFocusLost(true);
                  setTimeout(() => {
                    const active = document.activeElement;
                    if (
                      active &&
                      active !== document.body &&
                      active !== inputRef.current &&
                      (active as HTMLElement).closest(
                        "button, a, select, textarea, [data-sidebar]",
                      )
                    ) {
                      return;
                    }
                    focusInput();
                  }, 120);
                }}
                onFocus={() => setFocusLost(false)}
              />
              <p className="mt-2 text-xs text-slate-400">
                USB QR scanner (HID keyboard). Press Enter after a manual test
                ID.
              </p>
            </div>

            <div
              className={`mt-8 grid w-full gap-3 sm:grid-cols-3 ${
                entranceMode ? "text-white" : ""
              }`}
            >
              <StatCard
                label="Present today"
                value={summary?.present ?? "—"}
                entranceMode={entranceMode}
              />
              <StatCard
                label="Not yet scanned"
                value={summary?.not_yet_scanned ?? "—"}
                entranceMode={entranceMode}
              />
              <StatCard
                label="Active students"
                value={summary?.total_active ?? "—"}
                entranceMode={entranceMode}
              />
            </div>

            <div
              className={`mt-6 text-center text-sm ${
                entranceMode ? "text-slate-300" : "text-slate-500"
              }`}
            >
              <p className="font-semibold">
                {formatDay(summary?.local_day || result?.school_day || "")}
              </p>
              <p className="mt-1 font-mono text-lg tabular-nums">
                {formatClock(now)}
              </p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  entranceMode,
}: {
  label: string;
  value: number | string;
  entranceMode: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-4 text-center ${
        entranceMode
          ? "border-white/10 bg-white/5"
          : "border-slate-200 bg-white shadow-xs"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function ScanResultPanel({
  result,
  entranceMode,
  title,
}: {
  result: GateScanResultDto;
  entranceMode: boolean;
  title: string;
}) {
  const ok = result.outcome === "recorded";
  const warn = result.outcome === "duplicate";
  const color = ok
    ? entranceMode
      ? "text-emerald-300"
      : "text-emerald-600"
    : warn
      ? entranceMode
        ? "text-amber-300"
        : "text-amber-600"
      : entranceMode
        ? "text-rose-300"
        : "text-rose-600";

  return (
    <div>
      <p className={`text-xs font-bold uppercase tracking-widest ${color}`}>
        {ok ? "✓ " : warn ? "" : "✕ "}
        {title}
      </p>
      {result.student ? (
        <div className="mt-6 flex flex-col items-center gap-4">
          <div
            className={`h-28 w-28 overflow-hidden rounded-2xl border ${
              entranceMode
                ? "border-white/20 bg-white/10"
                : "border-slate-200 bg-slate-100"
            }`}
          >
            {result.student.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.student.photo_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                className={`flex h-full w-full items-center justify-center text-3xl font-bold ${
                  entranceMode ? "text-white/40" : "text-slate-300"
                }`}
              >
                {result.student.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p
              className={`text-3xl font-black tracking-tight ${
                entranceMode ? "text-white" : "text-slate-900"
              }`}
            >
              {result.student.name}
            </p>
            <p
              className={`mt-1 text-base ${
                entranceMode ? "text-slate-300" : "text-slate-500"
              }`}
            >
              {[result.student.class_name, result.student.student_code]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {result.attendance ? (
            <div
              className={`mt-2 rounded-xl px-5 py-3 ${
                entranceMode ? "bg-white/10" : "bg-slate-50"
              }`}
            >
              <p
                className={`text-lg font-bold uppercase tracking-wide ${color}`}
              >
                {result.attendance.status}
              </p>
              <p
                className={`mt-1 font-mono text-sm ${
                  entranceMode ? "text-slate-300" : "text-slate-600"
                }`}
              >
                Arrival: {result.attendance.arrival_display}
              </p>
            </div>
          ) : (
            <p
              className={`mt-2 max-w-md text-sm ${
                entranceMode ? "text-slate-300" : "text-slate-500"
              }`}
            >
              {result.message}
            </p>
          )}
        </div>
      ) : (
        <p
          className={`mt-6 text-lg ${
            entranceMode ? "text-slate-200" : "text-slate-600"
          }`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
