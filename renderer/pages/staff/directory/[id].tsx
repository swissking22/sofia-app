import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  PageAlert,
  SecondaryButton,
  StatusBadge,
} from "../../../components/staff/ui";
import {
  JOB_ROLE_LABELS,
  fetchStaff,
  type StaffDto,
} from "../../../lib/staff-mgmt";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-slate-100 py-2.5 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 font-medium text-slate-800">{value || "—"}</dd>
    </div>
  );
}

export default function StaffDirectoryDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [staff, setStaff] = React.useState<StaffDto | null>(null);

  React.useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoading(true);
      const res = await fetchStaff(id);
      if (res.ok) setStaff(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <AppShell
        title="Staff"
        breadcrumb={["Staff Management", "Staff Directory"]}
        heading="Staff"
      >
        <p className="text-sm text-slate-500">Loading…</p>
      </AppShell>
    );
  }

  if (!staff) {
    return (
      <AppShell
        title="Staff"
        breadcrumb={["Staff Management", "Staff Directory"]}
        heading="Staff not found"
      >
        <PageAlert tone="error">{error || "Staff not found."}</PageAlert>
        <SecondaryButton href="/staff/directory" className="mt-4">
          Back to directory
        </SecondaryButton>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={staff.full_name}
      breadcrumb={["Staff Management", "Staff Directory", staff.full_name]}
      heading={staff.full_name}
      subtitle={`${staff.employee_code || "No ID"} · ${
        staff.job_role ? JOB_ROLE_LABELS[staff.job_role] : staff.staff_type
      }`}
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

      <div className="mb-4">
        <StatusBadge status={staff.status} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Personal
          </h2>
          <dl>
            <InfoRow label="Full name" value={staff.full_name} />
            <InfoRow label="Gender" value={staff.gender} />
            <InfoRow label="Address" value={staff.address} />
            <InfoRow label="Joining date" value={staff.joining_date} />
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Role & department
          </h2>
          <dl>
            <InfoRow
              label="Staff type"
              value={
                staff.staff_type === "teaching"
                  ? "Teaching"
                  : "Administrative"
              }
            />
            <InfoRow
              label="Job role"
              value={
                staff.job_role ? JOB_ROLE_LABELS[staff.job_role] : null
              }
            />
            <InfoRow label="Department" value={staff.department_name} />
            <InfoRow label="Employee ID" value={staff.employee_code} />
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Contact
          </h2>
          <dl>
            <InfoRow label="Phone" value={staff.phone} />
            <InfoRow label="Email" value={staff.email} />
          </dl>
        </section>

        {(staff.subject_names.length > 0 ||
          staff.class_names.length > 0 ||
          staff.homeroom_class_names.length > 0) && (
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Assignments
            </h2>
            <dl>
              <InfoRow
                label="Teaches"
                value={
                  staff.teaching_assignments?.length
                    ? staff.teaching_assignments
                        .map((a) =>
                          [a.subject_name, a.class_name]
                            .filter(Boolean)
                            .join(" · "),
                        )
                        .join("; ")
                    : staff.subject_names.length
                      ? staff.subject_names.join(", ")
                      : null
                }
              />
              <InfoRow
                label="Homeroom"
                value={
                  staff.homeroom_class_names.length
                    ? staff.homeroom_class_names.join(", ")
                    : null
                }
              />
            </dl>
          </section>
        )}
      </div>

      <div className="mt-5">
        <SecondaryButton href="/staff/directory">
          Back to directory
        </SecondaryButton>
      </div>
    </AppShell>
  );
}
