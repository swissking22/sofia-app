import React from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { SofiaBrand } from "../components/brand/SofiaBrand";

type RecoveryPayload = {
  needsRecoveryUi: boolean;
  status: string;
  fromVersion: string | null;
  targetVersion: string | null;
  currentVersion: string;
  backupVerified: boolean;
  message: string;
  backup?: { verified?: boolean; backupVersion?: string } | null;
};

/**
 * Standalone recovery screen shown when an incomplete update is detected.
 * Avoids AppShell auth so schools can recover before signing in.
 */
export default function RecoveryPage() {
  const router = useRouter();
  const [data, setData] = React.useState<RecoveryPayload | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");

  React.useEffect(() => {
    void window.ipc.invoke("updater:recovery-status").then((res) => {
      const r = res as { ok: boolean; data: RecoveryPayload };
      if (r.ok) setData(r.data);
    });
  }, []);

  async function tryRecovery() {
    setBusy(true);
    setError("");
    const res = (await window.ipc.invoke("updater:recovery-try")) as {
      ok: boolean;
      error?: string;
      data?: { requiresRestart?: boolean };
    };
    setBusy(false);
    if (!res.ok) {
      setError(
        res.error ||
          "Sofia could not prepare recovery. Your current data was not changed.",
      );
      return;
    }
    setInfo(
      "Recovery is ready. Sofia will restart to finish restoring your school data.",
    );
    // Soft prompt — Electron will need a manual relaunch after DB close.
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  }

  async function continueWithout() {
    setBusy(true);
    await window.ipc.invoke("updater:recovery-continue");
    setBusy(false);
    await router.replace("/login");
  }

  return (
    <>
      <Head>
        <title>Sofia Recovery</title>
      </Head>
      <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SofiaBrand />
          <h1 className="mt-5 text-xl font-bold text-slate-900">
            Sofia Recovery
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {data?.message ||
              "Sofia detected an issue while applying an update. Your school data has been protected."}
          </p>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Current version</dt>
              <dd className="font-medium text-slate-800">
                {data?.currentVersion || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Previous version</dt>
              <dd className="font-medium text-slate-800">
                {data?.fromVersion || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Update target</dt>
              <dd className="font-medium text-slate-800">
                {data?.targetVersion || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Pre-update backup</dt>
              <dd className="font-medium text-slate-800">
                {data?.backupVerified || data?.backup?.verified
                  ? "Verified"
                  : "Not available"}
              </dd>
            </div>
          </dl>

          {error ? (
            <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {info}
            </p>
          ) : null}

          <p className="mt-5 text-sm text-slate-500">
            What would you like to do?
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={
                busy || !(data?.backupVerified || data?.backup?.verified)
              }
              onClick={() => void tryRecovery()}
              className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Try Recovery
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void continueWithout()}
              className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-60"
            >
              Continue Without Recovery
            </button>
            <a
              href="mailto:cherubtech7@gmail.com?subject=Sofia%20update%20recovery"
              className="rounded-xl px-4 py-2.5 text-center text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
