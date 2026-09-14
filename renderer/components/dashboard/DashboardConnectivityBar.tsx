import React from "react";
import { Wifi01Icon, WifiDisconnected01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";
import { syncNow } from "../../lib/backup-sync";

interface DashboardConnectivityBarProps {
  pendingSync: number;
  onSynced?: (pendingRemaining: number) => void;
}

/**
 * Dashboard strip: live online/offline indicator + Sync when Phase‑1
 * pending changes exist. Sync stays muted offline or while a run is in flight.
 */
export function DashboardConnectivityBar({
  pendingSync,
  onSynced,
}: DashboardConnectivityBarProps) {
  const [online, setOnline] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const update = () =>
      setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const hasChanges = pendingSync > 0;
  const canSync = online && hasChanges && !syncing;

  async function handleSync() {
    if (!canSync) return;
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const res = await syncNow();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const remaining = res.data.synchronization.pending_count;
      onSynced?.(remaining);
      setMessage(
        res.data.failed > 0
          ? `Synced with ${res.data.failed} failure(s). ${res.data.processed} processed.`
          : `Sync complete. ${res.data.processed} change(s) processed.`,
      );
    } catch {
      setError("Sync failed unexpectedly.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm animate-[fadeInUp_0.4s_ease-out]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${
              online
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            <Icon
              icon={online ? Wifi01Icon : WifiDisconnected01Icon}
              size={14}
            />
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                online ? "bg-emerald-500" : "bg-slate-400"
              }`}
              aria-hidden
            />
            {online ? "Online" : "Offline"}
          </span>

          {hasChanges ? (
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">
                {pendingSync}
              </span>{" "}
              change{pendingSync === 1 ? "" : "s"} waiting to sync
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              All caught up — nothing to sync
            </p>
          )}
        </div>

        {hasChanges ? (
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={!canSync}
            title={
              !online
                ? "Connect to the internet to sync"
                : syncing
                  ? "Sync in progress"
                  : "Sync pending changes"
            }
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-(--sofia-primary) px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? (
              <>
                <span
                  className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden
                />
                Syncing…
              </>
            ) : (
              "Sync now"
            )}
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {message && !error ? (
        <p className="mt-2 text-sm text-emerald-700">{message}</p>
      ) : null}
      {!online && hasChanges ? (
        <p className="mt-2 text-xs text-slate-500">
          Changes stay queued locally until you are online again.
        </p>
      ) : null}
    </div>
  );
}
