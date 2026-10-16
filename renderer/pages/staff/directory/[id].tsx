import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  ConfirmModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  fieldClass,
} from "../../../components/staff/ui";
import {
  JOB_ROLE_LABELS,
  deleteStaff,
  fetchStaff,
  fetchStaffMeta,
  updateStaff,
  type StaffDto,
} from "../../../lib/staff-mgmt";
import { formatDisplayDate } from "../../../lib/date-format";

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
  const [busy, setBusy] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [staff, setStaff] = React.useState<StaffDto | null>(null);
  const [canManage, setCanManage] = React.useState(false);
  const [salaryInput, setSalaryInput] = React.useState("");

  const reload = React.useCallback(async () => {
    if (!id) return;
    const [metaRes, res] = await Promise.all([
      fetchStaffMeta(),
      fetchStaff(id),
    ]);
    if (metaRes.ok) setCanManage(metaRes.data.can_manage);
    if (res.ok) {
      setStaff(res.data);
      setSalaryInput(
        res.data.monthly_salary != null && res.data.monthly_salary > 0
          ? String(res.data.monthly_salary)
          : "",
      );
    } else setError(res.error);
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  async function saveSalary() {
    if (!staff || !canManage || busy) return;
    const amount = Number(salaryInput);
    if (!(amount > 0)) {
      setError("Enter a positive monthly salary.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await updateStaff({
        id: staff.id,
        monthly_salary: amount,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        "Monthly salary saved. It will be used for payslip generation.",
      );
      setStaff(res.data);
    } finally {
      setBusy(false);
    }
  }

  async function runDelete() {
    if (!staff || !canManage) return;
    setDeleting(true);
    setError("");
    try {
      const res = await deleteStaff(staff.id);
      if (!res.ok) {
        setError(res.error);
        setConfirmDelete(false);
        return;
      }
      await router.push("/staff/directory");
    } catch {
      setError("Could not delete staff member.");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

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
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={staff.status} />
        {staff.staff_type === "teaching" ? (
          <PrimaryButton href={`/staff/teachers/${staff.id}`}>
            {canManage ? "Edit teacher" : "View teacher"}
          </PrimaryButton>
        ) : null}
        <SecondaryButton href="/staff/directory">Back</SecondaryButton>
        {canManage ? (
          <button
            type="button"
            disabled={deleting || busy}
            onClick={() => setConfirmDelete(true)}
            className="cursor-pointer rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            Delete
          </button>
        ) : null}
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
            <InfoRow
              label="Joining date"
              value={formatDisplayDate(staff.joining_date)}
            />
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
                staff.staff_type === "teaching" ? "Teaching" : "Administrative"
              }
            />
            <InfoRow
              label="Job role"
              value={staff.job_role ? JOB_ROLE_LABELS[staff.job_role] : null}
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

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Compensation
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            Monthly salary feeds Finance → Payslips. When a payslip is marked
            paid, a Salaries expense is posted for budgeting.
          </p>
          {canManage ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-40 flex-1 text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  Monthly salary
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={fieldClass}
                  value={salaryInput}
                  onChange={(e) => setSalaryInput(e.target.value)}
                />
              </label>
              <PrimaryButton disabled={busy} onClick={() => void saveSalary()}>
                {busy ? "Saving…" : "Save salary"}
              </PrimaryButton>
            </div>
          ) : (
            <dl>
              <InfoRow
                label="Monthly salary"
                value={
                  staff.monthly_salary != null && staff.monthly_salary > 0
                    ? staff.monthly_salary.toLocaleString()
                    : null
                }
              />
            </dl>
          )}
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

      <ConfirmModal
        open={confirmDelete}
        title="Delete staff member?"
        description={`${staff.full_name} will be removed from the active roster.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void runDelete()}
      />
    </AppShell>
  );
}
