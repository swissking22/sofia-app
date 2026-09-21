import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import {
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  fieldClass,
} from "../../../components/staff/ui";
import {
  createStaff,
  fetchStaffMeta,
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

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export default function CreateTeacherPage() {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [meta, setMeta] = React.useState<StaffMeta | null>(null);

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
  const [homeroomClassIds, setHomeroomClassIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchStaffMeta();
      if (res.ok) setMeta(res.data);
      else setError(res.error);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!meta?.can_manage) {
      setError("You do not have permission to create teachers.");
      return;
    }

    setSaving(true);
    try {
      const res = await createStaff({
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
        homeroom_class_ids: homeroomClassIds,
        staff_type: "teaching",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.warning) {
        setError(res.warning);
        return;
      }
      await router.push("/staff/teachers");
    } catch {
      setError("Could not create teacher.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Add teacher"
      breadcrumb={["Staff Management", "Teachers", "Add"]}
      heading="Add teacher"
      subtitle="Personal details, role, and teaching assignments. With an email, Sofia creates a desktop login and cloud Auth for the mobile teacher app (temporary password Sofia@Staff1)."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

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
            placeholder="Teacher full name"
            fullWidth
          />
          <FormField
            label="Employee ID"
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
            placeholder="Leave blank to auto-generate"
          />
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Gender
            </span>
            <select
              className={fieldClass}
              value={gender}
              onChange={(e) => setGender(e.target.value)}
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
            placeholder="teacher@email.com"
          />
          <FormField
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
          />
          <FormField
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Home address"
            fullWidth
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
          />
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Status
            </span>
            <select
              className={fieldClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as StaffStatus)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </FormSection>

        <FormSection
          title="Assignments"
          description="Tick each subject this teacher teaches in each class. One teacher can cover many classes and many subjects."
        >
          <div className="mb-4">
            <TeachingAssignmentPicker
              classes={meta?.classes ?? []}
              subjects={meta?.subjects ?? []}
              value={assignments}
              onChange={setAssignments}
            />
          </div>
          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-medium text-slate-700">
              Homeroom class
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(meta?.classes ?? []).map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={homeroomClassIds.includes(c.id)}
                    onChange={() =>
                      setHomeroomClassIds(toggleId(homeroomClassIds, c.id))
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
        </FormSection>

        <div className="flex flex-wrap gap-2">
          <PrimaryButton type="submit" disabled={saving || !meta?.can_manage}>
            {saving ? "Saving…" : "Create teacher"}
          </PrimaryButton>
          <SecondaryButton href="/staff/teachers">Cancel</SecondaryButton>
        </div>
      </form>
    </AppShell>
  );
}
