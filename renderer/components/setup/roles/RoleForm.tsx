import React from "react";
import { useRouter } from "next/router";
import { FormField, FormSection } from "../index";
import {
  createRole,
  duplicateRole,
  fetchPermissionCatalog,
  updateRole,
  type PermissionCatalogGroup,
  type RoleDetail,
} from "../../../lib/roles";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15 disabled:cursor-not-allowed disabled:bg-slate-50";

export interface RoleFormProps {
  mode: "create" | "edit";
  initial?: RoleDetail | null;
  onSaved?: (role: RoleDetail) => void;
}

export function RoleForm({ mode, initial, onSaved }: RoleFormProps) {
  const router = useRouter();
  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(
    initial?.description ?? "",
  );
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(initial?.permission_ids ?? []),
  );
  const [catalog, setCatalog] = React.useState<PermissionCatalogGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [duplicating, setDuplicating] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const isSystem = Boolean(initial?.is_system);
  const permissionsLocked = mode === "edit" && isSystem;

  React.useEffect(() => {
    void (async () => {
      const res = await fetchPermissionCatalog();
      if (res.ok) {
        setCatalog(res.data);
      } else {
        setError(res.error);
      }
      setLoading(false);
    })();
  }, []);

  React.useEffect(() => {
    if (!initial) return;
    setName(initial.name);
    setDescription(initial.description ?? "");
    setSelected(new Set(initial.permission_ids));
  }, [initial]);

  const allPermissionIds = React.useMemo(
    () => catalog.flatMap((g) => g.permissions.map((p) => p.id)),
    [catalog],
  );

  const allSelected =
    allPermissionIds.length > 0 &&
    allPermissionIds.every((id) => selected.has(id));

  function togglePermission(id: string) {
    if (permissionsLocked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleModule(group: PermissionCatalogGroup) {
    if (permissionsLocked) return;
    const ids = group.permissions.map((p) => p.id);
    const every = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (every) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleSelectAll() {
    if (permissionsLocked) return;
    setSelected((prev) => {
      if (allSelected) return new Set();
      return new Set(allPermissionIds);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        description: description.trim() || null,
        permission_ids: Array.from(selected),
      };
      const res =
        mode === "create"
          ? await createRole(input)
          : await updateRole(initial!.id, input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(mode === "create" ? "Role created." : "Role saved.");
      onSaved?.(res.data);
      await router.push("/setup/roles");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!initial) return;
    setDuplicating(true);
    setError("");
    try {
      const res = await duplicateRole(initial.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.push(`/setup/roles/${res.data.id}/edit`);
    } finally {
      setDuplicating(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading permissions…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      {isSystem ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This is a system role. Permissions are locked — duplicate it to create
          an editable copy.
        </div>
      ) : null}

      <FormSection
        title="Role details"
        description="Name and describe how this role is used at your school."
      >
        <FormField
          label="Role name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={permissionsLocked}
          placeholder="e.g. Exam Officer"
        />
        <label className="mb-4 block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={permissionsLocked}
            rows={2}
            placeholder="What this role can do"
            className={inputClass}
          />
        </label>
      </FormSection>

      <FormSection
        title="Permissions"
        description="Choose actions this role may perform. Labels only — no raw keys."
        layout="stack"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {selected.size} of {allPermissionIds.length} selected
          </p>
          <button
            type="button"
            disabled={permissionsLocked}
            onClick={toggleSelectAll}
            className="cursor-pointer text-sm font-semibold text-(--sofia-primary) hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.map((group) => {
            const ids = group.permissions.map((p) => p.id);
            const selectedCount = ids.filter((id) => selected.has(id)).length;
            const moduleAll =
              ids.length > 0 && ids.every((id) => selected.has(id));
            const moduleSome = ids.some((id) => selected.has(id));

            return (
              <article
                key={group.module_key}
                className="flex flex-col rounded-xl border border-slate-200/80 bg-slate-50/40"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-200/70 px-3.5 py-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {group.module_label}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {selectedCount} of {ids.length} selected
                    </p>
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={moduleAll}
                      ref={(el) => {
                        if (el) el.indeterminate = moduleSome && !moduleAll;
                      }}
                      disabled={permissionsLocked}
                      onChange={() => toggleModule(group)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-(--sofia-primary)"
                    />
                    All
                  </label>
                </div>
                <ul className="flex flex-1 flex-col gap-0.5 px-3.5 py-2.5">
                  {group.permissions.map((perm) => (
                    <li key={perm.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm text-slate-700 hover:bg-white/70">
                        <input
                          type="checkbox"
                          checked={selected.has(perm.id)}
                          disabled={permissionsLocked}
                          onChange={() => togglePermission(perm.id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-(--sofia-primary)"
                        />
                        {perm.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </FormSection>

      {mode === "edit" && initial ? (
        <FormSection
          title="Users with this role"
          description={
            initial.users.length
              ? `${initial.users.length} user(s) assigned.`
              : "No users assigned yet."
          }
          layout="stack"
        >
          {initial.users.length === 0 ? (
            <p className="text-sm text-slate-500">
              Assign users from staff accounts when ready.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80">
              {initial.users.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span className="font-medium text-slate-800">{u.email}</span>
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    {u.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </FormSection>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap gap-2">
          {isSystem ? (
            <button
              type="button"
              onClick={() => void handleDuplicate()}
              disabled={duplicating}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-(--sofia-primary) hover:text-(--sofia-primary) disabled:opacity-60"
            >
              {duplicating ? "Duplicating…" : "Duplicate role"}
            </button>
          ) : null}
          {!permissionsLocked ? (
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2 text-sm font-semibold text-white transition hover:bg-(--sofia-primary-dark) disabled:opacity-60"
            >
              {saving
                ? "Saving…"
                : mode === "create"
                  ? "Create role"
                  : "Save changes"}
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
