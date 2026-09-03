import React from "react";
import {
  Cancel01Icon,
  Tick02Icon,
  UnavailableIcon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StaffTable,
  fieldClass,
  selectClass,
} from "../../../components/staff/ui";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import {
  LEAVE_TYPE_LABELS,
  applyLeave,
  decideLeave,
  fetchLeaveBalances,
  fetchLeaveCalendar,
  fetchLeaveList,
  fetchStaffMeta,
  fetchStaffNotifications,
  fetchDirectory,
  markNotificationRead,
  type LeaveRequestStatus,
  type LeaveType,
  type StaffDto,
  type StaffMeta,
} from "../../../lib/staff-mgmt";

type TabKey = "requests" | "balances" | "calendar" | "apply";

type LeaveRequest = {
  id: string;
  staff_id: string;
  staff_name: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: LeaveRequestStatus;
  review_notes: string | null;
  created_at: string;
};

type LeaveBalance = {
  staff_id: string;
  full_name: string;
  leave_type: LeaveType;
  entitled: number | null;
  used: number;
  remaining: number | null;
};

type CalendarEvent = {
  id: string;
  staff_id: string;
  staff_name: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
};

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "requests", label: "Requests" },
  { key: "balances", label: "Balances" },
  { key: "calendar", label: "Calendar" },
  { key: "apply", label: "Apply" },
];

function monthRange(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = new Date(y, m, 1).toISOString().slice(0, 10);
  const to = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { from, to, label: d.toLocaleString(undefined, { month: "long", year: "numeric" }) };
}

export default function LeaveManagementPage() {
  const [tab, setTab] = React.useState<TabKey>("requests");
  const [meta, setMeta] = React.useState<StaffMeta | null>(null);
  const [teachers, setTeachers] = React.useState<StaffDto[]>([]);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [requests, setRequests] = React.useState<LeaveRequest[]>([]);
  const [requestStatus, setRequestStatus] = React.useState<
    LeaveRequestStatus | "all"
  >("all");
  const [balances, setBalances] = React.useState<LeaveBalance[]>([]);
  const [balanceYear, setBalanceYear] = React.useState(
    new Date().getFullYear(),
  );
  const [calendarEvents, setCalendarEvents] = React.useState<CalendarEvent[]>(
    [],
  );
  const [calMonth, setCalMonth] = React.useState(() => monthRange());

  const [leaveType, setLeaveType] = React.useState<LeaveType>("casual");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [applyStaffId, setApplyStaffId] = React.useState("");

  const canManage = meta?.can_manage ?? false;

  const loadNotifications = React.useCallback(async () => {
    const res = (await fetchStaffNotifications()) as Result<{
      notifications: Notification[];
    }>;
    if (res.ok) setNotifications(res.data.notifications);
  }, []);

  const loadRequests = React.useCallback(async () => {
    const res = (await fetchLeaveList({
      status: requestStatus,
    })) as Result<{ requests: LeaveRequest[] }>;
    if (res.ok) setRequests(res.data.requests);
    else setError(res.error);
  }, [requestStatus]);

  const loadBalances = React.useCallback(async () => {
    const res = (await fetchLeaveBalances({
      year: balanceYear,
    })) as Result<{ year: number; balances: LeaveBalance[] }>;
    if (res.ok) setBalances(res.data.balances);
    else setError(res.error);
  }, [balanceYear]);

  const loadCalendar = React.useCallback(async () => {
    const res = (await fetchLeaveCalendar(
      calMonth.from,
      calMonth.to,
    )) as Result<{ events: CalendarEvent[] }>;
    if (res.ok) setCalendarEvents(res.data.events);
    else setError(res.error);
  }, [calMonth.from, calMonth.to]);

  React.useEffect(() => {
    void (async () => {
      const [metaRes, dirRes] = await Promise.all([
        fetchStaffMeta(),
        fetchDirectory({ status: "active" }),
      ]);
      if (metaRes.ok) {
        setMeta(metaRes.data);
        if (metaRes.data.self_staff_id) {
          setApplyStaffId(metaRes.data.self_staff_id);
        }
      }
      if (dirRes.ok) setTeachers(dirRes.data.staff);
      await loadNotifications();
    })();
  }, [loadNotifications]);

  React.useEffect(() => {
    setError("");
    if (tab === "requests") void loadRequests();
    if (tab === "balances") void loadBalances();
    if (tab === "calendar") void loadCalendar();
  }, [tab, loadRequests, loadBalances, loadCalendar]);

  async function markAllRead() {
    await markNotificationRead({ all: true });
    await loadNotifications();
  }

  async function markOneRead(id: string) {
    await markNotificationRead({ id });
    await loadNotifications();
  }

  async function onDecide(
    id: string,
    decision: "approved" | "rejected" | "cancelled",
  ) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = (await decideLeave({ id, decision })) as Result<{
        id: string;
        status: string;
      }>;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Leave request ${decision}.`);
      await loadRequests();
      await loadNotifications();
    } finally {
      setBusy(false);
    }
  }

  async function onApply(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!startDate || !endDate) {
      setError("Start and end dates are required.");
      return;
    }
    setBusy(true);
    try {
      const res = (await applyLeave({
        staff_id: canManage ? applyStaffId || null : null,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || null,
      })) as Result<{ id: string }>;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Leave application submitted.");
      setStartDate("");
      setEndDate("");
      setReason("");
      setTab("requests");
      await loadRequests();
      await loadNotifications();
    } finally {
      setBusy(false);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(calMonth.from);
    d.setMonth(d.getMonth() + delta);
    setCalMonth(monthRange(d));
  }

  const unread = notifications.filter((n) => !n.read_at);

  return (
    <AppShell
      title="Leave Management"
      breadcrumb={["Staff Management", "Leave Management"]}
      heading="Leave Management"
      subtitle="Requests, balances, calendar, and applications."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      {notifications.length > 0 ? (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">
              Notifications
              {unread.length > 0 ? (
                <span className="ml-2 text-xs font-medium text-amber-700">
                  {unread.length} unread
                </span>
              ) : null}
            </h2>
            {unread.length > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="cursor-pointer text-xs font-semibold text-(--sofia-primary) hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="space-y-2">
            {notifications.slice(0, 5).map((n) => (
              <li
                key={n.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  n.read_at
                    ? "border-slate-100 bg-slate-50 text-slate-500"
                    : "border-amber-100 bg-amber-50 text-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{n.title}</p>
                    {n.body ? (
                      <p className="mt-0.5 text-slate-600">{n.body}</p>
                    ) : null}
                  </div>
                  {!n.read_at ? (
                    <button
                      type="button"
                      onClick={() => void markOneRead(n.id)}
                      className="shrink-0 cursor-pointer text-xs font-semibold text-(--sofia-primary) hover:underline"
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setError("");
              setSuccess("");
              setTab(t.key);
            }}
            className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === t.key
                ? "bg-(--sofia-primary) text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "requests" ? (
        <>
          <FilterBar
            filters={
              <FilterField label="Status">
                <select
                  className={selectClass}
                  value={requestStatus}
                  onChange={(e) =>
                    setRequestStatus(
                      e.target.value as LeaveRequestStatus | "all",
                    )
                  }
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </FilterField>
            }
          />

          <StaffTable
            columns={[
              "Staff",
              "Type",
              "Dates",
              "Days",
              "Status",
              "Reason",
              "",
            ]}
          >
            {requests.length === 0 ? (
              <EmptyRow colSpan={7}>No leave requests.</EmptyRow>
            ) : (
              requests.map((r) => {
                const isOwn =
                  meta?.self_staff_id != null &&
                  r.staff_id === meta.self_staff_id;
                return (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {r.staff_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {LEAVE_TYPE_LABELS[r.leave_type]}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {r.start_date} → {r.end_date}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.days}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="max-w-48 truncate px-4 py-3 text-slate-600">
                      {r.reason || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TableActionGroup>
                        {canManage && r.status === "pending" ? (
                          <>
                            <TableIconButton
                              icon={Tick02Icon}
                              label="Approve"
                              tone="primary"
                              disabled={busy}
                              onClick={() => void onDecide(r.id, "approved")}
                            />
                            <TableIconButton
                              icon={UnavailableIcon}
                              label="Reject"
                              tone="danger"
                              disabled={busy}
                              onClick={() => void onDecide(r.id, "rejected")}
                            />
                          </>
                        ) : null}
                        {isOwn && r.status === "pending" ? (
                          <TableIconButton
                            icon={Cancel01Icon}
                            label="Cancel"
                            disabled={busy}
                            onClick={() => void onDecide(r.id, "cancelled")}
                          />
                        ) : null}
                      </TableActionGroup>
                    </td>
                  </tr>
                );
              })
            )}
          </StaffTable>
        </>
      ) : null}

      {tab === "balances" ? (
        <>
          <FilterBar
            filters={
              <FilterField label="Year">
                <input
                  type="number"
                  className={selectClass}
                  value={balanceYear}
                  onChange={(e) =>
                    setBalanceYear(Number(e.target.value) || balanceYear)
                  }
                />
              </FilterField>
            }
          />
          <StaffTable
            columns={[
              "Staff",
              "Leave type",
              "Entitled",
              "Used",
              "Remaining",
            ]}
          >
            {balances.length === 0 ? (
              <EmptyRow colSpan={5}>No leave balances for this year.</EmptyRow>
            ) : (
              balances.map((b, i) => (
                <tr
                  key={`${b.staff_id}-${b.leave_type}-${i}`}
                  className="hover:bg-slate-50/80"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {b.full_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {LEAVE_TYPE_LABELS[b.leave_type]}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {b.entitled ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{b.used}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {b.remaining ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </StaffTable>
        </>
      ) : null}

      {tab === "calendar" ? (
        <>
          <FilterBar
            filters={
              <div className="flex items-end gap-2">
                <SecondaryButton onClick={() => shiftMonth(-1)}>
                  Previous
                </SecondaryButton>
                <p className="px-2 py-2.5 text-sm font-semibold text-slate-800">
                  {calMonth.label}
                </p>
                <SecondaryButton onClick={() => shiftMonth(1)}>
                  Next
                </SecondaryButton>
              </div>
            }
          />
          <StaffTable
            columns={["Staff", "Type", "Start", "End", "Days"]}
          >
            {calendarEvents.length === 0 ? (
              <EmptyRow colSpan={5}>
                No approved leave in {calMonth.label}.
              </EmptyRow>
            ) : (
              calendarEvents.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {e.staff_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {LEAVE_TYPE_LABELS[e.leave_type]}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {e.start_date}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {e.end_date}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{e.days}</td>
                </tr>
              ))
            )}
          </StaffTable>
        </>
      ) : null}

      {tab === "apply" ? (
        <form onSubmit={(e) => void onApply(e)} className="max-w-xl space-y-5">
          <FormSection
            title="Apply for leave"
            description="Submit a leave request for review."
          >
            {canManage ? (
              <label className="mb-4 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Staff member
                </span>
                <select
                  className={fieldClass}
                  value={applyStaffId}
                  onChange={(e) => setApplyStaffId(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Leave type <span className="text-red-500">*</span>
              </span>
              <select
                className={fieldClass}
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value as LeaveType)}
              >
                {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map((t) => (
                  <option key={t} value={t}>
                    {LEAVE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <FormField
              label="Start date"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <FormField
              label="End date"
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <FormField
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional notes"
              fullWidth
            />
          </FormSection>
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit application"}
          </PrimaryButton>
        </form>
      ) : null}
    </AppShell>
  );
}
