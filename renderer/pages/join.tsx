import React from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { AuthSplitLayout } from "../components/auth/AuthSplitLayout";
import { AuthField } from "../components/auth/AuthField";
import { authGetSetupState, authJoinSchool } from "../lib/auth";

export default function JoinSchoolPage() {
  const router = useRouter();
  const [schoolCode, setSchoolCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [checking, setChecking] = React.useState(true);
  const [success, setSuccess] = React.useState<{
    schoolName: string;
    usersPulled: number;
  } | null>(null);

  React.useEffect(() => {
    void (async () => {
      const state = await authGetSetupState();
      if (!state.needsSetup) {
        await router.replace("/login");
        return;
      }
      if (state.pendingSchool) {
        setError(
          "This device already started creating a school. Finish registration or clear the app data before joining another school.",
        );
      }
      setChecking(false);
    })();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(null);
    setLoading(true);

    try {
      const result = await authJoinSchool(schoolCode);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess({
        schoolName: result.schoolName,
        usersPulled: result.usersPulled,
      });
      // Brief pause so the user sees confirmation, then login
      await new Promise((r) => setTimeout(r, 900));
      await router.replace("/login");
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Join school — SOFIA</title>
      </Head>

      <AuthSplitLayout
        headline={
          <>
            Join your school on{" "}
            <span className="relative inline-block px-1">
              this desk
              <svg
                className="pointer-events-none absolute -inset-x-2 -inset-y-1 h-[calc(100%+8px)] w-[calc(100%+16px)] text-orange-400"
                viewBox="0 0 120 40"
                fill="none"
                aria-hidden
              >
                <ellipse
                  cx="60"
                  cy="20"
                  rx="56"
                  ry="16"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="opacity-90"
                />
              </svg>
            </span>
          </>
        }
      >
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Join existing school
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          For secretary, bursar, principal, and other office computers. Enter
          the school code from the main office (School Profile / short code),
          then log in with your shared account.
        </p>

        <form onSubmit={handleSubmit} className="mt-8">
          {error ? (
            <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Joined <strong>{success.schoolName}</strong>. Downloaded{" "}
              {success.usersPulled} account
              {success.usersPulled === 1 ? "" : "s"}. Opening log in…
            </div>
          ) : null}

          <AuthField
            label="School code"
            type="text"
            required
            autoFocus
            value={schoolCode}
            onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
            placeholder="e.g. LWM"
          />

          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            Ask the main office for the school short code. That computer must
            have run <span className="font-medium">Sync Now</span> at least once
            so your accounts are in the cloud. After joining, Sync Now again to
            pull logos and student photos when available.
          </p>

          <button
            type="submit"
            disabled={loading || Boolean(success)}
            className="mt-2 w-full rounded-lg bg-[#2f6bff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Connecting & downloading…"
              : success
                ? "Redirecting…"
                : "Join school"}
          </button>

          <p className="mt-5 text-center text-sm text-slate-500">
            First computer for this school?{" "}
            <Link
              href="/register"
              className="font-semibold text-blue-600 hover:underline"
            >
              Create school
            </Link>
            {" · "}
            <Link
              href="/login"
              className="font-semibold text-blue-600 hover:underline"
            >
              Log in
            </Link>
          </p>
        </form>
      </AuthSplitLayout>
    </>
  );
}
