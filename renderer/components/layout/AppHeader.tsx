import React from "react";
import { Notification03Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";

interface AppHeaderProps {
  breadcrumb: string[];
}

/** Top bar: breadcrumb, search, notifications — matches reference shell. */
export function AppHeader({ breadcrumb }: AppHeaderProps) {
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

      <div className="mx-auto flex w-full max-w-md cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm text-slate-400">
        <Icon icon={Search01Icon} size={15} />
        <span className="flex-1">Search…</span>
        <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          Ctrl K
        </kbd>
      </div>

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
