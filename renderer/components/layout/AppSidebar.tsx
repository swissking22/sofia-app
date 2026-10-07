import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowDown01Icon,
  ArrowLeftRightIcon,
  MoreVerticalIcon,
  Logout01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import type { SessionData } from "../../lib/auth";
import { type NavItem, type NavSection } from "../../lib/navigation";
import { checkAppUpdate } from "../../lib/updater";
import { SofiaBrand } from "../brand/SofiaBrand";
import { Icon } from "../ui/Icon";

interface AppSidebarProps {
  session: SessionData;
  /** Permission-filtered nav tree from AppShell. */
  sections: NavSection[];
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
}

function pathMatches(pathname: string, href: string): boolean {
  if (href === "/home") return pathname === "/home" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Prefer the longest matching href so /students does not stay active on /students/admissions. */
function isNavHrefActive(
  pathname: string,
  href: string,
  siblingHrefs: string[],
): boolean {
  if (!pathMatches(pathname, href)) return false;
  return !siblingHrefs.some(
    (other) =>
      other !== href &&
      other.length > href.length &&
      pathMatches(pathname, other),
  );
}

/** Left navigation with collapsible groups — Hugeicons + primary active state. */
export function AppSidebar({
  session,
  sections,
  collapsed,
  onToggle,
  onLogout,
}: AppSidebarProps) {
  const router = useRouter();
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(
    {},
  );
  const [flyoutId, setFlyoutId] = React.useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = React.useState(false);
  const [updateMessage, setUpdateMessage] = React.useState<string | null>(null);

  async function onCheckForUpdates() {
    if (updateBusy) return;
    setUpdateBusy(true);
    setUpdateMessage(null);
    const res = await checkAppUpdate({ force: true });
    setUpdateBusy(false);
    if (!res.ok) {
      setUpdateMessage(res.error);
      return;
    }
    if (res.data.phase === "available" || res.data.phase === "downloaded") {
      setUpdateMessage(null);
      return;
    }
    if (res.data.phase === "not-available" || res.data.phase === "idle") {
      setUpdateMessage(`You're up to date (v${res.data.currentVersion}).`);
      return;
    }
    if (res.data.phase === "error") {
      setUpdateMessage(
        res.data.errorMessage || "Could not check for updates.",
      );
    }
  }

  React.useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const section of sections) {
      for (const item of section.items) {
        if (!item.children) continue;
        if (item.children.some((c) => pathMatches(router.pathname, c.href))) {
          next[item.id] = true;
        }
      }
    }
    // Accordion: only the module that owns the current route stays open.
    setOpenGroups(next);
  }, [router.pathname, sections]);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      if (prev[id]) return { ...prev, [id]: false };
      return { [id]: true };
    });
  }

  function isChildActive(item: NavItem): boolean {
    return (item.children ?? []).some((c) =>
      pathMatches(router.pathname, c.href),
    );
  }

  function isItemActive(item: NavItem): boolean {
    if (item.href) return pathMatches(router.pathname, item.href);
    return isChildActive(item);
  }

  const itemBase =
    "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition";

  return (
    <aside
      className={`relative flex h-screen shrink-0 flex-col border-r border-slate-200 bg-[#f3f4f6] transition-[width] duration-200 print:hidden ${
        collapsed ? "w-18" : "w-67"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="absolute -right-3 top-7 z-20 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-slate-800"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <Icon icon={ArrowLeftRightIcon} size={12} />
      </button>

      <div
        className={`flex items-center gap-2.5 px-4 py-5 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        {collapsed ? (
          <SofiaBrand variant="icon" height={36} />
        ) : (
          <>
            <SofiaBrand variant="logo" height={42} className="max-w-48" />
            <button
              type="button"
              className="ml-auto cursor-pointer rounded-lg p-1 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-600"
              aria-label="More"
            >
              <Icon icon={MoreVerticalIcon} size={16} />
            </button>
          </>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-visible px-3 pb-3">
        {sections.map((section) => (
          <div key={section.id}>
            <p
              className={`mb-2 px-3 text-[10px] font-semibold tracking-[0.12em] text-slate-400 ${
                collapsed ? "text-center" : ""
              }`}
            >
              {section.label}
            </p>

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isItemActive(item);
                const hasChildren = Boolean(item.children?.length);
                const expanded = openGroups[item.id] ?? false;
                const parentHighlighted = hasChildren && expanded && !collapsed;

                if (!hasChildren) {
                  const classes = `${itemBase} ${
                    active
                      ? "bg-(--sofia-primary) text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
                  } ${collapsed ? "justify-center px-0" : ""} ${
                    item.comingSoon ? "opacity-50" : ""
                  }`;

                  if (item.comingSoon || !item.href) {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        title={item.label}
                        className={classes}
                      >
                        <span
                          className={active ? "text-white" : "text-slate-400"}
                        >
                          <Icon icon={item.icon} />
                        </span>
                        {!collapsed ? <span>{item.label}</span> : null}
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={classes}
                    >
                      <span
                        className={active ? "text-white" : "text-slate-400"}
                      >
                        <Icon icon={item.icon} />
                      </span>
                      {!collapsed ? <span>{item.label}</span> : null}
                    </Link>
                  );
                }

                return (
                  <div
                    key={item.id}
                    className="relative"
                    onMouseLeave={() => {
                      if (collapsed) setFlyoutId(null);
                    }}
                  >
                    <button
                      type="button"
                      title={collapsed ? item.label : undefined}
                      onClick={() => {
                        if (collapsed) {
                          setFlyoutId((id) =>
                            id === item.id ? null : item.id,
                          );
                        } else {
                          toggleGroup(item.id);
                        }
                      }}
                      className={`${itemBase} ${
                        active && collapsed
                          ? "bg-(--sofia-primary) text-white"
                          : parentHighlighted
                            ? "bg-slate-200/70 text-slate-900"
                            : active
                              ? "text-slate-900"
                              : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
                      } ${collapsed ? "justify-center px-0" : ""}`}
                    >
                      <span
                        className={
                          active && collapsed ? "text-white" : "text-slate-400"
                        }
                      >
                        <Icon icon={item.icon} />
                      </span>
                      {!collapsed ? (
                        <>
                          <span className="flex-1 text-left">{item.label}</span>
                          <span
                            className={`text-slate-400 transition ${
                              expanded ? "rotate-180" : ""
                            }`}
                          >
                            <Icon icon={ArrowDown01Icon} size={16} />
                          </span>
                        </>
                      ) : null}
                    </button>

                    {!collapsed && expanded ? (
                      <ul className="relative ml-5 mt-1 space-y-0.5 border-l border-slate-200 py-1 pl-3">
                        {item.children!.map((child) => {
                          const siblingHrefs = item.children!.map(
                            (c) => c.href,
                          );
                          const childActive = isNavHrefActive(
                            router.pathname,
                            child.href,
                            siblingHrefs,
                          );
                          const childClass = `block cursor-pointer rounded-xl px-3 py-2 text-sm font-medium transition ${
                            childActive
                              ? "bg-(--sofia-primary) text-white"
                              : "text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
                          } ${child.comingSoon ? "opacity-50" : ""}`;

                          if (child.comingSoon) {
                            return (
                              <li key={child.id}>
                                <button
                                  type="button"
                                  className={`w-full text-left ${childClass}`}
                                >
                                  {child.label}
                                </button>
                              </li>
                            );
                          }

                          return (
                            <li key={child.id}>
                              <Link href={child.href} className={childClass}>
                                {child.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}

                    {collapsed && flyoutId === item.id ? (
                      <div className="absolute left-full top-0 z-30 ml-2 min-w-45 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg animate-[fadeIn_0.15s_ease-out]">
                        <p className="px-3 py-1.5 text-xs font-semibold text-slate-400">
                          {item.label}
                        </p>
                        {item.children!.map((child) => {
                          const siblingHrefs = item.children!.map(
                            (c) => c.href,
                          );
                          const childActive = isNavHrefActive(
                            router.pathname,
                            child.href,
                            siblingHrefs,
                          );
                          const childClass = `block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                            childActive
                              ? "bg-(--sofia-primary) text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          } ${child.comingSoon ? "opacity-50" : ""}`;

                          if (child.comingSoon) {
                            return (
                              <button
                                key={child.id}
                                type="button"
                                className={childClass}
                              >
                                {child.label}
                              </button>
                            );
                          }

                          return (
                            <Link
                              key={child.id}
                              href={child.href}
                              className={childClass}
                              onClick={() => setFlyoutId(null)}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={() => void onCheckForUpdates()}
          disabled={updateBusy}
          title="Check for updates"
          aria-label="Check for updates"
          className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-(--sofia-primary) py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-(--sofia-primary-dark) disabled:cursor-wait disabled:opacity-70 ${
            collapsed ? "px-0" : "px-3"
          }`}
        >
          <Icon icon={RefreshIcon} size={16} />
          {!collapsed ? (
            <span>{updateBusy ? "Checking…" : "Check for updates"}</span>
          ) : null}
        </button>
        {!collapsed && updateMessage ? (
          <p className="px-1 text-center text-[11px] leading-snug text-slate-500">
            {updateMessage}
          </p>
        ) : null}

        <div
          className={`flex items-center gap-3 rounded-xl px-2 py-2 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
            {session.email.slice(0, 1).toUpperCase()}
          </div>
          {!collapsed ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {session.email.split("@")[0]}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {session.email}
                </p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
                aria-label="Sign out"
                title="Sign out"
              >
                <Icon icon={Logout01Icon} size={16} />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
