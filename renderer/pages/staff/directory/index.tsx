import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import {
  ActionDrawer,
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StaffTable,
  fieldClass,
  selectClass,
  useDebouncedValue,
} from "../../../components/staff/ui";
import { Icon } from "../../../components/ui/Icon";
import {
  JOB_ROLE_LABELS,
  createStaff,
  fetchDirectory,
  fetchStaffMeta,
  type StaffDto,
  type StaffJobRole,
  type StaffMeta,
  type StaffStatus,
  type StaffType,
} from "../../../lib/staff-mgmt";

export default function StaffDirectoryPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [staff, setStaff] = React.useState<StaffDto[]>([]);
  const [meta, setMeta] = React.useState<StaffMeta | null>(null);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = React.useState<StaffStatus | "all">("all");
  const [staffType, setStaffType] = React.useState<StaffType | "all">("all");
  const [jobRole, setJobRole] = React.useState<StaffJobRole | "all">("all");
  const [createOpen, setCreateOpen] = React.useState(false);

  const [fullName, setFullName] = React.useState("");
  const [employeeCode, setEmployeeCode] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [newJobRole, setNewJobRole] = React.useState<StaffJobRole>("support");
  const [joiningDate, setJoiningDate] = React.useState("");
  const [newStatus, setNewStatus] = React.useState<StaffStatus>("active");
  const [address, setAddress] = React.useState("");

  const load = React.useCallback(async () => {
    const [metaRes, listRes] = await Promise.all([
      fetchStaffMeta(),
      fetchDirectory({
        status,
        search: debouncedSearch || null,
        staffType,
        jobRole,
      }),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (listRes.ok) setStaff(listRes.data.staff);
    else setError(listRes.error);
    setLoading(false);
  }, [status, debouncedSearch, staffType, jobRole]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function resetCreateForm() {
    setFullName("");
    setEmployeeCode("");
    setEmail("");
    setPhone("");
    setDepartmentId("");
    setNewJobRole("support");
    setJoiningDate("");
    setNewStatus("active");
    setAddress("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await createStaff({
        full_name: fullName.trim(),
        employee_code: employeeCode.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        department_id: departmentId || null,
        job_role: newJobRole,
        joining_date: joiningDate || null,
        status: newStatus,
        address: address.trim() || null,
        staff_type: "administrative",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`${res.data.full_name} added to the directory.`);
      setCreateOpen(false);
      resetCreateForm();
      await load();
    } finally {
      setBusy(false);
    }
  }

  const canManage = meta?.can_manage ?? false;

  return (
    <AppShell
      title="Staff Directory"
      breadcrumb={["Staff Management", "Staff Directory"]}
      heading="Staff Directory"
      subtitle="All staff members — teaching and administrative."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={
          <>
            <FilterField label="Search" className="min-w-48 flex-1">
              <input
                className={`w-full ${selectClass}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or employee ID"
              />
            </FilterField>
            <FilterField label="Status">
              <select
                className={selectClass}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as StaffStatus | "all")
                }
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FilterField>
            <FilterField label="Staff type">
              <select
                className={selectClass}
                value={staffType}
                onChange={(e) =>
                  setStaffType(e.target.value as StaffType | "all")
                }
              >
                <option value="all">All types</option>
                <option value="teaching">Teaching</option>
                <option value="administrative">Administrative</option>
              </select>
            </FilterField>
            <FilterField label="Job role">
              <select
                className={selectClass}
                value={jobRole}
                onChange={(e) =>
                  setJobRole(e.target.value as StaffJobRole | "all")
                }
              >
                <option value="all">All roles</option>
                {(
                  Object.keys(JOB_ROLE_LABELS) as StaffJobRole[]
                ).map((role) => (
                  <option key={role} value={role}>
                    {JOB_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </FilterField>
          </>
        }
        actions={
          canManage ? (
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Icon icon={Add01Icon} size={16} />
              Add Staff
            </PrimaryButton>
          ) : null
        }
      />

      <StaffTable
        loading={loading}
        columns={["Name", "Role", "Department", "Contact", "Status", ""]}
      >
        {staff.length === 0 ? (
          <EmptyRow colSpan={6}>No staff match these filters.</EmptyRow>
        ) : (
          staff.map((s) => (
            <tr
              key={s.id}
              className="cursor-pointer hover:bg-slate-50/80"
              onClick={() => void router.push(`/staff/directory/${s.id}`)}
            >
              <td className="px-4 py-3">
                <Link
                  href={`/staff/directory/${s.id}`}
                  className="font-medium text-(--sofia-primary) hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {s.full_name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {s.job_role ? JOB_ROLE_LABELS[s.job_role] : s.staff_type}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {s.department_name || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {s.phone || s.email || "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={s.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/staff/directory/${s.id}`}
                  className="text-sm font-semibold text-(--sofia-primary) hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  View
                </Link>
              </td>
            </tr>
          ))
        )}
      </StaffTable>

      <ActionDrawer
        open={createOpen}
        title="Add staff"
        subtitle="Create a non-teaching staff member"
        onClose={() => {
          setCreateOpen(false);
          resetCreateForm();
        }}
        footer={
          <>
            <PrimaryButton
              className="w-full"
              disabled={busy}
              onClick={() => {
                const form = document.getElementById(
                  "add-staff-form",
                ) as HTMLFormElement | null;
                form?.requestSubmit();
              }}
            >
              {busy ? "Saving…" : "Create staff"}
            </PrimaryButton>
            <SecondaryButton
              className="w-full"
              onClick={() => {
                setCreateOpen(false);
                resetCreateForm();
              }}
            >
              Cancel
            </SecondaryButton>
          </>
        }
      >
        <form
          id="add-staff-form"
          onSubmit={(e) => void handleCreate(e)}
          className="space-y-3"
        >
          <FormSection title="Details" description="Administrative staff only.">
            <FormField
              label="Full name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              fullWidth
            />
            <FormField
              label="Employee ID"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              placeholder="Optional"
            />
            <FormField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <FormField
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Department
              </span>
              <select
                className={fieldClass}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">Select…</option>
                {(meta?.departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Job role
              </span>
              <select
                className={fieldClass}
                value={newJobRole}
                onChange={(e) =>
                  setNewJobRole(e.target.value as StaffJobRole)
                }
              >
                <option value="support">Support</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <FormField
              label="Joining date"
              type="date"
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
            />
            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Status
              </span>
              <select
                className={fieldClass}
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as StaffStatus)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <FormField
              label="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              fullWidth
            />
          </FormSection>
        </form>
      </ActionDrawer>
    </AppShell>
  );
}
