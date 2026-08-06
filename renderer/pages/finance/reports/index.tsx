import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  FinanceTable,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  selectClass,
} from "../../../components/finance/ui";
import {
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  downloadCsv,
  fetchFinanceMeta,
  fetchReports,
  formatMoney,
  type ExpenseCategory,
  type FinanceMeta,
  type FinanceReportDto,
  type PaymentMethod,
} from "../../../lib/finance-mgmt";

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export default function FinanceReportsPage() {
  const initial = monthRange();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [meta, setMeta] = React.useState<FinanceMeta | null>(null);
  const [report, setReport] = React.useState<FinanceReportDto | null>(null);
  const [from, setFrom] = React.useState(initial.from);
  const [to, setTo] = React.useState(initial.to);

  const currency = meta?.currency ?? "";

  const load = React.useCallback(async () => {
    setLoading(true);
    const [metaRes, reportRes] = await Promise.all([
      fetchFinanceMeta(),
      fetchReports({ from: from || null, to: to || null }),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (reportRes.ok) setReport(reportRes.data);
    else setError(reportRes.error);
    setLoading(false);
  }, [from, to]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function exportCsv() {
    if (!report) return;
    const lines = [
      "Metric,Value",
      `From,${report.from}`,
      `To,${report.to}`,
      `Revenue,${report.revenue}`,
      `Collected,${report.collected}`,
      `Outstanding,${report.outstanding}`,
      `Expenses,${report.expenses}`,
      `Profit/Loss,${report.profit_loss}`,
      `Invoice count,${report.invoice_count}`,
      `Payment count,${report.payment_count}`,
      "",
      "Payment method,Amount",
      ...Object.entries(report.payment_by_method).map(
        ([k, v]) => `${k},${v}`
      ),
      "",
      "Expense category,Amount",
      ...Object.entries(report.expense_by_category).map(
        ([k, v]) => `${k},${v}`
      ),
    ];
    downloadCsv(
      `finance-report-${report.from}-to-${report.to}.csv`,
      lines.join("\n")
    );
  }

  const cards = report
    ? [
        { label: "Revenue (billed)", value: report.revenue },
        { label: "Collected", value: report.collected },
        { label: "Outstanding", value: report.outstanding },
        { label: "Expenses", value: report.expenses },
        { label: "P&L (collected − expenses)", value: report.profit_loss },
      ]
    : [];

  const methodRows = Object.entries(report?.payment_by_method ?? {});
  const expenseRows = Object.entries(report?.expense_by_category ?? {});

  return (
    <AppShell
      title="Financial Reports"
      breadcrumb={["Finance & Fees", "Financial Reports"]}
      heading="Financial Reports"
      subtitle="Revenue, collections, expenses, and profit & loss for a date range."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

      <FilterBar
        filters={
          <>
            <FilterField label="From">
              <input
                type="date"
                className={selectClass}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </FilterField>
            <FilterField label="To">
              <input
                type="date"
                className={selectClass}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </FilterField>
          </>
        }
        actions={
          <>
            <SecondaryButton onClick={() => void load()}>
              Refresh
            </SecondaryButton>
            <PrimaryButton disabled={!report} onClick={exportCsv}>
              Export CSV
            </PrimaryButton>
          </>
        }
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {cards.map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="text-xs font-medium text-slate-500">
                  {c.label}
                </div>
                <div
                  className={`mt-1 text-lg font-semibold ${
                    c.label.startsWith("P&L") && c.value < 0
                      ? "text-red-600"
                      : "text-slate-900"
                  }`}
                >
                  {formatMoney(c.value, currency)}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Payments by method
              </h3>
              <FinanceTable columns={["Method", "Amount"]}>
                {methodRows.length === 0 ? (
                  <EmptyRow colSpan={2} message="No payments in range." />
                ) : (
                  methodRows.map(([method, amount]) => (
                    <tr key={method} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-700">
                        {PAYMENT_METHOD_LABELS[method as PaymentMethod] ??
                          method}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {formatMoney(amount, currency)}
                      </td>
                    </tr>
                  ))
                )}
              </FinanceTable>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Expenses by category
              </h3>
              <FinanceTable columns={["Category", "Amount"]}>
                {expenseRows.length === 0 ? (
                  <EmptyRow colSpan={2} message="No expenses in range." />
                ) : (
                  expenseRows.map(([cat, amount]) => (
                    <tr key={cat} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-700">
                        {EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory] ??
                          cat}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {formatMoney(amount, currency)}
                      </td>
                    </tr>
                  ))
                )}
              </FinanceTable>
            </div>
          </div>

          {report ? (
            <p className="mt-4 text-xs text-slate-400">
              {report.invoice_count} invoices · {report.payment_count} payments
              in range
            </p>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
