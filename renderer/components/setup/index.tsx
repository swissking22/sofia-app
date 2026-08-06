import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import {
  getNextSetupHref,
  skipSetupStep,
  type SetupProgress,
  type SetupStepId,
} from "../../lib/setup";
import { SofiaBrand } from "../brand/SofiaBrand";
import { Icon } from "../ui/Icon";

interface SetupProgressCardProps {
  progress: SetupProgress;
}

/** Compact progress summary for the setup sidebar. */
export function SetupProgressCard({ progress }: SetupProgressCardProps) {
  const percent = Math.round((progress.completed / progress.total) * 100);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Setup progress
        </p>
        <span className="text-xs font-semibold text-slate-700">
          {progress.completed}/{progress.total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
        <div
          className="h-full rounded-full bg-(--sofia-primary) transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">{percent}% complete</p>
    </div>
  );
}

interface SetupSidebarProps {
  progress: SetupProgress;
  currentStepId: string;
}

export function SetupSidebar({ progress, currentStepId }: SetupSidebarProps) {
  return (
    <aside className="flex h-full w-70 shrink-0 flex-col border-r border-slate-200/80 bg-white">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
        <SofiaBrand variant="icon" height={36} />
        <div>
          <p className="text-sm font-bold tracking-tight text-slate-900">
            SOFIA Setup
          </p>
          <p className="text-xs text-slate-500">Initial configuration</p>
        </div>
      </div>

      <div className="px-4 pt-4">
        <SetupProgressCard progress={progress} />
      </div>

      <nav className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {progress.steps.map((step) => {
            const active = step.id === currentStepId;
            return (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    active
                      ? "bg-(--sofia-primary) text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      step.done
                        ? active
                          ? "bg-white text-emerald-600"
                          : "bg-emerald-500 text-white"
                        : step.status === "skipped"
                          ? active
                            ? "bg-white/20 text-white"
                            : "border-2 border-dashed border-amber-300 bg-amber-50 text-amber-600"
                          : active
                            ? "bg-white/20 text-white"
                            : "border-2 border-slate-200 bg-white text-slate-400"
                    }`}
                  >
                    {step.done ? (
                      <Icon icon={Tick02Icon} size={12} strokeWidth={2.5} />
                    ) : (
                      step.order
                    )}
                  </span>
                  <span
                    className={`min-w-0 truncate font-medium ${
                      active ? "text-white" : ""
                    }`}
                  >
                    {step.title}
                  </span>
                  {step.status === "skipped" && !step.done && !active ? (
                    <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                      Skipped
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-100 p-4">
        <Link
          href="/home"
          className="block cursor-pointer rounded-xl px-3 py-2 text-center text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
        >
          Exit to Dashboard
        </Link>
      </div>
    </aside>
  );
}

interface SetupHeaderProps {
  title: string;
  description: string;
  stepNumber: number;
  totalSteps: number;
  /** Full trail for nested pages (parent → … → current). */
  breadcrumbs?: Array<{ label: string; href?: string }>;
  /** When set, shows a top Back control (non-main routes). */
  backHref?: string | null;
}

export function SetupHeader({
  title,
  description,
  stepNumber,
  totalSteps,
  breadcrumbs,
  backHref,
}: SetupHeaderProps) {
  const router = useRouter();

  return (
    <header className="mb-6">
      {backHref ? (
        <button
          type="button"
          onClick={() => void router.push(backHref)}
          className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-slate-700 transition hover:text-slate-900"
        >
          <Icon icon={ArrowLeft01Icon} size={16} />
          <span>Back</span>
        </button>
      ) : null}

      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-400"
        >
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <React.Fragment key={`${crumb.label}-${i}`}>
                {i > 0 ? (
                  <span className="text-slate-300" aria-hidden>
                    ›
                  </span>
                ) : null}
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="cursor-pointer transition hover:text-slate-500"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={isLast ? "page" : undefined}>
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      ) : (
        <p className="text-xs font-semibold uppercase tracking-wide text-(--sofia-primary)">
          Step {stepNumber} of {totalSteps}
        </p>
      )}

      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        {title}
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p>
    </header>
  );
}

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Default grid of fields; stack for custom card layouts */
  layout?: "grid" | "stack";
}

export function FormSection({
  title,
  description,
  children,
  layout = "grid",
}: FormSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 border-b border-slate-100 pb-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {layout === "stack" ? (
        <div className="space-y-4">{children}</div>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {children}
        </div>
      )}
    </section>
  );
}

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  fullWidth?: boolean;
  /** When set, renders instead of the default text input (e.g. select/textarea). */
  children?: React.ReactNode;
}

export function FormField({
  label,
  hint,
  fullWidth,
  className = "",
  children,
  ...props
}: FormFieldProps) {
  return (
    <label className={`mb-4 block ${fullWidth ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {props.required ? (
          <span className="text-red-500" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </span>
      {children ?? (
        <input
          {...props}
          className={`w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
        />
      )}
      {hint ? (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: ReadonlyArray<string>;
  placeholder?: string;
  fullWidth?: boolean;
}

export function FormSelect({
  label,
  options,
  placeholder = "Select…",
  fullWidth,
  className = "",
  ...props
}: FormSelectProps) {
  return (
    <label className={`mb-4 block ${fullWidth ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {props.required ? (
          <span className="text-red-500" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </span>
      <select
        {...props}
        className={`w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15 ${
          !props.value ? "text-slate-400" : "text-slate-900"
        } ${className}`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

interface FileUploadFieldProps {
  label: string;
  hint?: string;
  previewUrl: string | null;
  onFile: (file: File) => void;
  accept?: string;
}

export function FileUploadField({
  label,
  hint,
  previewUrl,
  onFile,
  accept = "image/png,image/jpeg,image/webp",
}: FileUploadFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="mb-4 sm:col-span-1">
      <p className="mb-1.5 text-sm font-medium text-slate-700">{label}</p>
      {hint ? <p className="mb-2 text-xs text-slate-400">{hint}</p> : null}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />

      {previewUrl ? (
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={label}
            className="h-16 w-16 rounded-lg bg-white object-contain ring-1 ring-slate-200"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer text-sm font-medium text-(--sofia-primary) hover:underline"
          >
            Replace image
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500 transition hover:border-(--sofia-primary) hover:bg-indigo-50/40 hover:text-(--sofia-primary)"
        >
          <span className="font-medium">Upload {label.toLowerCase()}</span>
          <span className="text-xs text-slate-400">PNG, JPG, or WebP</span>
        </button>
      )}
    </div>
  );
}

interface ContinueButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export function ContinueButton({
  loading,
  children = "Continue",
  className = "",
  ...props
}: ContinueButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-(--sofia-primary-dark) disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {loading ? "Saving…" : children}
    </button>
  );
}

interface SetupFooterProps {
  stepId: SetupStepId;
  onSaveDraft: () => void;
  onContinue: () => void;
  saving?: boolean;
  draftSaving?: boolean;
  /** Set false to hide Skip (defaults to true). */
  allowSkip?: boolean;
}

export function SetupFooter({
  stepId,
  onSaveDraft,
  onContinue,
  saving,
  draftSaving,
  allowSkip = true,
}: SetupFooterProps) {
  const router = useRouter();
  const [skipping, setSkipping] = React.useState(false);
  const busy = Boolean(saving || draftSaving || skipping);

  async function handleSkip() {
    setSkipping(true);
    try {
      const result = await skipSetupStep(stepId);
      if (!result.ok) return;
      // Next SetupShell load refreshes progress; step stays incomplete.
      await router.push(getNextSetupHref(stepId));
    } finally {
      setSkipping(false);
    }
  }

  return (
    <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 border-t border-slate-200/80 bg-[#f4f5f7]/95 px-1 py-4 backdrop-blur-sm">
      {allowSkip ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSkip()}
          className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {skipping ? "Skipping…" : "Skip for now"}
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onSaveDraft}
          className="cursor-pointer rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {draftSaving ? "Saving draft…" : "Save Draft"}
        </button>
        <ContinueButton disabled={busy} loading={saving} onClick={onContinue} />
      </div>
    </div>
  );
}
