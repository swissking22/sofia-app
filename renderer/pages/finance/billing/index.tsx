import React from "react";
import { Add01Icon, Delete02Icon, ViewIcon } from "@hugeicons/core-free-icons";
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
  INVOICE_STATUS_LABELS,
  adjustInvoice,
  bulkGenerateInvoices,
  deleteInvoice,
  fetchFinanceMeta,
  fetchInvoice,
  fetchInvoices,
  fetchStructures,
  formatMoney,
  generateInvoice,
  residenceLabel,
  structureMatchesStudent,
  preferredFeeStructuresForStudent,
  structureScopeSuffix,
  type DiscountMode,
  type FinanceMeta,
  type FeeStructureDto,
  type InvoiceDetailDto,
  type InvoiceDto,
  type InvoiceStatus,
} from "../../../lib/finance-mgmt";

export default function BillingPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<FinanceMeta | null>(null);
  const [structures, setStructures] = React.useState<FeeStructureDto[]>([]);
  const [invoices, setInvoices] = React.useState<InvoiceDto[]>([]);
  const [status, setStatus] = React.useState<InvoiceStatus | "all">("all");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const [genOpen, setGenOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<InvoiceDetailDto | null>(null);

  const [studentId, setStudentId] = React.useState("");
  const [studentQuery, setStudentQuery] = React.useState("");
  const [studentMenuOpen, setStudentMenuOpen] = React.useState(false);
  const [structureId, setStructureId] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [carryArrears, setCarryArrears] = React.useState(true);
  const [discountMode, setDiscountMode] = React.useState<DiscountMode | "">("");
  const [discountValue, setDiscountValue] = React.useState("");
  const studentSearchRef = React.useRef<HTMLDivElement | null>(null);

  const [bulkMode, setBulkMode] = React.useState<"structure" | "all_classes">(
    "structure",
  );
  const [bulkStructureId, setBulkStructureId] = React.useState("");
  const [bulkClassId, setBulkClassId] = React.useState("");
  const [bulkDueDate, setBulkDueDate] = React.useState("");
  const [bulkCarry, setBulkCarry] = React.useState(true);

  const [adjDesc, setAdjDesc] = React.useState("");
  const [adjAmount, setAdjAmount] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [deleteIds, setDeleteIds] = React.useState<string[] | null>(null);

  const allSelected =
    invoices.length > 0 && selected.length === invoices.length;
  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelected([]);
    else setSelected(invoices.map((inv) => inv.id));
  }
  function exportSelected() {
    const target = invoices.filter((inv) => selected.includes(inv.id));
    if (!target.length) return;
    const csv = [
      [
        "Invoice Number",
        "Student",
        "Student ID",
        "Class",
        "Issued Date",
        "Due Date",
        "Net Payable",
        "Amount Paid",
        "Balance",
        "Status",
      ].join(","),
      ...target.map((inv) =>
        [
          `"${inv.invoice_number}"`,
          `"${inv.student_name}"`,
          `"${inv.student_code || ""}"`,
          `"${inv.class_name || ""}"`,
          `"${inv.issue_date}"`,
          `"${inv.due_date || ""}"`,
          inv.net_payable,
          inv.amount_paid,
          inv.balance,
          `"${inv.status}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "";

  const selectedStudent = React.useMemo(
    () => (meta?.students ?? []).find((s) => s.id === studentId) ?? null,
    [meta?.students, studentId],
  );

  const studentSuggestions = React.useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];
    return (meta?.students ?? [])
      .filter((s) => {
        const hay = [s.name, s.student_code ?? "", s.class_name ?? ""]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [meta?.students, studentQuery]);

  function studentOptionLabel(s: {
    name: string;
    student_code?: string | null;
    class_name?: string | null;
    residence_type?: string;
  }): string {
    return [
      s.name,
      s.student_code ? `(${s.student_code})` : null,
      s.class_name ? `— ${s.class_name}` : null,
      `· ${residenceLabel(s.residence_type || "day")}`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  function pickStudent(s: {
    id: string;
    name: string;
    student_code?: string | null;
    class_name?: string | null;
    residence_type?: string;
  }) {
    setStudentId(s.id);
    setStudentQuery(studentOptionLabel(s));
    setStudentMenuOpen(false);
  }

  function clearStudentSelection() {
    setStudentId("");
    setStudentQuery("");
    setStructureId("");
  }

  React.useEffect(() => {
    if (!genOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!studentSearchRef.current?.contains(e.target as Node)) {
        setStudentMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [genOpen]);

  const selectedStudentContext = React.useMemo(() => {
    if (!selectedStudent) return null;
    const cls = (meta?.classes ?? []).find(
      (c) => c.id === selectedStudent.class_id,
    );
    return {
      residence_type: selectedStudent.residence_type || "day",
      academic_level_id:
        selectedStudent.academic_level_id || cls?.academic_level_id || null,
      class_id: selectedStudent.class_id,
      section_id: cls?.section_id ?? null,
    };
  }, [meta?.classes, selectedStudent]);

  const matchingStructures = React.useMemo(() => {
    const active = structures.filter((s) => s.is_active);
    if (!selectedStudentContext) return active;
    return active.filter((s) =>
      structureMatchesStudent(s, selectedStudentContext),
    );
  }, [structures, selectedStudentContext]);

  const bulkStructure = React.useMemo(
    () => structures.find((s) => s.id === bulkStructureId) ?? null,
    [structures, bulkStructureId],
  );

  React.useEffect(() => {
    if (!selectedStudentContext) {
      setStructureId("");
      return;
    }
    const preferred = preferredFeeStructuresForStudent(
      matchingStructures,
      selectedStudentContext,
    );
    if (preferred.length > 0) {
      setStructureId(preferred[0].id);
      return;
    }
    setStructureId("");
  }, [selectedStudentContext, matchingStructures]);

  const load = React.useCallback(async () => {
    const [metaRes, structRes, invRes] = await Promise.all([
      fetchFinanceMeta(),
      fetchStructures(),
      fetchInvoices({
        status,
        search: debouncedSearch || null,
      }),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (structRes.ok) {
      setStructures(structRes.data.filter((s) => s.is_active));
    }
    if (invRes.ok) setInvoices(invRes.data);
    else setError(invRes.error);
    setLoading(false);
  }, [status, debouncedSearch]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    setError("");
    const res = await fetchInvoice(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDetail(res.data);
    setAdjDesc("");
    setAdjAmount("");
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!studentId || !structureId) {
      setError(
        !studentId
          ? "Select a student from the search suggestions."
          : "Student and fee structure are required.",
      );
      return;
    }
    setBusy(true);
    try {
      const res = await generateInvoice({
        student_id: studentId,
        fee_structure_id: structureId,
        due_date: dueDate || null,
        carry_arrears: carryArrears,
        discount_mode: discountMode || null,
        discount_value: discountValue ? Number(discountValue) : 0,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Invoice ${res.data.invoice_number} generated.`);
      setGenOpen(false);
      clearStudentSelection();
      setDueDate("");
      setDiscountMode("");
      setDiscountValue("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleBulk(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (bulkMode === "structure" && !bulkStructureId) {
      setError("Fee structure is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await bulkGenerateInvoices({
        mode: bulkMode,
        fee_structure_id: bulkMode === "structure" ? bulkStructureId : null,
        class_id: bulkMode === "structure" ? bulkClassId || null : null,
        due_date: bulkDueDate || null,
        carry_arrears: bulkCarry,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `Bulk generate: ${res.data.created} created, ${res.data.skipped} skipped.`,
      );
      setBulkOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setError("");
    if (!adjDesc.trim() || !adjAmount) {
      setError("Adjustment description and amount are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await adjustInvoice({
        id: detail.id,
        lines: [{ description: adjDesc.trim(), amount: Number(adjAmount) }],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDetail(res.data);
      setAdjDesc("");
      setAdjAmount("");
      setSuccess("Invoice adjusted.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const selectedPending = React.useMemo(
    () =>
      invoices.filter(
        (inv) => selected.includes(inv.id) && inv.status === "pending",
      ),
    [invoices, selected],
  );

  async function confirmDelete() {
    if (!deleteIds?.length) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      let deleted = 0;
      const errors: string[] = [];
      for (const id of deleteIds) {
        const res = await deleteInvoice(id);
        if (res.ok) deleted += 1;
        else errors.push(res.error);
      }
      if (deleted > 0) {
        setSuccess(
          deleted === 1 ? "Invoice deleted." : `${deleted} invoices deleted.`,
        );
      }
      if (errors.length) {
        setError(errors[0]);
      }
      setDeleteIds(null);
      setSelected((prev) => prev.filter((id) => !deleteIds.includes(id)));
      if (detail && deleteIds.includes(detail.id)) setDetail(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Student Billing"
      breadcrumb={["Finance & Fees", "Student Billing"]}
      heading="Student Billing"
      subtitle="Generate and manage student fee invoices."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={
          <>
            <FilterField label="Search" className="min-w-48 flex-1">
              <input
                className={`w-full ${selectClass}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Invoice # or student"
              />
            </FilterField>
            <FilterField label="Status">
              <select
                className={selectClass}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as InvoiceStatus | "all")
                }
              >
                <option value="all">All</option>
                {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map(
                  (s) => (
                    <option key={s} value={s}>
                      {INVOICE_STATUS_LABELS[s]}
                    </option>
                  ),
                )}
              </select>
            </FilterField>
          </>
        }
        actions={
          canManage ? (
            <>
              <SecondaryButton onClick={() => setBulkOpen(true)}>
                Bulk generate
              </SecondaryButton>
              <PrimaryButton
                onClick={() => {
                  clearStudentSelection();
                  setStudentMenuOpen(false);
                  setGenOpen(true);
                }}
              >
                <Icon icon={Add01Icon} size={16} />
                Generate invoice
              </PrimaryButton>
            </>
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
              if (el) el.indeterminate = selected.length > 0 && !allSelected;
            }}
            onChange={toggleAll}
            aria-label="Select all"
          />,
          "Invoice",
          "Student",
          "Class",
          "Issued",
          "Due",
          "Net",
          "Paid",
          "Balance",
          "Status",
          "",
        ]}
        loading={loading}
      >
        {invoices.length === 0 ? (
          <EmptyRow colSpan={11} message="No invoices found." />
        ) : (
          invoices.map((inv) => (
            <tr
              key={inv.id}
              className="border-t border-slate-100 hover:bg-slate-50/80"
            >
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.includes(inv.id)}
                  onChange={() => toggle(inv.id)}
                />
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">
                {inv.invoice_number}
              </td>
              <td className="px-4 py-3 text-slate-700">
                <div>{inv.student_name}</div>
                <div className="text-xs text-slate-400">
                  {inv.student_code || "—"}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {inv.class_name ?? "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">{inv.issue_date}</td>
              <td className="px-4 py-3 text-slate-600">
                {inv.due_date ?? "—"}
              </td>
              <td className="px-4 py-3">
                {formatMoney(inv.net_payable, currency)}
              </td>
              <td className="px-4 py-3">
                {formatMoney(inv.amount_paid, currency)}
              </td>
              <td className="px-4 py-3 font-medium">
                {formatMoney(inv.balance, currency)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={inv.status}
                  label={INVOICE_STATUS_LABELS[inv.status]}
                />
              </td>
              <td className="px-4 py-3">
                <TableActionGroup>
                  <TableIconButton
                    icon={ViewIcon}
                    label="View invoice"
                    tone="primary"
                    onClick={() => void openDetail(inv.id)}
                  />
                  {canManage && inv.status === "pending" ? (
                    <TableIconButton
                      icon={Delete02Icon}
                      label="Delete invoice"
                      tone="danger"
                      onClick={() => setDeleteIds([inv.id])}
                    />
                  ) : null}
                </TableActionGroup>
              </td>
            </tr>
          ))
        )}
      </FinanceTable>

      <TableSelectionBar
        totalCount={invoices.length}
        selectedCount={selected.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setSelected([])}
        actions={
          <>
            {canManage && selectedPending.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setDeleteIds(selectedPending.map((inv) => inv.id))
                }
                className="cursor-pointer rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
              >
                Delete pending ({selectedPending.length})
              </button>
            ) : null}
            <button
              type="button"
              onClick={exportSelected}
              className="cursor-pointer rounded-lg bg-(--sofia-primary) px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
            >
              Export selected ({selected.length})
            </button>
          </>
        }
      />

      <FormModal
        open={genOpen}
        title="Generate invoice"
        subtitle="Bill one student from a matching fee structure (department + day/boarding)."
        onClose={() => setGenOpen(false)}
        footer={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => setGenOpen(false)}
              className="flex-1"
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form="gen-invoice-form"
              disabled={busy}
              className="flex-1"
            >
              {busy ? "Generating…" : "Generate"}
            </PrimaryButton>
          </div>
        }
      >
        <form
          id="gen-invoice-form"
          onSubmit={handleGenerate}
          className="space-y-3"
        >
          <FormField label="Student" required>
            <div ref={studentSearchRef} className="relative">
              <input
                type="search"
                className={fieldClass}
                value={studentQuery}
                onChange={(e) => {
                  const next = e.target.value;
                  setStudentQuery(next);
                  setStudentMenuOpen(true);
                  if (studentId) {
                    const current = (meta?.students ?? []).find(
                      (s) => s.id === studentId,
                    );
                    if (
                      !current ||
                      next.trim() !== studentOptionLabel(current)
                    ) {
                      setStudentId("");
                      setStructureId("");
                    }
                  }
                }}
                onFocus={() => {
                  if (studentQuery.trim()) setStudentMenuOpen(true);
                }}
                placeholder="Type a student name or ID…"
                autoComplete="off"
              />
              {studentMenuOpen && studentQuery.trim() ? (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  {studentSuggestions.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-slate-500">
                      No students match.
                    </li>
                  ) : (
                    studentSuggestions.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="w-full cursor-pointer px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickStudent(s)}
                        >
                          <span className="font-medium text-slate-900">
                            {s.name}
                          </span>
                          {s.student_code ? (
                            <span className="text-slate-500">
                              {" "}
                              ({s.student_code})
                            </span>
                          ) : null}
                          {s.class_name ? (
                            <span className="block text-xs text-slate-500">
                              {s.class_name} ·{" "}
                              {residenceLabel(s.residence_type || "day")}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
            {!studentId && studentQuery.trim() ? (
              <p className="mt-1.5 text-xs text-amber-700">
                Select a student from the suggestions.
              </p>
            ) : null}
          </FormField>
          <FormField label="Fee structure" required>
            <select
              className={selectClass}
              value={structureId}
              onChange={(e) => setStructureId(e.target.value)}
              required
              disabled={!studentId}
            >
              <option value="">
                {studentId
                  ? matchingStructures.length
                    ? "Select structure"
                    : "No matching day/boarding package"
                  : "Select a student first"}
              </option>
              {matchingStructures.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {structureScopeSuffix(s)} (
                  {formatMoney(s.total, currency)})
                </option>
              ))}
            </select>
          </FormField>
          {selectedStudent ? (
            <p className="text-xs text-slate-500">
              Showing packages for{" "}
              <span className="font-medium text-slate-700">
                {residenceLabel(selectedStudent.residence_type || "day")}
              </span>{" "}
              students
              {selectedStudent.class_name
                ? ` in ${selectedStudent.class_name}`
                : ""}
              .
            </p>
          ) : null}
          <FormField label="Due date">
            <input
              type="date"
              className={fieldClass}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={carryArrears}
              onChange={(e) => setCarryArrears(e.target.checked)}
            />
            Carry previous arrears
          </label>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Discount mode">
              <select
                className={selectClass}
                value={discountMode}
                onChange={(e) =>
                  setDiscountMode(e.target.value as DiscountMode | "")
                }
              >
                <option value="">None</option>
                <option value="percent">Percent</option>
                <option value="fixed">Fixed</option>
              </select>
            </FormField>
            <FormField label="Discount value">
              <input
                type="number"
                min={0}
                step="0.01"
                className={fieldClass}
                disabled={!discountMode}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </FormField>
          </div>
        </form>
      </FormModal>

      <FormModal
        open={bulkOpen}
        title="Bulk generate"
        subtitle="Create invoices for one fee package, or for every class using each class’s matching fee structure."
        onClose={() => setBulkOpen(false)}
        footer={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => setBulkOpen(false)}
              className="flex-1"
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form="bulk-invoice-form"
              disabled={busy}
              className="flex-1"
            >
              {busy ? "Working…" : "Generate"}
            </PrimaryButton>
          </div>
        }
      >
        <form
          id="bulk-invoice-form"
          onSubmit={handleBulk}
          className="space-y-3"
        >
          <FormField label="Scope" required>
            <select
              className={selectClass}
              value={bulkMode}
              onChange={(e) =>
                setBulkMode(
                  e.target.value === "all_classes"
                    ? "all_classes"
                    : "structure",
                )
              }
            >
              <option value="structure">One fee structure</option>
              <option value="all_classes">
                All classes (match each class fee structure)
              </option>
            </select>
          </FormField>
          {bulkMode === "all_classes" ? (
            <p className="text-xs text-slate-500">
              Bills every active student using the fee package for their class
              (day/boarding). If a class has no class-specific package, level or
              department packages are used.
            </p>
          ) : (
            <>
              <FormField label="Fee structure" required>
                <select
                  className={selectClass}
                  value={bulkStructureId}
                  onChange={(e) => setBulkStructureId(e.target.value)}
                  required
                >
                  <option value="">Select structure</option>
                  {structures
                    .filter((s) => s.is_active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {structureScopeSuffix(s)}
                      </option>
                    ))}
                </select>
              </FormField>
              {bulkStructure ? (
                <p className="text-xs text-slate-500">
                  This package bills{" "}
                  <span className="font-medium text-slate-700">
                    {bulkStructure.applies_to_residence === "boarding"
                      ? "boarding"
                      : bulkStructure.applies_to_residence === "day"
                        ? "day"
                        : "day and boarding"}
                  </span>{" "}
                  students
                  {bulkStructure.section_name
                    ? ` in ${bulkStructure.section_name}`
                    : ""}
                  {bulkStructure.level_name
                    ? ` · ${bulkStructure.level_name}`
                    : ""}
                  .
                </p>
              ) : null}
              <FormField label="Class (optional)">
                <select
                  className={selectClass}
                  value={bulkClassId}
                  onChange={(e) => setBulkClassId(e.target.value)}
                >
                  <option value="">Structure scope / all matching</option>
                  {(meta?.classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </>
          )}
          <FormField label="Due date">
            <input
              type="date"
              className={fieldClass}
              value={bulkDueDate}
              onChange={(e) => setBulkDueDate(e.target.value)}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={bulkCarry}
              onChange={(e) => setBulkCarry(e.target.checked)}
            />
            Carry previous arrears
          </label>
        </form>
      </FormModal>

      <FormModal
        open={!!detail}
        title={detail ? `Invoice ${detail.invoice_number}` : "Invoice"}
        subtitle={detail?.student_name}
        onClose={() => setDetail(null)}
        footer={
          <SecondaryButton onClick={() => setDetail(null)} className="w-full">
            Close
          </SecondaryButton>
        }
      >
        {detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-slate-500">Status</div>
                <StatusBadge
                  status={detail.status}
                  label={INVOICE_STATUS_LABELS[detail.status]}
                />
              </div>
              <div>
                <div className="text-xs text-slate-500">Balance</div>
                <div className="font-semibold">
                  {formatMoney(detail.balance, currency)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Net payable</div>
                {formatMoney(detail.net_payable, currency)}
              </div>
              <div>
                <div className="text-xs text-slate-500">Paid</div>
                {formatMoney(detail.amount_paid, currency)}
              </div>
              <div>
                <div className="text-xs text-slate-500">Due</div>
                {detail.due_date ?? "—"}
              </div>
              <div>
                <div className="text-xs text-slate-500">Credit balance</div>
                {formatMoney(detail.credit_balance, currency)}
              </div>
            </div>

            <FormSection title="Lines">
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {detail.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="text-slate-700">
                      {line.description}
                      {line.is_adjustment ? (
                        <span className="ml-2 text-xs text-amber-600">
                          adjustment
                        </span>
                      ) : null}
                    </span>
                    <span className="font-medium">
                      {formatMoney(line.amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </FormSection>

            {canManage && detail.status !== "cancelled" ? (
              <form onSubmit={handleAdjust} className="space-y-2">
                <FormSection title="Adjust">
                  <FormField label="Description">
                    <input
                      className={fieldClass}
                      value={adjDesc}
                      onChange={(e) => setAdjDesc(e.target.value)}
                      placeholder="e.g. Late fee waiver"
                    />
                  </FormField>
                  <FormField label="Amount (negative to credit)">
                    <input
                      type="number"
                      step="0.01"
                      className={fieldClass}
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value)}
                    />
                  </FormField>
                  <PrimaryButton type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Add adjustment"}
                  </PrimaryButton>
                </FormSection>
              </form>
            ) : null}

            {canManage && detail.status === "pending" ? (
              <div className="border-t border-slate-100 pt-3">
                <SecondaryButton
                  className="text-red-700"
                  disabled={busy}
                  onClick={() => setDeleteIds([detail.id])}
                >
                  Delete pending invoice
                </SecondaryButton>
              </div>
            ) : null}
          </div>
        ) : null}
      </FormModal>

      <ConfirmModal
        open={!!deleteIds?.length}
        title={
          deleteIds && deleteIds.length > 1
            ? `Delete ${deleteIds.length} pending invoices?`
            : "Delete pending invoice?"
        }
        description="This soft-deletes the invoice. Paid or partially paid invoices cannot be deleted."
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteIds(null)}
      />
    </AppShell>
  );
}
