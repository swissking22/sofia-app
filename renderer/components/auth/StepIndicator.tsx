import React from "react";

const STEPS = [
  { id: 1, label: "School" },
  { id: 2, label: "Branding" },
  { id: 3, label: "Admin" },
] as const;

interface StepIndicatorProps {
  current: 1 | 2 | 3;
}

/** Progress rail for the multi-step registration wizard. */
export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <ol className="mb-8 flex items-center gap-2">
      {STEPS.map((step, index) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <React.Fragment key={step.id}>
            {index > 0 ? (
              <li
                className={`h-px flex-1 ${done || active ? "bg-blue-500" : "bg-slate-200"}`}
                aria-hidden
              />
            ) : null}
            <li className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition ${
                  active
                    ? "bg-[#2f6bff] text-white"
                    : done
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {done ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M2.5 6.5L4.5 8.5L9.5 3.5"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  step.id
                )}
              </span>
              <span
                className={`hidden text-xs font-medium sm:inline ${
                  active ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}
