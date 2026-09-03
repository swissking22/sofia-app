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
  fieldClass,
  selectClass,
} from "../../../components/students/ui";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
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
  const [meta, setMeta] = React.useState<Awaited<ReturnType<typeof fetchAdminMeta>> extends { ok: true; data: infer D } ? D : null>(null);
  const [rows, setRows] = React.useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [query, setQuery] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<Record<string, unknown> | null>(null);

  const canCreate = meta?.can?.users_create;
  const canEdit = meta?.can?.users_edit;

  const load = React.useCallback(async () => {
    const [m, list] = await Promise.all([
      fetchAdminMeta(),
      fetchAdminUsers({ query, role_id: roleId || undefined, status: status || undefined, page }),
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
        <Link href="/administration/roles" className="text-sm text-(--sofia-primary)">
          Manage roles
        </Link>
        {canCreate ? (
          <PrimaryButton onClick={() => setCreateOpen(true)}>Create user</PrimaryButton>
        ) : null}
      </div>
      <FilterBar
        filters={
          <>
            <FilterField label="Search">
              <input className={fieldClass} value={query} onChange={(e) => setQuery(e.target.value)} />
            </FilterField>
            <FilterField label="Role">
              <select className={selectClass} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                <option value="">All</option>
                {(meta?.roles ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Status">
              <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </FilterField>
          </>
        }
      />
      <StudentTable columns={["User", "Email", "Role", "Status", "Last login", "Created", "Actions"]}>
        {rows.length === 0 ? (
          <EmptyRow colSpan={7} message="No users match these filters." />
        ) : (
          rows.map((u) => (
            <tr key={String(u.id)}>
              <td className="px-4 py-3 font-medium">
                {String(u.first_name || "")} {String(u.last_name || "")}
              </td>
              <td className="px-4 py-3 text-sm">{String(u.email)}</td>
              <td className="px-4 py-3">{String(u.role_name || u.role)}</td>
              <td className="px-4 py-3"><StatusBadge status={String(u.status)} /></td>
              <td className="px-4 py-3 text-xs">{u.last_login_at ? String(u.last_login_at).slice(0, 16) : "Never"}</td>
              <td className="px-4 py-3 text-xs">{String(u.created_at).slice(0, 10)}</td>
              <td className="px-4 py-3">
                <TableActionGroup>
                  <TableIconButton
                    icon={ViewIcon}
                    label="View user"
                    tone="primary"
                    onClick={() =>
                      void fetchAdminUser(String(u.id)).then((r) => r.ok && setDetail(r.data))
                    }
                  />
                </TableActionGroup>
              </td>
            </tr>
          ))
        )}
      </StudentTable>
      <p className="mt-2 text-xs text-slate-500">{total} user(s) · page {page}</p>
      {total > 25 ? (
        <button type="button" className="mt-2 text-sm text-(--sofia-primary)" onClick={() => setPage((p) => p + 1)}>
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
        <FilterField label="First name"><input className={fieldClass} value={first} onChange={(e) => setFirst(e.target.value)} /></FilterField>
        <FilterField label="Last name"><input className={fieldClass} value={last} onChange={(e) => setLast(e.target.value)} /></FilterField>
        <FilterField label="Email"><input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} /></FilterField>
        <FilterField label="Phone"><input className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></FilterField>
        <FilterField label="Role">
          <select className={selectClass} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Staff member (optional)">
          <select className={selectClass} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">None</option>
            {staff.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Temporary password" className="sm:col-span-2">
          <input className={fieldClass} value={password} onChange={(e) => setPassword(e.target.value)} />
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
    <FormModal open title={`${user.first_name} ${user.last_name}`} onClose={onClose} size="xl">
      <p className="text-sm text-slate-500">{user.email}</p>
      <p className="mt-2 text-xs uppercase text-slate-400">Inherited permissions</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {perms.slice(0, 24).map((p) => (
          <code key={p} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{p}</code>
        ))}
      </div>
      {canEdit ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FilterField label="Role">
            <select className={selectClass} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Status">
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </FilterField>
          <FilterField label="New temporary password">
            <input className={fieldClass} value={password} onChange={(e) => setPassword(e.target.value)} />
          </FilterField>
          <div className="flex flex-wrap items-end gap-2">
            <SecondaryButton
              onClick={() =>
                void updateAdminUser({ id: user.id, role_id: roleId, status }).then((r) =>
                  r.ok ? onUpdated("User updated.") : undefined,
                )
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
              <button type="button" className="text-sm text-red-600" onClick={() => setConfirmOff(true)}>
                Deactivate
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <ConfirmModal
        open={confirmOff}
        title="Deactivate this account?"
        message="The user will not be able to sign in. Historical actions stay in the audit log."
        confirmLabel="Deactivate"
        danger
        onClose={() => setConfirmOff(false)}
        onConfirm={() =>
          void updateAdminUser({ id: user.id, status: "inactive" }).then((r) => {
            setConfirmOff(false);
            if (r.ok) onUpdated("User deactivated.");
          })
        }
      />
    </FormModal>
  );
}
