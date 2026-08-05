import Link from "next/link";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import type { SetupProgress } from "../../lib/dashboard";
import { Icon } from "../ui/Icon";

interface DashboardSetupChecklistProps {
  progress: SetupProgress;
}

/**
 * Right-rail checklist for unfinished Sofia initial setup.
 * Hidden by the parent when progress.isComplete is true.
 */
export function DashboardSetupChecklist({
  progress,
}: DashboardSetupChecklistProps) {
  const percent = Math.round((progress.completed / progress.total) * 100);

  return (
    <aside className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm animate-[fadeInUp_0.45s_ease-out]">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Sofia Setup Progress
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Complete these steps to finish initial setup
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
          {progress.completed}/{progress.total}
        </span>
      </div>

      <div className="mt-4 mb-5">
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
          <span>Progress</span>
          <span className="font-semibold text-slate-700">{percent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-(--sofia-primary) transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ul className="space-y-1">
        {progress.steps.map((step) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm transition hover:bg-slate-50"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  step.done
                    ? "bg-emerald-500 text-white"
                    : step.status === "skipped"
                      ? "border-2 border-dashed border-amber-300 bg-amber-50"
                      : "border-2 border-slate-200 bg-white"
                }`}
              >
                {step.done ? (
                  <Icon icon={Tick02Icon} size={12} strokeWidth={2.5} />
                ) : null}
              </span>
              <span
                className={
                  step.done
                    ? "font-medium text-slate-700"
                    : "font-medium text-slate-500"
                }
              >
                {step.label ?? step.title}
              </span>
              {step.status === "skipped" && !step.done ? (
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                  Skipped
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** @deprecated Use DashboardSetupChecklist */
export const SetupProgressCard = DashboardSetupChecklist;
