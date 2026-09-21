import React from "react";
import { useRouter } from "next/router";
import { Upload01Icon } from "@hugeicons/core-free-icons";
import { FormField, FormSection, SetupFooter } from "../../components/setup";
import {
  SetupShell,
  useSetupProgress,
} from "../../components/setup/SetupShell";
import {
  DataTable,
  DataTableToolbar,
  RowActions,
  SetupModal,
} from "../../components/setup/DataTable";
import { Icon } from "../../components/ui/Icon";
import {
  ADMIN_ROLE_OPTIONS,
  clearAdminStaff,
  deleteTeacher,
  fetchStaffSetup,
  importTeachers,
  parseTeacherCsv,
  upsertAdminStaff,
  upsertTeacher,
  type StaffAdminRole,
  type StaffGender,
  type StaffMember,
  type StaffSetupData,
  type StaffStatus,
} from "../../lib/staff";
import { TeachingAssignmentPicker } from "../../components/staff/TeachingAssignmentPicker";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
} from "../../lib/setup";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function StaffSetupPage() {
  return (
    <SetupShell stepId="staff" aside={<StaffAside />}>
      <StaffSetupForm />
    </SetupShell>
  );
}

function StaffAside() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">
        What this creates
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Staff records are stored locally and user accounts are prepared for
        login.
      </p>
      <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Staff database for employees & teachers
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Prepared user accounts (when email is set)
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Temporary password:{" "}
          <span className="font-mono text-xs">Sofia@Staff1</span> (desktop +
          Sofia Teacher mobile when email is set)
        </li>
      </ul>
    </div>
  );
}

function StaffSetupForm() {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();
  const importRef = React.useRef<HTMLInputElement>(null);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [draftSaving, setDraftSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [data, setData] = React.useState<StaffSetupData | null>(null);
  const [search, setSearch] = React.useState("");

  const [teacherModalOpen, setTeacherModalOpen] = React.useState(false);
  const [editingTeacher, setEditingTeacher] =
    React.useState<StaffMember | null>(null);
  const [fullName, setFullName] = React.useState("");
  const [gender, setGender] = React.useState<StaffGender | "">("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [assignments, setAssignments] = React.useState<
    Array<{ class_id: string; subject_id: string }>
  >([]);
  const [status, setStatus] = React.useState<StaffStatus>("active");
  const [modalBusy, setModalBusy] = React.useState(false);
  const [modalError, setModalError] = React.useState("");

  const [adminDrafts, setAdminDrafts] = React.useState<
    Record<
      StaffAdminRole,
      { id: string; full_name: string; phone: string; email: string }
    >
  >(() => emptyAdminDrafts());

  function emptyAdminDrafts() {
    return Object.fromEntries(
      ADMIN_ROLE_OPTIONS.map((r) => [
        r.role,
        { id: "", full_name: "", phone: "", email: "" },
      ]),
    ) as Record<
      StaffAdminRole,
      { id: string; full_name: string; phone: string; email: string }
    >;
  }

  function applyData(next: StaffSetupData) {
    setData(next);
    const drafts = emptyAdminDrafts();
    for (const member of next.adminStaff) {
      if (!member.admin_role) continue;
      drafts[member.admin_role] = {
        id: member.id,
        full_name: member.full_name,
        phone: member.phone ?? "",
        email: member.email ?? "",
      };
    }
    setAdminDrafts(drafts);
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await fetchStaffSetup();
      if (cancelled) return;
      if (!result.ok) setError(result.error);
      else applyData(result.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function openCreateTeacher() {
    setEditingTeacher(null);
    setFullName("");
    setGender("");
    setPhone("");
    setEmail("");
    setDepartmentId("");
    setAssignments([]);
    setStatus("active");
    setModalError("");
    setTeacherModalOpen(true);
  }

  function openEditTeacher(teacher: StaffMember) {
    setEditingTeacher(teacher);
    setFullName(teacher.full_name);
    setGender(teacher.gender ?? "");
    setPhone(teacher.phone ?? "");
    setEmail(teacher.email ?? "");
    setDepartmentId(teacher.department_id ?? "");
    setAssignments(
      (teacher.teaching_assignments ?? []).map((a) => ({
        class_id: a.class_id,
        subject_id: a.subject_id,
      })),
    );
    setStatus(teacher.status);
    setModalError("");
    setTeacherModalOpen(true);
  }

  async function handleSaveTeacher() {
    setModalError("");
    setModalBusy(true);
    try {
      const result = await upsertTeacher({
        id: editingTeacher?.id ?? null,
        full_name: fullName,
        gender: gender || null,
        phone: phone || null,
        email: email || null,
        department_id: departmentId || null,
        teaching_assignments: assignments,
        status,
      });
      if (!result.ok) {
        setModalError(result.error);
        return;
      }
      applyData(result.data);
      setTeacherModalOpen(false);
      if (result.warning) {
        setSuccess(editingTeacher ? "Teacher updated." : "Teacher added.");
        setError(result.warning);
      } else {
        setSuccess(
          editingTeacher
            ? "Teacher updated."
            : "Teacher added. Desktop + mobile login use temporary password Sofia@Staff1 when an email is set.",
        );
        setError("");
      }
    } finally {
      setModalBusy(false);
    }
  }

  async function handleDeleteTeacher(id: string) {
    setError("");
    const result = await deleteTeacher(id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applyData(result.data);
    setSuccess("Teacher removed.");
  }

  async function handleSaveAdmin(role: StaffAdminRole) {
    const draft = adminDrafts[role];
    if (!draft.full_name.trim()) {
      setError(
        `Enter a name for ${ADMIN_ROLE_OPTIONS.find((r) => r.role === role)?.label}.`,
      );
      return;
    }
    setError("");
    const result = await upsertAdminStaff({
      id: draft.id || null,
      admin_role: role,
      full_name: draft.full_name,
      phone: draft.phone || null,
      email: draft.email || null,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applyData(result.data);
    setSuccess(
      `${ADMIN_ROLE_OPTIONS.find((r) => r.role === role)?.label} saved.`,
    );
  }

  async function handleClearAdmin(role: StaffAdminRole) {
    const result = await clearAdminStaff(role);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applyData(result.data);
    setSuccess("Role cleared.");
  }

  async function handleImportFile(file: File) {
    setError("");
    setSuccess("");
    const text = await file.text();
    const rows = parseTeacherCsv(text);
    if (!rows.length) {
      setError(
        "Could not parse CSV. Include a header row with Full Name (optional: Gender, Phone, Email, Department).",
      );
      return;
    }
    const result = await importTeachers(rows);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applyData(result.data);
    setSuccess(
      `Imported ${result.data.imported} teacher${result.data.imported === 1 ? "" : "s"}${
        result.data.skipped ? ` (${result.data.skipped} skipped)` : ""
      }.`,
    );
  }

  async function handleSaveDraft() {
    setError("");
    setSuccess("");
    setDraftSaving(true);
    try {
      // Persist any filled admin roles that aren't saved yet
      for (const opt of ADMIN_ROLE_OPTIONS) {
        const draft = adminDrafts[opt.role];
        if (draft.full_name.trim()) {
          const result = await upsertAdminStaff({
            id: draft.id || null,
            admin_role: opt.role,
            full_name: draft.full_name,
            phone: draft.phone || null,
            email: draft.email || null,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          applyData(result.data);
        }
      }
      const draft = await saveSetupDraft("staff");
      if (!draft.ok) {
        setError(draft.error);
        return;
      }
      await refreshProgress();
      setSuccess("Draft saved.");
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleContinue() {
    setError("");
    setSuccess("");
    const hasAdmin = ADMIN_ROLE_OPTIONS.some((r) =>
      adminDrafts[r.role].full_name.trim(),
    );
    const hasTeacher = (data?.teachers.length ?? 0) > 0;
    if (!hasAdmin && !hasTeacher) {
      setError("Add at least one administrative staff member or teacher.");
      return;
    }

    setSaving(true);
    try {
      for (const opt of ADMIN_ROLE_OPTIONS) {
        const draft = adminDrafts[opt.role];
        if (draft.full_name.trim()) {
          const result = await upsertAdminStaff({
            id: draft.id || null,
            admin_role: opt.role,
            full_name: draft.full_name,
            phone: draft.phone || null,
            email: draft.email || null,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          applyData(result.data);
        }
      }
      const done = await completeSetupStep("staff");
      if (!done.ok) {
        setError(done.error);
        return;
      }
      await refreshProgress();
      await router.push(getNextSetupHref("staff"));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return <p className="text-sm text-slate-500">Loading staff setup…</p>;
  }

  const q = search.trim().toLowerCase();
  const filteredTeachers = data.teachers.filter((t) => {
    if (!q) return true;
    return (
      t.full_name.toLowerCase().includes(q) ||
      (t.department_name ?? "").toLowerCase().includes(q) ||
      t.subject_names.some((n) => n.toLowerCase().includes(q)) ||
      t.class_names.some((n) => n.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-5 pb-4">
      {error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <FormSection
        title="1. Administrative Staff"
        description="Assign key leadership and office roles for your school."
        layout="stack"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ADMIN_ROLE_OPTIONS.map((opt) => {
            const draft = adminDrafts[opt.role];
            return (
              <div
                key={opt.role}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {opt.label}
                  </h3>
                  {draft.id ? (
                    <button
                      type="button"
                      onClick={() => void handleClearAdmin(opt.role)}
                      className="cursor-pointer text-xs font-medium text-slate-500 hover:text-red-600"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <FormField
                  label="Full name"
                  value={draft.full_name}
                  onChange={(e) =>
                    setAdminDrafts((prev) => ({
                      ...prev,
                      [opt.role]: {
                        ...prev[opt.role],
                        full_name: e.target.value,
                      },
                    }))
                  }
                  placeholder={`e.g. ${opt.label} name`}
                />
                <FormField
                  label="Phone"
                  value={draft.phone}
                  onChange={(e) =>
                    setAdminDrafts((prev) => ({
                      ...prev,
                      [opt.role]: { ...prev[opt.role], phone: e.target.value },
                    }))
                  }
                  placeholder="Optional"
                />
                <FormField
                  label="Email"
                  type="email"
                  value={draft.email}
                  onChange={(e) =>
                    setAdminDrafts((prev) => ({
                      ...prev,
                      [opt.role]: { ...prev[opt.role], email: e.target.value },
                    }))
                  }
                  placeholder="Prepares a login account"
                  hint="Optional — creates a user account when provided"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveAdmin(opt.role)}
                  className="mt-1 cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-(--sofia-primary) hover:text-(--sofia-primary)"
                >
                  Save {opt.label}
                </button>
              </div>
            );
          })}
        </div>
      </FormSection>

      <FormSection
        title="2. Teaching Staff"
        description="Add teachers and assign each to subjects in specific classes. One teacher can teach many classes and many subjects."
        layout="stack"
      >
        <div className="mb-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search teachers…"
            onAdd={openCreateTeacher}
            addLabel="Add teacher"
          />
        </div>
        <div className="-mt-2 mb-4">
          <input
            ref={importRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-(--sofia-primary) hover:text-(--sofia-primary)"
          >
            <Icon icon={Upload01Icon} size={16} />
            Import teachers (CSV)
          </button>
          <p className="mt-1.5 text-xs text-slate-400">
            CSV columns: Full Name, Gender, Phone, Email, Department
          </p>
        </div>

        <DataTable
          headers={["Name", "Department", "Subjects", "Classes", "Status"]}
          isEmpty={filteredTeachers.length === 0}
          emptyMessage="No teachers yet. Add or import teaching staff."
        >
          {filteredTeachers.map((teacher) => (
            <tr key={teacher.id}>
              <td className="px-4 py-3 font-medium text-slate-900">
                {teacher.full_name}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {teacher.department_name || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {teacher.subject_names.length
                  ? teacher.subject_names.join(", ")
                  : "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {teacher.class_names.length
                  ? teacher.class_names.join(", ")
                  : "—"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                    teacher.status === "active"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {teacher.status === "active" ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-4 py-3">
                <RowActions
                  onEdit={() => openEditTeacher(teacher)}
                  onDelete={() => void handleDeleteTeacher(teacher.id)}
                />
              </td>
            </tr>
          ))}
        </DataTable>
      </FormSection>

      <SetupModal
        title={editingTeacher ? "Edit Teacher" : "Add Teacher"}
        open={teacherModalOpen}
        onClose={() => setTeacherModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setTeacherModalOpen(false)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={modalBusy}
              onClick={() => void handleSaveTeacher()}
              className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2 text-sm font-semibold text-white hover:bg-(--sofia-primary-dark) disabled:opacity-60"
            >
              {modalBusy
                ? "Saving…"
                : editingTeacher
                  ? "Save changes"
                  : "Add teacher"}
            </button>
          </>
        }
      >
        <FormField
          label="Full name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Teacher full name"
          fullWidth
        />
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Gender
          </span>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as StaffGender | "")}
            className={inputClass}
          >
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </label>
        <FormField
          label="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Optional"
          fullWidth
        />
        <FormField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Prepares a login account"
          hint="Optional — creates a teacher account when provided"
          fullWidth
        />
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Department
          </span>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {data.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mb-4 max-h-64 overflow-y-auto">
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            Teaching assignments
          </p>
          <p className="mb-2 text-xs text-slate-500">
            Assign this teacher to a subject in a specific class. They can teach
            several classes and several subjects.
          </p>
          <TeachingAssignmentPicker
            classes={data.classes}
            subjects={data.subjects}
            value={assignments}
            onChange={setAssignments}
          />
        </div>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Status
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StaffStatus)}
            className={inputClass}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        {modalError ? (
          <p className="text-sm text-red-600">{modalError}</p>
        ) : null}
      </SetupModal>

      <SetupFooter
        stepId="staff"
        onSaveDraft={() => void handleSaveDraft()}
        onContinue={() => void handleContinue()}
        saving={saving}
        draftSaving={draftSaving}
      />
    </div>
  );
}
