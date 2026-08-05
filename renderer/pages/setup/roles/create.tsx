import { SetupShell } from "../../../components/setup/SetupShell";
import { RoleForm } from "../../../components/setup/roles/RoleForm";

export default function CreateRolePage() {
  return (
    <SetupShell
      stepId="permissions"
      breadcrumbs={[{ label: "Create role" }]}
      pageTitle="Create role"
      pageDescription="Name the role and choose which actions it can perform."
    >
      <RoleForm mode="create" />
    </SetupShell>
  );
}
