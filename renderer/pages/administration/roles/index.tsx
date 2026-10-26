import React from "react";
import {
  Copy01Icon,
  Delete02Icon,
  PauseIcon,
  PencilEdit01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import {
  ConfirmModal,
  EmptyRow,
  FormModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StudentTable,
  TableSelectionBar,
  fieldClass,
} from "../../../components/students/ui";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import {
  deleteAdminRole,
  duplicateAdminRole,
  fetchAdminMeta,
  fetchAdminRole,
  fetchAdminRoles,
  fetchPermissionCatalog,
  saveAdminRole,
  setAdminRoleEnabled,
} from "../../../lib/system-admin";

export default function AdminRolesPage() {
  const [roles, setRoles] = React.useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [canDelete, setCanDelete] = React.useState(false);
  const [catalog, setCatalog] = React.useState<
    Array<{ module_label: string; permissions: Array<{ id: string; name: string; label: string }> }>
  >([]);
  const [editing, setEditing] = React.useState<{
    id?: string;
    name: string;
    description: string;
    permission_ids: string[];
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null,
  );
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const allSelected =
    roles.length > 0 && selectedIds.length === roles.length;
  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(roles.map((r) => String(r.id)));
  }
  async function bulkSetRoleState(enabled: boolean) {
    if (!selectedIds.length) return;
    setError("");
    setSuccess("");
    try {
      for (const id of selectedIds) {
        await setAdminRoleEnabled(id, enabled);
      }
      setSelectedIds([]);
      await load();
    } catch {
      setError("Failed to update role statuses.");
    }
  }
  async function bulkDelete() {
    if (!selectedIds.length || !canDelete) return;
    setDeleting(true);
    setError("");
    setSuccess("");
    let deleted = 0;
    const failures: string[] = [];
    try {
      for (const id of selectedIds) {
        const role = roles.find((r) => String(r.id) === id);
        if (role?.is_system) {
          failures.push(`System role “${String(role.name)}” cannot be deleted.`);
          continue;
        }
        const res = await deleteAdminRole(id);
        if (res.ok) deleted += 1;
        else failures.push(res.error);
      }
      if (deleted) setSuccess(`Deleted ${deleted} role(s).`);
      if (failures.length) setError(failures[0] || "Some roles could not be deleted.");
      setSelectedIds([]);
      setConfirmBulkDelete(false);
      await load();
    } finally {
      setDeleting(false);
    }
  }
  function exportSelected() {
    const target = roles.filter((r) => selectedIds.includes(String(r.id)));
    if (!target.length) return;
    const csv = [
      ["Role", "Description", "Users", "Permissions", "Status"].join(","),
      ...target.map((r) =>
        [
          `"${String(r.name)}"`,
          `"${String(r.description || "")}"`,
          r.user_count,
          r.permission_count,
          r.is_enabled === false ? "Inactive" : "Active",
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-roles-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const load = React.useCallback(async () => {
    const [list, cat, meta] = await Promise.all([
      fetchAdminRoles(),
      fetchPermissionCatalog(),
      fetchAdminMeta(),
    ]);
    if (list.ok) setRoles(list.data.roles);
    else setError(list.error);
    if (cat.ok) setCatalog(cat.data);
    if (meta.ok) setCanDelete(Boolean(meta.data.can.roles_delete));
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const rolePendingDelete = confirmDeleteId
    ? roles.find((r) => String(r.id) === confirmDeleteId)
    : null;

  return (
    <AppShell
      title="Roles"
      breadcrumb={["System Administration", "Users & Roles", "Roles"]}
      heading="Roles"
      subtitle="Create custom roles, edit permissions, or permanently delete unused custom roles. System roles cannot be deleted; reassign users before deleting a role."
      >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}
      <div className="mb-4">
        <PrimaryButton
          onClick={() => setEditing({ name: "", description: "", permission_ids: [] })}
        >
          Create role
        </PrimaryButton>
      </div>
      <StudentTable
        columns={[
          <input
            key="select-all"
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el)
                el.indeterminate = selectedIds.length > 0 && !allSelected;
            }}
            onChange={toggleAll}
            aria-label="Select all"
          />,
          "Role",
          "Users",
          "Permissions",
          "Status",
          "Actions",
        ]}
      >
        {roles.length === 0 ? (
          <EmptyRow colSpan={6} message="No roles yet." />
        ) : (
          roles.map((r) => (
            <tr key={String(r.id)}>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(String(r.id))}
                  onChange={() => toggleRow(String(r.id))}
                />
              </td>
              <td className="px-4 py-3">
                <p className="font-medium">{String(r.name)}</p>
                <p className="text-xs text-slate-500">{String(r.description || "")}</p>
              </td>
              <td className="px-4 py-3">{String(r.user_count)}</td>
              <td className="px-4 py-3">{String(r.permission_count)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={r.is_enabled === false ? "inactive" : "active"} />
              </td>
              <td className="px-4 py-3">
                <TableActionGroup>
                  <TableIconButton
                    icon={PencilEdit01Icon}
                    label="Edit"
                    onClick={() =>
                      void fetchAdminRole(String(r.id)).then((res) => {
                        if (!res.ok) return;
                        const role = res.data.role;
                        setEditing({
                          id: String(role.id),
                          name: String(role.name),
                          description: String(role.description || ""),
                          permission_ids: (role.permission_ids as string[]) || [],
                        });
                      })
                    }
                  />
                  <TableIconButton
                    icon={Copy01Icon}
                    label="Duplicate"
                    onClick={() => void duplicateAdminRole(String(r.id)).then(() => load())}
                  />
                  <TableIconButton
                    icon={r.is_enabled === false ? Tick02Icon : PauseIcon}
                    label={r.is_enabled === false ? "Activate" : "Deactivate"}
                    tone={r.is_enabled === false ? "primary" : "warning"}
                    onClick={() =>
                      void setAdminRoleEnabled(String(r.id), r.is_enabled === false).then(() => load())
                    }
                  />
                  {canDelete && !r.is_system ? (
                    <TableIconButton
                      icon={Delete02Icon}
                      label="Delete"
                      tone="danger"
                      onClick={() => setConfirmDeleteId(String(r.id))}
                    />
                  ) : null}
                </TableActionGroup>
              </td>
            </tr>
          ))
        )}
      </StudentTable>

      <TableSelectionBar
        totalCount={roles.length}
        selectedCount={selectedIds.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setSelectedIds([])}
        actions={
          <>
            <button
              type="button"
              onClick={() => void bulkSetRoleState(true)}
              className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Activate selected
            </button>
            <button
              type="button"
              onClick={() => void bulkSetRoleState(false)}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Deactivate selected
            </button>
            {canDelete ? (
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmBulkDelete(true)}
                className="cursor-pointer rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                Delete selected
              </button>
            ) : null}
            <button
              type="button"
              onClick={exportSelected}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export selected ({selectedIds.length})
            </button>
          </>
        }
      />
      {editing ? (
        <FormModal
          open
          title={editing.id ? "Edit role" : "Create role"}
          onClose={() => setEditing(null)}
          size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                onClick={() =>
                  void saveAdminRole(editing).then((res) => {
                    if (res.ok) {
                      setEditing(null);
                      void load();
                    } else setError(!res.ok ? res.error : "");
                  })
                }
              >
                Save
              </PrimaryButton>
            </div>
          }
        >
          <div className="grid gap-3">
            <input
              className={fieldClass}
              placeholder="Name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <input
              className={fieldClass}
              placeholder="Description"
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
            <div className="max-h-80 overflow-auto rounded-lg border border-slate-200 p-3">
              {catalog.map((g) => (
                <div key={g.module_label} className="mb-3">
                  <p className="text-xs font-semibold uppercase text-slate-400">{g.module_label}</p>
                  {g.permissions.map((p) => (
                    <label key={p.id} className="mt-1 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editing.permission_ids.includes(p.id)}
                        onChange={() => {
                          const next = editing.permission_ids.includes(p.id)
                            ? editing.permission_ids.filter((id) => id !== p.id)
                            : [...editing.permission_ids, p.id];
                          setEditing({ ...editing, permission_ids: next });
                        }}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </FormModal>
      ) : null}

      <ConfirmModal
        open={Boolean(confirmDeleteId)}
        title="Delete this role?"
        description={
          rolePendingDelete
            ? `“${String(rolePendingDelete.name)}” will be permanently removed from this school (soft-deleted and synced). Reassign any users first. System roles cannot be deleted.`
            : "This role will be permanently removed."
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        danger
        onCancel={() => !deleting && setConfirmDeleteId(null)}
        onConfirm={() => {
          if (!confirmDeleteId || deleting) return;
          setDeleting(true);
          setError("");
          void deleteAdminRole(confirmDeleteId).then((res) => {
            setDeleting(false);
            setConfirmDeleteId(null);
            if (res.ok) {
              setSuccess("Role deleted.");
              void load();
            } else setError(res.error);
          });
        }}
      />

      <ConfirmModal
        open={confirmBulkDelete}
        title="Delete selected roles?"
        description="Custom roles with no assigned users will be permanently removed and synced. System roles and roles still assigned to users are skipped with an error."
        confirmLabel={deleting ? "Deleting…" : "Delete selected"}
        danger
        onCancel={() => !deleting && setConfirmBulkDelete(false)}
        onConfirm={() => {
          void bulkDelete();
        }}
      />
    </AppShell>
  );
}
