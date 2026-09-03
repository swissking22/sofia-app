import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { PageAlert } from "../../../components/students/ui";
import { fetchPermissionMatrix } from "../../../lib/system-admin";

export default function PermissionsMatrixPage() {
  const [error, setError] = React.useState("");
  const [roles, setRoles] = React.useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [matrix, setMatrix] = React.useState<
    Array<{
      permission_label: string;
      module_label: string;
      roles: Record<string, boolean>;
    }>
  >([]);

  React.useEffect(() => {
    void fetchPermissionMatrix().then((res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRoles(res.data.roles);
      setMatrix(res.data.matrix);
    });
  }, []);

  return (
    <AppShell
      title="Permissions"
      breadcrumb={["System Administration", "Permissions"]}
      heading="Permission matrix"
      subtitle="Users inherit these grants through their role. Read-only roles have view/read cells only."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2 text-left font-semibold">Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="px-3 py-2 text-center font-semibold">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr
                key={row.permission_label + row.module_label}
                className="border-b border-slate-100"
              >
                <td className="px-3 py-2">
                  <span className="text-slate-400">{row.module_label} · </span>
                  {row.permission_label}
                </td>
                {roles.map((r) => (
                  <td key={r.id} className="px-3 py-2 text-center">
                    {row.roles[r.id] ? "✓" : "✗"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
