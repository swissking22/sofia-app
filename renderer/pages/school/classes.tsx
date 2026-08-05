import { AppShell } from "../../components/layout/AppShell";
import { AcademicStructureManager } from "../../components/school/AcademicStructureManager";

export default function SchoolClassesPage() {
  return (
    <AppShell
      title="Classes"
      breadcrumb={["School Management", "Classes"]}
      heading="Classes"
      subtitle="Manage academic levels, sections, specializations, and classes."
    >
      <AcademicStructureManager />
    </AppShell>
  );
}
