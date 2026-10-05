import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  PageAlert,
  PrimaryButton,
  SecondaryButton,
} from "../../../components/finance/ui";
import { formatDisplayDateTime } from "../../../lib/date-format";
import {
  PAYMENT_METHOD_LABELS,
  fetchFinanceMeta,
  fetchReceipt,
  formatMoney,
  reprintReceipt,
  type FinanceMeta,
  type ReceiptDetailDto,
} from "../../../lib/finance-mgmt";

export default function ReceiptPrintPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [meta, setMeta] = React.useState<FinanceMeta | null>(null);
  const [data, setData] = React.useState<ReceiptDetailDto | null>(null);

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "";

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [metaRes, res] = await Promise.all([
      fetchFinanceMeta(),
      fetchReceipt(id),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (res.ok) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleReprint() {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const res = await reprintReceipt(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Receipt"
      breadcrumb={[
        "Finance & Fees",
        "Receipts",
        data?.receipt.receipt_number ?? "…",
      ]}
      heading="Receipt"
      subtitle="Printable payment receipt."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

      <div className="no-print mb-4 flex flex-wrap gap-2 print:hidden">
        <PrimaryButton onClick={() => window.print()}>Print</PrimaryButton>
        {canManage ? (
          <SecondaryButton disabled={busy} onClick={() => void handleReprint()}>
            {busy ? "Working…" : "Log reprint"}
          </SecondaryButton>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : data?.rendered_html ? (
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white p-6 print:border-0 print:p-0">
          {data.print_css ? <style>{data.print_css}</style> : null}
          <div dangerouslySetInnerHTML={{ __html: data.rendered_html }} />
          {data.receipt.reprint_count > 0 ? (
            <p className="mt-4 text-xs text-slate-400 print:hidden">
              Reprint #{data.receipt.reprint_count}
            </p>
          ) : null}
        </div>
      ) : data ? (
        <article className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 print:border-0 print:p-0">
          {data.template?.header_text ? (
            <p className="mb-6 whitespace-pre-wrap text-slate-700">
              {data.template.header_text}
            </p>
          ) : (
            <header className="mb-6 border-b border-slate-100 pb-4">
              <h1 className="text-2xl font-semibold text-slate-900">
                {data.school_name}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {data.template?.title || "Payment receipt"}
              </p>
            </header>
          )}

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Receipt number
              </dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900">
                {data.receipt.receipt_number}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Date
              </dt>
              <dd className="mt-1 text-slate-800">
                {formatDisplayDateTime(data.receipt.issued_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Student
              </dt>
              <dd className="mt-1 text-slate-800">
                {data.student?.name ?? "—"}
                {data.student?.student_code ? (
                  <span className="block text-slate-500">
                    {data.student.student_code}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Invoice
              </dt>
              <dd className="mt-1 text-slate-800">
                {data.invoice?.invoice_number ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Amount paid
              </dt>
              <dd className="mt-1 text-xl font-semibold text-slate-900">
                {formatMoney(data.receipt.amount, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Method
              </dt>
              <dd className="mt-1 text-slate-800">
                {data.payment?.method
                  ? (PAYMENT_METHOD_LABELS[data.payment.method] ??
                    data.payment.method)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Balance remaining
              </dt>
              <dd className="mt-1 font-medium text-slate-800">
                {formatMoney(data.receipt.balance_remaining, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Payment #
              </dt>
              <dd className="mt-1 text-slate-800">
                {data.payment?.payment_number ?? "—"}
              </dd>
            </div>
          </dl>

          {(data.lines?.length ?? 0) > 0 ? (
            <div className="mt-8">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">
                Paid for
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-2 font-medium">Fee component</th>
                    <th className="pb-2 text-right font-medium">Charged</th>
                    <th className="pb-2 text-right font-medium">
                      Paid this receipt
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line, idx) => (
                    <tr
                      key={`${line.description}-${idx}`}
                      className="border-b border-slate-100"
                    >
                      <td className="py-2 text-slate-800">
                        {line.description}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {formatMoney(line.charged, currency)}
                      </td>
                      <td className="py-2 text-right font-medium text-slate-900">
                        {formatMoney(line.paid, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {data.template?.footer_text ? (
            <p className="mt-8 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm text-slate-600">
              {data.template.footer_text}
            </p>
          ) : (
            <p className="mt-8 border-t border-slate-100 pt-4 text-xs text-slate-400">
              Thank you. Keep this receipt for your records.
              {data.receipt.reprint_count > 0
                ? ` (Reprint #${data.receipt.reprint_count})`
                : ""}
            </p>
          )}
        </article>
      ) : (
        <p className="text-sm text-slate-500">
          Receipt not found.{" "}
          <Link href="/finance/receipts" className="text-(--sofia-primary)">
            Back to list
          </Link>
        </p>
      )}
    </AppShell>
  );
}
