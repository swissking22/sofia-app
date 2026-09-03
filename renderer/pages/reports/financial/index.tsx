import React from "react";
import Link from "next/link";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  ExportBar,
  FilterBar,
  FilterField,
  PageAlert,
  ReportSection,
  ShareBar,
  StatGrid,
  StudentTable,
  selectClass,
} from "../../../components/reports/ui";
import {
  downloadCsv,
  fetchFinancialAnalytics,
  fetchReportsMeta,
  toCsv,
  type ReportFilters,
} from "../../../lib/reports";
import { formatMoney } from "../../../lib/finance-mgmt";

type NamedAmount = { name: string; amount: number };

export default function FinancialAnalyticsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [yearId, setYearId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [feeType, setFeeType] = React.useState("");
  const [method, setMethod] = React.useState("");
  const [expenseCat, setExpenseCat] = React.useState("");
  const [meta, setMeta] = React.useState<
    | Extract<
        Awaited<ReturnType<typeof fetchReportsMeta>>,
        { ok: true }
      >["data"]
    | null
  >(null);
  const [data, setData] = React.useState<Record<string, unknown> | null>(null);

  const load = React.useCallback(async () => {
    const metaRes = await fetchReportsMeta();
    if (!metaRes.ok) {
      setError(metaRes.error);
      setLoading(false);
      return;
    }
    setMeta(metaRes.data);
    if (!metaRes.data.can_view_finance) {
      setError("You do not have permission to view financial analytics.");
      setLoading(false);
      return;
    }
    const year =
      yearId ||
      metaRes.data.years.find((y) => y.is_current)?.id ||
      metaRes.data.years[0]?.id ||
      "";
    if (!yearId && year) setYearId(year);
    const filters: ReportFilters = {
      academic_year_id: year || undefined,
      term_id: termId || undefined,
      from: from || undefined,
      to: to || undefined,
      class_id: classId || undefined,
      fee_type: feeType || undefined,
      payment_method: method || undefined,
      expense_category: expenseCat || undefined,
    };
    const res = await fetchFinancialAnalytics(filters);
    if (res.ok) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, [yearId, termId, from, to, classId, feeType, method, expenseCat]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const currency = meta?.currency ?? "XAF";
  const summary = (data?.summary ?? null) as {
    billed: number;
    collected: number;
    outstanding: number;
    expenses: number;
    net: number;
    collection_rate: number;
    students_owing: number;
    aging: {
      current: number;
      aging_30: number;
      aging_60: number;
      aging_90: number;
    };
  } | null;
  const revenue = (data?.revenue ?? {
    by_term: [],
    by_class: [],
    by_fee_type: [],
    by_method: [],
  }) as {
    by_term: NamedAmount[];
    by_class: NamedAmount[];
    by_fee_type: NamedAmount[];
    by_method: NamedAmount[];
  };
  const expenses = (data?.expenses ?? { by_category: [], by_month: [] }) as {
    by_category: NamedAmount[];
    by_month: Array<{ month: string; amount: number }>;
  };
  const byClass = (data?.outstanding_by_class ?? []) as Array<{
    class_name: string;
    outstanding: number;
    students_owing: number;
  }>;
  const byStudent = (data?.outstanding_by_student ?? []) as Array<{
    student_id: string;
    student_name: string;
    class_name: string;
    outstanding: number;
  }>;
  const deposits = (data?.deposits ?? null) as {
    cash_collected: number;
    cash_deposited: number;
    undeposited: number;
    reconciled: number;
    unreconciled: number;
    by_bank: NamedAmount[];
    by_period: Array<{ month: string; amount: number }>;
  } | null;
  const budget = (data?.budget ?? null) as {
    allocated: number;
    spent: number;
    remaining: number;
    utilization: number;
  } | null;

  function money(n: number) {
    return formatMoney(n, currency);
  }

  function exportCsv() {
    if (!summary) return;
    downloadCsv(
      "financial-analytics.csv",
      toCsv(
        ["Metric", "Value"],
        [
          ["Billed", summary.billed],
          ["Collected", summary.collected],
          ["Outstanding", summary.outstanding],
          ["Expenses", summary.expenses],
          ["Net", summary.net],
          ["Collection rate", summary.collection_rate],
        ],
      ),
    );
  }

  const terms = (meta?.terms ?? []).filter(
    (t) => !yearId || t.academic_year_id === yearId,
  );

  return (
    <AppShell
      title="Financial Reports"
      breadcrumb={["Reports & Analytics", "Financial Reports"]}
      heading="Financial Reports"
      subtitle="Analytics on the existing Finance & Fees ledger. Operational recording stays in Finance."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      <FilterBar
        filters={
          <>
            <FilterField label="Year">
              <select
                className={selectClass}
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
              >
                {(meta?.years ?? []).map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Term">
              <select
                className={selectClass}
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              >
                <option value="">All terms</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FilterField>
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
            <FilterField label="Class">
              <select
                className={selectClass}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">All</option>
                {(meta?.classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Fee type">
              <select
                className={selectClass}
                value={feeType}
                onChange={(e) => setFeeType(e.target.value)}
              >
                <option value="">All</option>
                {(meta?.fee_types ?? []).map((f) => (
                  <option key={f.id} value={f.category_key}>
                    {f.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Payment method">
              <select
                className={selectClass}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="">All</option>
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile money</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="card">Card</option>
                <option value="online">Online</option>
              </select>
            </FilterField>
            <FilterField label="Expense category">
              <select
                className={selectClass}
                value={expenseCat}
                onChange={(e) => setExpenseCat(e.target.value)}
              >
                <option value="">All</option>
                <option value="salaries">Salaries</option>
                <option value="utilities">Utilities</option>
                <option value="maintenance">Maintenance</option>
                <option value="supplies">Supplies</option>
                <option value="transport">Transport</option>
                <option value="miscellaneous">Miscellaneous</option>
              </select>
            </FilterField>
          </>
        }
        actions={<ExportBar disabled={!summary} onCsv={exportCsv} />}
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : summary ? (
        <>
          <StatGrid
            items={[
              { label: "Total billed", value: money(summary.billed) },
              { label: "Total collected", value: money(summary.collected) },
              { label: "Outstanding fees", value: money(summary.outstanding) },
              { label: "Total expenses", value: money(summary.expenses) },
              { label: "Net balance", value: money(summary.net) },
              {
                label: "Collection rate",
                value: `${summary.collection_rate}%`,
              },
            ]}
          />

          <ReportSection title="Revenue">
            <div className="grid gap-6 md:grid-cols-2">
              <BreakdownTable
                title="By term"
                rows={revenue.by_term}
                money={money}
              />
              <BreakdownTable
                title="By class"
                rows={revenue.by_class}
                money={money}
              />
              <BreakdownTable
                title="By fee type"
                rows={revenue.by_fee_type}
                money={money}
              />
              <BreakdownTable
                title="By payment method"
                rows={revenue.by_method}
                money={money}
              />
            </div>
          </ReportSection>

          <ReportSection title="Outstanding fees">
            <StatGrid
              items={[
                { label: "Students owing", value: summary.students_owing },
                { label: "Current", value: money(summary.aging.current) },
                { label: "30+ days", value: money(summary.aging.aging_30) },
                { label: "60+ days", value: money(summary.aging.aging_60) },
                { label: "90+ days", value: money(summary.aging.aging_90) },
              ]}
            />
            <StudentTable
              columns={["Class", "Outstanding", "Students owing"]}
              loading={false}
            >
              {byClass.length === 0 ? (
                <EmptyRow colSpan={3} message="No outstanding balances." />
              ) : (
                byClass.map((r) => (
                  <tr key={r.class_name} className="border-t border-slate-100">
                    <td className="px-4 py-3">{r.class_name}</td>
                    <td className="px-4 py-3">{money(r.outstanding)}</td>
                    <td className="px-4 py-3">{r.students_owing}</td>
                  </tr>
                ))
              )}
            </StudentTable>
            <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-500">
              By student
            </h3>
            <StudentTable
              columns={["Student", "Class", "Outstanding"]}
              loading={false}
            >
              {byStudent.map((r) => (
                <tr key={r.student_id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      className="text-(--sofia-primary)"
                      href={`/reports/students?student_id=${r.student_id}`}
                    >
                      {r.student_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.class_name}</td>
                  <td className="px-4 py-3">{money(r.outstanding)}</td>
                </tr>
              ))}
            </StudentTable>
            <Link
              className="mt-3 inline-block text-sm font-semibold text-(--sofia-primary)"
              href="/finance/outstanding"
            >
              Open Outstanding Fees
            </Link>
          </ReportSection>

          <ReportSection title="Expenses">
            <BreakdownTable
              title="By category"
              rows={expenses.by_category}
              money={money}
            />
            <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-500">
              Monthly
            </h3>
            <StudentTable columns={["Month", "Amount"]} loading={false}>
              {expenses.by_month.map((r) => (
                <tr key={r.month} className="border-t border-slate-100">
                  <td className="px-4 py-3">{r.month}</td>
                  <td className="px-4 py-3">{money(r.amount)}</td>
                </tr>
              ))}
            </StudentTable>
          </ReportSection>

          {deposits ? (
            <ReportSection title="Bank deposits">
              <StatGrid
                items={[
                  {
                    label: "Cash collected",
                    value: money(deposits.cash_collected),
                  },
                  {
                    label: "Cash deposited",
                    value: money(deposits.cash_deposited),
                  },
                  { label: "Undeposited", value: money(deposits.undeposited) },
                  { label: "Reconciled", value: money(deposits.reconciled) },
                  {
                    label: "Unreconciled",
                    value: money(deposits.unreconciled),
                  },
                ]}
              />
              <BreakdownTable
                title="By bank"
                rows={deposits.by_bank}
                money={money}
              />
              <Link
                className="mt-3 inline-block text-sm font-semibold text-(--sofia-primary)"
                href="/finance/bank-deposits"
              >
                Open Bank Deposits
              </Link>
            </ReportSection>
          ) : null}

          {budget ? (
            <ReportSection title="Budget">
              <StatGrid
                items={[
                  { label: "Allocated", value: money(budget.allocated) },
                  { label: "Spent", value: money(budget.spent) },
                  { label: "Remaining", value: money(budget.remaining) },
                  { label: "Utilization", value: `${budget.utilization}%` },
                ]}
              />
              <ShareBar value={budget.utilization} />
              <Link
                className="mt-3 inline-block text-sm font-semibold text-(--sofia-primary)"
                href="/finance/budgeting"
              >
                Open Budgeting
              </Link>
            </ReportSection>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}

function BreakdownTable({
  title,
  rows,
  money,
}: {
  title: string;
  rows: NamedAmount[];
  money: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No data.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{r.name}</span>
                <span className="font-medium">{money(r.amount)}</span>
              </div>
              <ShareBar value={r.amount} max={max} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
