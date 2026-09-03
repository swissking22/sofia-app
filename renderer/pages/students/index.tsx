import React from "react";
import Link from "next/link";
import { Add01Icon, MoreHorizontalIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../components/layout/AppShell";
import {
  FormModal,
  ConfirmModal,
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StudentTable,
  selectClass,
  useDebouncedValue,
} from "../../components/students/ui";
import { Icon } from "../../components/ui/Icon";
import { TableActionGroup, TableIconButton } from "../../components/ui/TableActions";
import {
  bulkUpdateStudentStatus,
  deleteStudent,
  fetchStudentList,
  STATUS_LABELS,
  type StudentDto,
  type StudentListResult,
  type StudentStatus,
} from "../../lib/student-mgmt";

export default function StudentsIndexPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [data, setData] = React.useState<StudentListResult | null>(null);
  const [year, setYear] = React.useState("");
  const [levelId, setLevelId] = React.useState("");
  const [sectionId, setSectionId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [rowAction, setRowAction] = React.useState<StudentDto | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetchStudentList({
      status: "active",
      admissionYear: year ? Number(year) : null,
      academicLevelId: levelId || null,
      sectionId: sectionId || null,
      search: debouncedSearch || null,
    });
    if (res.ok) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, [year, levelId, sectionId, debouncedSearch]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const students = data?.students ?? [];

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    if (selected.length === students.length) setSelected([]);
    else setSelected(students.map((s) => s.id));
  }

  async function markAlumni(ids: string[]) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await bulkUpdateStudentStatus(ids, "alumni" as StudentStatus);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Marked ${res.data.updated} student(s) as alumni.`);
      setSelected([]);
      setBulkOpen(false);
      setRowAction(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function runDelete() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      for (const id of selected) {
        const res = await deleteStudent(id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }
      setSuccess(`Removed ${selected.length} student(s).`);
      setSelected([]);
      setConfirmDelete(false);
      setBulkOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Students"
      breadcrumb={["Student Management", "Students"]}
      heading="Students"
      subtitle="Browse, filter, and manage enrolled students."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={
          <>
            <FilterField label="Year">
              <select
                className={selectClass}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">All years</option>
                {(data?.filters.years ?? []).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Level">
              <select
                className={selectClass}
                value={levelId}
                onChange={(e) => setLevelId(e.target.value)}
              >
                <option value="">All levels</option>
                {(data?.filters.levels ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Department">
              <select
                className={selectClass}
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                <option value="">All departments</option>
                {(data?.filters.sections ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Search" className="min-w-48 flex-1">
              <input
                className={`w-full ${selectClass}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or student ID"
              />
            </FilterField>
          </>
        }
        actions={
          <>
            {selected.length > 0 ? (
              <SecondaryButton onClick={() => setBulkOpen(true)}>
                Bulk ({selected.length})
              </SecondaryButton>
            ) : null}
            <SecondaryButton href="/setup/students">
              <Icon icon={Upload04Icon} size={16} />
              Import
            </SecondaryButton>
            <PrimaryButton href="/students/create">
              <Icon icon={Add01Icon} size={16} />
              Add student
            </PrimaryButton>
          </>
        }
      />

      <StudentTable
        loading={loading}
        columns={[
          "",
          "Student ID",
          "Name",
          "Class",
          "Level",
          "Year",
          "Status",
          "",
        ]}
      >
        {students.length === 0 ? (
          <EmptyRow colSpan={8}>
            No students match these filters.{" "}
            <Link
              href="/students/create"
              className="font-semibold text-(--sofia-primary)"
            >
              Add a student
            </Link>
          </EmptyRow>
        ) : (
          students.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={() => toggle(s.id)}
                />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">
                {s.student_code || "—"}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/students/${s.id}`}
                  className="font-medium text-(--sofia-primary) hover:underline"
                >
                  {s.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {s.class_name || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {s.level_name || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {s.admission_year ?? "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={s.status}
                  label={STATUS_LABELS[s.status] ?? s.status}
                />
              </td>
              <td className="px-4 py-3 text-right">
                <TableActionGroup>
                  <TableIconButton
                    icon={MoreHorizontalIcon}
                    label="Actions"
                    onClick={() => setRowAction(s)}
                  />
                </TableActionGroup>
              </td>
            </tr>
          ))
        )}
      </StudentTable>

      {students.length > 0 ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={selected.length === students.length}
            onChange={toggleAll}
          />
          Select all on this page
        </div>
      ) : null}

      <FormModal
        open={bulkOpen}
        title="Bulk actions"
        subtitle={`${selected.length} student(s) selected`}
        onClose={() => setBulkOpen(false)}
        footer={
          <>
            <PrimaryButton
              className="w-full"
              disabled={busy}
              onClick={() => void markAlumni(selected)}
            >
              Mark as alumni
            </PrimaryButton>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className="w-full cursor-pointer rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Delete selected
            </button>
            <SecondaryButton
              className="w-full"
              onClick={() => setBulkOpen(false)}
            >
              Cancel
            </SecondaryButton>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Choose an action to apply to every selected student.
        </p>
      </FormModal>

      <FormModal
        open={!!rowAction}
        title="Quick actions"
        subtitle={rowAction?.name}
        onClose={() => setRowAction(null)}
        footer={
          rowAction ? (
            <>
              <PrimaryButton
                className="w-full"
                href={`/students/${rowAction.id}`}
              >
                View profile
              </PrimaryButton>
              <SecondaryButton
                className="w-full"
                href={`/students/documents/upload?student_id=${rowAction.id}`}
              >
                Upload document
              </SecondaryButton>
              <SecondaryButton
                className="w-full"
                href={`/students/transfers/create?student_id=${rowAction.id}`}
              >
                Transfer student
              </SecondaryButton>
              <SecondaryButton
                className="w-full"
                disabled={busy}
                onClick={() => void markAlumni([rowAction.id])}
              >
                Mark as alumni
              </SecondaryButton>
            </>
          ) : null
        }
      >
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Student ID</dt>
            <dd className="font-mono text-xs font-medium">
              {rowAction?.student_code || "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Class</dt>
            <dd className="font-medium">{rowAction?.class_name || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Status</dt>
            <dd>
              {rowAction ? (
                <StatusBadge
                  status={rowAction.status}
                  label={STATUS_LABELS[rowAction.status] ?? rowAction.status}
                />
              ) : null}
            </dd>
          </div>
        </dl>
      </FormModal>

      <ConfirmModal
        open={confirmDelete}
        title="Delete students?"
        description={`${selected.length} student(s) will be soft-deleted. This can be recovered from the database later but they will leave the active roster.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void runDelete()}
      />
    </AppShell>
  );
}
