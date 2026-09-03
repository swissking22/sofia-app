import React from "react";
import Link from "next/link";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";

export const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

export const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15 disabled:cursor-not-allowed disabled:bg-slate-50";

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function PageAlert({
  tone,
  children,
}: {
  tone: "error" | "success" | "warning";
  children: React.ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-red-100 bg-red-50 text-red-600"
      : tone === "warning"
        ? "border-amber-100 bg-amber-50 text-amber-800"
        : "border-emerald-100 bg-emerald-50 text-emerald-700";
  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function FilterBar({
  filters,
  actions,
}: {
  filters: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-wrap gap-2">{filters}</div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function FilterField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-xs font-medium text-slate-500 ${className}`}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const BADGE_TONES: Record<string, string> = {
  active: "border-emerald-100 bg-emerald-50 text-emerald-700",
  inactive: "border-slate-200 bg-slate-50 text-slate-500",
  alumni: "border-slate-200 bg-slate-50 text-slate-600",
  transferred: "border-sky-100 bg-sky-50 text-sky-700",
  pending: "border-amber-100 bg-amber-50 text-amber-700",
  accepted: "border-emerald-100 bg-emerald-50 text-emerald-700",
  rejected: "border-red-100 bg-red-50 text-red-600",
  completed: "border-emerald-100 bg-emerald-50 text-emerald-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-500",
  draft: "border-slate-200 bg-slate-50 text-slate-600",
  paid: "border-emerald-100 bg-emerald-50 text-emerald-700",
  partially_paid: "border-sky-100 bg-sky-50 text-sky-700",
  overdue: "border-red-100 bg-red-50 text-red-600",
  generated: "border-sky-100 bg-sky-50 text-sky-700",
  issued: "border-emerald-100 bg-emerald-50 text-emerald-700",
  voided: "border-red-100 bg-red-50 text-red-600",
  superseded: "border-slate-200 bg-slate-50 text-slate-500",
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const tone =
    BADGE_TONES[status] ?? "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${tone}`}
    >
      {label ?? status}
    </span>
  );
}

export function StudentTable({
  columns,
  loading,
  children,
}: {
  columns: string[];
  loading?: boolean;
  children: React.ReactNode;
}) {
  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((col, i) => (
                <th
                  key={`${col || "col"}-${i}`}
                  className="whitespace-nowrap px-4 py-3"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function EmptyRow({
  colSpan,
  children,
  message,
}: {
  colSpan: number;
  children?: React.ReactNode;
  message?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-500">
        {children ?? message ?? "No results."}
      </td>
    </tr>
  );
}

export function FormModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "lg",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const maxWidth =
    size === "xl" ? "max-w-3xl" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-modal-title"
        className={`my-auto flex max-h-[min(90vh,900px)] w-full flex-col rounded-2xl bg-white shadow-2xl ${maxWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3
              id="form-modal-title"
              className="text-base font-semibold text-slate-900"
            >
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
          >
            <Icon icon={Cancel01Icon} size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <div className="shrink-0 space-y-2 border-t border-slate-100 p-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <div className="mt-2 text-sm text-slate-500">{description}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-(--sofia-primary)"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PrimaryButton({
  children,
  href,
  onClick,
  type = "button",
  form,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  form?: string;
  disabled?: boolean;
  className?: string;
}) {
  const styles = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${className}`;
  if (href) {
    return (
      <Link href={href} className={styles}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer ${styles}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  href,
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const styles = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60 ${className}`;
  if (href) {
    return (
      <Link href={href} className={styles}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer ${styles}`}
    >
      {children}
    </button>
  );
}
