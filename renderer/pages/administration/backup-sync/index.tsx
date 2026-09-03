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
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import { TabBar as DocTabs } from "../../../components/documents/ui";
import {
  fetchBackups,
  fetchSyncDashboard,
  resolveAdminConflict,
  restoreBackup,
  retryAdminSync,
  runAdminSync,
  runBackupNow,
} from "../../../lib/system-admin";
import { formatSyncTime } from "../../../lib/backup-sync";

export default function AdminBackupSyncPage() {
  const [tab, setTab] = React.useState<"backup" | "sync">("backup");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [backups, setBackups] = React.useState<Array<Record<string, unknown>>>(
    [],
  );
  const [sync, setSync] = React.useState<Record<string, unknown> | null>(null);
  const [restoreId, setRestoreId] = React.useState<string | null>(null);
  const [phrase, setPhrase] = React.useState("");

  const load = React.useCallback(async () => {
    const [b, s] = await Promise.all([fetchBackups(1), fetchSyncDashboard()]);
    if (b.ok) setBackups(b.data.backups);
    else setError(b.error);
    if (s.ok) setSync(s.data);
    else setError(s.error);
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

  return (
    <AppShell
      title="Backup & Sync"
      breadcrumb={["System Administration", "Backup & Sync"]}
      heading="Backup & Sync"
      subtitle="Protect the local SQLite database and push pending changes when a connection is available."
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
          <div className="mb-4 flex gap-2">
            <PrimaryButton
              onClick={() =>
                void runBackupNow().then((r) => {
                  if (r.ok) {
                    setSuccess("Backup created.");
                    void load();
                  } else setError(r.error);
                })
              }
            >
              Backup now
            </PrimaryButton>
          </div>
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
                        onClick={() => setRestoreId(String(b.id))}
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
          <div className="mb-4 flex gap-2">
            <PrimaryButton
              onClick={() =>
                void runAdminSync().then((r) => {
                  if (r.ok) {
                    setSuccess("Sync finished.");
                    void load();
                  } else setError(r.error);
                })
              }
            >
              Sync now
            </PrimaryButton>
            <SecondaryButton
              onClick={() =>
                void retryAdminSync().then((r) => {
                  if (r.ok) {
                    setSuccess(`Queued ${r.data.retried} failed item(s).`);
                    void load();
                  }
                })
              }
            >
              Retry failed
            </SecondaryButton>
          </div>
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
        open={Boolean(restoreId)}
        title="Restore this backup?"
        onClose={() => {
          setRestoreId(null);
          setPhrase("");
        }}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton
              onClick={() => {
                setRestoreId(null);
                setPhrase("");
              }}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              className="bg-red-600"
              onClick={() => {
                if (!restoreId) return;
                void restoreBackup(restoreId, phrase).then((r) => {
                  if (r.ok) {
                    setSuccess(
                      r.data.warning || "Restart Sofia to finish restore.",
                    );
                    setRestoreId(null);
                    setPhrase("");
                  } else setError(r.error);
                });
              }}
            >
              Queue restore
            </PrimaryButton>
          </div>
        }
      >
        <PageAlert tone="warning">
          Restoring this backup will replace the current local database state. A
          safety backup is created first. Sofia must restart to apply the file.
        </PageAlert>
        <input
          className={fieldClass}
          placeholder="Type RESTORE to confirm"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
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
