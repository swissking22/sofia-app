import React from "react";
import { useRouter } from "next/router";
import {
  FormField,
  FormSection,
  FormSelect,
  SetupFooter,
} from "../../components/setup";
import {
  SetupShell,
  useSetupProgress,
} from "../../components/setup/SetupShell";
import {
  CHANNEL_OPTIONS,
  fetchCommunicationSetup,
  saveCommunicationSetup,
  SMS_PROVIDER_OPTIONS,
  type CommunicationSetup,
  type NotificationTemplateDto,
  type NotificationTemplateKey,
} from "../../lib/communication";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
} from "../../lib/setup";

const textareaClass =
  "w-full min-h-[88px] resize-y rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function CommunicationSetupPage() {
  return (
    <SetupShell stepId="communication" aside={<CommunicationAside />}>
      <CommunicationSetupForm />
    </SetupShell>
  );
}

function CommunicationAside() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Used for</h3>
      <p className="mt-1 text-xs text-slate-500">
        Notification settings control how parents and staff are reached for
        fees, admissions, results, and announcements.
      </p>
      <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Fee reminders
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Admission messages
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Results & announcements
        </li>
      </ul>
      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
        Use placeholders like {"{{student_name}}"} and {"{{school_name}}"} in
        templates. Sending happens later when you trigger notifications.
      </p>
    </div>
  );
}

type TemplateDraft = NotificationTemplateDto;

function CommunicationSetupForm() {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [draftSaving, setDraftSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [smsProvider, setSmsProvider] = React.useState("");
  const [smsApiKey, setSmsApiKey] = React.useState("");
  const [smsSenderName, setSmsSenderName] = React.useState("");
  const [channelSms, setChannelSms] = React.useState(false);
  const [channelEmail, setChannelEmail] = React.useState(true);
  const [channelInternal, setChannelInternal] = React.useState(true);
  const [templates, setTemplates] = React.useState<TemplateDraft[]>([]);
  const [activeKey, setActiveKey] =
    React.useState<NotificationTemplateKey>("fee_reminder");

  const applyData = React.useCallback((data: CommunicationSetup) => {
    setSmsProvider(data.sms_provider);
    setSmsApiKey(data.sms_api_key);
    setSmsSenderName(data.sms_sender_name);
    setChannelSms(data.channel_sms);
    setChannelEmail(data.channel_email);
    setChannelInternal(data.channel_internal);
    setTemplates(data.templates);
    setActiveKey((prev) =>
      data.templates.some((t) => t.template_key === prev)
        ? prev
        : (data.templates[0]?.template_key ?? "fee_reminder"),
    );
  }, []);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchCommunicationSetup();
      if (res.ok) applyData(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, [applyData]);

  const active = templates.find((t) => t.template_key === activeKey) ?? null;

  function updateActive(
    patch: Partial<Pick<TemplateDraft, "subject" | "body" | "is_enabled">>,
  ) {
    setTemplates((prev) =>
      prev.map((t) => (t.template_key === activeKey ? { ...t, ...patch } : t)),
    );
  }

  function buildInput() {
    return {
      sms_provider: smsProvider,
      sms_api_key: smsApiKey,
      sms_sender_name: smsSenderName,
      channel_sms: channelSms,
      channel_email: channelEmail,
      channel_internal: channelInternal,
      templates: templates.map((t) => ({
        template_key: t.template_key,
        subject: t.subject,
        body: t.body,
        is_enabled: t.is_enabled,
      })),
    };
  }

  async function persist(): Promise<boolean> {
    if (channelSms && !smsProvider.trim()) {
      setError("Select an SMS provider to enable SMS.");
      return false;
    }
    if (channelSms && !smsSenderName.trim()) {
      setError("Sender name is required when SMS is enabled.");
      return false;
    }
    if (!channelSms && !channelEmail && !channelInternal) {
      setError("Enable at least one notification channel.");
      return false;
    }
    for (const t of templates) {
      if (t.is_enabled && !t.body.trim()) {
        setError(`Add a message body for “${t.title}”.`);
        return false;
      }
    }

    const res = await saveCommunicationSetup(buildInput());
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    applyData(res.data);
    return true;
  }

  async function handleSaveOnly() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persist())) return;
      setSuccess("Communication settings saved.");
    } catch {
      setError("Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    setDraftSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persist())) return;
      const draft = await saveSetupDraft("communication");
      if (!draft.ok) {
        setError(draft.error);
        return;
      }
      await refreshProgress();
      setSuccess("Draft saved.");
    } catch {
      setError("Could not save draft.");
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleContinue() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persist())) return;
      const done = await completeSetupStep("communication");
      if (!done.ok) {
        setError(done.error);
        return;
      }
      await refreshProgress();
      const next = getNextSetupHref("communication");
      await router.push(next ?? "/setup");
    } catch {
      setError("Could not complete this step.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        Loading communication settings…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <FormSection
        title="Channels"
        description="Choose how SOFIA can notify parents and staff."
        layout="stack"
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {CHANNEL_OPTIONS.map((opt) => {
            const checked =
              opt.key === "sms"
                ? channelSms
                : opt.key === "email"
                  ? channelEmail
                  : channelInternal;
            const toggle =
              opt.key === "sms"
                ? setChannelSms
                : opt.key === "email"
                  ? setChannelEmail
                  : setChannelInternal;

            return (
              <label
                key={opt.key}
                className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-3.5 py-3 ${
                  checked
                    ? "border-(--sofia-primary)/40 bg-(--sofia-primary)/5"
                    : "border-slate-200 bg-white"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggle(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-(--sofia-primary)"
                  />
                  {opt.label}
                </span>
                <span className="pl-6 text-xs text-slate-500">
                  {opt.description}
                </span>
              </label>
            );
          })}
        </div>
      </FormSection>

      <FormSection
        title="SMS Configuration"
        description="Provider credentials used when SMS is enabled. Stored locally on this device."
        layout="stack"
      >
        <FormSelect
          label="Provider"
          options={SMS_PROVIDER_OPTIONS.map((p) => p.label)}
          value={
            SMS_PROVIDER_OPTIONS.find((p) => p.key === smsProvider)?.label ?? ""
          }
          onChange={(e) => {
            const match = SMS_PROVIDER_OPTIONS.find(
              (p) => p.label === e.target.value,
            );
            setSmsProvider(match?.key ?? "");
          }}
          placeholder="Select SMS provider"
        />
        <FormField
          label="API Key"
          type="password"
          value={smsApiKey}
          onChange={(e) => setSmsApiKey(e.target.value)}
          placeholder="Provider API key"
          autoComplete="off"
          hint={
            channelSms
              ? "Required before SMS can be sent."
              : "Optional until SMS is enabled."
          }
        />
        <FormField
          label="Sender Name"
          value={smsSenderName}
          onChange={(e) =>
            setSmsSenderName(e.target.value.slice(0, 20).toUpperCase())
          }
          placeholder="e.g. SOFIA SCHOOL"
          hint="Usually 3–11 alphanumeric characters (provider rules apply)."
          maxLength={20}
        />
      </FormSection>

      <FormSection
        title="Notification Templates"
        description="Edit the messages used for common school notifications."
        layout="stack"
      >
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => {
            const selected = activeKey === t.template_key;
            return (
              <button
                key={t.template_key}
                type="button"
                onClick={() => setActiveKey(t.template_key)}
                className={`cursor-pointer rounded-xl border px-3.5 py-2 text-left text-sm transition ${
                  selected
                    ? "border-(--sofia-primary)/40 bg-(--sofia-primary)/5 font-semibold text-(--sofia-primary)"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                <span className="block">{t.title}</span>
                {!t.is_enabled ? (
                  <span className="text-[10px] font-medium text-slate-400">
                    Disabled
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {active ? (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  {active.title}
                </span>
                <span className="text-xs text-slate-500">
                  Enable this template for outbound notifications.
                </span>
              </span>
              <input
                type="checkbox"
                checked={active.is_enabled}
                onChange={(e) => updateActive({ is_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-(--sofia-primary)"
              />
            </label>

            <FormField
              label="Subject"
              value={active.subject}
              onChange={(e) => updateActive({ subject: e.target.value })}
              placeholder="Email / notification subject"
              hint="Used for email and internal notifications."
              fullWidth
            />

            <label className="mb-0 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Message body
                {active.is_enabled ? (
                  <span className="text-red-500" aria-hidden>
                    {" "}
                    *
                  </span>
                ) : null}
              </span>
              <textarea
                value={active.body}
                onChange={(e) => updateActive({ body: e.target.value })}
                className={textareaClass}
                rows={5}
                placeholder="Message text with {{placeholders}}"
              />
              <span className="mt-1 block text-xs text-slate-400">
                Placeholders: {"{{student_name}}"}, {"{{parent_name}}"},{" "}
                {"{{school_name}}"}, {"{{amount}}"}, {"{{class_name}}"}
              </span>
            </label>
          </div>
        ) : null}
      </FormSection>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSaveOnly()}
          disabled={saving}
          className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-(--sofia-primary) hover:text-(--sofia-primary) disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      <SetupFooter
        stepId="communication"
        onSaveDraft={() => void handleSaveDraft()}
        onContinue={() => void handleContinue()}
        saving={saving}
        draftSaving={draftSaving}
      />
    </div>
  );
}
