import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft01Icon, Home01Icon } from "@hugeicons/core-free-icons";
import { SofiaBrand } from "../components/brand/SofiaBrand";
import { Icon } from "../components/ui/Icon";

/**
 * Custom 404 — shown for unknown routes (and coming-soon nav targets).
 */
export default function NotFoundPage() {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    void router.push("/home");
  }

  return (
    <>
      <Head>
        <title>Page not found — SOFIA</title>
      </Head>

      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f5f7] px-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#e0e7ff_0%,transparent_55%),radial-gradient(ellipse_at_bottom_right,#e2e8f0_0%,transparent_50%)]" />

        <div className="relative w-full max-w-md text-center animate-[fadeInUp_0.5s_ease-out]">
          <div className="mx-auto mb-6 flex justify-center">
            <SofiaBrand
              variant="icon"
              height={56}
              className="rounded-2xl shadow-lg shadow-indigo-600/20"
            />
          </div>

          <p className="text-7xl font-bold tracking-tight text-slate-200">
            404
          </p>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Page not found
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            This page doesn&apos;t exist yet, or the link may be broken. Head
            back and continue from where you left off.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-(--sofia-primary-dark)"
            >
              <Icon icon={ArrowLeft01Icon} size={16} />
              Go back
            </button>

            <Link
              href="/home"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Icon icon={Home01Icon} size={16} />
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
