import React from "react";
import {
  CheckmarkBadge01Icon,
  PencilEdit01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField } from "../../../components/setup";
import {
  ConfirmModal,
  EmptyRow,
  FilterBar,
  FinanceTable,
  TableSelectionBar,
  FormModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  fieldClass,
} from "../../../components/finance/ui";
import {
  TableActionGroup,
  TableIconButton,
} from "../../../components/ui/TableActions";
import {
  createBankDeposit,
  fetchBankDeposits,
  fetchCashCollections,
  postBankDeposit,
  reconcileBankDeposit,
  updateBankDeposit,
  verifyBankDeposit,
  type BankDepositRow,
} from "../../../lib/finance-ext";
import {
  fetchFinanceMeta,
  formatMoney,
  type FinanceMeta,
} from "../../../lib/finance-mgmt";

function depositBadge(status: string) {
  if (status === "posted") return "completed";
  if (status === "verified") return "accepted";
  return "pending";
}

function depositLabel(status: string) {
  if (status === "pending_verification") return "Pending verification";
  if (status === "verified") return "Verified";
  if (status === "posted") return "Posted";
  return status.replace(/_/g, " ");
}

export default function BankDepositsPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<FinanceMeta | null>(null);
  const [rows, setRows] = React.useState<BankDepositRow[]>([]);
  const [cash, setCash] = React.useState<
    Array<{
      id: string;
      payment_number: string;
      amount: number;
      paid_at: string;
      student_name?: string | null;
    }>
  >([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BankDepositRow | null>(null);
  const [reconciling, setReconciling] = React.useState<BankDepositRow | null>(
    null,
  );
  const [selectedPay, setSelectedPay] = React.useState<Record<string, boolean>>(
    {},
  );
  const [confirm, setConfirm] = React.useState<{
    id: string;
    action: "verify" | "post";
  } | null>(null);

  const [amount, setAmount] = React.useState("");
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
      ["Reference", "Amount", "Bank", "Account", "Date", "Deposited By", "Status", "Reconciled", "Unreconciled"].join(","),
      ...target.map((r) =>
        [
          `"${r.deposit_reference || r.deposit_number}"`,
          r.amount,
          `"${r.bank_name}"`,
          `"${r.bank_account || ""}"`,
          `"${r.deposit_date}"`,
          `"${r.deposited_by || ""}"`,
          `"${r.status}"`,
          r.reconciled,
          r.unreconciled,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bank-deposits-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const [source, setSource] = React.useState("Cash collections");
  const [collectionDate, setCollectionDate] = React.useState("");
  const [depositDate, setDepositDate] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [bankAccount, setBankAccount] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [depositedBy, setDepositedBy] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [documentPath, setDocumentPath] = React.useState("");

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "XAF";

  const load = React.useCallback(async () => {
    const [metaRes, listRes, cashRes] = await Promise.all([
      fetchFinanceMeta(),
      fetchBankDeposits(),
      fetchCashCollections(),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (listRes.ok) setRows(listRes.data.deposits);
    else setError(listRes.error);
    if (cashRes.ok) setCash(cashRes.data.payments);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setEditing(null);
    setAmount("");
    setSource("Cash collections");
    setCollectionDate("");
    setDepositDate(new Date().toISOString().slice(0, 10));
    setBankName("");
    setBankAccount("");
    setReference("");
    setDepositedBy("");
    setNotes("");
    setDocumentPath("");
    setOpen(true);
  }

  function startEdit(row: BankDepositRow) {
    setEditing(row);
    setAmount(String(row.amount));
    setSource(row.collection_source ?? "Cash collections");
    setCollectionDate(row.collection_date ?? "");
    setDepositDate(row.deposit_date);
    setBankName(row.bank_name);
    setBankAccount(row.bank_account ?? "");
    setReference(row.deposit_reference ?? "");
    setDepositedBy(row.deposited_by ?? "");
    setNotes(row.notes ?? "");
    setDocumentPath(row.document_path ?? "");
    setOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        amount: Number(amount),
        collection_source: source || null,
        collection_date: collectionDate || null,
        deposit_date: depositDate,
        bank_name: bankName.trim(),
        bank_account: bankAccount.trim() || null,
        deposit_reference: reference.trim() || null,
        deposited_by: depositedBy.trim() || null,
        notes: notes.trim() || null,
        document_path: documentPath.trim() || null,
      };
      const res = editing
        ? await updateBankDeposit({ id: editing.id, ...payload })
        : await createBankDeposit(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(editing ? "Deposit updated." : "Deposit recorded as pending.");
      setOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleReconcile(e: React.FormEvent) {
    e.preventDefault();
    if (!reconciling) return;
    const items = cash
      .filter((p) => selectedPay[p.id])
      .map((p) => ({ payment_id: p.id, amount: p.amount }));
    setBusy(true);
    setError("");
    try {
      const res = await reconcileBankDeposit(reconciling.id, items);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `Reconciled ${formatMoney(res.data.reconciled, currency)}. Unreconciled ${formatMoney(res.data.unreconciled, currency)}.`,
      );
      setReconciling(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      const res =
        confirm.action === "verify"
          ? await verifyBankDeposit(confirm.id)
          : await postBankDeposit(confirm.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        confirm.action === "verify"
          ? "Deposit verified."
          : "Deposit posted to the ledger.",
      );
      setConfirm(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const selectedTotal = cash
    .filter((p) => selectedPay[p.id])
    .reduce((s, p) => s + p.amount, 0);

  return (
    <AppShell
      title="Bank Deposits"
      breadcrumb={["Finance & Fees", "Bank Deposits"]}
      heading="Bank Deposits"
      subtitle="Track cash already collected by the school when it is deposited into the bank. This is not a student payment method."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={
          <span className="text-sm text-slate-500">
            {rows.length} deposit{rows.length === 1 ? "" : "s"}
          </span>
        }
        actions={
          canManage ? (
            <PrimaryButton onClick={startCreate}>Record deposit</PrimaryButton>
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
          "Reference",
          "Amount",
          "Bank",
          "Deposit date",
          "Deposited by",
          "Status",
          "Reconciled",
          "",
        ]}
        loading={loading}
      >
        {rows.length === 0 ? (
          <EmptyRow colSpan={9} message="No bank deposits recorded." />
        ) : (
          rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={() => toggle(r.id)}
                />
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">
                {r.deposit_reference || r.deposit_number}
              </td>
              <td className="px-4 py-3">{formatMoney(r.amount, currency)}</td>
              <td className="px-4 py-3 text-slate-600">
                {r.bank_name}
                {r.bank_account ? ` · ${r.bank_account}` : ""}
              </td>
              <td className="px-4 py-3 text-slate-600">{r.deposit_date}</td>
              <td className="px-4 py-3 text-slate-600">
                {r.deposited_by || "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={depositBadge(r.status)}
                  label={depositLabel(r.status)}
                />
              </td>
              <td className="px-4 py-3 text-sm">
                <div>{formatMoney(r.reconciled, currency)}</div>
                <div className="text-xs text-slate-500">
                  Unreconciled {formatMoney(r.unreconciled, currency)}
                </div>
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {canManage && r.status === "pending_verification" ? (
                  <TableActionGroup>
                    <TableIconButton
                      icon={PencilEdit01Icon}
                      label="Edit"
                      onClick={() => startEdit(r)}
                    />
                    <TableIconButton
                      icon={CheckmarkBadge01Icon}
                      label="Reconcile"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        r.allocations.forEach((a) => {
                          next[a.payment_id] = true;
                        });
                        setSelectedPay(next);
                        setReconciling(r);
                      }}
                    />
                    <TableIconButton
                      icon={Tick02Icon}
                      label="Verify"
                      tone="primary"
                      onClick={() => setConfirm({ id: r.id, action: "verify" })}
                    />
                  </TableActionGroup>
                ) : null}
                {canManage && r.status === "verified" ? (
                  <TableActionGroup>
                    <TableIconButton
                      icon={CheckmarkBadge01Icon}
                      label="Post"
                      tone="primary"
                      onClick={() => setConfirm({ id: r.id, action: "post" })}
                    />
                  </TableActionGroup>
                ) : null}
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
        open={open}
        title={editing ? "Edit deposit" : "Record bank deposit"}
        subtitle="Pending deposits can be edited. Verified deposits cannot be changed silently."
        onClose={() => setOpen(false)}
        footer={
          <div className="flex gap-2">
            <SecondaryButton onClick={() => setOpen(false)} className="flex-1">
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form="bank-deposit-form"
              disabled={busy}
              className="flex-1"
            >
              {busy ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        }
      >
        <form
          id="bank-deposit-form"
          onSubmit={handleSave}
          className="space-y-1"
        >
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
          <FormField label="Collection source">
            <input
              className={fieldClass}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </FormField>
          <FormField label="Collection date">
            <input
              type="date"
              className={fieldClass}
              value={collectionDate}
              onChange={(e) => setCollectionDate(e.target.value)}
            />
          </FormField>
          <FormField label="Deposit date" required>
            <input
              type="date"
              className={fieldClass}
              value={depositDate}
              onChange={(e) => setDepositDate(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Bank" required>
            <input
              className={fieldClass}
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Bank account">
            <input
              className={fieldClass}
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
            />
          </FormField>
          <FormField label="Deposit slip / reference">
            <input
              className={fieldClass}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </FormField>
          <FormField label="Deposited by">
            <input
              className={fieldClass}
              value={depositedBy}
              onChange={(e) => setDepositedBy(e.target.value)}
            />
          </FormField>
          <FormField label="Supporting document (path or slip id)">
            <input
              className={fieldClass}
              value={documentPath}
              onChange={(e) => setDocumentPath(e.target.value)}
              placeholder="Slip number or file reference"
            />
          </FormField>
          <FormField label="Notes">
            <textarea
              className={fieldClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </form>
      </FormModal>

      <FormModal
        open={Boolean(reconciling)}
        title="Reconcile deposit"
        subtitle={
          reconciling
            ? `Match cash collections to ${formatMoney(reconciling.amount, currency)}.`
            : undefined
        }
        onClose={() => setReconciling(null)}
        size="xl"
        footer={
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              Selected {formatMoney(selectedTotal, currency)}
              {reconciling
                ? ` · deposit ${formatMoney(reconciling.amount, currency)}`
                : ""}
            </p>
            <div className="flex gap-2">
              <SecondaryButton onClick={() => setReconciling(null)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                type="submit"
                form="reconcile-form"
                disabled={busy}
              >
                {busy ? "Saving…" : "Save reconciliation"}
              </PrimaryButton>
            </div>
          </div>
        }
      >
        <form id="reconcile-form" onSubmit={handleReconcile}>
          <p className="mb-3 text-sm text-slate-500">
            A deposit can include collections from many students. Select the
            cash payments that went into this slip.
          </p>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
            {cash.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                No cash collections found.
              </p>
            ) : (
              cash.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-sm last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selectedPay[p.id])}
                    onChange={(e) =>
                      setSelectedPay((prev) => ({
                        ...prev,
                        [p.id]: e.target.checked,
                      }))
                    }
                  />
                  <span className="font-medium">{p.payment_number}</span>
                  <span className="text-slate-500">
                    {p.student_name || "—"} · {p.paid_at}
                  </span>
                  <span className="ml-auto font-medium">
                    {formatMoney(p.amount, currency)}
                  </span>
                </label>
              ))
            )}
          </div>
        </form>
      </FormModal>

      <ConfirmModal
        open={Boolean(confirm)}
        title={
          confirm?.action === "post"
            ? "Post this deposit?"
            : "Verify this deposit?"
        }
        description={
          confirm?.action === "post"
            ? "Posting writes the movement to the school ledger. This cannot be reversed silently."
            : "Verification is only allowed when school reconciliation rules are met. Verified deposits cannot be edited."
        }
        confirmLabel={confirm?.action === "post" ? "Post" : "Verify"}
        busy={busy}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </AppShell>
  );
}
