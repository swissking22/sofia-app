import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import {
  FormModal,
  CommunicationTable,
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  fieldClass,
  selectClass,
  useDebouncedValue,
} from "../../../components/communication/ui";
import {
  CHANNEL_LABELS,
  fetchCommunicationMeta,
  fetchThread,
  fetchThreads,
  sendParentMessage,
  type CommunicationChannel,
  type CommunicationMeta,
  type ThreadMessage,
  type ThreadRow,
} from "../../../lib/communication-mgmt";
import { formatDisplayDateTime } from "../../../lib/date-format";

export default function ParentMessagesPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<CommunicationMeta | null>(null);
  const [threads, setThreads] = React.useState<ThreadRow[]>([]);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ThreadMessage[]>([]);
  const [activeThread, setActiveThread] = React.useState<ThreadRow | null>(
    null,
  );
  const [composeOpen, setComposeOpen] = React.useState(false);

  const [newStudentId, setNewStudentId] = React.useState("");
  const [newChannel, setNewChannel] =
    React.useState<CommunicationChannel>("internal");
  const [replyBody, setReplyBody] = React.useState("");
  const [newBody, setNewBody] = React.useState("");

  const canManage = meta?.can_manage ?? false;

  const loadThreads = React.useCallback(async () => {
    const [metaRes, listRes] = await Promise.all([
      fetchCommunicationMeta(),
      fetchThreads(debouncedSearch || undefined),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (listRes.ok) setThreads(listRes.data.threads);
    else setError(listRes.error);
    setLoading(false);
  }, [debouncedSearch]);

  React.useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const loadThread = React.useCallback(async (threadId: string) => {
    const res = await fetchThread(threadId);
    if (res.ok) {
      setActiveThread(res.data.thread);
      setMessages(res.data.messages);
      setActiveId(threadId);
    } else setError(res.error);
  }, []);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!activeThread) return;
    setBusy(true);
    setError("");
    try {
      const res = await sendParentMessage({
        student_id: activeThread.student_id,
        channel: newChannel,
        body: replyBody,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setReplyBody("");
      setSuccess("Message sent.");
      await loadThread(activeThread.id);
      await loadThreads();
    } finally {
      setBusy(false);
    }
  }

  async function handleNewMessage(e: React.FormEvent) {
    e.preventDefault();
    const studentId = newStudentId;
    setBusy(true);
    setError("");
    try {
      const res = await sendParentMessage({
        student_id: studentId,
        channel: newChannel,
        body: newBody,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setComposeOpen(false);
      setNewStudentId("");
      setNewBody("");
      setSuccess("Message sent.");
      const refreshed = await fetchThreads(debouncedSearch || undefined);
      if (refreshed.ok) {
        setThreads(refreshed.data.threads);
        const thread = refreshed.data.threads.find(
          (t) => t.student_id === studentId,
        );
        if (thread) await loadThread(thread.id);
      }
    } finally {
      setBusy(false);
    }
  }

  const channelOptions: CommunicationChannel[] = ["internal"];
  if (meta?.channels.sms) channelOptions.push("sms");
  if (meta?.channels.email) channelOptions.push("email");

  return (
    <AppShell
      title="Parent Messages"
      breadcrumb={["Communication", "Parent Messages"]}
      heading="Parent Messages"
      subtitle="School-to-parent conversations. Internal messages appear instantly; SMS and email are queued for sync."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={
          <FilterField label="Search">
            <input
              className={fieldClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Student or guardian…"
            />
          </FilterField>
        }
        actions={
          canManage ? (
            <PrimaryButton type="button" onClick={() => setComposeOpen(true)}>
              New message
            </PrimaryButton>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <CommunicationTable
          columns={["Student", "Guardian", "Last activity"]}
          loading={loading}
        >
          {!loading && threads.length === 0 ? (
            <EmptyRow colSpan={3} message="No conversations yet." />
          ) : (
            threads.map((t) => (
              <tr
                key={t.id}
                className={`cursor-pointer border-t border-slate-100 ${
                  activeId === t.id ? "bg-emerald-50/60" : ""
                }`}
                onClick={() => void loadThread(t.id)}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">
                    {t.student_name}
                  </div>
                  {t.class_name ? (
                    <div className="text-xs text-slate-500">{t.class_name}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div>{t.guardian_name || "—"}</div>
                  <div className="text-xs text-slate-500">
                    {t.guardian_phone || t.guardian_email || ""}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {formatDisplayDateTime(t.last_message_at)}
                  {t.last_message_preview ? (
                    <div className="mt-1 line-clamp-1 text-xs text-slate-500">
                      {t.last_message_preview}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </CommunicationTable>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {!activeThread ? (
            <p className="text-sm text-slate-500">
              Select a conversation or start a new message.
            </p>
          ) : (
            <>
              <div className="mb-4 border-b border-slate-100 pb-3">
                <h3 className="font-semibold text-slate-900">
                  {activeThread.student_name}
                </h3>
                <p className="text-sm text-slate-500">
                  {activeThread.guardian_name} ·{" "}
                  {activeThread.guardian_phone ||
                    activeThread.guardian_email ||
                    "No contact"}
                </p>
              </div>

              <div className="mb-4 max-h-90 space-y-3 overflow-y-auto">
                {messages.length === 0 ? (
                  <p className="text-sm text-slate-500">No messages yet.</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        m.direction === "outbound"
                          ? "ml-8 bg-emerald-50 text-slate-800"
                          : "mr-8 bg-slate-100 text-slate-800"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                        <StatusBadge
                          status="draft"
                          label={CHANNEL_LABELS[m.channel]}
                        />
                        {formatDisplayDateTime(m.created_at)}
                      </div>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))
                )}
              </div>

              {canManage ? (
                <form
                  onSubmit={handleReply}
                  className="space-y-3 border-t border-slate-100 pt-3"
                >
                  <FormField label="Channel">
                    <select
                      className={selectClass}
                      value={newChannel}
                      onChange={(e) =>
                        setNewChannel(e.target.value as CommunicationChannel)
                      }
                    >
                      {channelOptions.map((ch) => (
                        <option key={ch} value={ch}>
                          {CHANNEL_LABELS[ch]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Reply">
                    <textarea
                      className={`${fieldClass} min-h-20`}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                    />
                  </FormField>
                  <PrimaryButton
                    type="submit"
                    disabled={busy || !replyBody.trim()}
                  >
                    Send
                  </PrimaryButton>
                </form>
              ) : null}
            </>
          )}
        </div>
      </div>

      <FormModal
        open={composeOpen}
        title="New parent message"
        onClose={() => setComposeOpen(false)}
      >
        <form onSubmit={handleNewMessage} className="space-y-4">
          <FormSection title="Recipient">
            <FormField label="Student" required>
              <select
                className={selectClass}
                value={newStudentId}
                onChange={(e) => setNewStudentId(e.target.value)}
                required
              >
                <option value="">Select student</option>
                {meta?.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Channel">
              <select
                className={selectClass}
                value={newChannel}
                onChange={(e) =>
                  setNewChannel(e.target.value as CommunicationChannel)
                }
              >
                {channelOptions.map((ch) => (
                  <option key={ch} value={ch}>
                    {CHANNEL_LABELS[ch]}
                  </option>
                ))}
              </select>
            </FormField>
          </FormSection>
          <FormField label="Message" required>
            <textarea
              className={`${fieldClass} min-h-30`}
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setComposeOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>
              Send
            </PrimaryButton>
          </div>
        </form>
      </FormModal>
    </AppShell>
  );
}
