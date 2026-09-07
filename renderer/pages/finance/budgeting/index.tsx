import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField } from "../../../components/setup";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  FinanceTable,
  FormModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  fieldClass,
  selectClass,
} from "../../../components/finance/ui";
import {
  createBudget,
  createBudgetCategory,
  fetchBudgetMeta,
  fetchBudgets,
  saveBudgetThresholds,
  type BudgetPeriodType,
  type BudgetRow,
} from "../../../lib/finance-ext";
import { formatMoney } from "../../../lib/finance-mgmt";

function barColor(alert: BudgetRow["alert"]) {
  if (alert === "critical") return "bg-red-500";
  if (alert === "warning") return "bg-amber-500";
  if (alert === "alert") return "bg-sky-500";
  return "bg-emerald-500";
}

export default function BudgetingPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [yearId, setYearId] = React.useState("");
  const [rows, setRows] = React.useState<BudgetRow[]>([]);
  const [totals, setTotals] = React.useState({
    allocated: 0,
    spent: 0,
    remaining: 0,
    utilization: 0,
  });
  const [meta, setMeta] = React.useState<
    | Extract<Awaited<ReturnType<typeof fetchBudgetMeta>>, { ok: true }>["data"]
    | null
  >(null);
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [periodType, setPeriodType] =
    React.useState<BudgetPeriodType>("annual");
  const [periodStart, setPeriodStart] = React.useState("");
  const [periodEnd, setPeriodEnd] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [newCat, setNewCat] = React.useState("");
  const [alert, setAlert] = React.useState("70");
  const [warning, setWarning] = React.useState("85");
  const [critical, setCritical] = React.useState("100");

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "XAF";

  const load = React.useCallback(async () => {
    const metaRes = await fetchBudgetMeta();
    if (metaRes.ok) {
      setMeta(metaRes.data);
      setAlert(String(metaRes.data.thresholds.alert));
      setWarning(String(metaRes.data.thresholds.warning));
      setCritical(String(metaRes.data.thresholds.critical));
      const current =
        yearId ||
        metaRes.data.years.find((y) => y.is_current)?.id ||
        metaRes.data.years[0]?.id ||
        "";
      if (!yearId && current) setYearId(current);
      const listRes = await fetchBudgets(current || undefined);
      if (listRes.ok) {
        setRows(listRes.data.rows);
        setTotals(listRes.data.totals);
      } else setError(listRes.error);
    } else setError(metaRes.error);
    setLoading(false);
  }, [yearId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function applyPeriod(type: BudgetPeriodType) {
    setPeriodType(type);
    const year = meta?.years.find((y) => y.id === yearId);
    if (type === "annual" && year) {
      setPeriodStart(year.start_date);
      setPeriodEnd(year.end_date);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await createBudget({
        academic_year_id: yearId,
        budget_category_id: categoryId,
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        allocated_amount: Number(amount),
        description: description || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Budget created.");
      setOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Budgeting"
      breadcrumb={["Finance & Fees", "Budgeting"]}
      heading="Budgeting"
      subtitle="Allocate funds by category and watch spending against expenses already recorded in Finance."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          ["Allocated", totals.allocated],
          ["Spent", totals.spent],
          ["Remaining", totals.remaining],
          ["Utilization", totals.utilization],
        ].map(([label, val]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {label === "Utilization"
                ? `${val}%`
                : formatMoney(Number(val), currency)}
            </div>
          </div>
        ))}
      </div>

      <FilterBar
        filters={
          <FilterField label="Academic year">
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
        }
        actions={
          canManage ? (
            <PrimaryButton onClick={() => setOpen(true)}>
              New budget
            </PrimaryButton>
          ) : null
        }
      />

      <FinanceTable
        columns={[
          "Category",
          "Period",
          "Budget",
          "Spent",
          "Remaining",
          "Utilization",
        ]}
        loading={loading}
      >
        {rows.length === 0 ? (
          <EmptyRow colSpan={6} message="No budgets for this year yet." />
        ) : (
          rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium">{r.category_name}</td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {r.period_start} → {r.period_end}
              </td>
              <td className="px-4 py-3">
                {formatMoney(r.allocated_amount, currency)}
              </td>
              <td className="px-4 py-3">{formatMoney(r.spent, currency)}</td>
              <td className="px-4 py-3">
                {formatMoney(r.remaining, currency)}
              </td>
              <td className="px-4 py-3">
                <div className="mb-1 flex items-center gap-2">
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full ${barColor(r.alert)}`}
                      style={{ width: `${Math.min(100, r.utilization)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold">
                    {r.utilization}%
                  </span>
                </div>
                {r.alert !== "none" ? (
                  <StatusBadge
                    status={
                      r.alert === "critical"
                        ? "overdue"
                        : r.alert === "warning"
                          ? "pending"
                          : "partially_paid"
                    }
                    label={r.alert}
                  />
                ) : null}
                {r.latest_alert ? (
                  <div className="mt-1 text-xs text-amber-700">
                    {r.latest_alert}
                  </div>
                ) : null}
              </td>
            </tr>
          ))
        )}
      </FinanceTable>

      {canManage ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveBudgetThresholds({
              alert: Number(alert),
              warning: Number(warning),
              critical: Number(critical),
            }).then((res) => {
              if (res.ok) setSuccess("Alert thresholds saved.");
              else setError(res.error);
            });
          }}
        >
          <FormField label="Alert %">
            <input
              className={fieldClass}
              value={alert}
              onChange={(e) => setAlert(e.target.value)}
            />
          </FormField>
          <FormField label="Warning %">
            <input
              className={fieldClass}
              value={warning}
              onChange={(e) => setWarning(e.target.value)}
            />
          </FormField>
          <FormField label="Critical %">
            <input
              className={fieldClass}
              value={critical}
              onChange={(e) => setCritical(e.target.value)}
            />
          </FormField>
          <PrimaryButton type="submit">Save thresholds</PrimaryButton>
        </form>
      ) : null}

      <FormModal open={open} title="New budget" onClose={() => setOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-1">
          <FormField label="Category" required>
            <select
              className={selectClass}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {(meta?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          {canManage ? (
            <div className="mb-4 flex gap-2">
              <input
                className={fieldClass}
                placeholder="Add custom category"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
              />
              <SecondaryButton
                onClick={() => {
                  if (!newCat.trim()) return;
                  void createBudgetCategory(newCat.trim()).then(() => {
                    setNewCat("");
                    void load();
                  });
                }}
              >
                Add
              </SecondaryButton>
            </div>
          ) : null}
          <FormField label="Period type">
            <select
              className={selectClass}
              value={periodType}
              onChange={(e) => applyPeriod(e.target.value as BudgetPeriodType)}
            >
              <option value="annual">Annual</option>
              <option value="termly">Termly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>
          </FormField>
          <FormField label="Period start" required>
            <input
              type="date"
              className={fieldClass}
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Period end" required>
            <input
              type="date"
              className={fieldClass}
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Allocated amount" required>
            <input
              type="number"
              min={0}
              step="0.01"
              className={fieldClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Description">
            <textarea
              className={fieldClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? "Saving…" : "Create"}
            </PrimaryButton>
          </div>
        </form>
      </FormModal>
    </AppShell>
  );
}
