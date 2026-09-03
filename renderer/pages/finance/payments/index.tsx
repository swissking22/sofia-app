import React from "react";
import Link from "next/link";
import { Add01Icon, Cancel01Icon, Tick02Icon, UnavailableIcon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField } from "../../../components/setup";
import {
  FormModal,
  EmptyRow,
  FilterBar,
  FinanceTable,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  fieldClass,
  selectClass,
} from "../../../components/finance/ui";
import { Icon } from "../../../components/ui/Icon";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import {
  PAYMENT_METHOD_LABELS,
  fetchFinanceMeta,
  fetchInvoices,
  fetchPayments,
  formatMoney,
  recordPayment,
  type FinanceMeta,
  type InvoiceDto,
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
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [reference, setReference] = React.useState("");
  const [useCredit, setUseCredit] = React.useState(false);
  const [lastReceiptId, setLastReceiptId] = React.useState<string | null>(null);

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "";

  const selectedInvoice = outstanding.find((i) => i.id === invoiceId);

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
    if (selectedInvoice) {
      setAmount(String(selectedInvoice.balance));
    }
  }, [selectedInvoice]);

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLastReceiptId(null);
    if (!invoiceId || !amount || Number(amount) <= 0) {
      setError("Select an invoice and enter a positive amount.");
      return;
    }
    setBusy(true);
    try {
      const res = await recordPayment({
        invoice_id: invoiceId,
        amount: Number(amount),
        method,
        reference: reference.trim() || null,
        use_credit: useCredit,
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
      setInvoiceId("");
      setAmount("");
      setReference("");
      setUseCredit(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const methodOptions = (
    (meta?.payment_methods ??
      Object.keys(PAYMENT_METHOD_LABELS)) as PaymentMethod[]
  ).filter((m) => m !== "online");

  const openOnline = onlineTxns.filter(
    (t) => t.status === "pending" || t.status === "processing",
  );

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
              <PrimaryButton onClick={() => setOpen(true)}>
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
              "Reference",
              "Invoice",
              "Amount",
              "Status",
              "Created",
              "",
            ]}
          >
            {openOnline.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
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
                <td className="px-4 py-3 text-slate-500">{t.created_at}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {canManage ? (
                    <TableActionGroup>
                      <TableIconButton
                        icon={Tick02Icon}
                        label="Confirm"
                        tone="primary"
                        disabled={busy}
                        onClick={() => void handleOnlineComplete(t.id, "successful")}
                      />
                      <TableIconButton
                        icon={UnavailableIcon}
                        label="Fail"
                        tone="warning"
                        disabled={busy}
                        onClick={() => void handleOnlineComplete(t.id, "failed")}
                      />
                      <TableIconButton
                        icon={Cancel01Icon}
                        label="Cancel"
                        tone="danger"
                        disabled={busy}
                        onClick={() => void handleOnlineComplete(t.id, "cancelled")}
                      />
                    </TableActionGroup>
                  ) : null}
                </td>
              </tr>
            ))}
          </FinanceTable>
        </div>
      ) : null}

      <FinanceTable
        columns={[
          "Payment #",
          "Student",
          "Invoice",
          "Amount",
          "Method",
          "Date",
          "Reference",
        ]}
        loading={loading}
      >
        {payments.length === 0 ? (
          <EmptyRow colSpan={7} message="No payments recorded." />
        ) : (
          payments.map((p) => (
            <tr key={p.id} className="border-t border-slate-100">
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
              <td className="px-4 py-3 text-slate-600">
                {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
              </td>
              <td className="px-4 py-3 text-slate-600">{p.paid_at}</td>
              <td className="px-4 py-3 text-slate-600">{p.reference || "—"}</td>
            </tr>
          ))
        )}
      </FinanceTable>

      <FormModal
        open={open}
        title="Record payment"
        subtitle="Apply payment against an outstanding invoice."
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
          <FormField label="Amount" required>
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
            />
            Use student credit balance first
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
