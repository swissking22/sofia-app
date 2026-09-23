import React from "react";
import {
  Add01Icon,
  Delete02Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../components/layout/AppShell";
import { FormField, FormSection } from "../../components/setup";
import { Icon } from "../../components/ui/Icon";
import { TableActionGroup, TableIconButton } from "../../components/ui/TableActions";
import { ClientPaginatedTable } from "../../components/ui/table-pagination";
import {
  createDepartment,
  deleteDepartment,
  fetchDepartments,
  updateDepartment,
  type DepartmentDto,
} from "../../lib/departments";

export default function SchoolDepartmentsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [departments, setDepartments] = React.useState<DepartmentDto[]>([]);

  const [name, setName] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchDepartments();
      if (res.ok) setDepartments(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, []);

  function startEdit(dept: DepartmentDto) {
    setEditingId(dept.id);
    setName(dept.name);
    setError("");
    setSuccess("");
  }

  function cancelEdit() {
    setEditingId(null);
    setName("");
  }

  async function handleSubmit() {
    setError("");
    setSuccess("");
    if (!name.trim()) {
      setError("Department name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = editingId
        ? await updateDepartment(editingId, name.trim())
        : await createDepartment(name.trim());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDepartments(res.data);
      setSuccess(editingId ? "Department updated." : "Department added.");
      cancelEdit();
    } catch {
      setError("Could not save department.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError("");
    setSuccess("");
    const res = await deleteDepartment(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDepartments(res.data);
    if (editingId === id) cancelEdit();
    setSuccess("Department removed.");
  }

  return (
    <AppShell
      title="Departments"
      breadcrumb={["School Management", "Departments"]}
      heading="Departments"
      subtitle="Organize staff and subjects into academic departments."
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading departments…</p>
      ) : (
        <div className="space-y-5">
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
            title={editingId ? "Edit Department" : "Add Department"}
            description="Science, Arts, Commercial, Technical, or custom departments."
          >
            <FormField
              label="Name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Science"
              fullWidth
            />
            <div className="mb-4 flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSubmit()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                <Icon icon={Add01Icon} size={16} />
                {saving
                  ? "Saving…"
                  : editingId
                    ? "Update Department"
                    : "Add Department"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-300"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </FormSection>

          <FormSection title="Departments" layout="stack">
            {departments.length === 0 ? (
              <p className="text-sm text-slate-500">No departments yet.</p>
            ) : (
              <ClientPaginatedTable
                tableClassName="w-full text-left text-sm"
                head={
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Staff</th>
                      <th className="px-4 py-3">Subjects</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                }
              >
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {d.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{d.staff_count}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {d.subject_count}
                    </td>
                    <td className="px-4 py-3">
                      <TableActionGroup>
                        <TableIconButton
                          icon={PencilEdit01Icon}
                          label={`Edit ${d.name}`}
                          onClick={() => startEdit(d)}
                        />
                        <TableIconButton
                          icon={Delete02Icon}
                          label={`Delete ${d.name}`}
                          tone="danger"
                          onClick={() => void handleDelete(d.id)}
                        />
                      </TableActionGroup>
                    </td>
                  </tr>
                ))}
              </ClientPaginatedTable>
            )}
          </FormSection>
        </div>
      )}
    </AppShell>
  );
}
