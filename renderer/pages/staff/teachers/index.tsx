import React from "react";
import Link from "next/link";
import { Add01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import {
  FormModal,
  ConfirmModal,
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StaffTable,
  TableSelectionBar,
  selectClass,
  useDebouncedValue,
} from "../../../components/staff/ui";
import { Icon } from "../../../components/ui/Icon";
import {
  TableActionGroup,
  TableIconButton,
} from "../../../components/ui/TableActions";
import {
  JOB_ROLE_LABELS,
  deleteStaff,
  fetchStaffMeta,
  fetchTeachers,
  type StaffDto,
  type StaffJobRole,
  type StaffMeta,
  type StaffStatus,
} from "../../../lib/staff-mgmt";

export default function TeachersIndexPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [teachers, setTeachers] = React.useState<StaffDto[]>([]);
  const [meta, setMeta] = React.useState<StaffMeta | null>(null);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = React.useState<StaffStatus | "all">("all");
  const [departmentId, setDepartmentId] = React.useState("");
  const [jobRole, setJobRole] = React.useState<StaffJobRole | "all">("all");
  const [rowAction, setRowAction] = React.useState<StaffDto | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const load = React.useCallback(async () => {
    const [metaRes, listRes] = await Promise.all([
      fetchStaffMeta(),
      fetchTeachers({
        status,
        search: debouncedSearch || null,
        departmentId: departmentId || null,
        jobRole,
      }),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (listRes.ok) setTeachers(listRes.data.teachers);
    else setError(listRes.error);
    setLoading(false);
  }, [status, debouncedSearch, departmentId, jobRole]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const warning = window.sessionStorage.getItem(
      "sofia.teacher.create.warning",
    );
    if (!warning) return;
    window.sessionStorage.removeItem("sofia.teacher.create.warning");
    setError(warning);
  }, []);

  async function runDelete() {
    if (!rowAction) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await deleteStaff(rowAction.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`${rowAction.full_name} removed.`);
      setConfirmDelete(false);
      setRowAction(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const canManage = meta?.can_manage ?? false;
  const [selected, setSelected] = React.useState<string[]>([]);

  const allSelected =
    teachers.length > 0 && selected.length === teachers.length;
  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelected([]);
    else setSelected(teachers.map((t) => t.id));
  }
  function exportSelected() {
    const target = teachers.filter((t) => selected.includes(t.id));
    if (!target.length) return;
    const csv = [
      [
        "Name",
        "Employee ID",
        "Department",
        "Role",
        "Phone",
        "Email",
        "Status",
      ].join(","),
      ...target.map((t) =>
        [
          `"${t.full_name}"`,
          `"${t.employee_code || ""}"`,
          `"${t.department_name || ""}"`,
          `"${t.job_role ? JOB_ROLE_LABELS[t.job_role] || t.job_role : ""}"`,
          `"${t.phone || ""}"`,
          `"${t.email || ""}"`,
          `"${t.status}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teachers-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title="Teachers"
      breadcrumb={["Staff Management", "Teachers"]}
      heading="Teachers"
      subtitle="Browse and manage teaching staff."
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
            <FilterField label="Department">
              <select
                className={selectClass}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">All departments</option>
                {(meta?.departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
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
                <option value="teacher">Teacher</option>
                <option value="head_of_department">Head of Department</option>
              </select>
            </FilterField>
          </>
        }
        actions={
          canManage ? (
            <PrimaryButton href="/staff/teachers/create">
              <Icon icon={Add01Icon} size={16} />
              Add Teacher
            </PrimaryButton>
          ) : null
        }
      />

      <StaffTable
        loading={loading}
        columns={[
          <input
            key="select-all-header"
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = selected.length > 0 && !allSelected;
            }}
            onChange={toggleAll}
            aria-label="Select all"
          />,
          "Name",
          "Employee ID",
          "Department",
          "Role",
          "Contact",
          "Status",
          "",
        ]}
      >
        {teachers.length === 0 ? (
          <EmptyRow colSpan={8}>
            No teachers match these filters.{" "}
            {canManage ? (
              <Link
                href="/staff/teachers/create"
                className="font-semibold text-(--sofia-primary)"
              >
                Add a teacher
              </Link>
            ) : null}
          </EmptyRow>
        ) : (
          teachers.map((t) => (
            <tr key={t.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.includes(t.id)}
                  onChange={() => toggle(t.id)}
                />
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/staff/teachers/${t.id}`}
                  className="font-medium text-(--sofia-primary) hover:underline"
                >
                  {t.full_name}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">
                {t.employee_code || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {t.department_name || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {t.job_role ? JOB_ROLE_LABELS[t.job_role] : "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {t.phone || t.email || "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={t.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <TableActionGroup>
                  <TableIconButton
                    icon={MoreHorizontalIcon}
                    label="Actions"
                    onClick={() => setRowAction(t)}
                  />
                </TableActionGroup>
              </td>
            </tr>
          ))
        )}
      </StaffTable>

      <TableSelectionBar
        totalCount={teachers.length}
        selectedCount={selected.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setSelected([])}
        actions={
          <button
            type="button"
            onClick={exportSelected}
            className="cursor-pointer rounded-lg bg-(--sofia-primary) px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
          >
            Export selected ({selected.length})
          </button>
        }
      />

      <FormModal
        open={!!rowAction}
        title="Quick actions"
        subtitle={rowAction?.full_name}
        onClose={() => setRowAction(null)}
        footer={
          rowAction ? (
            <>
              <PrimaryButton
                className="w-full"
                href={`/staff/teachers/${rowAction.id}`}
              >
                View / Edit
              </PrimaryButton>
              {canManage ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                  className="w-full cursor-pointer rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  Delete
                </button>
              ) : null}
              <SecondaryButton
                className="w-full"
                onClick={() => setRowAction(null)}
              >
                Cancel
              </SecondaryButton>
            </>
          ) : null
        }
      >
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Employee ID</dt>
            <dd className="font-mono text-xs font-medium">
              {rowAction?.employee_code || "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Department</dt>
            <dd className="font-medium">{rowAction?.department_name || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Role</dt>
            <dd className="font-medium">
              {rowAction?.job_role ? JOB_ROLE_LABELS[rowAction.job_role] : "—"}
            </dd>
          </div>
        </dl>
      </FormModal>

      <ConfirmModal
        open={confirmDelete}
        title="Delete teacher?"
        description={`${rowAction?.full_name ?? "This teacher"} will be removed from the active roster.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void runDelete()}
      />
    </AppShell>
  );
}
