import React from "react";
import {
  dismissAppUpdate,
  downloadAppUpdate,
  getUpdaterStatus,
  installAppUpdate,
  subscribeUpdaterEvent,
  type UpdaterState,
} from "../../lib/updater";

/**
 * Packaged-app update prompts. Mounted from AppShell so every authenticated
 * screen can receive update dialogs without changing page layouts.
 */
export function UpdateNotifier() {
  const [state, setState] = React.useState<UpdaterState | null>(null);
  const [prompt, setPrompt] = React.useState<
    "available" | "downloading" | "ready" | "preparing" | "postponed" | null
  >(null);
  const [busy, setBusy] = React.useState(false);
  const [postponeMessage, setPostponeMessage] = React.useState("");
  const dismissedRef = React.useRef(false);

  React.useEffect(() => {
    void getUpdaterStatus().then((res) => {
      if (!res.ok || !res.data.enabled) {
        if (res.ok) setState(res.data);
        return;
      }
      setState(res.data);
      if (dismissedRef.current) return;
      if (res.data.phase === "downloaded") setPrompt("ready");
      else if (res.data.phase === "available") setPrompt("available");
      else if (res.data.phase === "downloading") setPrompt("downloading");
      else if (res.data.phase === "preparing-backup") setPrompt("preparing");
    });

    const unsubs = [
      subscribeUpdaterEvent("updater:status", (payload) => {
        const next = payload as UpdaterState;
        setState(next);
        if (dismissedRef.current) return;
        if (next.phase === "downloading") setPrompt("downloading");
        if (next.phase === "downloaded") setPrompt("ready");
        if (next.phase === "preparing-backup") setPrompt("preparing");
      }),
      subscribeUpdaterEvent("updater:available", () => {
        dismissedRef.current = false;
        setPrompt("available");
      }),
      subscribeUpdaterEvent("updater:progress", () => {
        dismissedRef.current = false;
        setPrompt("downloading");
      }),
      subscribeUpdaterEvent("updater:downloaded", () => {
        dismissedRef.current = false;
        setPrompt("ready");
      }),
      subscribeUpdaterEvent("updater:preparing-backup", () => {
        setPrompt("preparing");
      }),
      subscribeUpdaterEvent("updater:backup-failed", (payload) => {
        const p = payload as { message?: string };
        setPostponeMessage(
          p.message ||
            "Sofia could not safely prepare for this update. Your school data has not been changed. The update has been postponed.",
        );
        setPrompt("postponed");
        setBusy(false);
      }),
      subscribeUpdaterEvent("updater:error", () => {
        setPrompt(null);
      }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, []);

  if (!state?.enabled || !prompt) return null;

  const current = state.currentVersion;
  const next = state.availableVersion || "—";

  async function onDownload() {
    dismissedRef.current = false;
    setBusy(true);
    setPrompt("downloading");
    const res = await downloadAppUpdate();
    setBusy(false);
    if (!res.ok) setPrompt("available");
  }

  async function onInstall() {
    setBusy(true);
    setPrompt("preparing");
    const res = await installAppUpdate();
    if (!res.ok) {
      setBusy(false);
      setPostponeMessage(
        res.error ||
          "Sofia could not safely prepare for this update. Your school data has not been changed. The update has been postponed.",
      );
      setPrompt("postponed");
    }
  }

  async function onLater() {
    dismissedRef.current = true;
    await dismissAppUpdate();
    setPrompt(null);
  }

  if (prompt === "postponed") {
    return (
      <ModalShell>
        <h3 className="text-base font-semibold text-slate-900">
          Update postponed
        </h3>
        <p className="mt-2 text-sm text-slate-500">{postponeMessage}</p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => setPrompt(null)}
            className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
          >
            OK
          </button>
        </div>
      </ModalShell>
    );
  }

  if (prompt === "preparing") {
    return (
      <ModalShell>
        <h3 className="text-base font-semibold text-slate-900">
          Protecting your school data…
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Sofia is creating and verifying a database backup before installing
          the update. Please keep Sofia open.
        </p>
      </ModalShell>
    );
  }

  if (prompt === "available") {
    return (
      <ModalShell>
        <h3 className="text-base font-semibold text-slate-900">
          Sofia Update Available
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          A new version of Sofia is available.
        </p>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Current version</dt>
            <dd className="font-medium text-slate-800">{current}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">New version</dt>
            <dd className="font-medium text-slate-800">{next}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => void onLater()}
            disabled={busy}
            className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 disabled:opacity-60"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => void onDownload()}
            disabled={busy}
            className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Starting…" : "Download Update"}
          </button>
        </div>
      </ModalShell>
    );
  }

  if (prompt === "downloading") {
    const percent = Math.max(0, Math.min(100, state.percent || 0));
    return (
      <ModalShell>
        <h3 className="text-base font-semibold text-slate-900">
          Downloading Sofia Update
        </h3>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-(--sofia-primary) transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-sm font-medium text-slate-700">{percent}%</p>
        <p className="mt-3 text-sm text-slate-500">Please keep Sofia open.</p>
      </ModalShell>
    );
  }

  return (
    <ModalShell>
      <h3 className="text-base font-semibold text-slate-900">Update Ready</h3>
      <p className="mt-2 text-sm text-slate-500">
        Sofia {next} is ready to install.
      </p>
      <p className="mt-3 text-sm text-slate-600">
        Sofia will back up your school database before installing.
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => void onLater()}
          disabled={busy}
          className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 disabled:opacity-60"
        >
          Later
        </button>
        <button
          type="button"
          onClick={() => void onInstall()}
          disabled={busy}
          className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Preparing…" : "Restart & Install"}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 p-4 print:hidden">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        {children}
      </div>
    </div>
  );
}
