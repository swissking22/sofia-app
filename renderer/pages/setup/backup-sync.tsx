import React from "react";
import { useRouter } from "next/router";
import {
  FormField,
  FormSection,
  FormSelect,
  SetupFooter,
} from "../../components/setup";
import {
  SetupShell,
  useSetupProgress,
} from "../../components/setup/SetupShell";
import {
  BACKUP_FREQUENCY_OPTIONS,
  fetchBackupSyncSetup,
  formatSyncTime,
  pickBackupLocation,
  saveBackupSyncSetup,
  syncNow,
  testCloudConnection,
  type BackupFrequency,
  type BackupSyncSetup,
} from "../../lib/backup-sync";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
} from "../../lib/setup";

function StatusPill({ status }: { status: "connected" | "disconnected" }) {
  const connected = status === "connected";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        connected
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "bg-emerald-500" : "bg-slate-400"
        }`}
      />
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

export default function BackupSyncSetupPage() {
  return (
    <SetupShell stepId="backup-sync" aside={<BackupSyncAside />}>
      <BackupSyncSetupForm />
    </SetupShell>
  );
}

function BackupSyncAside() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Controls</h3>
      <p className="mt-1 text-xs text-slate-500">
        Manages data protection and synchronization for this school.
      </p>
      <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Local SQLite database
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Cloud sync queue
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Automatic backups
        </li>
      </ul>
      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
        Sync processes local change queue items. Full cloud sync ships in a
        later release; Test Connection verifies readiness offline-first.
      </p>
    </div>
  );
}

function BackupSyncSetupForm() {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [draftSaving, setDraftSaving] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [setup, setSetup] = React.useState<BackupSyncSetup | null>(null);
  const [automaticBackup, setAutomaticBackup] = React.useState(true);
  const [frequency, setFrequency] = React.useState<BackupFrequency>("daily");
  const [backupLocation, setBackupLocation] = React.useState("");

  const applyData = React.useCallback((data: BackupSyncSetup) => {
    setSetup(data);
    setAutomaticBackup(data.backup.automatic_backup);
    setFrequency(data.backup.backup_frequency);
    setBackupLocation(data.backup.backup_location);
  }, []);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchBackupSyncSetup();
      if (res.ok) applyData(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, [applyData]);

  function buildInput() {
    return {
      automatic_backup: automaticBackup,
      backup_frequency: frequency,
      backup_location: backupLocation.trim(),
    };
  }

  async function persist(): Promise<boolean> {
    if (!backupLocation.trim()) {
      setError("Choose a backup storage location.");
      return false;
    }
    const res = await saveBackupSyncSetup(buildInput());
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    applyData(res.data);
    return true;
  }

  async function handleSaveOnly() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persist())) return;
      setSuccess("Backup settings saved.");
    } catch {
      setError("Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    setDraftSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persist())) return;
      const draft = await saveSetupDraft("backup-sync");
      if (!draft.ok) {
        setError(draft.error);
        return;
      }
      await refreshProgress();
      setSuccess("Draft saved.");
    } catch {
      setError("Could not save draft.");
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleContinue() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persist())) return;
      const done = await completeSetupStep("backup-sync");
      if (!done.ok) {
        setError(done.error);
        return;
      }
      await refreshProgress();
      const next = getNextSetupHref("backup-sync");
      await router.push(next ?? "/setup");
    } catch {
      setError("Could not complete this step.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setError("");
    setSuccess("");
    try {
      await persist();
      const res = await syncNow();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      applyData(res.data);
      setSuccess(
        res.data.failed > 0
          ? `Sync finished with ${res.data.failed} failure(s). Processed ${res.data.processed}.`
          : `Sync complete. Processed ${res.data.processed} change(s).`,
      );
    } catch {
      setError("Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setError("");
    setSuccess("");
    try {
      const res = await testCloudConnection();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      applyData(res.data);
      setSuccess("Cloud connection test succeeded.");
    } catch {
      setError("Connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function handlePickLocation() {
    const res = await pickBackupLocation();
    if (res.ok) setBackupLocation(res.data.path);
  }

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        Loading backup & sync…
      </p>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-4">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <p className="py-12 text-center text-sm text-slate-500">
            Unable to load settings.
          </p>
        )}
      </div>
    );
  }

  const sync = setup.synchronization;

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <FormSection
        title="Database Status"
        description="Connection state for local and cloud databases."
        layout="stack"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Local Database
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <StatusPill status={setup.localDatabase.status} />
            </div>
            <p
              className="mt-2 truncate font-mono text-[11px] text-slate-400"
              title={setup.localDatabase.path}
            >
              {setup.localDatabase.path}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Cloud Database
            </p>
            <div className="mt-2">
              <StatusPill status={setup.cloudDatabase.status} />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Last tested: {formatSyncTime(setup.cloudDatabase.last_test_at)}
            </p>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Synchronization"
        description="School identity and last sync activity."
        layout="stack"
      >
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3">
            <dt className="text-xs font-medium text-slate-500">
              School Sync ID
            </dt>
            <dd className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">
              {sync.school_sync_id}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3">
            <dt className="text-xs font-medium text-slate-500">
              Last Sync Time
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {formatSyncTime(sync.last_sync_at)}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3">
            <dt className="text-xs font-medium text-slate-500">Sync Status</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {sync.sync_status_label}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSyncNow()}
            disabled={syncing || testing}
            className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
          <button
            type="button"
            onClick={() => void handleTestConnection()}
            disabled={testing || syncing}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-(--sofia-primary) hover:text-(--sofia-primary) disabled:opacity-60"
          >
            {testing ? "Testing…" : "Test Connection"}
          </button>
        </div>
      </FormSection>

      <FormSection
        title="Backup"
        description="Local snapshot settings for data protection."
        layout="stack"
      >
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
          <span>
            <span className="block text-sm font-semibold text-slate-900">
              Automatic Backup
            </span>
            <span className="text-xs text-slate-500">
              Create a local database copy when you sync (and on schedule
              later).
            </span>
          </span>
          <input
            type="checkbox"
            checked={automaticBackup}
            onChange={(e) => setAutomaticBackup(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-(--sofia-primary)"
          />
        </label>

        <FormSelect
          label="Backup frequency"
          options={BACKUP_FREQUENCY_OPTIONS.map((o) => o.label)}
          value={
            BACKUP_FREQUENCY_OPTIONS.find((o) => o.key === frequency)?.label ??
            ""
          }
          onChange={(e) => {
            const match = BACKUP_FREQUENCY_OPTIONS.find(
              (o) => o.label === e.target.value,
            );
            if (match) setFrequency(match.key);
          }}
          placeholder="Select frequency"
        />

        <div>
          <FormField
            label="Storage location"
            value={backupLocation}
            onChange={(e) => setBackupLocation(e.target.value)}
            placeholder="Folder path for backups"
            fullWidth
            hint="Local folder where Sofia stores database snapshots."
          />
          <button
            type="button"
            onClick={() => void handlePickLocation()}
            className="mt-1 cursor-pointer text-sm font-medium text-(--sofia-primary) hover:underline"
          >
            Choose folder…
          </button>
        </div>
      </FormSection>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSaveOnly()}
          disabled={saving}
          className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-(--sofia-primary) hover:text-(--sofia-primary) disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      <SetupFooter
        stepId="backup-sync"
        onSaveDraft={() => void handleSaveDraft()}
        onContinue={() => void handleContinue()}
        saving={saving}
        draftSaving={draftSaving}
      />
    </div>
  );
}
