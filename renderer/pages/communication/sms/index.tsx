import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import {
  FormModal,
  CommunicationTable,
  EmptyRow,
  FilterBar,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  fieldClass,
  selectClass,
} from "../../../components/communication/ui";
import {
  CHANNEL_LABELS,
  DELIVERY_STATUS_LABELS,
  fetchCommunicationMeta,
  fetchSmsDeliveries,
  sendSms,
  type CommunicationMeta,
  type DeliveryRow,
} from "../../../lib/communication-mgmt";

function deliveryStatusKey(status: DeliveryRow["status"]): string {
  if (status === "sent") return "completed";
  if (status === "queued") return "pending";
  if (status === "failed") return "rejected";
  return "draft";
}

export default function SmsNotificationsPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<CommunicationMeta | null>(null);
  const [rows, setRows] = React.useState<DeliveryRow[]>([]);
  const [composeOpen, setComposeOpen] = React.useState(false);

  const [studentId, setStudentId] = React.useState("");
  const [recipientPhone, setRecipientPhone] = React.useState("");
  const [recipientName, setRecipientName] = React.useState("");
  const [body, setBody] = React.useState("");

  const canManage = meta?.can_manage ?? false;
  const smsEnabled = meta?.channels.sms ?? false;

  const load = React.useCallback(async () => {
    const [metaRes, listRes] = await Promise.all([
      fetchCommunicationMeta(),
      fetchSmsDeliveries(),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (listRes.ok) setRows(listRes.data.deliveries);
    else setError(listRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function onStudentChange(id: string) {
    setStudentId(id);
    const student = meta?.students.find((s) => s.id === id);
    if (student) {
      setRecipientPhone(student.guardian_phone ?? "");
      setRecipientName(student.guardian_name ?? student.name);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await sendSms({
        student_id: studentId || null,
        recipient_phone: recipientPhone,
        recipient_name: recipientName || null,
        body,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("SMS queued for delivery when the device is online.");
      setComposeOpen(false);
      setStudentId("");
      setRecipientPhone("");
      setRecipientName("");
      setBody("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="SMS Notifications"
      breadcrumb={["Communication", "SMS Notifications"]}
      heading="SMS & email outbox"
      subtitle="Outbound messages are queued locally and sync when online. Failed rows show missing contact details."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      {!smsEnabled && !loading ? (
        <PageAlert tone="error">
          SMS is disabled. Enable it under Setup → Communication to send text
          messages.
        </PageAlert>
      ) : null}

      <FilterBar
        filters={null}
        actions={
          <>
            {canManage && smsEnabled ? (
              <PrimaryButton type="button" onClick={() => setComposeOpen(true)}>
                Compose SMS
              </PrimaryButton>
            ) : null}
            {meta?.sms_sender_name ? (
              <span className="text-sm text-slate-500">
                Sender: {meta.sms_sender_name}
              </span>
            ) : null}
          </>
        }
      />

      <CommunicationTable
        columns={[
          "When",
          "Channel",
          "Recipient",
          "Student",
          "Message",
          "Status",
        ]}
        loading={loading}
      >
        {!loading && rows.length === 0 ? (
          <EmptyRow colSpan={6} message="No outbound messages yet." />
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                {new Date(row.created_at).toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status="draft"
                  label={CHANNEL_LABELS[row.channel]}
                />
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">
                  {row.recipient_name || "—"}
                </div>
                <div className="text-xs text-slate-500">
                  {row.recipient_contact || "—"}
                </div>
              </td>
              <td className="px-4 py-3">
                {row.student_name ? (
                  <>
                    <div>{row.student_name}</div>
                    {row.class_name ? (
                      <div className="text-xs text-slate-500">
                        {row.class_name}
                      </div>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="max-w-xs px-4 py-3">
                <div className="line-clamp-2 text-sm">{row.body}</div>
                {row.error_message ? (
                  <div className="mt-1 text-xs text-red-600">
                    {row.error_message}
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={deliveryStatusKey(row.status)}
                  label={DELIVERY_STATUS_LABELS[row.status]}
                />
              </td>
            </tr>
          ))
        )}
      </CommunicationTable>

      <FormModal
        open={composeOpen}
        title="Compose SMS"
        onClose={() => setComposeOpen(false)}
      >
        <form onSubmit={handleSend} className="space-y-4">
          <FormSection title="Recipient">
            <FormField label="Link to student (optional)">
              <select
                className={selectClass}
                value={studentId}
                onChange={(e) => onStudentChange(e.target.value)}
              >
                <option value="">Manual entry</option>
                {meta?.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.guardian_phone ? ` — ${s.guardian_phone}` : ""}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Phone" required>
              <input
                className={fieldClass}
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+237…"
              />
            </FormField>
            <FormField label="Recipient name">
              <input
                className={fieldClass}
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
              />
            </FormField>
          </FormSection>
          <FormField label="Message" required>
            <textarea
              className={`${fieldClass} min-h-25`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={480}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setComposeOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>
              Queue SMS
            </PrimaryButton>
          </div>
        </form>
      </FormModal>
    </AppShell>
  );
}
