import React from "react";
import Link from "next/link";
import { PrinterIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import {
  FormModal,
  EmptyRow,
  FilterBar,
  FilterField,
  FinanceTable,
  TableSelectionBar,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  selectClass,
  useDebouncedValue,
} from "../../../components/finance/ui";
import {
  TableActionGroup,
  TableIconButton,
} from "../../../components/ui/TableActions";
import {
  PAYMENT_METHOD_LABELS,
  fetchFinanceMeta,
  fetchReceipt,
  fetchReceipts,
  formatMoney,
  reprintReceipt,
  type FinanceMeta,
  type ReceiptDetailDto,
  type ReceiptDto,
} from "../../../lib/finance-mgmt";

export default function ReceiptsPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<FinanceMeta | null>(null);
  const [receipts, setReceipts] = React.useState<ReceiptDto[]>([]);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [preview, setPreview] = React.useState<ReceiptDetailDto | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "";

  const load = React.useCallback(async () => {
    const [metaRes, listRes] = await Promise.all([
      fetchFinanceMeta(),
      fetchReceipts(),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (listRes.ok) setReceipts(listRes.data);
    else setError(listRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter(
      (r) =>
        r.receipt_number.toLowerCase().includes(q) ||
        (r.student_name || "").toLowerCase().includes(q) ||
        (r.student_code || "").toLowerCase().includes(q) ||
        (r.payment_number || "").toLowerCase().includes(q),
    );
  }, [receipts, debouncedSearch]);

  const allSelected = filtered.length > 0 && selected.length === filtered.length;
  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelected([]);
    else setSelected(filtered.map((r) => r.id));
  }
  function exportSelected() {
    const target = filtered.filter((r) => selected.includes(r.id));
    if (!target.length) return;
    const csv = [
      ["Receipt #", "Student", "Student ID", "Payment #", "Amount", "Method", "Balance Left", "Issued Date", "Reprints"].join(","),
      ...target.map((r) =>
        [
          `"${r.receipt_number}"`,
          `"${r.student_name || ""}"`,
          `"${r.student_code || ""}"`,
          `"${r.payment_number || ""}"`,
          r.amount,
          `"${r.method ? (PAYMENT_METHOD_LABELS[r.method] ?? r.method) : ""}"`,
          r.balance_remaining,
          `"${r.issued_at}"`,
          r.reprint_count,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipts-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function openPreview(id: string) {
    setError("");
    const res = await fetchReceipt(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPreview(res.data);
  }

  async function handleReprint(id: string) {
    setBusy(true);
    setError("");
    try {
      const res = await reprintReceipt(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Reprint logged (count ${res.data.reprint_count}).`);
      await load();
      if (preview?.receipt.id === id) {
        await openPreview(id);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Receipts"
      breadcrumb={["Finance & Fees", "Receipts"]}
      heading="Receipts"
      subtitle="View and print payment receipts."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={
          <FilterField label="Search" className="min-w-48 flex-1">
            <input
              className={`w-full ${selectClass}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Receipt # or student"
            />
          </FilterField>
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
          "Receipt #",
          "Student",
          "Payment",
          "Amount",
          "Method",
          "Balance left",
          "Issued",
          "Reprints",
          "",
        ]}
        loading={loading}
      >
        {filtered.length === 0 ? (
          <EmptyRow colSpan={10} message="No receipts yet." />
        ) : (
          filtered.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={() => toggle(r.id)}
                />
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">
                {r.receipt_number}
              </td>
              <td className="px-4 py-3 text-slate-700">
                <div>{r.student_name}</div>
                <div className="text-xs text-slate-400">
                  {r.student_code || "—"}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {r.payment_number ?? "—"}
              </td>
              <td className="px-4 py-3 font-medium">
                {formatMoney(r.amount, currency)}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {r.method ? (PAYMENT_METHOD_LABELS[r.method] ?? r.method) : "—"}
              </td>
              <td className="px-4 py-3">
                {formatMoney(r.balance_remaining, currency)}
              </td>
              <td className="px-4 py-3 text-slate-600">{r.issued_at}</td>
              <td className="px-4 py-3 text-slate-600">{r.reprint_count}</td>
              <td className="px-4 py-3">
                <TableActionGroup>
                  <TableIconButton
                    icon={ViewIcon}
                    label="View receipt"
                    tone="primary"
                    onClick={() => void openPreview(r.id)}
                  />
                  <TableIconButton
                    icon={PrinterIcon}
                    label="Print page"
                    href={`/finance/receipts/${r.id}`}
                  />
                </TableActionGroup>
              </td>
            </tr>
          ))
        )}
      </FinanceTable>

      <TableSelectionBar
        totalCount={filtered.length}
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
        open={!!preview}
        title={
          preview ? `Receipt ${preview.receipt.receipt_number}` : "Receipt"
        }
        subtitle={preview?.student?.name}
        onClose={() => setPreview(null)}
        footer={
          <div className="flex flex-col gap-2">
            <PrimaryButton
              onClick={() => {
                window.print();
              }}
            >
              Print
            </PrimaryButton>
            {canManage && preview ? (
              <SecondaryButton
                disabled={busy}
                onClick={() => void handleReprint(preview.receipt.id)}
              >
                {busy ? "Working…" : "Log reprint"}
              </SecondaryButton>
            ) : null}
            {preview ? (
              <Link
                href={`/finance/receipts/${preview.receipt.id}`}
                className="text-center text-sm font-medium text-(--sofia-primary)"
              >
                Open full print page
              </Link>
            ) : null}
          </div>
        }
      >
        {preview ? (
          <div className="print:p-0 space-y-3 text-sm" id="receipt-preview">
            {preview.template?.header_text ? (
              <p className="whitespace-pre-wrap text-slate-700">
                {preview.template.header_text}
              </p>
            ) : (
              <h2 className="text-lg font-semibold text-slate-900">
                {preview.school_name}
              </h2>
            )}
            <dl className="grid grid-cols-2 gap-2">
              <div>
                <dt className="text-xs text-slate-500">Receipt #</dt>
                <dd className="font-medium">
                  {preview.receipt.receipt_number}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Date</dt>
                <dd>{preview.receipt.issued_at}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Student</dt>
                <dd>
                  {preview.student?.name ?? "—"}
                  {preview.student?.student_code
                    ? ` (${preview.student.student_code})`
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Amount</dt>
                <dd className="font-semibold">
                  {formatMoney(preview.receipt.amount, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Method</dt>
                <dd>
                  {preview.payment?.method
                    ? (PAYMENT_METHOD_LABELS[preview.payment.method] ??
                      preview.payment.method)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Balance remaining</dt>
                <dd>
                  {formatMoney(preview.receipt.balance_remaining, currency)}
                </dd>
              </div>
            </dl>
            {(preview.lines?.length ?? 0) > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  Paid for
                </h3>
                <ul className="space-y-1 text-sm">
                  {preview.lines
                    .filter((l) => l.paid > 0)
                    .map((line, idx) => (
                      <li
                        key={`${line.description}-${idx}`}
                        className="flex justify-between gap-3 border-b border-slate-50 py-1"
                      >
                        <span className="text-slate-700">{line.description}</span>
                        <span className="font-medium text-slate-900">
                          {formatMoney(line.paid, currency)}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
            {preview.template?.footer_text ? (
              <p className="whitespace-pre-wrap border-t border-slate-100 pt-3 text-slate-600">
                {preview.template.footer_text}
              </p>
            ) : null}
          </div>
        ) : null}
      </FormModal>
    </AppShell>
  );
}
