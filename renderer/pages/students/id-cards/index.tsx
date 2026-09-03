import React from "react";
import Link from "next/link";
import { AppShell } from "../../../components/layout/AppShell";
import { IdCardModuleNav } from "../../../components/id-cards/ModuleNav";
import { PageAlert, PrimaryButton, SecondaryButton } from "../../../components/students/ui";
import { fetchIdCardDashboard, fetchIdCardMeta } from "../../../lib/student-id-cards";

export default function IdCardDashboardPage() {
  const [error, setError] = React.useState("");
  const [data, setData] = React.useState<Extract<Awaited<ReturnType<typeof fetchIdCardDashboard>>, { ok: true }>["data"] | null>(null);
  const [canManage, setCanManage] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      const meta = await fetchIdCardMeta();
      if (meta.ok) setCanManage(meta.data.can_manage);
      const res = await fetchIdCardDashboard();
      if (res.ok) setData(res.data);
      else setError(res.error);
    })();
  }, []);

  const kpis = [
    { label: "Active students", value: data?.active_students ?? "—" },
    { label: "Cards issued", value: data?.cards_issued ?? "—" },
    { label: "Pending", value: data?.pending ?? "—" },
    { label: "Expiring soon", value: data?.expiring_soon ?? "—" },
    { label: "Expired", value: data?.expired ?? "—" },
    { label: "Templates", value: data?.templates ?? "—" },
  ];

  return (
    <AppShell
      title="ID Cards"
      breadcrumb={["Student Management", "ID Cards"]}
      heading="ID Cards"
      subtitle="Design templates once, then generate cards for every student from live Sofia records — fully offline."
    >
      <IdCardModuleNav />
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{k.value}</p>
          </div>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {canManage ? (
          <Link href="/students/id-cards/templates/new">
            <PrimaryButton>Create template</PrimaryButton>
          </Link>
        ) : null}
        <Link href="/students/id-cards/generate">
          <SecondaryButton>Generate cards</SecondaryButton>
        </Link>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Recent generation jobs</h2>
        {!data?.recent_jobs.length ? (
          <p className="mt-3 text-sm text-slate-500">No cards generated yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {data.recent_jobs.map((job) => (
              <li key={job.id} className="flex items-start justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-800">
                    {job.job_number} · {job.successful}/{job.total} cards · {job.template_name || "Template"}
                  </p>
                  <p className="text-slate-500">
                    {job.created_by_email || "Staff"} · {new Date(job.created_at).toLocaleString()}
                  </p>
                </div>
                <span className="capitalize text-slate-500">{job.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
