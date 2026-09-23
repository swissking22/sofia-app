import React from "react";
import Link from "next/link";
import { AppShell } from "../../components/layout/AppShell";
import { PageAlert } from "../../components/students/ui";
import { formatDisplayDateTime } from "../../lib/date-format";
import { fetchAdminOverview } from "../../lib/system-admin";

export default function SystemAdminOverviewPage() {
  const [error, setError] = React.useState("");
  const [data, setData] = React.useState<Record<string, unknown> | null>(null);

  React.useEffect(() => {
    void fetchAdminOverview().then((res) => {
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
  }, []);

  const users = (data?.users ?? {}) as { active?: number; inactive?: number };
  const health = (data?.health ?? {}) as Record<string, string>;

  return (
    <AppShell
      title="System Administration"
      breadcrumb={["System Administration"]}
      heading="System Administration"
      subtitle="Users, security, audit, backup, and school-wide settings."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Active users" value={String(users.active ?? "—")} href="/administration/users" />
        <Card label="Audit events today" value={String(data?.audit_today ?? "—")} href="/administration/audit-logs" />
        <Card
          label="Last backup"
          value={fmt(data?.last_backup_at as string)}
          href="/administration/backup-sync"
        />
        <Card
          label="Sync"
          value={String(health.sync ?? "—")}
          href="/administration/backup-sync"
        />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">System health</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Row k="Database" v={health.database} />
          <Row k="Storage" v={health.storage} />
          <Row k="Sync" v={health.sync} />
          <Row k="Version" v={health.version} />
          <Row k="Timezone" v={health.timezone} />
        </dl>
      </div>
    </AppShell>
  );
}

function fmt(iso?: string | null) {
  return formatDisplayDateTime(iso, "Never");
}

function Card({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-4 hover:border-(--sofia-primary)"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </Link>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1">
      <dt className="text-slate-500">{k}</dt>
      <dd className="capitalize font-medium text-slate-800">{v || "—"}</dd>
    </div>
  );
}
