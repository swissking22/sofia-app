import React from "react";
import { Delete02Icon, SentIcon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import {
  FormModal,
  ConfirmModal,
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
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import { formatDisplayDateTime } from "../../../lib/date-format";
import {
  AUDIENCE_LABELS,
  CHANNEL_LABELS,
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncements,
  fetchCommunicationMeta,
  sendAnnouncement,
  type AnnouncementAudience,
  type AnnouncementRow,
  type CommunicationChannel,
  type CommunicationMeta,
} from "../../../lib/communication-mgmt";

const CHANNELS: CommunicationChannel[] = ["sms", "email", "internal"];

function audienceLabel(row: AnnouncementRow): string {
  if (row.audience_type === "class") {
    return row.class_name ? `Class: ${row.class_name}` : "Class";
  }
  if (row.audience_type === "level") {
    return row.level_name ? `Level: ${row.level_name}` : "Level";
  }
  return AUDIENCE_LABELS.all;
}

export default function AnnouncementsPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<CommunicationMeta | null>(null);
  const [rows, setRows] = React.useState<AnnouncementRow[]>([]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [sendTarget, setSendTarget] = React.useState<AnnouncementRow | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] =
    React.useState<AnnouncementRow | null>(null);

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [audience, setAudience] = React.useState<AnnouncementAudience>("all");
  const [classId, setClassId] = React.useState("");
  const [levelId, setLevelId] = React.useState("");
  const [channels, setChannels] = React.useState<CommunicationChannel[]>([
    "internal",
  ]);

  const canManage = meta?.can_manage ?? false;

  const load = React.useCallback(async () => {
    const [metaRes, listRes] = await Promise.all([
      fetchCommunicationMeta(),
      fetchAnnouncements(),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    if (listRes.ok) setRows(listRes.data.announcements);
    else setError(listRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function toggleChannel(ch: CommunicationChannel) {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  }

  function resetForm() {
    setTitle("");
    setBody("");
    setAudience("all");
    setClassId("");
    setLevelId("");
    setChannels(["internal"]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await createAnnouncement({
        title,
        body,
        audience_type: audience,
        class_id: audience === "class" ? classId || null : null,
        academic_level_id: audience === "level" ? levelId || null : null,
        channels,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Announcement saved as draft.");
      setCreateOpen(false);
      resetForm();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmSend() {
    if (!sendTarget) return;
    setBusy(true);
    setError("");
    try {
      const res = await sendAnnouncement(sendTarget.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `Announcement sent — ${res.data.recipient_count} delivery item(s) queued or logged.`,
      );
      setSendTarget(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setError("");
    try {
      const res = await deleteAnnouncement(deleteTarget.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Draft deleted.");
      setDeleteTarget(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const columns = canManage
    ? ["Title", "Audience", "Channels", "Status", "Recipients", "Created", ""]
    : ["Title", "Audience", "Channels", "Status", "Recipients", "Created"];

  return (
    <AppShell
      title="Announcements"
      breadcrumb={["Communication", "Announcements"]}
      heading="Announcements"
      subtitle="Broadcast messages to parents by class, level, or whole school."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={null}
        actions={
          canManage ? (
            <PrimaryButton type="button" onClick={() => setCreateOpen(true)}>
              + New announcement
            </PrimaryButton>
          ) : null
        }
      />

      <CommunicationTable columns={columns} loading={loading}>
        {!loading && rows.length === 0 ? (
          <EmptyRow colSpan={columns.length} message="No announcements yet." />
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{row.title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                  {row.body}
                </div>
              </td>
              <td className="px-4 py-3">{audienceLabel(row)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {row.channels.map((ch) => (
                    <StatusBadge
                      key={ch}
                      status="draft"
                      label={CHANNEL_LABELS[ch]}
                    />
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={row.status === "sent" ? "completed" : "draft"}
                  label={row.status === "sent" ? "Sent" : "Draft"}
                />
              </td>
              <td className="px-4 py-3">{row.recipient_count || "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                {formatDisplayDateTime(row.created_at)}
              </td>
              {canManage ? (
                <td className="px-4 py-3 text-right">
                  {row.status === "draft" ? (
                    <div className="flex justify-end gap-2">
                      <TableActionGroup>
                        <TableIconButton
                          icon={SentIcon}
                          label="Send"
                          tone="primary"
                          onClick={() => setSendTarget(row)}
                        />
                        <TableIconButton
                          icon={Delete02Icon}
                          label="Delete"
                          tone="danger"
                          onClick={() => setDeleteTarget(row)}
                        />
                      </TableActionGroup>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">
                      {row.sent_at
                        ? formatDisplayDateTime(row.sent_at)
                        : ""}
                    </span>
                  )}
                </td>
              ) : null}
            </tr>
          ))
        )}
      </CommunicationTable>

      <FormModal
        open={createOpen}
        title="New announcement"
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <FormSection title="Message">
            <FormField label="Title" required>
              <input
                className={fieldClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. PTA meeting reminder"
              />
            </FormField>
            <FormField
              label="Body"
              required
              hint="Use {{parent_name}}, {{student_name}}, {{class_name}}, {{school_name}}."
            >
              <textarea
                className={`${fieldClass} min-h-30`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </FormField>
          </FormSection>

          <FormSection title="Audience">
            <FormField label="Send to">
              <select
                className={selectClass}
                value={audience}
                onChange={(e) =>
                  setAudience(e.target.value as AnnouncementAudience)
                }
              >
                {(
                  Object.entries(AUDIENCE_LABELS) as Array<
                    [AnnouncementAudience, string]
                  >
                ).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            {audience === "class" ? (
              <FormField label="Class" required>
                <select
                  className={selectClass}
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                >
                  <option value="">Select class</option>
                  {meta?.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
            {audience === "level" ? (
              <FormField label="Level" required>
                <select
                  className={selectClass}
                  value={levelId}
                  onChange={(e) => setLevelId(e.target.value)}
                >
                  <option value="">Select level</option>
                  {meta?.levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
          </FormSection>

          <FormSection title="Channels">
            <div className="flex flex-wrap gap-3">
              {CHANNELS.map((ch) => (
                <label key={ch} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={channels.includes(ch)}
                    onChange={() => toggleChannel(ch)}
                    disabled={
                      ch === "sms"
                        ? !meta?.channels.sms
                        : ch === "email"
                          ? !meta?.channels.email
                          : !meta?.channels.internal
                    }
                  />
                  {CHANNEL_LABELS[ch]}
                </label>
              ))}
            </div>
            {!meta?.channels.sms && !meta?.channels.email ? (
              <p className="mt-2 text-xs text-slate-500">
                Enable SMS or email under Setup → Communication to use those
                channels.
              </p>
            ) : null}
          </FormSection>

          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setCreateOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>
              Save draft
            </PrimaryButton>
          </div>
        </form>
      </FormModal>

      <ConfirmModal
        open={Boolean(sendTarget)}
        title="Send announcement?"
        description={
          sendTarget
            ? `Send "${sendTarget.title}" to ${audienceLabel(sendTarget)}? This cannot be undone.`
            : ""
        }
        confirmLabel="Send now"
        onConfirm={() => void confirmSend()}
        onCancel={() => setSendTarget(null)}
        busy={busy}
      />

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete draft?"
        description="This draft will be removed permanently."
        confirmLabel="Delete"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
        busy={busy}
      />
    </AppShell>
  );
}
