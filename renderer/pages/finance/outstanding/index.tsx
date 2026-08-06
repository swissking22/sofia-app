import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField } from "../../../components/setup";
import {
  ActionDrawer,
  EmptyRow,
  FilterBar,
  FilterField,
  FinanceTable,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  fieldClass,
  selectClass,
} from "../../../components/finance/ui";
import {
  fetchFinanceMeta,
  fetchOutstanding,
  formatMoney,
  sendReminders,
  type FinanceMeta,
  type OutstandingClassRow,
  type OutstandingStudentRow,
} from "../../../lib/finance-mgmt";

export default function OutstandingPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<FinanceMeta | null>(null);
  const [groupBy, setGroupBy] = React.useState<"student" | "class">("student");
  const [classId, setClassId] = React.useState("");
  const [studentRows, setStudentRows] = React.useState<OutstandingStudentRow[]>(
    []
  );
  const [classRows, setClassRows] = React.useState<OutstandingClassRow[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [remindOpen, setRemindOpen] = React.useState(false);
  const [message, setMessage] = React.useState(
    "Fee reminder: please settle outstanding school fees."
  );

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "";

  const load = React.useCallback(async () => {
    const [metaRes, outRes] = await Promise.all([
      fetchFinanceMeta(),
      fetchOutstanding({
        classId: classId || null,
        groupBy,
      }),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (outRes.ok) {
      if (outRes.data.mode === "student") {
        setStudentRows(outRes.data.rows);
        setClassRows([]);
      } else {
        setClassRows(outRes.data.rows);
        setStudentRows([]);
      }
    } else setError(outRes.error);
    setSelected(new Set());
    setLoading(false);
  }, [groupBy, classId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function toggleAll(ids: string[]) {
    setSelected((prev) => {
      if (ids.every((id) => prev.has(id))) return new Set();
      return new Set(ids);
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRemind(e: React.FormEvent) {
    e.preventDefault();
    if (!selected.size) {
      setError("Select at least one student.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await sendReminders({
        student_ids: Array.from(selected),
        message: message.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`${res.data.sent} reminder(s) logged.`);
      setRemindOpen(false);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  const studentIds = studentRows.map((r) => r.student_id);

  return (
    <AppShell
      title="Outstanding Fees"
      breadcrumb={["Finance & Fees", "Outstanding Fees"]}
      heading="Outstanding Fees"
      subtitle="Aging balances by student or class. Send in-app fee reminders."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={
          <>
            <FilterField label="Group by">
              <select
                className={selectClass}
                value={groupBy}
                onChange={(e) =>
                  setGroupBy(e.target.value as "student" | "class")
                }
              >
                <option value="student">Student</option>
                <option value="class">Class</option>
              </select>
            </FilterField>
            <FilterField label="Class">
              <select
                className={selectClass}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">All classes</option>
                {(meta?.classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FilterField>
          </>
        }
        actions={
          canManage && groupBy === "student" ? (
            <PrimaryButton
              disabled={!selected.size}
              onClick={() => setRemindOpen(true)}
            >
              Send reminders ({selected.size})
            </PrimaryButton>
          ) : null
        }
      />

      {groupBy === "student" ? (
        <FinanceTable
          columns={[
            "",
            "Student",
            "Class",
            "Outstanding",
            "Current",
            "1–30 days",
            "60+ days",
            "Invoices",
          ]}
          loading={loading}
        >
          {studentRows.length === 0 ? (
            <EmptyRow colSpan={8} message="No outstanding balances." />
          ) : (
            <>
              <tr className="border-t border-slate-100 bg-slate-50/80">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={
                      studentIds.length > 0 &&
                      studentIds.every((id) => selected.has(id))
                    }
                    onChange={() => toggleAll(studentIds)}
                    aria-label="Select all"
                  />
                </td>
                <td colSpan={7} className="px-4 py-2 text-xs text-slate-500">
                  Select all on this list
                </td>
              </tr>
              {studentRows.map((r) => (
                <tr key={r.student_id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.student_id)}
                      onChange={() => toggleOne(r.student_id)}
                      aria-label={`Select ${r.student_name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {r.student_name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {r.student_code || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.class_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {formatMoney(r.outstanding, currency)}
                  </td>
                  <td className="px-4 py-3">
                    {formatMoney(r.aging_current, currency)}
                  </td>
                  <td className="px-4 py-3">
                    {formatMoney(r.aging_30, currency)}
                  </td>
                  <td className="px-4 py-3">
                    {formatMoney(r.aging_60, currency)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.invoice_ids.length}
                  </td>
                </tr>
              ))}
            </>
          )}
        </FinanceTable>
      ) : (
        <FinanceTable
          columns={[
            "Class",
            "Students",
            "Outstanding",
            "Current",
            "1–30 days",
            "60+ days",
          ]}
          loading={loading}
        >
          {classRows.length === 0 ? (
            <EmptyRow colSpan={6} message="No outstanding balances." />
          ) : (
            classRows.map((r) => (
              <tr
                key={r.class_id ?? "none"}
                className="border-t border-slate-100"
              >
                <td className="px-4 py-3 font-medium text-slate-900">
                  {r.class_name ?? "Unassigned"}
                </td>
                <td className="px-4 py-3 text-slate-600">{r.students}</td>
                <td className="px-4 py-3 font-semibold">
                  {formatMoney(r.outstanding, currency)}
                </td>
                <td className="px-4 py-3">
                  {formatMoney(r.aging_current, currency)}
                </td>
                <td className="px-4 py-3">
                  {formatMoney(r.aging_30, currency)}
                </td>
                <td className="px-4 py-3">
                  {formatMoney(r.aging_60, currency)}
                </td>
              </tr>
            ))
          )}
        </FinanceTable>
      )}

      <ActionDrawer
        open={remindOpen}
        title="Send reminders"
        subtitle={`${selected.size} student(s) — logged in-app only.`}
        onClose={() => setRemindOpen(false)}
        footer={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => setRemindOpen(false)}
              className="flex-1"
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form="remind-form"
              disabled={busy}
              className="flex-1"
            >
              {busy ? "Sending…" : "Send"}
            </PrimaryButton>
          </div>
        }
      >
        <form id="remind-form" onSubmit={handleRemind} className="space-y-3">
          <FormField label="Message">
            <textarea
              className={fieldClass}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </FormField>
        </form>
      </ActionDrawer>
    </AppShell>
  );
}
