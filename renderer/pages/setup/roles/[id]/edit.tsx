import React from "react";
import { useRouter } from "next/router";
import { SetupShell } from "../../../../components/setup/SetupShell";
import { RoleForm } from "../../../../components/setup/roles/RoleForm";
import { getRole, type RoleDetail } from "../../../../lib/roles";

export default function EditRolePage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [role, setRole] = React.useState<RoleDetail | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await getRole(id);
      if (res.ok) setRole(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, [id]);

  const pageTitle = role
    ? role.is_system
      ? "View role"
      : "Edit role"
    : "Edit role";
  const pageDescription = role
    ? role.is_system
      ? "System roles are read-only. Duplicate to customize."
      : "Update the name, description, and permissions."
    : "Loading role details…";

  return (
    <SetupShell
      stepId="permissions"
      breadcrumbs={[{ label: role?.name ?? "Role" }]}
      pageTitle={pageTitle}
      pageDescription={pageDescription}
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading role…</p>
      ) : error || !role ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || "Role not found."}
        </p>
      ) : (
        <RoleForm mode="edit" initial={role} />
      )}
    </SetupShell>
  );
}
