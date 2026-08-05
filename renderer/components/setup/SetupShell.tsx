import React from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { authGetSession } from "../../lib/auth";
import {
  fetchSetupProgress,
  getSetupStep,
  type SetupProgress,
  type SetupStepId,
} from "../../lib/setup";
import { SetupHeader, SetupSidebar } from "./index";

export interface SetupBreadcrumb {
  label: string;
  href?: string;
}

interface SetupContextValue {
  progress: SetupProgress;
  refreshProgress: () => Promise<SetupProgress>;
}

const SetupContext = React.createContext<SetupContextValue | null>(null);

export function useSetupProgress() {
  const ctx = React.useContext(SetupContext);
  if (!ctx) {
    throw new Error("useSetupProgress must be used inside SetupShell");
  }
  return ctx;
}

function normalizePath(path: string): string {
  const bare = path.split(/[?#]/)[0] || "/";
  if (bare.length > 1 && bare.endsWith("/")) return bare.slice(0, -1);
  return bare;
}

interface SetupShellProps {
  stepId: SetupStepId;
  children: React.ReactNode;
  /** Optional sticky right column (e.g. live preview) */
  aside?: React.ReactNode;
  /**
   * Nested trail after the main step (current page last).
   * When set — or when the URL is deeper than the step href — Back + breadcrumbs show.
   */
  breadcrumbs?: SetupBreadcrumb[];
  /** Overrides the step title on nested pages */
  pageTitle?: string;
  /** Overrides the step description on nested pages */
  pageDescription?: string;
  /** Back target; defaults to the main step href when nested */
  backHref?: string;
}

/**
 * Dedicated setup wizard chrome: progress sidebar + step content.
 * Does not use the main AppSidebar.
 */
export function SetupShell({
  stepId,
  children,
  aside,
  breadcrumbs,
  pageTitle,
  pageDescription,
  backHref,
}: SetupShellProps) {
  const router = useRouter();
  const step = getSetupStep(stepId);
  const [progress, setProgress] = React.useState<SetupProgress | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refreshProgress = React.useCallback(async () => {
    const data = await fetchSetupProgress();
    setProgress(data);
    return data;
  }, []);

  React.useEffect(() => {
    void (async () => {
      const session = await authGetSession();
      if (!session) {
        await router.replace("/login");
        return;
      }
      try {
        await refreshProgress();
      } catch {
        setProgress(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, refreshProgress]);

  const path = normalizePath(router.asPath);
  const stepHref = normalizePath(step.href);
  const isNested =
    Boolean(breadcrumbs?.length) ||
    (path !== stepHref && path.startsWith(`${stepHref}/`));

  const resolvedBackHref = isNested ? (backHref ?? stepHref) : null;
  const title = isNested && pageTitle ? pageTitle : step.title;
  const description =
    isNested && pageDescription !== undefined
      ? pageDescription
      : step.description;

  const trail = isNested
    ? [
        { label: step.title, href: stepHref },
        ...(breadcrumbs?.length
          ? breadcrumbs
          : [{ label: pageTitle ?? "Details" }]),
      ]
    : undefined;

  if (loading || !progress) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] text-sm text-slate-500">
        Loading setup…
      </div>
    );
  }

  return (
    <SetupContext.Provider value={{ progress, refreshProgress }}>
      <Head>
        <title>{title} — SOFIA Setup</title>
      </Head>
      <div className="flex h-screen overflow-hidden bg-[#f4f5f7]">
        <SetupSidebar progress={progress} currentStepId={stepId} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
            <SetupHeader
              title={title}
              description={description}
              stepNumber={step.order}
              totalSteps={progress.total}
              breadcrumbs={trail}
              backHref={resolvedBackHref}
            />
            {aside ? (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0">{children}</div>
                <div className="xl:sticky xl:top-2 xl:self-start">{aside}</div>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </SetupContext.Provider>
  );
}
