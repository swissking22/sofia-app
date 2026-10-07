import React from "react";
import { Notification03Icon } from "@hugeicons/core-free-icons";
import type { NavSection } from "../../lib/navigation";
import { Icon } from "../ui/Icon";
import { GlobalSearch } from "./GlobalSearch";

interface AppHeaderProps {
  breadcrumb: string[];
  /** Permission-filtered nav — page hits in Ctrl+K match the sidebar. */
  sections?: NavSection[];
}

/** Top bar: breadcrumb, search, notifications — matches reference shell. */
export function AppHeader({ breadcrumb, sections }: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6 print:hidden">
      <nav className="flex min-w-45 items-center gap-1.5 text-sm text-slate-500">
        {breadcrumb.map((crumb, i) => (
          <React.Fragment key={`${crumb}-${i}`}>
            {i > 0 ? <span className="text-slate-300">›</span> : null}
            <span
              className={
                i === breadcrumb.length - 1
                  ? "font-medium text-slate-800"
                  : undefined
              }
            >
              {crumb}
            </span>
          </React.Fragment>
        ))}
      </nav>

      <GlobalSearch sections={sections} />

      <button
        type="button"
        className="relative cursor-pointer rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
        aria-label="Notifications"
      >
        <Icon icon={Notification03Icon} size={18} />
      </button>
    </header>
  );
}
