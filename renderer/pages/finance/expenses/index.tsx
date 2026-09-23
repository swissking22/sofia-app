import React from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField } from "../../../components/setup";
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
  fieldClass,
  selectClass,
} from "../../../components/finance/ui";
import { Icon } from "../../../components/ui/Icon";
import { formatDisplayDate } from "../../../lib/date-format";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  createExpense,
  fetchExpenses,
  fetchFinanceMeta,
  formatMoney,
  type ExpenseCategory,
  type ExpenseDto,
  type FinanceMeta,
  type PaymentMethod,
} from "../../../lib/finance-mgmt";

export default function ExpensesPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<FinanceMeta | null>(null);
  const [rows, setRows] = React.useState<ExpenseDto[]>([]);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const [category, setCategory] = React.useState<ExpenseCategory>("miscellaneous");
  const [amount, setAmount] = React.useState("");
  const [expenseDate, setExpenseDate] = React.useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [vendor, setVendor] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [method, setMethod] = React.useState("");
  const [recurring, setRecurring] = React.useState(false);
  const [recurringInterval, setRecurringInterval] = React.useState("monthly");
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
      ["Expense #", "Date", "Category", "Amount", "Vendor", "Method", "Recurring", "Description"].join(","),
      ...target.map((r) =>
        [
          `"${r.expense_number}"`,
          `"${formatDisplayDate(r.expense_date, "")}"`,
          `"${EXPENSE_CATEGORY_LABELS[r.category] ?? r.category}"`,
          r.amount,
          `"${r.vendor || ""}"`,
          `"${r.payment_method ? (PAYMENT_METHOD_LABELS[r.payment_method as PaymentMethod] ?? r.payment_method) : ""}"`,
          `"${r.is_recurring ? (r.recurring_interval || "Yes") : "No"}"`,
          `"${r.description || ""}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "";

  const load = React.useCallback(async () => {
    const [metaRes, listRes] = await Promise.all([
      fetchFinanceMeta(),
      fetchExpenses({ from: from || null, to: to || null }),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (listRes.ok) setRows(listRes.data);
    else setError(listRes.error);
    setLoading(false);
  }, [from, to]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setCategory("miscellaneous");
    setAmount("");
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setVendor("");
    setDescription("");
    setMethod("");
    setRecurring(false);
    setRecurringInterval("monthly");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!amount || Number(amount) <= 0 || !expenseDate) {
      setError("Amount and date are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await createExpense({
        category,
        amount: Number(amount),
        expense_date: expenseDate,
        vendor: vendor.trim() || null,
        description: description.trim() || null,
        payment_method: method || null,
        is_recurring: recurring,
        recurring_interval: recurring ? recurringInterval : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Expense ${res.data.expense_number} recorded.`);
      setOpen(false);
      resetForm();
      await load();
    } finally {
      setBusy(false);
    }
  }

  const methodOptions = (meta?.payment_methods ??
    Object.keys(PAYMENT_METHOD_LABELS)) as PaymentMethod[];

  return (
    <AppShell
      title="Expenses"
      breadcrumb={["Finance & Fees", "Expenses"]}
      heading="Expenses"
      subtitle="Track school operating expenses (not staff payroll)."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

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
          canManage ? (
            <PrimaryButton
              onClick={() => {
                resetForm();
                setOpen(true);
              }}
            >
              <Icon icon={Add01Icon} size={16} />
              Add expense
            </PrimaryButton>
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
          "Expense #",
          "Date",
          "Category",
          "Amount",
          "Vendor",
          "Method",
          "Recurring",
          "Description",
        ]}
        loading={loading}
      >
        {rows.length === 0 ? (
          <EmptyRow colSpan={9} message="No expenses recorded." />
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
                {r.expense_number}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {formatDisplayDate(r.expense_date)}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {EXPENSE_CATEGORY_LABELS[r.category] ?? r.category}
              </td>
              <td className="px-4 py-3 font-medium">
                {formatMoney(r.amount, currency)}
              </td>
              <td className="px-4 py-3 text-slate-600">{r.vendor || "—"}</td>
              <td className="px-4 py-3 text-slate-600">
                {r.payment_method
                  ? PAYMENT_METHOD_LABELS[
                      r.payment_method as PaymentMethod
                    ] ?? r.payment_method
                  : "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {r.is_recurring
                  ? r.recurring_interval || "Yes"
                  : "—"}
              </td>
              <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                {r.description || "—"}
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
        title="Add expense"
        subtitle="Record an operating cost. Salaries here is a category label only."
        onClose={() => setOpen(false)}
        footer={
          <div className="flex gap-2">
            <SecondaryButton onClick={() => setOpen(false)} className="flex-1">
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form="expense-form"
              disabled={busy}
              className="flex-1"
            >
              {busy ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        }
      >
        <form id="expense-form" onSubmit={handleCreate} className="space-y-3">
          <FormField label="Category" required>
            <select
              className={selectClass}
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as ExpenseCategory)
              }
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
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
          <FormField label="Date" required>
            <input
              type="date"
              className={fieldClass}
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Vendor">
            <input
              className={fieldClass}
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
          </FormField>
          <FormField label="Description">
            <textarea
              className={fieldClass}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
          <FormField label="Payment method">
            <select
              className={selectClass}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="">—</option>
              {methodOptions.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m] ?? m}
                </option>
              ))}
            </select>
          </FormField>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
            />
            Recurring
          </label>
          {recurring ? (
            <FormField label="Interval">
              <select
                className={selectClass}
                value={recurringInterval}
                onChange={(e) => setRecurringInterval(e.target.value)}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="termly">Termly</option>
                <option value="yearly">Yearly</option>
              </select>
            </FormField>
          ) : null}
        </form>
      </FormModal>
    </AppShell>
  );
}
