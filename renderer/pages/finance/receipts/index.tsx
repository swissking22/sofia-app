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
          <EmptyRow colSpan={9} message="No receipts yet." />
        ) : (
          filtered.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
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
