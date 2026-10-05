import React from "react";
import {
  Add01Icon,
  Copy01Icon,
  Delete02Icon,
  PauseIcon,
  PencilEdit01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import {
  FormModal,
  ConfirmModal,
  EmptyRow,
  FilterBar,
  FilterField,
  FinanceTable,
  TableSelectionBar,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  fieldClass,
  selectClass,
  useDebouncedValue,
} from "../../../components/finance/ui";
import { Icon } from "../../../components/ui/Icon";
import {
  TableActionGroup,
  TableIconButton,
} from "../../../components/ui/TableActions";
import {
  FREQUENCY_LABELS,
  createStructure,
  deleteStructure,
  fetchFinanceMeta,
  fetchStructures,
  formatMoney,
  setStructureActive,
  updateStructure,
  type FeeFrequency,
  type FeeStructureDto,
  type FinanceMeta,
  type LateFeeMode,
} from "../../../lib/finance-mgmt";

type LineDraft = {
  key: string;
  fee_category_id: string;
  name: string;
  amount: string;
  frequency: FeeFrequency;
  is_mandatory: boolean;
  late_fee_mode: LateFeeMode;
  late_fee_value: string;
};

type FormMode = "create" | "edit" | "duplicate";

function emptyLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    fee_category_id: "",
    name: "",
    amount: "",
    frequency: "termly",
    is_mandatory: true,
    late_fee_mode: "none",
    late_fee_value: "0",
  };
}

export default function FeeStructurePage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<FinanceMeta | null>(null);
  const [rows, setRows] = React.useState<FeeStructureDto[]>([]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<FormMode>("create");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [yearId, setYearId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [levelId, setLevelId] = React.useState("");
  const [sectionId, setSectionId] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [appliesTo, setAppliesTo] = React.useState<"all" | "day" | "boarding">(
    "all",
  );
  const [lines, setLines] = React.useState<LineDraft[]>([emptyLine()]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [filterYear, setFilterYear] = React.useState("");
  const [filterLevel, setFilterLevel] = React.useState("");
  const [filterSection, setFilterSection] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState("");
  const [filterSearch, setFilterSearch] = React.useState("");
  const debouncedFilterSearch = useDebouncedValue(filterSearch, 250);

  const filteredRows = React.useMemo(() => {
    const q = debouncedFilterSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterYear && r.academic_year_id !== filterYear) return false;
      if (filterLevel && r.academic_level_id !== filterLevel) return false;
      if (filterSection && r.section_id !== filterSection) return false;
      if (filterStatus === "active" && !r.is_active) return false;
      if (filterStatus === "inactive" && r.is_active) return false;
      if (!q) return true;
      const hay = [
        r.name,
        r.year_name,
        r.level_name,
        r.section_name,
        r.class_name,
        r.applies_to_residence,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    rows,
    filterYear,
    filterLevel,
    filterSection,
    filterStatus,
    debouncedFilterSearch,
  ]);

  const allSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selected.includes(r.id));
  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) {
      setSelected((prev) =>
        prev.filter((id) => !filteredRows.some((r) => r.id === id)),
      );
    } else {
      setSelected((prev) => [
        ...new Set([...prev, ...filteredRows.map((r) => r.id)]),
      ]);
    }
  }
  function exportSelected() {
    const target = rows.filter((r) => selected.includes(r.id));
    if (!target.length) return;
    const csv = [
      [
        "Name",
        "Year",
        "Level",
        "Department",
        "Class",
        "Residence",
        "Total",
        "Lines Count",
        "Status",
      ].join(","),
      ...target.map((r) =>
        [
          `"${r.name}"`,
          `"${r.year_name || ""}"`,
          `"${r.level_name || ""}"`,
          `"${r.section_name || ""}"`,
          `"${r.class_name || ""}"`,
          `"${r.applies_to_residence || "all"}"`,
          r.total,
          r.lines.length,
          `"${r.is_active ? "active" : "inactive"}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fee-structures-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "";

  const termsForYear = (meta?.terms ?? []).filter(
    (t) => t.academic_year_id === yearId,
  );
  const classesForLevel = (meta?.classes ?? []).filter((c) => {
    if (levelId && c.academic_level_id !== levelId) return false;
    if (sectionId && c.section_id !== sectionId) return false;
    return true;
  });

  const load = React.useCallback(async () => {
    const [metaRes, listRes] = await Promise.all([
      fetchFinanceMeta(),
      fetchStructures(),
    ]);
    if (metaRes.ok) {
      setMeta(metaRes.data);
      setYearId((prev) => {
        if (prev) return prev;
        const current = metaRes.data.years.find((y) => y.is_current);
        return current?.id ?? metaRes.data.years[0]?.id ?? "";
      });
    }
    if (listRes.ok) setRows(listRes.data);
    else setError(listRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setName("");
    setTermId("");
    setLevelId("");
    setSectionId("");
    setClassId("");
    setNotes("");
    setAppliesTo("all");
    setLines([emptyLine()]);
    setEditingId(null);
    setFormMode("create");
    const current = meta?.years.find((y) => y.is_current);
    setYearId(current?.id ?? meta?.years[0]?.id ?? "");
  }

  function fillFormFromRow(row: FeeStructureDto, mode: FormMode) {
    setFormMode(mode);
    setEditingId(mode === "edit" ? row.id : null);
    setName(mode === "duplicate" ? `Copy of ${row.name}` : row.name);
    setYearId(row.academic_year_id);
    setTermId(row.academic_term_id || "");
    setLevelId(row.academic_level_id || "");
    setSectionId(row.section_id || "");
    setClassId(row.class_id || "");
    setNotes(row.notes || "");
    setAppliesTo(row.applies_to_residence || "all");
    setLines(
      row.lines.length
        ? row.lines.map((l) => ({
            key: Math.random().toString(36).slice(2),
            fee_category_id: l.fee_category_id || "",
            name: l.name,
            amount: String(l.amount),
            frequency: l.frequency,
            is_mandatory: l.is_mandatory === 1,
            late_fee_mode: l.late_fee_mode,
            late_fee_value: String(l.late_fee_value ?? 0),
          }))
        : [emptyLine()],
    );
    setFormOpen(true);
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.fee_category_id !== undefined) {
          const cat = meta?.categories.find(
            (c) => c.id === patch.fee_category_id,
          );
          if (cat && !next.name.trim()) next.name = cat.name;
        }
        return next;
      }),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!name.trim() || !yearId) {
      setError("Name and academic year are required.");
      return;
    }
    const parsed = lines
      .map((l) => ({
        fee_category_id: l.fee_category_id || null,
        name:
          l.name.trim() ||
          meta?.categories.find((c) => c.id === l.fee_category_id)?.name ||
          "",
        amount: Number(l.amount),
        frequency: l.frequency,
        is_mandatory: l.is_mandatory,
        late_fee_mode: l.late_fee_mode,
        late_fee_value: Number(l.late_fee_value) || 0,
      }))
      .filter((l) => l.name && Number.isFinite(l.amount) && l.amount > 0);
    if (!parsed.length) {
      setError("Add at least one fee line with a positive amount.");
      return;
    }
    const payload = {
      name: name.trim(),
      academic_year_id: yearId,
      academic_term_id: termId || null,
      academic_level_id: levelId || null,
      section_id: sectionId || null,
      class_id: classId || null,
      notes: notes.trim() || null,
      applies_to_residence: appliesTo,
      lines: parsed,
    };
    setBusy(true);
    try {
      const res =
        formMode === "edit" && editingId
          ? await updateStructure({ id: editingId, ...payload })
          : await createStructure(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        formMode === "edit"
          ? `Fee structure “${res.data.name}” updated.`
          : formMode === "duplicate"
            ? `Fee structure “${res.data.name}” duplicated.`
            : `Fee structure “${res.data.name}” created.`,
      );
      setFormOpen(false);
      resetForm();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: FeeStructureDto) {
    setError("");
    setBusy(true);
    try {
      const res = await setStructureActive({
        id: row.id,
        is_active: !row.is_active,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        row.is_active
          ? `“${row.name}” deactivated.`
          : `“${row.name}” activated.`,
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setBusy(true);
    setError("");
    try {
      const res = await deleteStructure(deleteId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Fee structure deleted.");
      setDeleteId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Fee Structure"
      breadcrumb={["Finance & Fees", "Fee Structure"]}
      heading="Fee Structure"
      subtitle="Define tuition and fee packages by year, level, department, or class."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={
          <>
            <FilterField label="Search" className="min-w-44 flex-1">
              <input
                className={`w-full ${selectClass}`}
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Name, year, level…"
              />
            </FilterField>
            <FilterField label="Year">
              <select
                className={selectClass}
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
              >
                <option value="">All years</option>
                {(meta?.years ?? []).map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Level">
              <select
                className={selectClass}
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
              >
                <option value="">All levels</option>
                {(meta?.levels ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Department">
              <select
                className={selectClass}
                value={filterSection}
                onChange={(e) => setFilterSection(e.target.value)}
              >
                <option value="">All departments</option>
                {(meta?.sections ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Status">
              <select
                className={selectClass}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FilterField>
            <span className="self-end pb-2 text-sm text-slate-500">
              {filteredRows.length} structure
              {filteredRows.length === 1 ? "" : "s"}
            </span>
          </>
        }
        actions={
          canManage ? (
            <PrimaryButton
              onClick={() => {
                resetForm();
                setFormOpen(true);
              }}
            >
              <Icon icon={Add01Icon} size={16} />
              New structure
            </PrimaryButton>
          ) : null
        }
      />

      <FinanceTable
        columns={[
          <input
            key="select-all-header"
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el)
                el.indeterminate =
                  selected.length > 0 &&
                  !allSelected &&
                  filteredRows.some((r) => selected.includes(r.id));
            }}
            onChange={toggleAll}
            aria-label="Select all"
          />,
          "Name",
          "Year",
          "Level / department / class",
          "Total",
          "Lines",
          "Status",
          "Actions",
        ]}
        loading={loading}
      >
        {filteredRows.length === 0 ? (
          <EmptyRow
            colSpan={8}
            message={
              rows.length === 0
                ? "No fee structures yet."
                : "No fee structures match these filters."
            }
          />
        ) : (
          filteredRows.map((row) => (
            <tr
              key={row.id}
              className="border-t border-slate-100 hover:bg-slate-50/80"
            >
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.includes(row.id)}
                  onChange={() => toggle(row.id)}
                />
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">
                {row.name}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {row.year_name ?? "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {[row.level_name, row.section_name, row.class_name]
                  .filter(Boolean)
                  .join(" · ") || "All"}
                {row.applies_to_residence &&
                row.applies_to_residence !== "all" ? (
                  <div className="text-xs text-slate-500">
                    {row.applies_to_residence === "boarding"
                      ? "Boarding students"
                      : "Day students"}
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3 font-medium text-slate-800">
                {formatMoney(row.total, currency)}
              </td>
              <td className="px-4 py-3 text-slate-600">{row.lines.length}</td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={row.is_active ? "active" : "inactive"}
                  label={row.is_active ? "Active" : "Inactive"}
                />
              </td>
              <td className="px-4 py-3">
                {canManage ? (
                  <TableActionGroup>
                    <TableIconButton
                      icon={PencilEdit01Icon}
                      label="Edit"
                      onClick={() => fillFormFromRow(row, "edit")}
                    />
                    <TableIconButton
                      icon={Copy01Icon}
                      label="Duplicate"
                      onClick={() => fillFormFromRow(row, "duplicate")}
                    />
                    <TableIconButton
                      icon={row.is_active ? PauseIcon : Tick02Icon}
                      label={row.is_active ? "Deactivate" : "Activate"}
                      tone={row.is_active ? "warning" : "primary"}
                      onClick={() => void toggleActive(row)}
                    />
                    <TableIconButton
                      icon={Delete02Icon}
                      label="Delete"
                      tone="danger"
                      onClick={() => setDeleteId(row.id)}
                    />
                  </TableActionGroup>
                ) : (
                  <span className="text-xs text-slate-400">View only</span>
                )}
              </td>
            </tr>
          ))
        )}
      </FinanceTable>

      <TableSelectionBar
        totalCount={rows.length}
        selectedCount={selected.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setSelected([])}
        actions={
          <button
            type="button"
            onClick={exportSelected}
            className="cursor-pointer rounded-lg bg-(--sofia-primary) px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
          >
            Export selected ({selected.length})
          </button>
        }
      />

      <FormModal
        open={formOpen}
        title={
          formMode === "edit"
            ? "Edit fee structure"
            : formMode === "duplicate"
              ? "Duplicate fee structure"
              : "New fee structure"
        }
        subtitle={
          formMode === "edit"
            ? "Update package scope and fee lines. Existing invoices are not changed."
            : formMode === "duplicate"
              ? "Review the copy, adjust as needed, then save as a new structure."
              : "Add named fee lines with amounts and frequency."
        }
        size="xl"
        onClose={() => {
          setFormOpen(false);
          resetForm();
        }}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form="fee-structure-form"
              disabled={busy}
            >
              {busy
                ? "Saving…"
                : formMode === "edit"
                  ? "Save changes"
                  : formMode === "duplicate"
                    ? "Create copy"
                    : "Create structure"}
            </PrimaryButton>
          </div>
        }
      >
        <form
          id="fee-structure-form"
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-5"
        >
          <FormSection
            title="Details"
            description="Scope this package to a year, term, level, department, or class."
          >
            <FormField label="Name" required fullWidth>
              <input
                className={fieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Form 1 Technical Day fees"
                required
              />
            </FormField>
            <FormField label="Academic year" required>
              <select
                className={selectClass}
                value={yearId}
                onChange={(e) => {
                  setYearId(e.target.value);
                  setTermId("");
                }}
                required
              >
                <option value="">Select year</option>
                {(meta?.years ?? []).map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Term (optional)">
              <select
                className={selectClass}
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              >
                <option value="">Any term</option>
                {termsForYear.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Level (optional)">
              <select
                className={selectClass}
                value={levelId}
                onChange={(e) => {
                  setLevelId(e.target.value);
                  setClassId("");
                }}
              >
                <option value="">All levels</option>
                {(meta?.levels ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Department (optional)">
              <select
                className={selectClass}
                value={sectionId}
                onChange={(e) => {
                  setSectionId(e.target.value);
                  setClassId("");
                }}
              >
                <option value="">All departments</option>
                {(meta?.sections ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Class (optional)">
              <select
                className={selectClass}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">All classes</option>
                {classesForLevel.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Applies to">
              <select
                className={selectClass}
                value={appliesTo}
                onChange={(e) =>
                  setAppliesTo(e.target.value as "all" | "day" | "boarding")
                }
              >
                <option value="all">All students (day & boarding)</option>
                <option value="day">Day students only</option>
                <option value="boarding">Boarding students only</option>
              </select>
            </FormField>
            <p className="col-span-full text-xs text-slate-500">
              For schools with both day and boarding students, create separate
              packages (Day vs Boarding) so boarders are not billed the day fee
              and vice versa.
            </p>
            <FormField label="Notes" fullWidth>
              <textarea
                className={fieldClass}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for this structure"
              />
            </FormField>
          </FormSection>

          <FormSection
            title="Fee lines"
            description="Break the package into individual charges."
            layout="stack"
          >
            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div
                  key={line.key}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">
                      Line {idx + 1}
                    </span>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        className="cursor-pointer text-xs font-medium text-red-600 hover:text-red-700"
                        onClick={() =>
                          setLines((prev) =>
                            prev.filter((l) => l.key !== line.key),
                          )
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-6">
                    <div className="sm:col-span-2">
                      <FormField label="Category">
                        <select
                          className={selectClass}
                          value={line.fee_category_id}
                          onChange={(e) =>
                            updateLine(line.key, {
                              fee_category_id: e.target.value,
                            })
                          }
                        >
                          <option value="">Custom / other</option>
                          {(meta?.categories ?? []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    </div>
                    <div className="sm:col-span-4">
                      <FormField label="Name">
                        <input
                          className={fieldClass}
                          value={line.name}
                          onChange={(e) =>
                            updateLine(line.key, { name: e.target.value })
                          }
                          placeholder="Tuition, PTA, sports…"
                        />
                      </FormField>
                    </div>

                    <div className="sm:col-span-2">
                      <FormField label="Amount">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className={fieldClass}
                          value={line.amount}
                          onChange={(e) =>
                            updateLine(line.key, { amount: e.target.value })
                          }
                          placeholder="0.00"
                        />
                      </FormField>
                    </div>
                    <div className="sm:col-span-2">
                      <FormField label="Frequency">
                        <select
                          className={selectClass}
                          value={line.frequency}
                          onChange={(e) =>
                            updateLine(line.key, {
                              frequency: e.target.value as FeeFrequency,
                            })
                          }
                        >
                          {(
                            Object.keys(FREQUENCY_LABELS) as FeeFrequency[]
                          ).map((f) => (
                            <option key={f} value={f}>
                              {FREQUENCY_LABELS[f]}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    </div>
                    <div className="mb-4 flex items-end sm:col-span-2">
                      <label className="flex h-10.5 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={line.is_mandatory}
                          onChange={(e) =>
                            updateLine(line.key, {
                              is_mandatory: e.target.checked,
                            })
                          }
                        />
                        Mandatory
                      </label>
                    </div>

                    <div className="sm:col-span-3">
                      <FormField label="Late fee">
                        <select
                          className={selectClass}
                          value={line.late_fee_mode}
                          onChange={(e) =>
                            updateLine(line.key, {
                              late_fee_mode: e.target.value as LateFeeMode,
                            })
                          }
                        >
                          <option value="none">None</option>
                          <option value="fixed">Fixed amount</option>
                          <option value="percent">Percent</option>
                        </select>
                      </FormField>
                    </div>
                    <div className="sm:col-span-3">
                      <FormField label="Late fee value">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className={fieldClass}
                          disabled={line.late_fee_mode === "none"}
                          value={line.late_fee_value}
                          onChange={(e) =>
                            updateLine(line.key, {
                              late_fee_value: e.target.value,
                            })
                          }
                          placeholder={
                            line.late_fee_mode === "percent" ? "%" : "0.00"
                          }
                        />
                      </FormField>
                    </div>
                  </div>
                </div>
              ))}

              <SecondaryButton
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                Add line
              </SecondaryButton>
            </div>
          </FormSection>
        </form>
      </FormModal>

      <ConfirmModal
        open={!!deleteId}
        title="Delete fee structure?"
        description="This soft-deletes the structure. Existing invoices are kept."
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </AppShell>
  );
}
