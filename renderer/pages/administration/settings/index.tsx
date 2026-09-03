import React from "react";
import Link from "next/link";
import { AppShell } from "../../../components/layout/AppShell";
import {
  PageAlert,
  PrimaryButton,
  fieldClass,
} from "../../../components/students/ui";
import { TabBar } from "../../../components/documents/ui";
import {
  fetchSystemSettings,
  saveSystemSettings,
} from "../../../lib/system-admin";

export default function AdminSettingsPage() {
  const [tab, setTab] = React.useState<"general" | "security" | "backup">(
    "general",
  );
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [data, setData] = React.useState<Record<string, unknown> | null>(null);
  const [timeout, setTimeoutMin] = React.useState(480);
  const [minLen, setMinLen] = React.useState(8);
  const [upper, setUpper] = React.useState(true);
  const [digit, setDigit] = React.useState(true);
  const [lockout, setLockout] = React.useState(5);
  const [lockMin, setLockMin] = React.useState(15);
  const [tz, setTz] = React.useState("Africa/Douala");
  const [retention, setRetention] = React.useState(30);

  React.useEffect(() => {
    void fetchSystemSettings().then((res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setData(res.data);
      const sys = (res.data.system ?? {}) as Record<string, unknown>;
      setTimeoutMin(Number(sys.session_timeout_minutes) || 480);
      setMinLen(Number(sys.password_min_length) || 8);
      setUpper(sys.password_require_upper !== 0);
      setDigit(sys.password_require_digit !== 0);
      setLockout(Number(sys.lockout_attempts) || 5);
      setLockMin(Number(sys.lockout_minutes) || 15);
      setTz(String(sys.timezone || "Africa/Douala"));
      setRetention(Number(sys.backup_retention_days) || 30);
    });
  }, []);

  const school = (data?.school ?? {}) as Record<string, string>;
  const finance = (data?.finance ?? {}) as Record<string, string>;
  const backup = (data?.backup ?? {}) as Record<string, unknown>;

  return (
    <AppShell
      title="Settings"
      breadcrumb={["System Administration", "Settings"]}
      heading="Settings"
      subtitle="Only options Sofia already supports. School profile, academics, and finance still have their own screens."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}
      <TabBar
        tabs={[
          { key: "general", label: "General / School" },
          { key: "security", label: "Users & Security" },
          { key: "backup", label: "Backup & Sync" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "general" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
          <p>
            <strong>School:</strong> {school.name}
          </p>
          <p>
            <strong>Short code:</strong> {school.short_code}
          </p>
          <p>
            <strong>Email:</strong> {school.email}
          </p>
          <p>
            <strong>Currency:</strong> {finance.currency || "XAF"}
          </p>
          <p>
            <strong>Receipt prefix:</strong> {finance.receipt_prefix}
          </p>
          <p className="mt-3 text-slate-500">
            Edit identity on{" "}
            <Link className="text-(--sofia-primary)" href="/school/profile">
              School Profile
            </Link>
            , academics on{" "}
            <Link
              className="text-(--sofia-primary)"
              href="/school/academic-year"
            >
              Academic Year
            </Link>
            , documents on{" "}
            <Link
              className="text-(--sofia-primary)"
              href="/documents/receipt-templates"
            >
              Documents
            </Link>
            , finance on{" "}
            <Link
              className="text-(--sofia-primary)"
              href="/finance/fee-structure"
            >
              Finance
            </Link>
            .
          </p>
          <label className="mt-4 block text-xs text-slate-500">
            Timezone
            <input
              className={`${fieldClass} mt-1`}
              value={tz}
              onChange={(e) => setTz(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {tab === "security" ? (
        <div className="grid max-w-lg gap-3 rounded-xl border border-slate-200 bg-white p-5">
          <label className="text-xs text-slate-500">
            Session timeout (minutes)
            <input
              type="number"
              className={fieldClass}
              value={timeout}
              onChange={(e) => setTimeoutMin(Number(e.target.value))}
            />
          </label>
          <label className="text-xs text-slate-500">
            Minimum password length
            <input
              type="number"
              className={fieldClass}
              value={minLen}
              onChange={(e) => setMinLen(Number(e.target.value))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={upper}
              onChange={(e) => setUpper(e.target.checked)}
            />
            Require uppercase letter
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={digit}
              onChange={(e) => setDigit(e.target.checked)}
            />
            Require a digit
          </label>
          <label className="text-xs text-slate-500">
            Lockout after failed attempts
            <input
              type="number"
              className={fieldClass}
              value={lockout}
              onChange={(e) => setLockout(Number(e.target.value))}
            />
          </label>
          <label className="text-xs text-slate-500">
            Lockout duration (minutes)
            <input
              type="number"
              className={fieldClass}
              value={lockMin}
              onChange={(e) => setLockMin(Number(e.target.value))}
            />
          </label>
        </div>
      ) : null}

      {tab === "backup" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
          <p>Automatic backup: {backup.automatic_backup ? "On" : "Off"}</p>
          <p>Frequency: {String(backup.backup_frequency || "daily")}</p>
          <p>Location: {String(backup.backup_location || "—")}</p>
          <label className="mt-3 block text-xs text-slate-500">
            Retention (days)
            <input
              type="number"
              className={fieldClass}
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
            />
          </label>
          <p className="mt-2 text-slate-500">
            Change folder and frequency under Setup → Backup or use Backup &
            Sync in this module.
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        <PrimaryButton
          onClick={() =>
            void saveSystemSettings({
              timezone: tz,
              session_timeout_minutes: timeout,
              password_min_length: minLen,
              password_require_upper: upper,
              password_require_digit: digit,
              lockout_attempts: lockout,
              lockout_minutes: lockMin,
              backup_retention_days: retention,
            }).then((r) => {
              if (r.ok) setSuccess("Settings saved.");
              else setError(r.error);
            })
          }
        >
          Save settings
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
