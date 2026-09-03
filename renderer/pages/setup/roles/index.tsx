import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Copy01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { FormSection, SetupFooter } from "../../../components/setup";
import {
  SetupShell,
  useSetupProgress,
} from "../../../components/setup/SetupShell";
import {
  deleteRole,
  duplicateRole,
  listRoles,
  type RoleListItem,
} from "../../../lib/roles";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
} from "../../../lib/setup";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";

export default function RolesSetupPage() {
  return (
    <SetupShell stepId="permissions" aside={<RolesAside />}>
      <RolesList />
    </SetupShell>
  );
}

function RolesAside() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Roles & access</h3>
      <p className="mt-1 text-xs text-slate-500">
        Assign action-level permissions to each role. System roles can be
        duplicated but not deleted.
      </p>
      <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Grouped permissions by module
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Duplicate system roles to customize
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Create custom roles for your school
        </li>
      </ul>
    </div>
  );
}

function RolesList() {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();
  const [roles, setRoles] = React.useState<RoleListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [draftSaving, setDraftSaving] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await listRoles();
    if (res.ok) setRoles(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(role: RoleListItem) {
    if (role.is_system) return;
    if (
      !window.confirm(
        `Delete role “${role.name}”? This cannot be undone for local records.`,
      )
    ) {
      return;
    }
    setBusyId(role.id);
    setError("");
    try {
      const res = await deleteRole(role.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Deleted “${role.name}”.`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(role: RoleListItem) {
    setBusyId(role.id);
    setError("");
    try {
      const res = await duplicateRole(role.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Duplicated as “${res.data.name}”.`);
      await router.push(`/setup/roles/${res.data.id}/edit`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveDraft() {
    setDraftSaving(true);
    setError("");
    try {
      const draft = await saveSetupDraft("permissions");
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
    setSaving(true);
    setError("");
    try {
      const done = await completeSetupStep("permissions");
      if (!done.ok) {
        setError(done.error);
        return;
      }
      await refreshProgress();
      await router.push(getNextSetupHref("permissions"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading roles…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <Link
          href="/setup/roles/create"
          className="inline-flex cursor-pointer items-center rounded-xl bg-(--sofia-primary) px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-(--sofia-primary-dark)"
        >
          + Create role
        </Link>
      </div>

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

      <FormSection
        title="School roles"
        description="System roles ship ready to use. Duplicate or create custom roles as needed."
        layout="stack"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map((role) => (
            <article
              key={role.id}
              className="flex flex-col rounded-xl border border-slate-200/80 bg-slate-50/40 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {role.name}
                  </h3>
                  {role.is_system ? (
                    <span className="mt-1 inline-block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      System
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 line-clamp-2 flex-1 text-xs text-slate-500">
                {role.description || "No description"}
              </p>
              <p className="mt-3 text-xs text-slate-600">
                {role.user_count} user{role.user_count === 1 ? "" : "s"} ·{" "}
                {role.permission_count} permission
                {role.permission_count === 1 ? "" : "s"}
              </p>
              <div className="mt-3">
                <TableActionGroup align="start">
                  <TableIconButton
                    icon={role.is_system ? ViewIcon : PencilEdit01Icon}
                    label={role.is_system ? "View" : "Edit"}
                    tone="primary"
                    href={`/setup/roles/${role.id}/edit`}
                  />
                  <TableIconButton
                    icon={Copy01Icon}
                    label="Duplicate"
                    disabled={busyId === role.id}
                    onClick={() => void handleDuplicate(role)}
                  />
                  <TableIconButton
                    icon={Delete02Icon}
                    label={
                      role.is_system
                        ? "System roles cannot be deleted"
                        : "Delete role"
                    }
                    tone="danger"
                    disabled={role.is_system || busyId === role.id}
                    onClick={() => void handleDelete(role)}
                  />
                </TableActionGroup>
              </div>
            </article>
          ))}
        </div>
      </FormSection>

      <SetupFooter
        stepId="permissions"
        onSaveDraft={() => void handleSaveDraft()}
        onContinue={() => void handleContinue()}
        saving={saving}
        draftSaving={draftSaving}
      />
    </div>
  );
}
