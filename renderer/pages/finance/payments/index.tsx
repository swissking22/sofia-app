import React from "react";
import Link from "next/link";
import {
  Add01Icon,
  Cancel01Icon,
  Tick02Icon,
  UnavailableIcon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField } from "../../../components/setup";
import {
  FormModal,
  EmptyRow,
  FilterBar,
  FinanceTable,
  TableSelectionBar,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  fieldClass,
  selectClass,
} from "../../../components/finance/ui";
import { Icon } from "../../../components/ui/Icon";
import {
  TableActionGroup,
  TableIconButton,
} from "../../../components/ui/TableActions";
import { formatDisplayDateTime } from "../../../lib/date-format";
import {
  PAYMENT_METHOD_LABELS,
  fetchFinanceMeta,
  fetchInvoice,
  fetchInvoices,
  fetchPayments,
  formatMoney,
  recordPayment,
  type FinanceMeta,
  type InvoiceDto,
  type InvoiceLineDto,
  type PaymentDto,
  type PaymentMethod,
} from "../../../lib/finance-mgmt";
import {
  completeOnlinePayment,
  fetchOnlinePayments,
  initiateOnlinePayment,
  type OnlineTxn,
} from "../../../lib/finance-ext";

export default function PaymentsPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<FinanceMeta | null>(null);
  const [payments, setPayments] = React.useState<PaymentDto[]>([]);
  const [outstanding, setOutstanding] = React.useState<InvoiceDto[]>([]);
  const [open, setOpen] = React.useState(false);
  const [onlineOpen, setOnlineOpen] = React.useState(false);
  const [onlineTxns, setOnlineTxns] = React.useState<OnlineTxn[]>([]);

  const [invoiceId, setInvoiceId] = React.useState("");
  const [studentId, setStudentId] = React.useState("");
  const [studentQuery, setStudentQuery] = React.useState("");
  const [studentMenuOpen, setStudentMenuOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [reference, setReference] = React.useState("");
  const [useCredit, setUseCredit] = React.useState(false);
  const [lastReceiptId, setLastReceiptId] = React.useState<string | null>(null);
  const [invoiceLines, setInvoiceLines] = React.useState<InvoiceLineDto[]>([]);
  const [lineSelections, setLineSelections] = React.useState<
    Record<string, { selected: boolean; amount: string }>
  >({});
  const [linesLoading, setLinesLoading] = React.useState(false);
  const [creditBalance, setCreditBalance] = React.useState(0);
  const studentSearchRef = React.useRef<HTMLDivElement | null>(null);

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "";

  const [selectedOnline, setSelectedOnline] = React.useState<string[]>([]);
  const [selectedPayments, setSelectedPayments] = React.useState<string[]>([]);

  const methodOptions = (
    (meta?.payment_methods ??
      Object.keys(PAYMENT_METHOD_LABELS)) as PaymentMethod[]
  ).filter((m) => m !== "online");

  const openOnline = onlineTxns.filter(
    (t) => t.status === "pending" || t.status === "processing",
  );

  const studentsWithBalance = React.useMemo(() => {
    const byId = new Map<
      string,
      {
        id: string;
        name: string;
        student_code: string | null;
        class_name: string | null;
        invoice_count: number;
        total_due: number;
      }
    >();
    for (const inv of outstanding) {
      const existing = byId.get(inv.student_id);
      if (existing) {
        existing.invoice_count += 1;
        existing.total_due += inv.balance;
      } else {
        byId.set(inv.student_id, {
          id: inv.student_id,
          name: inv.student_name || "Unknown student",
          student_code: inv.student_code ?? null,
          class_name: inv.class_name ?? null,
          invoice_count: 1,
          total_due: inv.balance,
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [outstanding]);

  const studentSuggestions = React.useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];
    return studentsWithBalance
      .filter((s) => {
        const hay = [s.name, s.student_code ?? "", s.class_name ?? ""]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [studentsWithBalance, studentQuery]);

  const studentInvoices = React.useMemo(() => {
    if (!studentId) return [];
    return outstanding.filter((i) => i.student_id === studentId);
  }, [outstanding, studentId]);

  function studentOptionLabel(s: {
    name: string;
    student_code?: string | null;
    class_name?: string | null;
  }): string {
    return [
      s.name,
      s.student_code ? `(${s.student_code})` : null,
      s.class_name ? `— ${s.class_name}` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  function clearLineSelections() {
    setInvoiceLines([]);
    setLineSelections({});
    setCreditBalance(0);
  }

  function pickStudent(s: {
    id: string;
    name: string;
    student_code?: string | null;
    class_name?: string | null;
  }) {
    setStudentId(s.id);
    setStudentQuery(studentOptionLabel(s));
    setStudentMenuOpen(false);
    setInvoiceId("");
    setAmount("");
    clearLineSelections();
  }

  function clearStudentSelection() {
    setStudentId("");
    setStudentQuery("");
    setInvoiceId("");
    setAmount("");
    clearLineSelections();
  }

  const selectedLineTotal = React.useMemo(() => {
    let total = 0;
    for (const line of invoiceLines) {
      const sel = lineSelections[line.id];
      if (!sel?.selected) continue;
      total += Number(sel.amount) || 0;
    }
    return Math.round(total * 100) / 100;
  }, [invoiceLines, lineSelections]);

  const payableLines = React.useMemo(
    () => invoiceLines.filter((l) => (l.remaining ?? l.amount ?? 0) > 0.009),
    [invoiceLines],
  );

  React.useEffect(() => {
    if (!open && !onlineOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!studentSearchRef.current?.contains(e.target as Node)) {
        setStudentMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open, onlineOpen]);

  React.useEffect(() => {
    if (!studentId) return;
    if (studentInvoices.length === 1) {
      setInvoiceId(studentInvoices[0].id);
    }
  }, [studentId, studentInvoices]);

  const allOnlineSelected =
    openOnline.length > 0 && selectedOnline.length === openOnline.length;
  function toggleOnline(id: string) {
    setSelectedOnline((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAllOnline() {
    if (allOnlineSelected) setSelectedOnline([]);
    else setSelectedOnline(openOnline.map((t) => t.id));
  }

  const allPaymentsSelected =
    payments.length > 0 && selectedPayments.length === payments.length;
  function togglePayment(id: string) {
    setSelectedPayments((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAllPayments() {
    if (allPaymentsSelected) setSelectedPayments([]);
    else setSelectedPayments(payments.map((p) => p.id));
  }

  async function bulkConfirmOnline() {
    setBusy(true);
    setError("");
    try {
      for (const id of selectedOnline) {
        await handleOnlineComplete(id, "successful");
      }
      setSelectedOnline([]);
    } finally {
      setBusy(false);
    }
  }

  function exportPayments() {
    const target = payments.filter((p) => selectedPayments.includes(p.id));
    if (!target.length) return;
    const csv = [
      [
        "Payment #",
        "Student",
        "Invoice #",
        "Amount",
        "Paid for",
        "Method",
        "Date",
        "Reference",
      ].join(","),
      ...target.map((p) =>
        [
          `"${p.payment_number}"`,
          `"${p.student_name || ""}"`,
          `"${p.invoice_number || ""}"`,
          p.amount,
          `"${(p.paid_for || "").replace(/"/g, '""')}"`,
          `"${PAYMENT_METHOD_LABELS[p.method] ?? p.method}"`,
          `"${formatDisplayDateTime(p.paid_at, "")}"`,
          `"${p.reference || ""}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const load = React.useCallback(async () => {
    const [metaRes, payRes, invRes, onlineRes] = await Promise.all([
      fetchFinanceMeta(),
      fetchPayments(),
      fetchInvoices({ status: "all" }),
      fetchOnlinePayments(),
    ]);
    if (metaRes.ok) {
      setMeta(metaRes.data);
      setMethod((prev) => {
        const methods = metaRes.data.payment_methods;
        if (methods.length && !methods.includes(prev)) {
          return methods[0] as PaymentMethod;
        }
        return prev;
      });
    }
    if (payRes.ok) setPayments(payRes.data);
    else setError(payRes.error);
    if (invRes.ok) {
      setOutstanding(
        invRes.data.filter(
          (i) =>
            i.balance > 0 && i.status !== "cancelled" && i.status !== "paid",
        ),
      );
    }
    if (onlineRes.ok) setOnlineTxns(onlineRes.data.transactions);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!invoiceId || !open) {
      clearLineSelections();
      return;
    }
    let cancelled = false;
    setLinesLoading(true);
    void fetchInvoice(invoiceId).then((res) => {
      if (cancelled) return;
      setLinesLoading(false);
      if (!res.ok) {
        setError(res.error);
        clearLineSelections();
        return;
      }
      const lines = res.data.lines ?? [];
      setInvoiceLines(lines);
      setCreditBalance(Number(res.data.credit_balance) || 0);
      const next: Record<string, { selected: boolean; amount: string }> = {};
      let total = 0;
      for (const line of lines) {
        const remaining =
          Math.round((line.remaining ?? line.amount ?? 0) * 100) / 100;
        const selected = remaining > 0;
        next[line.id] = {
          selected,
          amount: selected ? String(remaining) : "0",
        };
        if (selected) total += remaining;
      }
      setLineSelections(next);
      setAmount(total > 0 ? String(Math.round(total * 100) / 100) : "");
    });
    return () => {
      cancelled = true;
    };
  }, [invoiceId, open]);

  React.useEffect(() => {
    if (!open || !invoiceId || payableLines.length === 0) return;
    const creditApplied = useCredit
      ? Math.min(creditBalance, selectedLineTotal)
      : 0;
    const cashNeeded =
      Math.round((selectedLineTotal - creditApplied) * 100) / 100;
    setAmount(
      cashNeeded > 0 ? String(cashNeeded) : selectedLineTotal > 0 ? "0" : "",
    );
  }, [
    selectedLineTotal,
    open,
    invoiceId,
    payableLines.length,
    useCredit,
    creditBalance,
  ]);

  function toggleFeeLine(lineId: string, remaining: number) {
    setLineSelections((prev) => {
      const current = prev[lineId];
      const selected = !(current?.selected ?? false);
      return {
        ...prev,
        [lineId]: {
          selected,
          amount: selected
            ? current?.amount && Number(current.amount) > 0
              ? current.amount
              : String(remaining)
            : "0",
        },
      };
    });
  }

  function setFeeLineAmount(lineId: string, value: string) {
    setLineSelections((prev) => ({
      ...prev,
      [lineId]: {
        selected: true,
        amount: value,
      },
    }));
  }

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLastReceiptId(null);
    if (!invoiceId) {
      setError(
        !studentId
          ? "Select a student from the search suggestions."
          : "Select an invoice.",
      );
      return;
    }
    const allocations = payableLines
      .map((line) => {
        const sel = lineSelections[line.id];
        if (!sel?.selected) return null;
        const lineAmount = Number(sel.amount) || 0;
        if (lineAmount <= 0) return null;
        return { invoice_line_id: line.id, amount: lineAmount };
      })
      .filter(Boolean) as Array<{ invoice_line_id: string; amount: number }>;

    if (payableLines.length > 0 && allocations.length === 0) {
      setError("Select at least one fee line being paid for.");
      return;
    }

    const allocSum =
      Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
    const creditApplied = useCredit
      ? Math.min(creditBalance, allocSum || Number(amount) || 0)
      : 0;
    const cashAmount =
      allocations.length > 0
        ? Math.round(Math.max(0, allocSum - creditApplied) * 100) / 100
        : Number(amount);

    if (
      cashAmount <= 0 &&
      !(useCredit && (allocSum > 0 || creditApplied > 0))
    ) {
      setError("Enter a positive amount or use student credit.");
      return;
    }

    setBusy(true);
    try {
      const res = await recordPayment({
        invoice_id: invoiceId,
        amount: cashAmount > 0 ? cashAmount : useCredit ? 0 : Number(amount),
        method,
        reference: reference.trim() || null,
        use_credit: useCredit,
        allocations: allocations.length ? allocations : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `Payment recorded. Receipt ${res.data.receipt.receipt_number}.`,
      );
      setLastReceiptId(res.data.receipt.id);
      setOpen(false);
      clearStudentSelection();
      setReference("");
      setUseCredit(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleOnlineInitiate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!invoiceId || !amount || Number(amount) <= 0) {
      setError("Select an invoice and enter a positive amount.");
      return;
    }
    setBusy(true);
    try {
      const res = await initiateOnlinePayment({
        invoice_id: invoiceId,
        amount: Number(amount),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `Online payment request created (${res.data.status}). Confirm only after the provider settles — this is not yet a fee payment.`,
      );
      setOnlineOpen(false);
      setInvoiceId("");
      setAmount("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleOnlineComplete(
    id: string,
    status: "successful" | "failed" | "cancelled",
  ) {
    setBusy(true);
    setError("");
    try {
      const res = await completeOnlinePayment(id, status);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        status === "successful"
          ? "Online payment confirmed. Student balance and receipt updated."
          : `Online payment marked ${status}. No balance change.`,
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Payments"
      breadcrumb={["Finance & Fees", "Payments"]}
      heading="Payments"
      subtitle="Record cash and transfer payments, or start an online payment that only updates the student balance after a verified success."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? (
        <PageAlert tone="success">
          {success}
          {lastReceiptId ? (
            <>
              {" "}
              <Link
                href={`/finance/receipts/${lastReceiptId}`}
                className="font-semibold underline"
              >
                View receipt
              </Link>
            </>
          ) : null}
        </PageAlert>
      ) : null}

      <FilterBar
        filters={
          <span className="text-sm text-slate-500">
            {payments.length} payments
          </span>
        }
        actions={
          canManage ? (
            <>
              <SecondaryButton onClick={() => setOnlineOpen(true)}>
                Online payment
              </SecondaryButton>
              <PrimaryButton
                onClick={() => {
                  clearStudentSelection();
                  setStudentMenuOpen(false);
                  setReference("");
                  setUseCredit(false);
                  setOpen(true);
                }}
              >
                <Icon icon={Add01Icon} size={16} />
                Record payment
              </PrimaryButton>
            </>
          ) : null
        }
      />

      {openOnline.length > 0 ? (
        <div className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Online payments awaiting confirmation
          </h2>
          <FinanceTable
            columns={[
              <input
                key="select-all-online"
                type="checkbox"
                checked={allOnlineSelected}
                ref={(el) => {
                  if (el)
                    el.indeterminate =
                      selectedOnline.length > 0 && !allOnlineSelected;
                }}
                onChange={toggleAllOnline}
                aria-label="Select all"
              />,
              "Reference",
              "Invoice",
              "Amount",
              "Status",
              "Created",
              "",
            ]}
          >
            {openOnline.map((t) => (
              <tr
                key={t.id}
                className="border-t border-slate-100 hover:bg-slate-50/80"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedOnline.includes(t.id)}
                    onChange={() => toggleOnline(t.id)}
                  />
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {t.provider_reference || t.id}
                </td>
                <td className="px-4 py-3 text-slate-600">{t.invoice_id}</td>
                <td className="px-4 py-3">
                  {formatMoney(t.amount, t.currency)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status="pending" label={t.status} />
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {formatDisplayDateTime(t.created_at)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {canManage ? (
                    <TableActionGroup>
                      <TableIconButton
                        icon={Tick02Icon}
                        label="Confirm"
                        tone="primary"
                        disabled={busy}
                        onClick={() =>
                          void handleOnlineComplete(t.id, "successful")
                        }
                      />
                      <TableIconButton
                        icon={UnavailableIcon}
                        label="Fail"
                        tone="warning"
                        disabled={busy}
                        onClick={() =>
                          void handleOnlineComplete(t.id, "failed")
                        }
                      />
                      <TableIconButton
                        icon={Cancel01Icon}
                        label="Cancel"
                        tone="danger"
                        disabled={busy}
                        onClick={() =>
                          void handleOnlineComplete(t.id, "cancelled")
                        }
                      />
                    </TableActionGroup>
                  ) : null}
                </td>
              </tr>
            ))}
          </FinanceTable>
          <TableSelectionBar
            totalCount={openOnline.length}
            selectedCount={selectedOnline.length}
            allSelected={allOnlineSelected}
            onToggleAll={toggleAllOnline}
            onClear={() => setSelectedOnline([])}
            actions={
              canManage ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void bulkConfirmOnline()}
                  className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  Confirm selected ({selectedOnline.length})
                </button>
              ) : null
            }
          />
        </div>
      ) : null}

      <FinanceTable
        columns={[
          <input
            key="select-all-payments"
            type="checkbox"
            checked={allPaymentsSelected}
            ref={(el) => {
              if (el)
                el.indeterminate =
                  selectedPayments.length > 0 && !allPaymentsSelected;
            }}
            onChange={toggleAllPayments}
            aria-label="Select all"
          />,
          "Payment #",
          "Student",
          "Invoice",
          "Amount",
          "Paid for",
          "Method",
          "Date",
          "Reference",
        ]}
        loading={loading}
      >
        {payments.length === 0 ? (
          <EmptyRow colSpan={9} message="No payments recorded." />
        ) : (
          payments.map((p) => (
            <tr
              key={p.id}
              className="border-t border-slate-100 hover:bg-slate-50/80"
            >
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedPayments.includes(p.id)}
                  onChange={() => togglePayment(p.id)}
                />
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">
                {p.payment_number}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {p.student_name ?? "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {p.invoice_number ?? "—"}
              </td>
              <td className="px-4 py-3 font-medium">
                {formatMoney(p.amount, currency)}
              </td>
              <td
                className="max-w-48 truncate px-4 py-3 text-slate-600"
                title={p.paid_for || undefined}
              >
                {p.paid_for || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {formatDisplayDateTime(p.paid_at)}
              </td>
              <td className="px-4 py-3 text-slate-600">{p.reference || "—"}</td>
            </tr>
          ))
        )}
      </FinanceTable>

      <TableSelectionBar
        totalCount={payments.length}
        selectedCount={selectedPayments.length}
        allSelected={allPaymentsSelected}
        onToggleAll={toggleAllPayments}
        onClear={() => setSelectedPayments([])}
        actions={
          <button
            type="button"
            onClick={exportPayments}
            className="cursor-pointer rounded-lg bg-(--sofia-primary) px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
          >
            Export selected ({selectedPayments.length})
          </button>
        }
      />

      <FormModal
        open={open}
        title="Record payment"
        subtitle="Choose which fee lines this payment covers, then record it."
        onClose={() => setOpen(false)}
        footer={
          <div className="flex gap-2">
            <SecondaryButton onClick={() => setOpen(false)} className="flex-1">
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form="record-payment-form"
              disabled={busy}
              className="flex-1"
            >
              {busy ? "Saving…" : "Record"}
            </PrimaryButton>
          </div>
        }
      >
        <form
          id="record-payment-form"
          onSubmit={handleRecord}
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
                    const current = studentsWithBalance.find(
                      (s) => s.id === studentId,
                    );
                    if (
                      !current ||
                      next.trim() !== studentOptionLabel(current)
                    ) {
                      setStudentId("");
                      setInvoiceId("");
                      setAmount("");
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
                      No students with outstanding invoices match.
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
                          <span className="block text-xs text-slate-500">
                            {[
                              s.class_name,
                              `${s.invoice_count} invoice${s.invoice_count === 1 ? "" : "s"}`,
                              formatMoney(s.total_due, currency) + " due",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
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
          <FormField label="Outstanding invoice" required>
            <select
              className={selectClass}
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                setAmount("");
                clearLineSelections();
              }}
              required
              disabled={!studentId}
            >
              <option value="">
                {studentId
                  ? studentInvoices.length
                    ? "Select invoice"
                    : "No outstanding invoices"
                  : "Select a student first"}
              </option>
              {studentInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} ({formatMoney(inv.balance, currency)}{" "}
                  due)
                </option>
              ))}
            </select>
          </FormField>
          {invoiceId ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <p className="text-sm font-semibold text-slate-800">
                Fee lines being paid
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Select components so the receipt shows what this payment covers.
              </p>
              {linesLoading ? (
                <p className="mt-3 text-sm text-slate-500">
                  Loading fee lines…
                </p>
              ) : payableLines.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  No open fee lines on this invoice.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {payableLines.map((line) => {
                    const remaining =
                      Math.round((line.remaining ?? line.amount) * 100) / 100;
                    const sel = lineSelections[line.id];
                    const selected = sel?.selected ?? false;
                    return (
                      <li
                        key={line.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-2"
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleFeeLine(line.id, remaining)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">
                              {line.description}
                            </span>
                            <span className="block text-xs text-slate-500">
                              Remaining {formatMoney(remaining, currency)}
                              {line.amount !== remaining
                                ? ` · Charged ${formatMoney(line.amount, currency)}`
                                : ""}
                            </span>
                          </span>
                        </label>
                        <input
                          type="number"
                          min={0.01}
                          max={remaining}
                          step="0.01"
                          disabled={!selected}
                          className={`${fieldClass} w-28 shrink-0 py-1.5 text-right disabled:bg-slate-100`}
                          value={selected ? (sel?.amount ?? "") : ""}
                          onChange={(e) =>
                            setFeeLineAmount(line.id, e.target.value)
                          }
                          aria-label={`Amount for ${line.description}`}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
              {payableLines.length > 0 ? (
                <p className="mt-2 text-right text-xs font-medium text-slate-600">
                  Selected total {formatMoney(selectedLineTotal, currency)}
                </p>
              ) : null}
            </div>
          ) : null}
          <FormField
            label={useCredit ? "Cash to collect" : "Amount"}
            required={!useCredit || Number(amount) > 0}
          >
            <input
              type="number"
              min={0}
              step="0.01"
              className={fieldClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required={!useCredit}
              readOnly={payableLines.length > 0}
            />
            {payableLines.length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                {useCredit && creditBalance > 0
                  ? `Selected fee lines ${formatMoney(selectedLineTotal, currency)}; up to ${formatMoney(Math.min(creditBalance, selectedLineTotal), currency)} from credit.`
                  : "Matches the selected fee lines. Uncheck or edit line amounts to change it."}
              </p>
            ) : null}
          </FormField>
          <FormField label="Method" required>
            <select
              className={selectClass}
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {methodOptions.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m] ?? m}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Reference">
            <input
              className={fieldClass}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Cheque #, MoMo ref…"
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={useCredit}
              onChange={(e) => setUseCredit(e.target.checked)}
              disabled={creditBalance <= 0}
            />
            Use student credit first
            {creditBalance > 0
              ? ` (${formatMoney(creditBalance, currency)} available)`
              : ""}
          </label>
        </form>
      </FormModal>

      <FormModal
        open={onlineOpen}
        title="Start online payment"
        subtitle="Creates a payment request only. The student balance updates after a verified successful transaction."
        onClose={() => setOnlineOpen(false)}
        footer={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => setOnlineOpen(false)}
              className="flex-1"
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form="online-payment-form"
              disabled={busy}
              className="flex-1"
            >
              {busy ? "Creating…" : "Create request"}
            </PrimaryButton>
          </div>
        }
      >
        <form
          id="online-payment-form"
          onSubmit={handleOnlineInitiate}
          className="space-y-3"
        >
          <FormField label="Outstanding invoice" required>
            <select
              className={selectClass}
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                setAmount("");
              }}
              required
            >
              <option value="">Select invoice</option>
              {outstanding.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} — {inv.student_name} (
                  {formatMoney(inv.balance, currency)} due)
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Amount to pay" required>
            <input
              type="number"
              min={0.01}
              step="0.01"
              className={fieldClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </FormField>
        </form>
      </FormModal>
    </AppShell>
  );
}
