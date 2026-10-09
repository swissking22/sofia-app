import React from "react";
import Link from "next/link";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  ExportBar,
  FilterBar,
  FilterField,
  MoneyText,
  PageAlert,
  ReportSection,
  StatGrid,
  StudentTable,
  selectClass,
} from "../../../components/reports/ui";
import {
  ReportChartGrid,
  ReportChartPanel,
  SofiaAreaChart,
  SofiaDonutChart,
  SofiaHorizontalBarChart,
  SofiaPercentGauge,
  SofiaVerticalBarChart,
} from "../../../components/reports/charts";
import {
  downloadCsv,
  fetchFinancialAnalytics,
  fetchReportsMeta,
  toCsv,
  type ReportFilters,
} from "../../../lib/reports";
import { formatCompactMoney, formatMoney } from "../../../lib/finance-mgmt";

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
    by_fee_line: [],
    by_method: [],
  }) as {
    by_term: NamedAmount[];
    by_class: NamedAmount[];
    by_fee_type: NamedAmount[];
    by_fee_line: NamedAmount[];
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

  /** Chart axis / tooltip — compact on screen. */
  function moneyCompact(n: number) {
    return formatCompactMoney(n, currency);
  }

  function exportCsv() {
    if (!summary) return;
    const feeLineRows = (revenue.by_fee_line ?? []).map((r) => [
      `Fee line · ${r.name}`,
      formatMoney(r.amount, currency),
    ]);
    downloadCsv(
      "financial-analytics.csv",
      toCsv(
        ["Metric", "Value"],
        [
          ["Billed", formatMoney(summary.billed, currency)],
          ["Collected", formatMoney(summary.collected, currency)],
          ["Outstanding", formatMoney(summary.outstanding, currency)],
          ["Expenses", formatMoney(summary.expenses, currency)],
          ["Net", formatMoney(summary.net, currency)],
          ["Collection rate", `${summary.collection_rate}%`],
          ...feeLineRows,
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
              {
                label: "Total billed",
                value: (
                  <MoneyText amount={summary.billed} currency={currency} />
                ),
              },
              {
                label: "Total collected",
                value: (
                  <MoneyText amount={summary.collected} currency={currency} />
                ),
              },
              {
                label: "Outstanding fees",
                value: (
                  <MoneyText amount={summary.outstanding} currency={currency} />
                ),
              },
              {
                label: "Total expenses",
                value: (
                  <MoneyText amount={summary.expenses} currency={currency} />
                ),
              },
              {
                label: "Net balance",
                value: <MoneyText amount={summary.net} currency={currency} />,
              },
              {
                label: "Collection rate",
                value: `${summary.collection_rate}%`,
              },
            ]}
          />

          <ReportChartGrid>
            <ReportChartPanel
              title="Collection rate"
              description="Gauge of fees collected vs billed"
            >
              <SofiaPercentGauge
                rate={summary.collection_rate}
                label="Collected"
                footer={
                  <p className="mt-2 text-center text-xs text-slate-500">
                    <MoneyText amount={summary.collected} currency={currency} />{" "}
                    of <MoneyText amount={summary.billed} currency={currency} />
                  </p>
                }
              />
            </ReportChartPanel>
            <ReportChartPanel
              title="Cash position"
              description="Donut of collected vs outstanding"
            >
              <SofiaDonutChart
                data={[
                  {
                    id: "collected",
                    label: "Collected",
                    value: summary.collected,
                  },
                  {
                    id: "outstanding",
                    label: "Outstanding",
                    value: summary.outstanding,
                  },
                ].filter((d) => d.value > 0)}
                totalLabel="Fees"
              />
            </ReportChartPanel>
          </ReportChartGrid>

          <ReportSection title="Revenue">
            <ReportChartGrid>
              <ReportChartPanel
                title="Revenue by class"
                description="Horizontal bars for class comparison"
              >
                <SofiaHorizontalBarChart
                  data={revenue.by_class.map((r, i) => ({
                    id: `${r.name}-${i}`,
                    label: r.name,
                    value: r.amount,
                  }))}
                  valueFormatter={moneyCompact}
                />
              </ReportChartPanel>
              <ReportChartPanel
                title="Revenue by fee type"
                description="Donut for fee mix"
              >
                <SofiaDonutChart
                  data={revenue.by_fee_type.map((r, i) => ({
                    id: `${r.name}-${i}`,
                    label: r.name,
                    value: r.amount,
                  }))}
                  totalLabel="Revenue"
                />
              </ReportChartPanel>
              <ReportChartPanel
                title="Collected by fee line"
                description="How much came in for Tuition, PTA, and other fee lines"
              >
                <SofiaHorizontalBarChart
                  data={(revenue.by_fee_line ?? []).map((r, i) => ({
                    id: `${r.name}-${i}`,
                    label: r.name,
                    value: r.amount,
                  }))}
                  valueFormatter={moneyCompact}
                />
              </ReportChartPanel>
              <ReportChartPanel
                title="Revenue by term"
                description="Vertical bars across terms"
              >
                <SofiaVerticalBarChart
                  data={revenue.by_term.map((r) => ({
                    label: r.name,
                    value: r.amount,
                  }))}
                  valueFormatter={moneyCompact}
                  highlightLast={false}
                />
              </ReportChartPanel>
              <ReportChartPanel
                title="Payment methods"
                description="Donut of collection channels"
              >
                <SofiaDonutChart
                  data={revenue.by_method.map((r, i) => ({
                    id: `${r.name}-${i}`,
                    label: r.name,
                    value: r.amount,
                  }))}
                  totalLabel="Payments"
                />
              </ReportChartPanel>
            </ReportChartGrid>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Collections by fee line
                </h3>
                <p className="text-xs text-slate-500">
                  Amounts recorded against each fee structure line in the
                  selected period.
                </p>
              </div>
              <StudentTable columns={["Fee line", "Collected"]}>
                {(revenue.by_fee_line ?? []).length === 0 ? (
                  <EmptyRow
                    colSpan={2}
                    message="No fee-line collections in this period."
                  />
                ) : (
                  (revenue.by_fee_line ?? []).map((row) => (
                    <tr key={row.name} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.name}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        <MoneyText amount={row.amount} currency={currency} />
                      </td>
                    </tr>
                  ))
                )}
              </StudentTable>
            </div>
          </ReportSection>

          <ReportSection title="Outstanding fees">
            <ReportChartPanel
              title="Aging buckets"
              description="Horizontal bars for arrears age"
              className="mb-4"
            >
              <SofiaHorizontalBarChart
                data={[
                  {
                    id: "current",
                    label: "Current",
                    value: summary.aging.current,
                  },
                  {
                    id: "30",
                    label: "30+ days",
                    value: summary.aging.aging_30,
                  },
                  {
                    id: "60",
                    label: "60+ days",
                    value: summary.aging.aging_60,
                  },
                  {
                    id: "90",
                    label: "90+ days",
                    value: summary.aging.aging_90,
                  },
                ]}
                valueFormatter={moneyCompact}
              />
            </ReportChartPanel>
            <StatGrid
              items={[
                { label: "Students owing", value: summary.students_owing },
                {
                  label: "Current",
                  value: (
                    <MoneyText
                      amount={summary.aging.current}
                      currency={currency}
                    />
                  ),
                },
                {
                  label: "30+ days",
                  value: (
                    <MoneyText
                      amount={summary.aging.aging_30}
                      currency={currency}
                    />
                  ),
                },
                {
                  label: "60+ days",
                  value: (
                    <MoneyText
                      amount={summary.aging.aging_60}
                      currency={currency}
                    />
                  ),
                },
                {
                  label: "90+ days",
                  value: (
                    <MoneyText
                      amount={summary.aging.aging_90}
                      currency={currency}
                    />
                  ),
                },
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
                    <td className="px-4 py-3">
                      <MoneyText amount={r.outstanding} currency={currency} />
                    </td>
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
                  <td className="px-4 py-3">
                    <MoneyText amount={r.outstanding} currency={currency} />
                  </td>
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
            <ReportChartGrid>
              <ReportChartPanel
                title="Expenses by category"
                description="Donut of spend mix"
              >
                <SofiaDonutChart
                  data={expenses.by_category.map((r, i) => ({
                    id: `${r.name}-${i}`,
                    label: r.name,
                    value: r.amount,
                  }))}
                  totalLabel="Spend"
                />
              </ReportChartPanel>
              <ReportChartPanel
                title="Monthly expenses"
                description="Area chart of spend over time"
              >
                <SofiaAreaChart
                  data={expenses.by_month.map((r) => ({
                    label: r.month,
                    value: r.amount,
                  }))}
                  valueFormatter={moneyCompact}
                />
              </ReportChartPanel>
            </ReportChartGrid>
            <StudentTable columns={["Month", "Amount"]} loading={false}>
              {expenses.by_month.map((r) => (
                <tr key={r.month} className="border-t border-slate-100">
                  <td className="px-4 py-3">{r.month}</td>
                  <td className="px-4 py-3">
                    <MoneyText amount={r.amount} currency={currency} />
                  </td>
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
                    value: (
                      <MoneyText
                        amount={deposits.cash_collected}
                        currency={currency}
                      />
                    ),
                  },
                  {
                    label: "Cash deposited",
                    value: (
                      <MoneyText
                        amount={deposits.cash_deposited}
                        currency={currency}
                      />
                    ),
                  },
                  {
                    label: "Undeposited",
                    value: (
                      <MoneyText
                        amount={deposits.undeposited}
                        currency={currency}
                      />
                    ),
                  },
                  {
                    label: "Reconciled",
                    value: (
                      <MoneyText
                        amount={deposits.reconciled}
                        currency={currency}
                      />
                    ),
                  },
                  {
                    label: "Unreconciled",
                    value: (
                      <MoneyText
                        amount={deposits.unreconciled}
                        currency={currency}
                      />
                    ),
                  },
                ]}
              />
              <ReportChartGrid>
                <ReportChartPanel
                  title="Deposits by bank"
                  description="Horizontal bars per bank"
                >
                  <SofiaHorizontalBarChart
                    data={deposits.by_bank.map((r, i) => ({
                      id: `${r.name}-${i}`,
                      label: r.name,
                      value: r.amount,
                    }))}
                    valueFormatter={moneyCompact}
                  />
                </ReportChartPanel>
                <ReportChartPanel
                  title="Deposit timeline"
                  description="Area chart of deposits by month"
                >
                  <SofiaAreaChart
                    data={deposits.by_period.map((r) => ({
                      label: r.month,
                      value: r.amount,
                    }))}
                    valueFormatter={moneyCompact}
                  />
                </ReportChartPanel>
              </ReportChartGrid>
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
              <ReportChartGrid>
                <ReportChartPanel
                  title="Budget utilization"
                  description="Gauge of spend vs allocation"
                >
                  <SofiaPercentGauge
                    rate={budget.utilization}
                    label="Utilized"
                    footer={
                      <p className="mt-2 text-center text-xs text-slate-500">
                        <MoneyText amount={budget.spent} currency={currency} />{" "}
                        of{" "}
                        <MoneyText
                          amount={budget.allocated}
                          currency={currency}
                        />
                      </p>
                    }
                  />
                </ReportChartPanel>
                <ReportChartPanel
                  title="Budget composition"
                  description="Donut of spent vs remaining"
                >
                  <SofiaDonutChart
                    data={[
                      { id: "spent", label: "Spent", value: budget.spent },
                      {
                        id: "remaining",
                        label: "Remaining",
                        value: Math.max(0, budget.remaining),
                      },
                    ].filter((d) => d.value > 0)}
                    totalLabel="Budget"
                  />
                </ReportChartPanel>
              </ReportChartGrid>
              <StatGrid
                items={[
                  {
                    label: "Allocated",
                    value: (
                      <MoneyText
                        amount={budget.allocated}
                        currency={currency}
                      />
                    ),
                  },
                  {
                    label: "Spent",
                    value: (
                      <MoneyText amount={budget.spent} currency={currency} />
                    ),
                  },
                  {
                    label: "Remaining",
                    value: (
                      <MoneyText
                        amount={budget.remaining}
                        currency={currency}
                      />
                    ),
                  },
                  { label: "Utilization", value: `${budget.utilization}%` },
                ]}
              />
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
