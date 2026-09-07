import React from "react";
import Link from "next/link";
import { Add01Icon, UserCheck01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
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
  fieldClass,
  selectClass,
  useDebouncedValue,
} from "../../../components/students/ui";
import { Icon } from "../../../components/ui/Icon";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import { fetchAcademicStructure } from "../../../lib/academic-structure";
import {
  ADMISSION_STATUS_LABELS,
  approveAdmission,
  downloadCsv,
  fetchAdmissions,
  rejectAdmission,
  type AdmissionDto,
  type AdmissionStatusFilter,
} from "../../../lib/student-mgmt";

export default function AdmissionsIndexPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [rows, setRows] = React.useState<AdmissionDto[]>([]);
  const [status, setStatus] = React.useState<AdmissionStatusFilter>("pending");
  const [year, setYear] = React.useState("");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [classes, setClasses] = React.useState<
    Array<{ id: string; name: string; academic_level_id: string | null }>
  >([]);

  const [drawer, setDrawer] = React.useState<AdmissionDto | null>(null);
  const [approveClassId, setApproveClassId] = React.useState("");
  const [rejectNotes, setRejectNotes] = React.useState("");
  const [acting, setActing] = React.useState(false);
  const [confirmReject, setConfirmReject] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);

  const allSelected = rows.length > 0 && selected.length === rows.length;
  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelected([]);
    else setSelected(rows.map((r) => r.id));
  }
  function exportSelected() {
    const target = rows.filter((r) => selected.includes(r.id));
    if (!target.length) return;
    const csv = [
      ["Applicant", "Phone", "Email", "Level", "Preferred Class", "Year", "Guardian", "Status", "Applied"].join(","),
      ...target.map((r) =>
        [
          `"${r.full_name}"`,
          `"${r.phone || ""}"`,
          `"${r.email || ""}"`,
          `"${r.level_name || ""}"`,
          `"${r.class_name || ""}"`,
          r.admission_year ?? "",
          `"${r.guardian_name || ""}"`,
          `"${r.status}"`,
          `"${r.created_at?.slice(0, 10) || ""}"`,
        ].join(","),
      ),
    ].join("\n");
    downloadCsv(`admissions-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }
  async function bulkReject() {
    const pendingSelected = rows.filter((r) => selected.includes(r.id) && r.status === "pending");
    if (!pendingSelected.length) return;
    setActing(true);
    setError("");
    setSuccess("");
    try {
      for (const item of pendingSelected) {
        await rejectAdmission({ id: item.id, notes: "Bulk rejected" });
      }
      setSuccess(`Rejected ${pendingSelected.length} application(s).`);
      setSelected([]);
      await load();
    } finally {
      setActing(false);
    }
  }

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await fetchAdmissions({
      status,
      search: debouncedSearch || null,
      admissionYear: year ? Number(year) : null,
    });
    if (res.ok) setRows(res.data);
    else setError(res.error);
    setLoading(false);
  }, [status, debouncedSearch, year]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAcademicStructure();
      if (res.ok) {
        setClasses(
          res.data.classes
            .filter((c) => c.is_active === 1)
            .map((c) => ({
              id: c.id,
              name: c.name,
              academic_level_id: c.academic_level_id,
            })),
        );
      }
    })();
  }, []);

  const years = React.useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) {
      if (r.admission_year) set.add(r.admission_year);
    }
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [rows]);

  function openDrawer(row: AdmissionDto) {
    setDrawer(row);
    setApproveClassId(row.preferred_class_id || "");
    setRejectNotes("");
    setConfirmReject(false);
    setError("");
    setSuccess("");
  }

  function closeDrawer() {
    setDrawer(null);
    setConfirmReject(false);
  }

  const classOptions = React.useMemo(() => {
    if (!drawer?.academic_level_id) return classes;
    const filtered = classes.filter(
      (c) => c.academic_level_id === drawer.academic_level_id,
    );
    return filtered.length ? filtered : classes;
  }, [classes, drawer]);

  async function handleApprove() {
    if (!drawer) return;
    setError("");
    setSuccess("");
    if (!approveClassId) {
      setError("Select a class to place the student.");
      return;
    }
    setActing(true);
    try {
      const res = await approveAdmission({
        id: drawer.id,
        class_id: approveClassId,
        admission_year: drawer.admission_year,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `Accepted. Student created${
          res.data.student_code ? ` (${res.data.student_code})` : ""
        }.`,
      );
      closeDrawer();
      await load();
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!drawer) return;
    setError("");
    setSuccess("");
    setActing(true);
    try {
      const res = await rejectAdmission({
        id: drawer.id,
        notes: rejectNotes || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Application rejected.");
      closeDrawer();
      await load();
    } finally {
      setActing(false);
      setConfirmReject(false);
    }
  }

  return (
    <AppShell
      title="Admissions"
      breadcrumb={["Student Management", "Admissions"]}
      heading="Admissions"
      subtitle="Review applications. Approving creates an enrolled student."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={
          <>
            <FilterField label="Status">
              <select
                className={selectClass}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as AdmissionStatusFilter)
                }
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            </FilterField>
            <FilterField label="Year">
              <select
                className={selectClass}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Search" className="min-w-48 flex-1">
              <input
                className={`w-full ${selectClass}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, phone, guardian"
              />
            </FilterField>
          </>
        }
        actions={
          <PrimaryButton href="/students/admissions/create">
            <Icon icon={Add01Icon} size={16} />
            New application
          </PrimaryButton>
        }
      />

      <StudentTable
        loading={loading}
        columns={[
          <input
            key="select-all-header"
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = selected.length > 0 && !allSelected;
            }}
            onChange={toggleAll}
            aria-label="Select all"
          />,
          "Applicant",
          "Level",
          "Preferred class",
          "Year",
          "Guardian",
          "Status",
          "Applied",
          "",
        ]}
      >
        {rows.length === 0 ? (
          <EmptyRow colSpan={9}>
            No applications match these filters.{" "}
            <Link
              href="/students/admissions/create"
              className="font-semibold text-(--sofia-primary)"
            >
              New application
            </Link>
          </EmptyRow>
        ) : (
          rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={() => toggle(r.id)}
                />
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-800">{r.full_name}</p>
                <p className="text-xs text-slate-500">
                  {r.phone || r.email || "—"}
                </p>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {r.level_name || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {r.class_name || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {r.admission_year ?? "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {r.guardian_name || "—"}
                {r.guardian_phone ? (
                  <span className="block text-xs text-slate-400">
                    {r.guardian_phone}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={r.status}
                  label={ADMISSION_STATUS_LABELS[r.status] ?? r.status}
                />
              </td>
              <td className="px-4 py-3 text-slate-500">
                {r.created_at?.slice(0, 10) || "—"}
              </td>
              <td className="px-4 py-3 text-right">
                {r.status === "pending" ? (
                  <TableActionGroup>
                    <TableIconButton
                      icon={UserCheck01Icon}
                      label="Review"
                      tone="primary"
                      onClick={() => openDrawer(r)}
                    />
                  </TableActionGroup>
                ) : r.student_id ? (
                  <TableActionGroup>
                    <TableIconButton
                      icon={UserIcon}
                      label="View student"
                      tone="primary"
                      href={`/students/${r.student_id}`}
                    />
                  </TableActionGroup>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))
        )}
      </StudentTable>

      <TableSelectionBar
        totalCount={rows.length}
        selectedCount={selected.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setSelected([])}
        actions={
          <>
            <button
              type="button"
              disabled={acting}
              onClick={() => void bulkReject()}
              className="cursor-pointer rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Reject pending selected
            </button>
            <button
              type="button"
              onClick={exportSelected}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export selected ({selected.length})
            </button>
          </>
        }
      />

      <FormModal
        open={!!drawer}
        title="Review application"
        subtitle={drawer?.full_name}
        onClose={closeDrawer}
        footer={
          drawer ? (
            <>
              <PrimaryButton
                className="w-full"
                disabled={acting}
                onClick={() => void handleApprove()}
              >
                {acting ? "Working…" : "Approve → create student"}
              </PrimaryButton>
              <button
                type="button"
                disabled={acting}
                onClick={() => setConfirmReject(true)}
                className="w-full cursor-pointer rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                Reject
              </button>
              <SecondaryButton className="w-full" onClick={closeDrawer}>
                Close
              </SecondaryButton>
            </>
          ) : null
        }
      >
        {drawer ? (
          <div className="space-y-4 text-sm">
            {drawer.photo_url ? (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={drawer.photo_url}
                  alt={`${drawer.full_name} photo`}
                  className="h-28 w-28 rounded-xl border border-slate-200 object-cover"
                />
              </div>
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
                No 4×4 photo uploaded
              </p>
            )}
            <dl className="space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Level</dt>
                <dd className="font-medium text-slate-800">
                  {drawer.level_name || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Preferred class</dt>
                <dd className="font-medium text-slate-800">
                  {drawer.class_name || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Year</dt>
                <dd className="font-medium text-slate-800">
                  {drawer.admission_year ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Guardian</dt>
                <dd className="text-right font-medium text-slate-800">
                  {drawer.guardian_name || "—"}
                  {drawer.guardian_phone ? (
                    <span className="block text-xs font-normal text-slate-500">
                      {drawer.guardian_phone}
                    </span>
                  ) : null}
                </dd>
              </div>
              {drawer.notes ? (
                <div>
                  <dt className="text-slate-500">Notes</dt>
                  <dd className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
                    {drawer.notes}
                  </dd>
                </div>
              ) : null}
            </dl>

            <label className="block text-xs font-medium text-slate-500">
              Place in class
              <select
                className={`mt-1 block w-full ${selectClass}`}
                value={approveClassId}
                onChange={(e) => setApproveClassId(e.target.value)}
              >
                <option value="">Select class…</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-500">
              Rejection note (optional)
              <textarea
                className={`mt-1 block w-full resize-none ${fieldClass}`}
                rows={3}
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Reason for rejection"
              />
            </label>
          </div>
        ) : null}
      </FormModal>

      <ConfirmModal
        open={confirmReject}
        title="Reject application?"
        description={
          <>
            <span className="font-medium text-slate-700">
              {drawer?.full_name}
            </span>{" "}
            will be marked rejected. This cannot create a student record.
          </>
        }
        confirmLabel="Reject"
        danger
        busy={acting}
        onCancel={() => setConfirmReject(false)}
        onConfirm={() => void handleReject()}
      />
    </AppShell>
  );
}
