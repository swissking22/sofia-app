import React from "react";
import Link from "next/link";
import {
  Copy01Icon,
  CustomerService01Icon,
  Mail01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../components/layout/AppShell";
import { Icon } from "../../components/ui/Icon";
import {
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  fieldClass,
  selectClass,
} from "../../components/students/ui";
import { authGetSession, type SessionData } from "../../lib/auth";
import { getUpdaterStatus } from "../../lib/updater";

const SUPPORT_EMAIL = "support@sofia.school";

const TOPICS = [
  { value: "general", label: "General question" },
  { value: "sync", label: "Backup & sync" },
  { value: "update", label: "App update / install" },
  { value: "login", label: "Login or users" },
  { value: "students", label: "Students / academics" },
  { value: "finance", label: "Finance" },
  { value: "bug", label: "Bug or unexpected behaviour" },
] as const;

type Topic = (typeof TOPICS)[number]["value"];

/**
 * Help → Contact Sofia Support.
 * Opens the school’s mail client with diagnostics prefilled; no ticket backend.
 */
export default function ContactSupportPage() {
  const [session, setSession] = React.useState<SessionData | null>(null);
  const [version, setVersion] = React.useState("");
  const [topic, setTopic] = React.useState<Topic>("general");
  const [message, setMessage] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [info, setInfo] = React.useState("");

  React.useEffect(() => {
    void authGetSession().then(setSession);
    void getUpdaterStatus().then((res) => {
      if (res.ok) setVersion(res.data.currentVersion);
    });
  }, []);

  const diagnostics = [
    `Sofia version: ${version || "—"}`,
    `School: ${session?.schoolName || "—"}`,
    `School ID: ${session?.schoolId || "—"}`,
    `Signed-in user: ${session?.email || "—"}`,
    `Role: ${session?.role || "—"}`,
    `Platform: ${typeof navigator !== "undefined" ? navigator.platform : "—"}`,
  ].join("\n");

  function buildMailto() {
    const topicLabel =
      TOPICS.find((t) => t.value === topic)?.label || "Support request";
    const subject = `Sofia support: ${topicLabel} — ${session?.schoolName || "School"}`;
    const body = [
      message.trim() || "(Describe what you need help with.)",
      "",
      "—",
      "Diagnostics (please leave attached):",
      diagnostics,
    ].join("\n");
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function openMail() {
    window.location.href = buildMailto();
    setInfo(
      "Your email app should open with a draft to Sofia Support. If nothing opens, copy the address and send manually.",
    );
  }

  async function copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(`${SUPPORT_EMAIL}\n\n${diagnostics}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setInfo("Could not copy. Select the diagnostics text manually.");
    }
  }

  return (
    <AppShell
      title="Contact Sofia Support"
      breadcrumb={["Help & Support", "Contact Sofia Support"]}
      heading="Contact Sofia Support"
      subtitle="Email the Sofia team with your question. Diagnostics below help us respond faster."
    >
      {info ? <PageAlert tone="success">{info}</PageAlert> : null}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--sofia-primary)/10 text-(--sofia-primary)">
              <Icon icon={Mail01Icon} size={20} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Write to support
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Opens your default mail app addressed to{" "}
                <a
                  className="font-medium text-(--sofia-primary)"
                  href={`mailto:${SUPPORT_EMAIL}`}
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>
          </div>

          <label className="mb-3 block text-xs font-medium text-slate-500">
            Topic
            <select
              className={`${selectClass} mt-1 w-full`}
              value={topic}
              onChange={(e) => setTopic(e.target.value as Topic)}
            >
              {TOPICS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-4 block text-xs font-medium text-slate-500">
            Message
            <textarea
              className={`${fieldClass} mt-1 min-h-32 resize-y`}
              placeholder="What happened? What did you expect? Include steps if it is a bug."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={openMail}>
              <Icon icon={Mail01Icon} size={16} />
              Open email draft
            </PrimaryButton>
            <SecondaryButton onClick={() => void copyDiagnostics()}>
              <Icon icon={copied ? Tick02Icon : Copy01Icon} size={16} />
              {copied ? "Copied" : "Copy email + diagnostics"}
            </SecondaryButton>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon
                icon={CustomerService01Icon}
                size={18}
                className="text-(--sofia-primary)"
              />
              <h2 className="text-sm font-semibold text-slate-900">
                Your diagnostics
              </h2>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
              {diagnostics}
            </pre>
            <p className="mt-2 text-xs text-slate-500">
              Included automatically when you open an email draft.
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Try these first
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  className="text-(--sofia-primary) hover:underline"
                  href="/administration/backup-sync"
                >
                  Backup & Sync
                </Link>
                <span className="text-slate-500">
                  {" "}
                  — pending changes, failed sync, restore
                </span>
              </li>
              <li>
                <Link
                  className="text-(--sofia-primary) hover:underline"
                  href="/administration/settings"
                >
                  Settings
                </Link>
                <span className="text-slate-500">
                  {" "}
                  — app version, session, password policy
                </span>
              </li>
              <li>
                <Link
                  className="text-(--sofia-primary) hover:underline"
                  href="/home"
                >
                  Dashboard
                </Link>
                <span className="text-slate-500">
                  {" "}
                  — online status and quick sync
                </span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
