import React from "react";
import { ReloadIcon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  FormModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StudentTable,
  fieldClass,
} from "../../../components/students/ui";
import {
  TableActionGroup,
  TableIconButton,
} from "../../../components/ui/TableActions";
import { TabBar as DocTabs } from "../../../components/documents/ui";
import {
  fetchBackups,
  fetchSyncDashboard,
  pickRestoreBackupFile,
  resolveAdminConflict,
  restoreBackup,
  restoreBackupFromFile,
  retryAdminSync,
  runAdminSync,
  runBackupNow,
} from "../../../lib/system-admin";
import { listPreUpdateBackups } from "../../../lib/updater";
import { formatSyncTime } from "../../../lib/backup-sync";

type RestoreTarget =
  | { kind: "record"; id: string }
  | { kind: "file"; path: string; fileName: string };

export default function AdminBackupSyncPage() {
  const [tab, setTab] = React.useState<"backup" | "sync">("backup");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [backups, setBackups] = React.useState<Array<Record<string, unknown>>>(
    [],
  );
  const [preUpdate, setPreUpdate] = React.useState<
    Array<{
      backupVersion: string;
      targetVersion: string;
      createdAt: string;
      verified: boolean;
      fileSize: number;
    }>
  >([]);
  const [sync, setSync] = React.useState<Record<string, unknown> | null>(null);
  const [restoreTarget, setRestoreTarget] =
    React.useState<RestoreTarget | null>(null);
  const [phrase, setPhrase] = React.useState("");
  const [restoring, setRestoring] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);

  const load = React.useCallback(async () => {
    const [b, s, p] = await Promise.all([
      fetchBackups(1),
      fetchSyncDashboard(),
      listPreUpdateBackups(),
    ]);
    if (b.ok) setBackups(b.data.backups);
    else setError(b.error);
    if (s.ok) setSync(s.data);
    else setError(s.error);
    if (p.ok) setPreUpdate(p.data);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const dash = (sync?.dashboard ?? {}) as Record<string, number>;
  const setup = (sync?.setup ?? null) as {
    synchronization?: Record<string, unknown>;
    backup?: Record<string, unknown>;
  } | null;
  const runs = ((sync?.runs as { runs?: Array<Record<string, unknown>> })
    ?.runs ?? []) as Array<Record<string, unknown>>;
  const conflicts = (sync?.conflicts ?? []) as Array<Record<string, unknown>>;
  const pendingCount = Number(dash.pending ?? 0);
  const failedCount = Number(dash.failed ?? 0);
  const byTable = (Array.isArray(dash.by_table) ? dash.by_table : []) as Array<{
    table_name: string;
    pending: number;
    failed: number;
    synced: number;
  }>;
  const syncBusy = syncing || retrying;

  async function handleSyncNow() {
    if (syncBusy) return;
    setSyncing(true);
    setError("");
    setSuccess("");
    try {
      const r = await runAdminSync();
      if (r.ok) {
        const data = r.data as {
          successful?: number;
          processed?: number;
          failed?: number;
          message?: string;
          push?: { hasMore?: boolean; successful?: number };
        };
        const pushed = Number(data.push?.successful ?? data.successful ?? 0);
        const failed = Number(data.failed ?? 0);
        const hasMore = Boolean(data.push?.hasMore || data.message);
        if (data.message) {
          setSuccess(data.message);
        } else if (hasMore) {
          setSuccess(
            `Synced ${pushed} item(s). More remain — click Sync Now again.`,
          );
        } else if (failed > 0) {
          setSuccess(
            `Sync finished: ${pushed} pushed, ${failed} failed. Use Retry failed if needed.`,
          );
        } else {
          setSuccess(
            pushed > 0
              ? `Sync finished — pushed ${pushed} pending item(s) and pulled latest.`
              : "Sync finished (pulled latest from cloud).",
          );
        }
        await load();
      } else {
        setError(r.error);
        await load();
      }
    } catch {
      setError("Sync failed unexpectedly.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleRetryFailed() {
    if (failedCount <= 0 || syncBusy) return;
    setRetrying(true);
    setError("");
    setSuccess("");
    try {
      const r = await retryAdminSync();
      if (r.ok) {
        setSuccess(`Queued ${r.data.retried} failed item(s).`);
        await load();
      } else {
        setError(r.error);
      }
    } catch {
      setError("Could not retry failed items.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <AppShell
      title="Backup & Sync"
      breadcrumb={["System Administration", "Backup & Sync"]}
      heading="Backup & Sync"
      subtitle="Protect the local SQLite database and sync with other school desks when online."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}
      <DocTabs
        tabs={[
          { key: "backup", label: "Backup" },
          { key: "sync", label: "Sync" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "backup" ? (
        <>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <h3 className="font-semibold text-slate-900">Backup & Recovery</h3>
            <p className="mt-1 text-slate-500">
              Automatic pre-update backups are created and verified before every
              Windows app update. Manual backups use the same SQLite-safe
              snapshot API.
            </p>
            <p className="mt-2 text-slate-600">
              Last backup:{" "}
              {backups[0]
                ? String(backups[0].created_at).replace("T", " ").slice(0, 19)
                : preUpdate[0]
                  ? String(preUpdate[0].createdAt)
                      .replace("T", " ")
                      .slice(0, 19)
                  : "Never"}
            </p>
            <p className="text-slate-600">
              Automatic backups: Enabled (before each update + optional
              scheduled local snapshots)
            </p>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <PrimaryButton
              onClick={() =>
                void runBackupNow().then((r) => {
                  if (r.ok) {
                    setSuccess("Backup created and verified.");
                    void load();
                  } else setError(r.error);
                })
              }
            >
              Backup Now
            </PrimaryButton>
            <SecondaryButton
              disabled={restoring}
              onClick={() => {
                setError("");
                setSuccess("");
                void pickRestoreBackupFile().then((r) => {
                  if (!r.ok) {
                    if (r.error !== "No file selected.") setError(r.error);
                    return;
                  }
                  setRestoreTarget({
                    kind: "file",
                    path: r.data.path,
                    fileName: r.data.fileName,
                  });
                  setPhrase("");
                });
              }}
            >
              Restore from file…
            </SecondaryButton>
          </div>
          {preUpdate.length > 0 ? (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Pre-update recovery points
              </h3>
              <StudentTable
                columns={["Created", "From", "Target", "Size", "Verified"]}
              >
                {preUpdate.map((b) => (
                  <tr key={`${b.createdAt}-${b.backupVersion}`}>
                    <td className="px-4 py-3 text-xs">
                      {b.createdAt.replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="px-4 py-3">{b.backupVersion}</td>
                    <td className="px-4 py-3">{b.targetVersion}</td>
                    <td className="px-4 py-3 text-xs">
                      {Number(b.fileSize || 0).toLocaleString()} bytes
                    </td>
                    <td className="px-4 py-3">{b.verified ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </StudentTable>
            </div>
          ) : null}
          <StudentTable columns={["Date", "Type", "Size", "Status", "Actions"]}>
            {backups.length === 0 ? (
              <EmptyRow colSpan={5} message="No backups recorded yet." />
            ) : (
              backups.map((b) => (
                <tr key={String(b.id)}>
                  <td className="px-4 py-3 text-xs">
                    {String(b.created_at).replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="px-4 py-3">{String(b.backup_type)}</td>
                  <td className="px-4 py-3 text-xs">
                    {Number(b.file_size || 0).toLocaleString()} bytes
                  </td>
                  <td className="px-4 py-3">{String(b.status)}</td>
                  <td className="px-4 py-3">
                    <TableActionGroup>
                      <TableIconButton
                        icon={ReloadIcon}
                        label="Restore"
                        tone="danger"
                        onClick={() => {
                          setRestoreTarget({
                            kind: "record",
                            id: String(b.id),
                          });
                          setPhrase("");
                        }}
                      />
                    </TableActionGroup>
                  </td>
                </tr>
              ))
            )}
          </StudentTable>
        </>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Stat
              label="Connection"
              value={setup?.synchronization ? "See last test" : "—"}
            />
            <Stat label="Pending" value={String(dash.pending ?? 0)} />
            <Stat label="Synced" value={String(dash.synced ?? 0)} />
            <Stat label="Failed" value={String(dash.failed ?? 0)} />
          </div>
          <p className="mb-3 text-sm text-slate-500">
            Last sync:{" "}
            {formatSyncTime(
              (setup?.synchronization?.last_sync_at as string) || null,
            )}
          </p>
          {syncing ? (
            <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600">
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-(--sofia-primary)"
                aria-hidden
              />
              Sync in progress…
            </p>
          ) : null}
          <div className="mb-4 flex gap-2">
            <PrimaryButton
              disabled={syncBusy}
              onClick={() => void handleSyncNow()}
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
            </PrimaryButton>
            <SecondaryButton
              disabled={failedCount <= 0 || syncBusy}
              onClick={() => void handleRetryFailed()}
            >
              {retrying ? "Retrying…" : "Retry failed"}
            </SecondaryButton>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            Sync Now drains the pending outbox in batches (prioritizing staff,
            assignments, classes, and timetable before large finance backlogs),
            then pulls the latest from cloud. A safety cap stops around 10 000
            items — click Sync Now again if pending remains. Branding logos and
            student photos download when Storage has them.
          </p>
          {byTable.length > 0 ? (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold">Queue by table</h3>
              <StudentTable columns={["Table", "Pending", "Failed", "Synced"]}>
                {byTable.map((row) => (
                  <tr key={row.table_name}>
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.table_name}
                    </td>
                    <td className="px-4 py-3">{row.pending}</td>
                    <td className="px-4 py-3">{row.failed}</td>
                    <td className="px-4 py-3">{row.synced}</td>
                  </tr>
                ))}
              </StudentTable>
            </div>
          ) : null}
          <h3 className="mb-2 text-sm font-semibold">Sync history</h3>
          <StudentTable
            columns={[
              "When",
              "Processed",
              "Failed",
              "Conflicts",
              "Duration",
              "Status",
            ]}
          >
            {runs.length === 0 ? (
              <EmptyRow colSpan={6} message="No sync runs yet." />
            ) : (
              runs.map((r) => (
                <tr key={String(r.id)}>
                  <td className="px-4 py-3 text-xs">
                    {String(r.created_at).slice(0, 19)}
                  </td>
                  <td className="px-4 py-3">{String(r.processed)}</td>
                  <td className="px-4 py-3">{String(r.failed)}</td>
                  <td className="px-4 py-3">{String(r.conflicts)}</td>
                  <td className="px-4 py-3">{String(r.duration_ms)} ms</td>
                  <td className="px-4 py-3">{String(r.status)}</td>
                </tr>
              ))
            )}
          </StudentTable>
          {conflicts.length ? (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold">Conflicts</h3>
              {conflicts.map((c) => (
                <div
                  key={String(c.id)}
                  className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
                >
                  <p>
                    {String(c.table_name)} · {String(c.record_id)}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <SecondaryButton
                      onClick={() =>
                        void resolveAdminConflict(String(c.id), "local").then(
                          () => load(),
                        )
                      }
                    >
                      Keep local
                    </SecondaryButton>
                    <SecondaryButton
                      onClick={() =>
                        void resolveAdminConflict(String(c.id), "remote").then(
                          () => load(),
                        )
                      }
                    >
                      Keep remote
                    </SecondaryButton>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              No open conflicts. Sofia never overwrites silently.
            </p>
          )}
        </>
      )}

      <FormModal
        open={Boolean(restoreTarget)}
        title="Restore Backup?"
        onClose={() => {
          if (restoring) return;
          setRestoreTarget(null);
          setPhrase("");
        }}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton
              disabled={restoring}
              onClick={() => {
                setRestoreTarget(null);
                setPhrase("");
              }}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              className="bg-red-600"
              disabled={restoring}
              onClick={() => {
                if (!restoreTarget) return;
                setRestoring(true);
                setError("");
                const request =
                  restoreTarget.kind === "record"
                    ? restoreBackup(restoreTarget.id, phrase)
                    : restoreBackupFromFile(restoreTarget.path, phrase);
                void request
                  .then((r) => {
                    if (r.ok) {
                      setSuccess(
                        r.data.warning || "Restart Sofia to finish restore.",
                      );
                      setRestoreTarget(null);
                      setPhrase("");
                    } else setError(r.error);
                  })
                  .finally(() => setRestoring(false));
              }}
            >
              {restoring ? "Preparing…" : "Continue"}
            </PrimaryButton>
          </div>
        }
      >
        <PageAlert tone="warning">
          This will replace the current Sofia database with the selected backup.
          A safety backup of the current database will be created first. Restart
          Sofia after confirming to finish the restore.
        </PageAlert>
        {restoreTarget?.kind === "file" ? (
          <p className="mb-3 text-sm text-slate-600">
            File:{" "}
            <span className="font-medium text-slate-900">
              {restoreTarget.fileName}
            </span>
          </p>
        ) : null}
        <input
          className={fieldClass}
          placeholder="Type RESTORE to confirm"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          disabled={restoring}
        />
      </FormModal>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
