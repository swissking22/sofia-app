import React from "react";
import {
  Copy01Icon,
  PauseIcon,
  PencilEdit01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  FormModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StudentTable,
  fieldClass,
} from "../../../components/students/ui";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import {
  duplicateAdminRole,
  fetchAdminRole,
  fetchAdminRoles,
  fetchPermissionCatalog,
  saveAdminRole,
  setAdminRoleEnabled,
} from "../../../lib/system-admin";

export default function AdminRolesPage() {
  const [roles, setRoles] = React.useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = React.useState("");
  const [catalog, setCatalog] = React.useState<
    Array<{ module_label: string; permissions: Array<{ id: string; name: string; label: string }> }>
  >([]);
  const [editing, setEditing] = React.useState<{
    id?: string;
    name: string;
    description: string;
    permission_ids: string[];
  } | null>(null);

  const load = React.useCallback(async () => {
    const [list, cat] = await Promise.all([fetchAdminRoles(), fetchPermissionCatalog()]);
    if (list.ok) setRoles(list.data.roles);
    else setError(list.error);
    if (cat.ok) setCatalog(cat.data);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell
      title="Roles"
      breadcrumb={["System Administration", "Users & Roles", "Roles"]}
      heading="Roles"
      subtitle="Custom roles are allowed. System roles can be duplicated. A role assigned to users cannot be deleted."
      >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      <div className="mb-4">
        <PrimaryButton
          onClick={() => setEditing({ name: "", description: "", permission_ids: [] })}
        >
          Create role
        </PrimaryButton>
      </div>
      <StudentTable columns={["Role", "Users", "Permissions", "Status", "Actions"]}>
        {roles.length === 0 ? (
          <EmptyRow colSpan={5} message="No roles yet." />
        ) : (
          roles.map((r) => (
            <tr key={String(r.id)}>
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
                </TableActionGroup>
              </td>
            </tr>
          ))
        )}
      </StudentTable>
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
    </AppShell>
  );
}
