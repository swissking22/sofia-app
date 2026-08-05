import React from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { authGetSession, authLogout, type SessionData } from "../../lib/auth";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";

interface AppShellProps {
  title: string;
  breadcrumb: string[];
  heading: string;
  subtitle?: string;
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
  children,
}: AppShellProps) {
  const router = useRouter();
  const [session, setSession] = React.useState<SessionData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [collapsed, setCollapsed] = React.useState(false);

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
      <div className="flex h-screen overflow-hidden bg-[#f4f5f7]">
        <AppSidebar
          session={session}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onLogout={handleLogout}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader breadcrumb={breadcrumb} />
          <main className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mb-5 animate-[fadeInUp_0.4s_ease-out]">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {heading}
              </h1>
              {subtitle ? (
                <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
              ) : null}
            </div>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
