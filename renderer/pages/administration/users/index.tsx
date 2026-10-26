import React from "react";
import Link from "next/link";
import { ViewIcon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import {
  ConfirmModal,
  EmptyRow,
  FilterBar,
  FilterField,
  FormModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StudentTable,
  TableSelectionBar,
  fieldClass,
  selectClass,
} from "../../../components/students/ui";
import {
  TableActionGroup,
  TableIconButton,
} from "../../../components/ui/TableActions";
import { formatDisplayDateTime } from "../../../lib/date-format";
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminMeta,
  fetchAdminUser,
  fetchAdminUsers,
  resetAdminPassword,
  revokeAdminSessions,
  updateAdminUser,
} from "../../../lib/system-admin";

export default function AdminUsersPage() {
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [meta, setMeta] = React.useState<
    | Extract<Awaited<ReturnType<typeof fetchAdminMeta>>, { ok: true }>["data"]
    | null
  >(null);
  const [rows, setRows] = React.useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [query, setQuery] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<Record<string, unknown> | null>(
    null,
  );
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  const canCreate = meta?.can?.users_create;
  const canEdit = meta?.can?.users_edit;
  const canDelete = meta?.can?.users_delete;

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(rows.map((u) => String(u.id)));
  }
  async function bulkUpdateStatus(
    newStatus: "active" | "inactive" | "suspended",
  ) {
    if (!selectedIds.length) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      for (const id of selectedIds) {
        await updateAdminUser({ id, status: newStatus });
      }
      setSuccess(`${selectedIds.length} user(s) updated to ${newStatus}.`);
      setSelectedIds([]);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function bulkDelete() {
    if (!selectedIds.length) return;
    setBusy(true);
    setError("");
    setSuccess("");
    let deleted = 0;
    const failures: string[] = [];
    try {
      for (const id of selectedIds) {
        const res = await deleteAdminUser(id);
        if (res.ok) deleted += 1;
        else failures.push(res.error);
      }
      if (deleted) setSuccess(`Deleted ${deleted} user(s).`);
      if (failures.length)
        setError(failures[0] || "Some users could not be deleted.");
      setSelectedIds([]);
      setConfirmBulkDelete(false);
      await load();
    } finally {
      setBusy(false);
    }
  }
  function exportSelected() {
    const target = rows.filter((u) => selectedIds.includes(String(u.id)));
    if (!target.length) return;
    const csv = [
      ["User", "Email", "Role", "Status", "Last Login", "Created At"].join(","),
      ...target.map((u) =>
        [
          `"${String(u.first_name || "")} ${String(u.last_name || "")}".trim()`,
          `"${String(u.email)}"`,
          `"${String(u.role_name || u.role || "")}"`,
          `"${String(u.status)}"`,
          `"${u.last_login_at ? formatDisplayDateTime(u.last_login_at as string, "") : "Never"}"`,
          `"${formatDisplayDateTime(u.created_at as string, "")}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const load = React.useCallback(async () => {
    const [m, list] = await Promise.all([
      fetchAdminMeta(),
      fetchAdminUsers({
        query,
        role_id: roleId || undefined,
        status: status || undefined,
        page,
      }),
    ]);
    if (m.ok) setMeta(m.data);
    if (list.ok) {
      setRows(list.data.users);
      setTotal(list.data.total);
    } else setError(list.error);
  }, [query, roleId, status, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell
      title="Users"
      breadcrumb={["System Administration", "Users & Roles"]}
      heading="Users & Roles"
      subtitle="All school logins, including teachers created under Staff → Teachers (Teacher role). Prefer deactivate for temporary access; delete removes the account (soft-delete + sync)."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}
      <div className="mb-4 flex gap-2">
        <Link
          href="/administration/roles"
          className="text-sm text-(--sofia-primary)"
        >
          Manage roles
        </Link>
        {canCreate ? (
          <PrimaryButton onClick={() => setCreateOpen(true)}>
            Create user
          </PrimaryButton>
        ) : null}
      </div>
      <FilterBar
        filters={
          <>
            <FilterField label="Search">
              <input
                className={fieldClass}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </FilterField>
            <FilterField label="Role">
              <select
                className={selectClass}
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                <option value="">All</option>
                {(meta?.roles ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Status">
              <select
                className={selectClass}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </FilterField>
          </>
        }
      />
      <StudentTable
        columns={[
          <input
            key="select-all"
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = selectedIds.length > 0 && !allSelected;
            }}
            onChange={toggleAll}
            aria-label="Select all"
          />,
          "User",
          "Email",
          "Role",
          "Status",
          "Last login",
          "Created",
          "Actions",
        ]}
      >
        {rows.length === 0 ? (
          <EmptyRow colSpan={8} message="No users match these filters." />
        ) : (
          rows.map((u) => (
            <tr key={String(u.id)}>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(String(u.id))}
                  onChange={() => toggleRow(String(u.id))}
                />
              </td>
              <td className="px-4 py-3 font-medium">
                {String(u.first_name || "")} {String(u.last_name || "")}
              </td>
              <td className="px-4 py-3 text-sm">{String(u.email)}</td>
              <td className="px-4 py-3">
                {String(u.role_name || u.role)}
                {u.staff_id ? (
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                    Staff linked
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={String(u.status)} />
              </td>
              <td className="px-4 py-3 text-xs">
                {u.last_login_at
                  ? formatDisplayDateTime(u.last_login_at as string)
                  : "Never"}
              </td>
              <td className="px-4 py-3 text-xs">
                {formatDisplayDateTime(u.created_at as string)}
              </td>
              <td className="px-4 py-3">
                <TableActionGroup>
                  <TableIconButton
                    icon={ViewIcon}
                    label="View user"
                    tone="primary"
                    onClick={() =>
                      void fetchAdminUser(String(u.id)).then(
                        (r) => r.ok && setDetail(r.data),
                      )
                    }
                  />
                </TableActionGroup>
              </td>
            </tr>
          ))
        )}
      </StudentTable>

      <TableSelectionBar
        totalCount={rows.length}
        selectedCount={selectedIds.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setSelectedIds([])}
        actions={
          <>
            {canEdit ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void bulkUpdateStatus("active")}
                  className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  Activate selected
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void bulkUpdateStatus("inactive")}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Deactivate selected
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void bulkUpdateStatus("suspended")}
                  className="cursor-pointer rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  Suspend selected
                </button>
              </>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                disabled={busy}
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
      <p className="mt-2 text-xs text-slate-500">
        {total} user(s) · page {page}
      </p>
      {total > 25 ? (
        <button
          type="button"
          className="mt-2 text-sm text-(--sofia-primary)"
          onClick={() => setPage((p) => p + 1)}
        >
          Next page
        </button>
      ) : null}

      <CreateUserModal
        open={createOpen}
        roles={meta?.roles ?? []}
        staff={meta?.staff ?? []}
        busy={busy}
        onClose={() => setCreateOpen(false)}
        onSave={async (payload) => {
          setBusy(true);
          setError("");
          const res = await createAdminUser(payload);
          setBusy(false);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setSuccess("User created. Share the temporary password securely.");
          setCreateOpen(false);
          await load();
        }}
      />

      {detail ? (
        <UserDetailModal
          data={detail}
          canEdit={Boolean(canEdit)}
          canDelete={Boolean(canDelete)}
          roles={meta?.roles ?? []}
          onClose={() => setDetail(null)}
          onUpdated={async (msg) => {
            setSuccess(msg);
            setDetail(null);
            await load();
          }}
          onError={(msg) => setError(msg)}
        />
      ) : null}

      <ConfirmModal
        open={confirmBulkDelete}
        title="Delete selected users?"
        description="Accounts are soft-deleted and removed from the active list. You cannot delete your own account or the last active administrator."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={() => void bulkDelete()}
      />
    </AppShell>
  );
}

function CreateUserModal({
  open,
  roles,
  staff,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  roles: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; name: string }>;
  busy: boolean;
  onClose: () => void;
  onSave: (input: Record<string, unknown>) => void;
}) {
  const [first, setFirst] = React.useState("");
  const [last, setLast] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [staffId, setStaffId] = React.useState("");
  const [password, setPassword] = React.useState("Sofia@Temp1");

  React.useEffect(() => {
    if (open) setRoleId(roles[0]?.id || "");
  }, [open, roles]);

  return (
    <FormModal
      open={open}
      title="Create user"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            disabled={busy || !first || !last || !email || !roleId}
            onClick={() =>
              onSave({
                first_name: first,
                last_name: last,
                email,
                phone,
                role_id: roleId,
                staff_id: staffId || null,
                password,
              })
            }
          >
            Create
          </PrimaryButton>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FilterField label="First name">
          <input
            className={fieldClass}
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
        </FilterField>
        <FilterField label="Last name">
          <input
            className={fieldClass}
            value={last}
            onChange={(e) => setLast(e.target.value)}
          />
        </FilterField>
        <FilterField label="Email">
          <input
            className={fieldClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FilterField>
        <FilterField label="Phone">
          <input
            className={fieldClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </FilterField>
        <FilterField label="Role">
          <select
            className={selectClass}
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Staff member (optional)">
          <select
            className={selectClass}
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
          >
            <option value="">None</option>
            {staff.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Temporary password" className="sm:col-span-2">
          <input
            className={fieldClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FilterField>
      </div>
    </FormModal>
  );
}

function UserDetailModal({
  data,
  canEdit,
  canDelete,
  roles,
  onClose,
  onUpdated,
  onError,
}: {
  data: Record<string, unknown>;
  canEdit: boolean;
  canDelete: boolean;
  roles: Array<{ id: string; name: string }>;
  onClose: () => void;
  onUpdated: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const user = (data.user ?? {}) as Record<string, string>;
  const perms = (data.permissions ?? []) as string[];
  const [firstName, setFirstName] = React.useState(user.first_name || "");
  const [lastName, setLastName] = React.useState(user.last_name || "");
  const [status, setStatus] = React.useState(user.status);
  const [roleId, setRoleId] = React.useState(user.role_id);
  const [password, setPassword] = React.useState("Sofia@Temp1");
  const [confirmOff, setConfirmOff] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const displayName =
    `${firstName.trim()} ${lastName.trim()}`.trim() || user.email;

  return (
    <FormModal
      open
      title={displayName}
      onClose={onClose}
      size="xl"
    >
      <p className="text-sm text-slate-500">{user.email}</p>
      <p className="mt-2 text-xs uppercase text-slate-400">
        Inherited permissions
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {perms.slice(0, 24).map((p) => (
          <code
            key={p}
            className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]"
          >
            {p}
          </code>
        ))}
      </div>
      {canEdit ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FilterField label="First name">
            <input
              className={fieldClass}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </FilterField>
          <FilterField label="Last name">
            <input
              className={fieldClass}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </FilterField>
          <FilterField label="Role">
            <select
              className={selectClass}
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Status">
            <select
              className={selectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </FilterField>
          <FilterField label="New temporary password">
            <input
              className={fieldClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FilterField>
          <div className="flex flex-wrap items-end gap-2">
            <SecondaryButton
              disabled={saving || !firstName.trim() || !lastName.trim()}
              onClick={() => {
                if (saving) return;
                setSaving(true);
                void updateAdminUser({
                  id: user.id,
                  first_name: firstName.trim(),
                  last_name: lastName.trim(),
                  role_id: roleId,
                  status,
                }).then((r) => {
                  setSaving(false);
                  if (r.ok) onUpdated("User updated.");
                  else onError(r.error);
                });
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </SecondaryButton>
            <SecondaryButton
              onClick={() =>
                void resetAdminPassword(user.id, password).then((r) =>
                  r.ok ? onUpdated("Password reset.") : undefined,
                )
              }
            >
              Reset password
            </SecondaryButton>
            <SecondaryButton
              onClick={() =>
                void revokeAdminSessions(user.id).then((r) =>
                  r.ok ? onUpdated("Sessions revoked.") : undefined,
                )
              }
            >
              Revoke sessions
            </SecondaryButton>
            {status === "active" ? (
              <button
                type="button"
                className="text-sm text-red-600"
                onClick={() => setConfirmOff(true)}
              >
                Deactivate
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                className="text-sm text-red-700"
                onClick={() => setConfirmDelete(true)}
              >
                Delete user
              </button>
            ) : null}
          </div>
        </div>
      ) : canDelete ? (
        <div className="mt-4">
          <button
            type="button"
            className="text-sm text-red-700"
            onClick={() => setConfirmDelete(true)}
          >
            Delete user
          </button>
        </div>
      ) : null}
      <ConfirmModal
        open={confirmOff}
        title="Deactivate this account?"
        description="The user will not be able to sign in. Historical actions stay in the audit log."
        confirmLabel="Deactivate"
        danger
        onCancel={() => setConfirmOff(false)}
        onConfirm={() => {
          void updateAdminUser({ id: user.id, status: "inactive" }).then(
            (r) => {
              setConfirmOff(false);
              if (r.ok) onUpdated("User deactivated.");
            },
          );
        }}
      />
      <ConfirmModal
        open={confirmDelete}
        title="Delete this user?"
        description="The account is soft-deleted, sessions are revoked, and the change syncs to the cloud. You cannot delete your own account or the last active administrator."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        danger
        onCancel={() => !deleting && setConfirmDelete(false)}
        onConfirm={() => {
          if (deleting) return;
          setDeleting(true);
          void deleteAdminUser(user.id).then((r) => {
            setDeleting(false);
            setConfirmDelete(false);
            if (r.ok) onUpdated("User deleted.");
            else onError(r.error);
          });
        }}
      />
    </FormModal>
  );
}
