import React from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { AuthSplitLayout } from "../components/auth/AuthSplitLayout";
import { AuthField } from "../components/auth/AuthField";
import { authGetSetupState, authLogin } from "../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [checking, setChecking] = React.useState(true);
  const [showSetupLinks, setShowSetupLinks] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      const state = await authGetSetupState();
      // Fresh installs (no local users) can Join or Create.
      // Devices that already have accounts stay on Login only.
      setShowSetupLinks(state.needsSetup);
      setChecking(false);
    })();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await authLogin({ email, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await router.push("/home");
    } catch {
      setError("Something went wrong. Please try again.");
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
        <title>Log in — SOFIA</title>
      </Head>

      <AuthSplitLayout
        headline={
          <>
            Welcome back to your{" "}
            <span className="relative inline-block px-1">
              school
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
            </span>{" "}
            workspace
          </>
        }
      >
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Log in
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Sign in with your school email to continue.
        </p>

        <form onSubmit={handleSubmit} className="mt-8">
          {error ? (
            <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <AuthField
            label="School Email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@school.edu"
          />

          <AuthField
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-[#2f6bff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Log in"}
          </button>

          {showSetupLinks ? (
            <>
              <p className="mt-5 text-center text-sm text-slate-500">
                Another office computer?{" "}
                <Link
                  href="/join"
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Join existing school
                </Link>
              </p>
              <p className="mt-2 text-center text-sm text-slate-500">
                Need to set up a school?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Create an account
                </Link>
              </p>
            </>
          ) : (
            <p className="mt-5 text-center text-sm text-slate-500">
              This computer already has school accounts. Sign in above, or use a
              fresh install / clear local app data to join a different school.
            </p>
          )}
        </form>
      </AuthSplitLayout>
    </>
  );
}
