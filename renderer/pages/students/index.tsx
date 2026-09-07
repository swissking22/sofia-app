import React from "react";
import Link from "next/link";
import {
  Add01Icon,
  File01Icon,
  MoreHorizontalIcon,
  PrinterIcon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
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
  TableSelectionBar,
  selectClass,
  useDebouncedValue,
} from "../../components/students/ui";
import { Icon } from "../../components/ui/Icon";
import {
  TableActionGroup,
  TableIconButton,
} from "../../components/ui/TableActions";
import {
  classListFilename,
  classListToCsv,
  classListsToCsv,
} from "../../lib/class-list";
import {
  bulkUpdateStudentStatus,
  deleteStudent,
  downloadCsv,
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
  const [classId, setClassId] = React.useState("");
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
      classId: classId || null,
      search: debouncedSearch || null,
    });
    if (res.ok) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, [year, levelId, sectionId, classId, debouncedSearch]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const students = data?.students ?? [];
  const classOptions = React.useMemo(() => {
    const all = data?.filters.classes ?? [];
    return all.filter((c) => {
      if (levelId && c.academic_level_id !== levelId) return false;
      if (sectionId && c.section_id !== sectionId) return false;
      return true;
    });
  }, [data?.filters.classes, levelId, sectionId]);

  const canPrintOrExport =
    selected.length > 0 || Boolean(classId) || students.length > 0;

  function classListHref() {
    if (selected.length > 0) {
      const q = new URLSearchParams();
      if (classId) q.set("class_id", classId);
      q.set("ids", selected.join(","));
      return `/students/class-lists?${q.toString()}`;
    }
    if (classId) {
      return `/students/class-lists?class_id=${encodeURIComponent(classId)}`;
    }
    return "/students/class-lists?class_id=all";
  }

  function exportCurrentList() {
    const rows =
      selected.length > 0
        ? students.filter((s) => selected.includes(s.id))
        : students;
    if (!rows.length) return;
    const fromFilter = classOptions.find((c) => c.id === classId)?.name;
    if (classId && fromFilter) {
      downloadCsv(classListFilename(fromFilter), classListToCsv(rows));
      return;
    }
    const byClass = new Map<string, { name: string; students: typeof rows }>();
    for (const row of rows) {
      const key = row.class_id || "__none__";
      const entry = byClass.get(key) ?? {
        name: row.class_name?.trim() || "Unassigned",
        students: [],
      };
      entry.students.push(row);
      byClass.set(key, entry);
    }
    const order = new Map(
      (data?.filters.classes ?? []).map((c, i) => [c.id, i]),
    );
    const sections = [...byClass.entries()]
      .sort(([a], [b]) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999))
      .map(([, v]) => ({ class_name: v.name, students: v.students }));
    downloadCsv(
      classListFilename(
        sections.length === 1 ? sections[0].class_name : "All classes",
      ),
      classListsToCsv(sections),
    );
  }

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
                onChange={(e) => {
                  setLevelId(e.target.value);
                  setClassId("");
                }}
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
                onChange={(e) => {
                  setSectionId(e.target.value);
                  setClassId("");
                }}
              >
                <option value="">All departments</option>
                {(data?.filters.sections ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Class">
              <select
                className={selectClass}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">All classes</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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
            {canPrintOrExport ? (
              <>
                <SecondaryButton onClick={exportCurrentList}>
                  <Icon icon={File01Icon} size={16} />
                  Export class list
                </SecondaryButton>
                <SecondaryButton href={classListHref()}>
                  <Icon icon={PrinterIcon} size={16} />
                  Print class list
                </SecondaryButton>
              </>
            ) : null}
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
          <input
            key="select-all-header"
            type="checkbox"
            checked={students.length > 0 && selected.length === students.length}
            ref={(el) => {
              if (el) {
                el.indeterminate =
                  selected.length > 0 && selected.length < students.length;
              }
            }}
            onChange={toggleAll}
            aria-label="Select all"
          />,
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

      <TableSelectionBar
        totalCount={students.length}
        selectedCount={selected.length}
        allSelected={students.length > 0 && selected.length === students.length}
        onToggleAll={toggleAll}
        onClear={() => setSelected([])}
        actions={
          <>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="cursor-pointer rounded-lg bg-(--sofia-primary) px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
            >
              Bulk actions ({selected.length})
            </button>
            <button
              type="button"
              onClick={exportCurrentList}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export selected ({selected.length})
            </button>
            <Link
              href={classListHref()}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Print list
            </Link>
          </>
        }
      />

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
