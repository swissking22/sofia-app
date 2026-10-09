import React from "react";
import Link from "next/link";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  FinanceTable,
  FormModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  fieldClass,
  selectClass,
} from "../../../components/finance/ui";
import { formatDisplayDate } from "../../../lib/date-format";
import {
  fetchFinanceMeta,
  formatMoney,
  PAYMENT_METHOD_LABELS,
  type FinanceMeta,
  type PaymentMethod,
} from "../../../lib/finance-mgmt";
import {
  fetchPayslips,
  generatePayslips,
  markPayslipPaid,
  PAYSLIP_STATUS_LABELS,
  periodLabel,
  type PayslipDto,
  type PayslipStatus,
} from "../../../lib/finance-payroll";

export default function PayslipsPage() {
  const now = new Date();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<FinanceMeta | null>(null);
  const [rows, setRows] = React.useState<PayslipDto[]>([]);
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [status, setStatus] = React.useState<PayslipStatus | "all">("all");
  const [payTarget, setPayTarget] = React.useState<PayslipDto | null>(null);
  const [payMethod, setPayMethod] = React.useState("cash");
  const [paidAt, setPaidAt] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "";

  const load = React.useCallback(async () => {
    const [metaRes, listRes] = await Promise.all([
      fetchFinanceMeta(),
      fetchPayslips({ year, month, status }),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (listRes.ok) setRows(listRes.data);
    else setError(listRes.error);
    setLoading(false);
  }, [year, month, status]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleGenerate() {
    if (!canManage || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await generatePayslips({ year, month });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `Generated ${res.data.created.length} payslip(s) for ${periodLabel(year, month)}. Skipped ${res.data.skipped}.`,
      );
      await load();
    } catch {
      setError("Could not generate payslips.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkPaid() {
    if (!payTarget || !canManage || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await markPayslipPaid({
        id: payTarget.id,
        payment_method: payMethod,
        paid_at: paidAt,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `Paid ${res.data.payslip.payslip_number}. Expense ${res.data.payslip.expense_number || res.data.expense_id} posted under Salaries (budget-traced).`,
      );
      setPayTarget(null);
      await load();
    } catch {
      setError("Could not mark payslip paid.");
    } finally {
      setBusy(false);
    }
  }

  const methods = (meta?.payment_methods ?? ["cash"]) as PaymentMethod[];

  return (
    <AppShell
      title="Payslips"
      breadcrumb={["Finance & Fees", "Payslips"]}
      heading="Payslips"
      subtitle="Set staff salaries, generate monthly payslips, and mark them paid. Paid slips post a Salaries expense so budgets stay accurate."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={
          <>
            <FilterField label="Year">
              <input
                className={selectClass}
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || year)}
              />
            </FilterField>
            <FilterField label="Month">
              <select
                className={selectClass}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Status">
              <select
                className={selectClass}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as PayslipStatus | "all")
                }
              >
                <option value="all">All</option>
                {(Object.keys(PAYSLIP_STATUS_LABELS) as PayslipStatus[]).map(
                  (s) => (
                    <option key={s} value={s}>
                      {PAYSLIP_STATUS_LABELS[s]}
                    </option>
                  ),
                )}
              </select>
            </FilterField>
          </>
        }
        actions={
          <>
            <Link
              href="/staff/directory"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Set staff salaries
            </Link>
            {canManage ? (
              <PrimaryButton
                disabled={busy}
                onClick={() => void handleGenerate()}
              >
                {busy ? "Working…" : `Generate ${periodLabel(year, month)}`}
              </PrimaryButton>
            ) : null}
          </>
        }
      />

      <p className="mb-3 text-sm text-slate-500">
        Generation uses each active staff member&apos;s current monthly salary.
        Marking paid creates an expense in category <strong>Salaries</strong>,
        which counts against any active Salaries budget for that date.
      </p>

      <FinanceTable
        loading={loading}
        columns={[
          "Payslip #",
          "Staff",
          "Period",
          "Gross",
          "Net",
          "Status",
          "Expense",
          "Actions",
        ]}
      >
        {rows.length === 0 ? (
          <EmptyRow colSpan={8}>
            No payslips for {periodLabel(year, month)}. Set salaries on staff,
            then Generate.
          </EmptyRow>
        ) : (
          rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-800">
                {r.payslip_number}
              </td>
              <td className="px-3 py-2 text-slate-700">
                {r.staff_name}
                {r.employee_code ? (
                  <span className="ml-1 text-xs text-slate-400">
                    ({r.employee_code})
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-slate-600">
                {periodLabel(r.period_year, r.period_month)}
              </td>
              <td className="px-3 py-2 tabular-nums text-slate-700">
                {formatMoney(r.gross_amount, currency)}
              </td>
              <td className="px-3 py-2 tabular-nums font-semibold text-slate-800">
                {formatMoney(r.net_amount, currency)}
              </td>
              <td className="px-3 py-2 text-slate-700">
                {PAYSLIP_STATUS_LABELS[r.status]}
                {r.paid_at ? (
                  <div className="text-xs text-slate-400">
                    {formatDisplayDate(r.paid_at, "")}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2 text-slate-600">
                {r.expense_number ? (
                  <Link
                    href="/finance/expenses"
                    className="font-medium text-(--sofia-primary) hover:underline"
                  >
                    {r.expense_number}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2">
                {canManage && r.status === "issued" ? (
                  <SecondaryButton
                    disabled={busy}
                    onClick={() => {
                      setPayTarget(r);
                      setPayMethod(methods[0] || "cash");
                      setPaidAt(new Date().toISOString().slice(0, 10));
                    }}
                  >
                    Mark paid
                  </SecondaryButton>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))
        )}
      </FinanceTable>

      <FormModal
        open={Boolean(payTarget)}
        title={payTarget ? `Pay ${payTarget.payslip_number}` : "Mark paid"}
        onClose={() => setPayTarget(null)}
        footer={
          <>
            <SecondaryButton onClick={() => setPayTarget(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton disabled={busy} onClick={() => void handleMarkPaid()}>
              Confirm payment
            </PrimaryButton>
          </>
        }
      >
        {payTarget ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Pay{" "}
              <strong>
                {formatMoney(payTarget.net_amount, currency)}
              </strong>{" "}
              to <strong>{payTarget.staff_name}</strong>. This posts a Salaries
              expense and updates budgeting.
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                Payment date
              </span>
              <input
                type="date"
                className={fieldClass}
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                Method
              </span>
              <select
                className={selectClass}
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m] ?? m}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </FormModal>
    </AppShell>
  );
}
