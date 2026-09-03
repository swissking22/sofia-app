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
  NOTICE_AUDIENCE_LABELS,
  NOTICE_PRIORITY_LABELS,
  createNotice,
  fetchCommunicationMeta,
  fetchNotices,
  type CommunicationMeta,
  type NoticeAudience,
  type NoticePriority,
  type NoticeRow,
} from "../../../lib/communication-mgmt";

export default function InternalNoticesPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<CommunicationMeta | null>(null);
  const [rows, setRows] = React.useState<NoticeRow[]>([]);
  const [createOpen, setCreateOpen] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [audience, setAudience] = React.useState<NoticeAudience>("all");
  const [priority, setPriority] = React.useState<NoticePriority>("normal");
  const [expiresAt, setExpiresAt] = React.useState("");

  const canManage = meta?.can_manage ?? false;

  const load = React.useCallback(async () => {
    const [metaRes, listRes] = await Promise.all([
      fetchCommunicationMeta(),
      fetchNotices(),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (listRes.ok) setRows(listRes.data.notices);
    else setError(listRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setTitle("");
    setBody("");
    setAudience("all");
    setPriority("normal");
    setExpiresAt("");
  }

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await createNotice({
        title,
        body,
        audience,
        priority,
        expires_at: expiresAt || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `Notice published to ${res.data.recipient_count} staff member(s).`,
      );
      setCreateOpen(false);
      resetForm();
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Internal Notices"
      breadcrumb={["Communication", "Internal Notices"]}
      heading="Internal Notices"
      subtitle="Broadcast notices to staff. Recipients also receive an in-app notification."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      {!meta?.channels.internal && !loading ? (
        <PageAlert tone="error">
          Internal channel is disabled. Enable it under Setup → Communication.
        </PageAlert>
      ) : null}

      <FilterBar
        filters={null}
        actions={
          canManage ? (
            <PrimaryButton type="button" onClick={() => setCreateOpen(true)}>
              Publish notice
            </PrimaryButton>
          ) : null
        }
      />

      <CommunicationTable
        columns={[
          "Title",
          "Audience",
          "Priority",
          "Recipients",
          "Published",
          "Expires",
        ]}
        loading={loading}
      >
        {!loading && rows.length === 0 ? (
          <EmptyRow colSpan={6} message="No notices published yet." />
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{row.title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                  {row.body}
                </div>
              </td>
              <td className="px-4 py-3">
                {NOTICE_AUDIENCE_LABELS[row.audience]}
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={row.priority === "high" ? "pending" : "draft"}
                  label={NOTICE_PRIORITY_LABELS[row.priority]}
                />
              </td>
              <td className="px-4 py-3">{row.recipient_count}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                {row.sent_at ? new Date(row.sent_at).toLocaleString() : "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                {row.expires_at
                  ? new Date(row.expires_at).toLocaleDateString()
                  : "—"}
              </td>
            </tr>
          ))
        )}
      </CommunicationTable>

      <FormModal
        open={createOpen}
        title="Publish internal notice"
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handlePublish} className="space-y-4">
          <FormSection title="Notice">
            <FormField label="Title" required>
              <input
                className={fieldClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </FormField>
            <FormField label="Body" required>
              <textarea
                className={`${fieldClass} min-h-35`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </FormField>
          </FormSection>

          <FormSection title="Delivery">
            <FormField label="Audience">
              <select
                className={selectClass}
                value={audience}
                onChange={(e) => setAudience(e.target.value as NoticeAudience)}
              >
                {(
                  Object.entries(NOTICE_AUDIENCE_LABELS) as Array<
                    [NoticeAudience, string]
                  >
                ).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Priority">
              <select
                className={selectClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value as NoticePriority)}
              >
                {(
                  Object.entries(NOTICE_PRIORITY_LABELS) as Array<
                    [NoticePriority, string]
                  >
                ).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Expires (optional)">
              <input
                type="date"
                className={fieldClass}
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </FormField>
          </FormSection>

          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setCreateOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>
              Publish
            </PrimaryButton>
          </div>
        </form>
      </FormModal>
    </AppShell>
  );
}
