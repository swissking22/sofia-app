import React from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { authGetSession, authLogout, type SessionData } from "../../lib/auth";
import { resolveNestedBackHref } from "../../lib/nested-back";
import {
  filterNavSections,
  NAV_SECTIONS,
  type NavSection,
} from "../../lib/navigation";
import { fetchMyPermissions } from "../../lib/rbac";
import { useBackgroundSyncProgress } from "../../lib/sync-progress";
import { Icon } from "../ui/Icon";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { SyncProgressBar } from "../sync/SyncProgressBar";
import { UpdateNotifier } from "../updates/UpdateNotifier";

interface AppShellProps {
  title: string;
  breadcrumb: string[];
  heading: string;
  subtitle?: string;
  /** Primary actions shown on the right of the page heading (e.g. Create). */
  actions?: React.ReactNode;
  /**
   * Parent route for the heading Back control.
   * Omit to auto-resolve for deep nested paths; pass `false` to hide; pass a string to override.
   */
  backHref?: string | false;
  /** Label for the Back control (default: Back). */
  backLabel?: string;
  children: React.ReactNode;
}

/**
 * Authenticated app chrome: sidebar + header + page content.
 * Matches the reference dashboard layout.
 */
export function AppShell({
  title,
  breadcrumb,
  heading,
  subtitle,
  actions,
  backHref,
  backLabel = "Back",
  children,
}: AppShellProps) {
  const router = useRouter();
  const { progress: syncProgress, active: syncActive } =
    useBackgroundSyncProgress();
  const [session, setSession] = React.useState<SessionData | null>(null);
  const [navSections, setNavSections] =
    React.useState<NavSection[]>(NAV_SECTIONS);
  const [loading, setLoading] = React.useState(true);
  const [collapsed, setCollapsed] = React.useState(false);

  const resolvedBackHref =
    backHref === false
      ? null
      : typeof backHref === "string"
        ? backHref
        : resolveNestedBackHref(router.asPath);

  React.useEffect(() => {
    void (async () => {
      const current = await authGetSession();
      if (!current) {
        await router.replace("/login");
        return;
      }
      setSession(current);

      if (current.role === "admin") {
        setNavSections(NAV_SECTIONS);
      } else {
        const perms = await fetchMyPermissions();
        const names = perms.ok ? perms.data.permissions : [];
        setNavSections(filterNavSections(NAV_SECTIONS, names));
      }
      setLoading(false);
    })();
  }, [router]);

  async function handleLogout() {
    await authLogout();
    await router.replace("/login");
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{title} — SOFIA</title>
      </Head>
      <div className="flex h-screen overflow-hidden bg-[#f4f5f7] print:h-auto print:overflow-visible print:bg-white">
        <AppSidebar
          session={session}
          sections={navSections}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onLogout={handleLogout}
        />
        <div className="flex min-w-0 flex-1 flex-col print:block">
          <AppHeader breadcrumb={breadcrumb} sections={navSections} />
          {syncProgress && (syncActive || syncProgress.phase === "done") ? (
            <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-2 print:hidden">
              <SyncProgressBar progress={syncProgress} />
            </div>
          ) : null}
          <main className="flex-1 overflow-y-auto px-6 py-5 print:overflow-visible print:p-0">
            {heading || resolvedBackHref ? (
              <div className="mb-5 animate-[fadeInUp_0.4s_ease-out] print:hidden">
                {resolvedBackHref ? (
                  <button
                    type="button"
                    onClick={() => void router.push(resolvedBackHref)}
                    className="mb-2 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"
                  >
                    <Icon icon={ArrowLeft01Icon} size={16} />
                    <span>{backLabel}</span>
                  </button>
                ) : null}
                {heading ? (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        {heading}
                      </h1>
                      {subtitle ? (
                        <p className="mt-1 text-sm text-slate-500">
                          {subtitle}
                        </p>
                      ) : null}
                    </div>
                    {actions ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {actions}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {children}
          </main>
        </div>
      </div>
      <UpdateNotifier />
    </>
  );
}
