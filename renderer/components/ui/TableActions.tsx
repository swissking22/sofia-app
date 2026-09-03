import React from "react";
import Link from "next/link";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "./Icon";

export type TableActionTone = "default" | "primary" | "warning" | "danger";

const TONE_CLASS: Record<TableActionTone, string> = {
  default:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-slate-200",
  primary:
    "text-(--sofia-primary) hover:bg-(--sofia-primary)/10 border-(--sofia-primary)/25",
  warning:
    "text-orange-600 hover:bg-orange-50 hover:text-orange-700 border-orange-200",
  danger: "text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200",
};

export function TableIconButton({
  icon,
  label,
  onClick,
  href,
  tone = "default",
  disabled,
  external,
}: {
  icon: IconSvgElement;
  label: string;
  onClick?: () => void;
  href?: string;
  tone?: TableActionTone;
  disabled?: boolean;
  external?: boolean;
}) {
  const className = `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-white transition disabled:cursor-not-allowed disabled:opacity-40 ${TONE_CLASS[tone]}`;
  if (href) {
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          aria-label={label}
          title={label}
        >
          <Icon icon={icon} size={16} />
        </a>
      );
    }
    return (
      <Link href={href} className={className} aria-label={label} title={label}>
        <Icon icon={icon} size={16} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer ${className}`}
      aria-label={label}
      title={label}
    >
      <Icon icon={icon} size={16} />
    </button>
  );
}

export function TableActionGroup({
  children,
  align = "end",
}: {
  children: React.ReactNode;
  align?: "end" | "start";
}) {
  return (
    <div
      className={`flex items-center gap-1 whitespace-nowrap ${
        align === "end" ? "justify-end" : "justify-start"
      }`}
    >
      {children}
    </div>
  );
}
