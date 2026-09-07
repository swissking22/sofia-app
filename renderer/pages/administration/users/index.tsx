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
import {
  createAdminUser,
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

  const canCreate = meta?.can?.users_create;
  const canEdit = meta?.can?.users_edit;

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const allSelected =
    rows.length > 0 && selectedIds.length === rows.length;
  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(rows.map((u) => String(u.id)));
  }
  async function bulkUpdateStatus(newStatus: "active" | "inactive" | "suspended") {
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
          `"${u.last_login_at ? String(u.last_login_at) : "Never"}"`,
          `"${String(u.created_at || "")}"`,
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
      subtitle="School accounts inherit permissions from a single role. Deactivate instead of deleting."
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
              if (el)
                el.indeterminate = selectedIds.length > 0 && !allSelected;
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
              <td className="px-4 py-3">{String(u.role_name || u.role)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={String(u.status)} />
              </td>
              <td className="px-4 py-3 text-xs">
                {u.last_login_at
                  ? String(u.last_login_at).slice(0, 16)
                  : "Never"}
              </td>
              <td className="px-4 py-3 text-xs">
                {String(u.created_at).slice(0, 10)}
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
          roles={meta?.roles ?? []}
          onClose={() => setDetail(null)}
          onUpdated={async (msg) => {
            setSuccess(msg);
            setDetail(null);
            await load();
          }}
        />
      ) : null}
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
  roles,
  onClose,
  onUpdated,
}: {
  data: Record<string, unknown>;
  canEdit: boolean;
  roles: Array<{ id: string; name: string }>;
  onClose: () => void;
  onUpdated: (msg: string) => void;
}) {
  const user = (data.user ?? {}) as Record<string, string>;
  const perms = (data.permissions ?? []) as string[];
  const [status, setStatus] = React.useState(user.status);
  const [roleId, setRoleId] = React.useState(user.role_id);
  const [password, setPassword] = React.useState("Sofia@Temp1");
  const [confirmOff, setConfirmOff] = React.useState(false);

  return (
    <FormModal
      open
      title={`${user.first_name} ${user.last_name}`}
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
              onClick={() =>
                void updateAdminUser({
                  id: user.id,
                  role_id: roleId,
                  status,
                }).then((r) => (r.ok ? onUpdated("User updated.") : undefined))
              }
            >
              Save access
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
          </div>
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
    </FormModal>
  );
}
