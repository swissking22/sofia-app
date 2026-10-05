import React from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { authGetSession, authLogout, type SessionData } from "../../lib/auth";
import { resolveNestedBackHref } from "../../lib/nested-back";
import { Icon } from "../ui/Icon";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { UpdateNotifier } from "../updates/UpdateNotifier";

interface AppShellProps {
  title: string;
  breadcrumb: string[];
  heading: string;
  subtitle?: string;
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
  backHref,
  backLabel = "Back",
  children,
}: AppShellProps) {
  const router = useRouter();
  const [session, setSession] = React.useState<SessionData | null>(null);
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
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onLogout={handleLogout}
        />
        <div className="flex min-w-0 flex-1 flex-col print:block">
          <AppHeader breadcrumb={breadcrumb} />
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
                  <>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                      {heading}
                    </h1>
                    {subtitle ? (
                      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
                    ) : null}
                  </>
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
