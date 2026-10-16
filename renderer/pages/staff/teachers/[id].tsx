import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
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
  type StaffJobRole,
  type StaffMeta,
  type StaffStatus,
} from "../../../lib/staff-mgmt";
import { TeachingAssignmentPicker } from "../../../components/staff/TeachingAssignmentPicker";

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
] as const;

export default function TeacherDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<StaffMeta | null>(null);
  const [staff, setStaff] = React.useState<StaffDto | null>(null);

  const [fullName, setFullName] = React.useState("");
  const [employeeCode, setEmployeeCode] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [jobRole, setJobRole] = React.useState<StaffJobRole>("teacher");
  const [joiningDate, setJoiningDate] = React.useState("");
  const [status, setStatus] = React.useState<StaffStatus>("active");
  const [address, setAddress] = React.useState("");
  const [gender, setGender] = React.useState("");
  const [assignments, setAssignments] = React.useState<
    Array<{ class_id: string; subject_id: string }>
  >([]);
  const [homeroomClassId, setHomeroomClassId] = React.useState("");

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [metaRes, staffRes] = await Promise.all([
      fetchStaffMeta(),
      fetchStaff(id),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (staffRes.ok) {
      const s = staffRes.data;
      setStaff(s);
      setFullName(s.full_name);
      setEmployeeCode(s.employee_code || "");
      setEmail(s.email || "");
      setPhone(s.phone || "");
      setDepartmentId(s.department_id || "");
      setJobRole(
        s.job_role === "head_of_department" ? "head_of_department" : "teacher",
      );
      setJoiningDate(s.joining_date || "");
      setStatus(s.status);
      setAddress(s.address || "");
      setGender(s.gender || "");
      setAssignments(
        (s.teaching_assignments ?? []).map((a) => ({
          class_id: a.class_id,
          subject_id: a.subject_id,
        })),
      );
      setHomeroomClassId(s.homeroom_class_ids?.[0] ?? "");
    } else {
      setError(staffRes.error);
    }
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staff) return;
    setError("");
    setSuccess("");
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!meta?.can_manage) {
      setError("You do not have permission to update teachers.");
      return;
    }

    setSaving(true);
    try {
      const res = await updateStaff({
        id: staff.id,
        full_name: fullName.trim(),
        employee_code: employeeCode.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        department_id: departmentId || null,
        job_role: jobRole,
        joining_date: joiningDate || null,
        status,
        address: address.trim() || null,
        gender: gender || null,
        teaching_assignments: assignments,
        homeroom_class_ids: homeroomClassId ? [homeroomClassId] : [],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStaff(res.data);
      setSuccess("Teacher updated.");
    } catch {
      setError("Could not update teacher.");
    } finally {
      setSaving(false);
    }
  }

  async function runDelete() {
    if (!staff || !meta?.can_manage) return;
    setDeleting(true);
    setError("");
    try {
      const res = await deleteStaff(staff.id);
      if (!res.ok) {
        setError(res.error);
        setConfirmDelete(false);
        return;
      }
      await router.push("/staff/teachers");
    } catch {
      setError("Could not delete teacher.");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <AppShell
        title="Teacher"
        breadcrumb={["Staff Management", "Teachers"]}
        heading="Teacher"
      >
        <p className="text-sm text-slate-500">Loading…</p>
      </AppShell>
    );
  }

  if (!staff) {
    return (
      <AppShell
        title="Teacher"
        breadcrumb={["Staff Management", "Teachers"]}
        heading="Teacher not found"
      >
        <PageAlert tone="error">{error || "Teacher not found."}</PageAlert>
        <SecondaryButton href="/staff/teachers" className="mt-4">
          Back to teachers
        </SecondaryButton>
      </AppShell>
    );
  }

  const canManage = meta?.can_manage ?? false;

  return (
    <AppShell
      title={staff.full_name}
      breadcrumb={["Staff Management", "Teachers", staff.full_name]}
      heading={staff.full_name}
      subtitle={`${staff.employee_code || "No ID"} · ${
        staff.job_role ? JOB_ROLE_LABELS[staff.job_role] : "Teacher"
      }`}
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={staff.status} />
        {(staff.teaching_assignments ?? []).length > 0 ? (
          <span className="text-sm text-slate-500">
            {(staff.teaching_assignments ?? [])
              .map((a) =>
                [a.subject_name, a.class_name].filter(Boolean).join(" · "),
              )
              .join(" · ")}
          </span>
        ) : null}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <FormSection
          title="Personal information"
          description="Identity and contact details."
        >
          <FormField
            label="Full name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            fullWidth
            disabled={!canManage}
          />
          <FormField
            label="Employee ID"
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
            disabled={!canManage}
          />
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Gender
            </span>
            <select
              className={fieldClass}
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              disabled={!canManage}
            >
              <option value="">Select…</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <FormField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!canManage}
          />
          <FormField
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!canManage}
          />
          <FormField
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            fullWidth
            disabled={!canManage}
          />
        </FormSection>

        <FormSection
          title="Role & status"
          description="Department, job role, and employment status."
        >
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Department
            </span>
            <select
              className={fieldClass}
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={!canManage}
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
              value={jobRole}
              onChange={(e) => setJobRole(e.target.value as StaffJobRole)}
              disabled={!canManage}
            >
              <option value="teacher">Teacher</option>
              <option value="head_of_department">Head of Department</option>
            </select>
          </label>
          <FormField
            label="Joining date"
            type="date"
            value={joiningDate}
            onChange={(e) => setJoiningDate(e.target.value)}
            disabled={!canManage}
          />
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Status
            </span>
            <select
              className={fieldClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as StaffStatus)}
              disabled={!canManage}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </FormSection>

        <FormSection
          title="Teaching Assignments"
          description="Assign the classes and subjects this teacher teaches."
        >
          <TeachingAssignmentPicker
            classes={meta?.classes ?? []}
            subjects={meta?.subjects ?? []}
            value={assignments}
            onChange={setAssignments}
            disabled={!canManage}
          />
        </FormSection>

        <FormSection
          title="Homeroom"
          description="A teacher can have only one homeroom class."
        >
          <label className="mb-0 block max-w-md">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Homeroom class
            </span>
            <select
              className={fieldClass}
              value={homeroomClassId}
              onChange={(e) => setHomeroomClassId(e.target.value)}
              disabled={!canManage}
            >
              <option value="">None</option>
              {(meta?.classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              Homeroom is separate from teaching assignments.
            </p>
          </label>
        </FormSection>

        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <PrimaryButton type="submit" disabled={saving || deleting}>
              {saving ? "Saving…" : "Save changes"}
            </PrimaryButton>
          ) : null}
          <SecondaryButton href="/staff/teachers">Back</SecondaryButton>
          {canManage ? (
            <button
              type="button"
              disabled={saving || deleting}
              onClick={() => setConfirmDelete(true)}
              className="cursor-pointer rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Delete teacher
            </button>
          ) : null}
        </div>
      </form>

      <ConfirmModal
        open={confirmDelete}
        title="Delete teacher?"
        description={`${staff.full_name} will be removed from the active roster. Homeroom assignments will be cleared.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void runDelete()}
      />
    </AppShell>
  );
}
