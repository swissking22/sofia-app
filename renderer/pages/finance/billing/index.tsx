import React from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import {
  ActionDrawer,
  EmptyRow,
  FilterBar,
  FilterField,
  FinanceTable,
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
  INVOICE_STATUS_LABELS,
  adjustInvoice,
  bulkGenerateInvoices,
  fetchFinanceMeta,
  fetchInvoice,
  fetchInvoices,
  fetchStructures,
  formatMoney,
  generateInvoice,
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
  const [structureId, setStructureId] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [carryArrears, setCarryArrears] = React.useState(true);
  const [discountMode, setDiscountMode] = React.useState<DiscountMode | "">("");
  const [discountValue, setDiscountValue] = React.useState("");

  const [bulkStructureId, setBulkStructureId] = React.useState("");
  const [bulkClassId, setBulkClassId] = React.useState("");
  const [bulkDueDate, setBulkDueDate] = React.useState("");
  const [bulkCarry, setBulkCarry] = React.useState(true);

  const [adjDesc, setAdjDesc] = React.useState("");
  const [adjAmount, setAdjAmount] = React.useState("");

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "";

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
      setError("Student and fee structure are required.");
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
      setStudentId("");
      setStructureId("");
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
    if (!bulkStructureId) {
      setError("Fee structure is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await bulkGenerateInvoices({
        fee_structure_id: bulkStructureId,
        class_id: bulkClassId || null,
        due_date: bulkDueDate || null,
        carry_arrears: bulkCarry,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `Bulk generate: ${res.data.created} created, ${res.data.skipped} skipped.`
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
                  )
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
              <PrimaryButton onClick={() => setGenOpen(true)}>
                <Icon icon={Add01Icon} size={16} />
                Generate invoice
              </PrimaryButton>
            </>
          ) : null
        }
      />

      <FinanceTable
        columns={[
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
          <EmptyRow colSpan={10} message="No invoices found." />
        ) : (
          invoices.map((inv) => (
            <tr key={inv.id} className="border-t border-slate-100">
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
                <SecondaryButton onClick={() => void openDetail(inv.id)}>
                  View
                </SecondaryButton>
              </td>
            </tr>
          ))
        )}
      </FinanceTable>

      <ActionDrawer
        open={genOpen}
        title="Generate invoice"
        subtitle="Bill one student from a fee structure."
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
        <form id="gen-invoice-form" onSubmit={handleGenerate} className="space-y-3">
          <FormField label="Student" required>
            <select
              className={selectClass}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            >
              <option value="">Select student</option>
              {(meta?.students ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.student_code ? ` (${s.student_code})` : ""}
                  {s.class_name ? ` — ${s.class_name}` : ""}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Fee structure" required>
            <select
              className={selectClass}
              value={structureId}
              onChange={(e) => setStructureId(e.target.value)}
              required
            >
              <option value="">Select structure</option>
              {structures.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatMoney(s.total, currency)})
                </option>
              ))}
            </select>
          </FormField>
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
      </ActionDrawer>

      <ActionDrawer
        open={bulkOpen}
        title="Bulk generate"
        subtitle="Create invoices for a class (or structure scope)."
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
        <form id="bulk-invoice-form" onSubmit={handleBulk} className="space-y-3">
          <FormField label="Fee structure" required>
            <select
              className={selectClass}
              value={bulkStructureId}
              onChange={(e) => setBulkStructureId(e.target.value)}
              required
            >
              <option value="">Select structure</option>
              {structures.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
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
      </ActionDrawer>

      <ActionDrawer
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
          </div>
        ) : null}
      </ActionDrawer>
    </AppShell>
  );
}
