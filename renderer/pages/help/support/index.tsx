import React from "react";
import Link from "next/link";
import {
  Mail01Icon,
  Copy01Icon,
  BookOpen01Icon,
  CustomerServiceIcon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { Icon } from "../../../components/ui/Icon";
import {
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  fieldClass,
  selectClass,
} from "../../../components/students/ui";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_EMAIL,
  buildSupportMailto,
  copyText,
  formatDiagnosticsBlock,
  loadSupportDiagnostics,
  type SupportCategoryId,
  type SupportDiagnostics,
} from "../../../lib/help-support";

export default function HelpSupportPage() {
  const [diagnostics, setDiagnostics] =
    React.useState<SupportDiagnostics | null>(null);
  const [category, setCategory] =
    React.useState<SupportCategoryId>("technical");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    void loadSupportDiagnostics().then(setDiagnostics);
  }, []);

  const categoryLabel =
    SUPPORT_CATEGORIES.find((c) => c.id === category)?.label || "Support";

  function openMail() {
    setError("");
    if (!diagnostics) {
      setError("Diagnostics are still loading. Try again in a moment.");
      return;
    }
    if (message.trim().length < 12) {
      setError(
        "Please describe the issue in a bit more detail (at least a short paragraph).",
      );
      return;
    }
    const href = buildSupportMailto({
      categoryLabel,
      subject,
      message,
      diagnostics,
    });
    window.location.href = href;
  }

  async function handleCopy() {
    if (!diagnostics) return;
    const ok = await copyText(
      [
        `Subject: ${subject || categoryLabel}`,
        `Category: ${categoryLabel}`,
        "",
        message.trim() || "(No message yet)",
        "",
        formatDiagnosticsBlock(diagnostics),
      ].join("\n"),
    );
    setCopied(ok);
    if (!ok) setError("Could not copy to the clipboard.");
  }

  return (
    <AppShell
      title="Contact Sofia Support"
      breadcrumb={["Help & Support", "Contact Sofia Support"]}
      heading="Contact Sofia Support"
      subtitle="Email the Sofia team with diagnostics attached so we can help faster."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {copied ? (
        <PageAlert tone="success">
          Message and diagnostics copied. Paste into your email client if
          needed.
        </PageAlert>
      ) : null}

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <InfoCard
          icon={Mail01Icon}
          title="Email"
          body={
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-semibold text-(--sofia-primary) hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          }
        />
        <InfoCard
          icon={BookOpen01Icon}
          title="Documentation"
          body={
            <Link
              href="/help/docs"
              className="font-semibold text-(--sofia-primary) hover:underline"
            >
              Browse in-app guides
            </Link>
          }
        />
        <InfoCard
          icon={CustomerServiceIcon}
          title="Response"
          body={
            <span className="text-slate-600">
              Include school name, what you tried, and any error text.
            </span>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            New support request
          </h2>
          <div className="space-y-4">
            <label className="block text-xs font-medium text-slate-500">
              Category
              <select
                className={`${selectClass} mt-1 w-full`}
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as SupportCategoryId)
                }
              >
                {SUPPORT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-500">
              Subject
              <input
                className={`${fieldClass} mt-1`}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Short summary"
              />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              Describe the issue
              <textarea
                className={`${fieldClass} mt-1 min-h-40`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What happened? What did you expect? Any error messages?"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton onClick={openMail}>
                <span className="inline-flex items-center gap-1.5">
                  <Icon icon={Mail01Icon} size={16} />
                  Open email to support
                </span>
              </PrimaryButton>
              <SecondaryButton onClick={() => void handleCopy()}>
                <span className="inline-flex items-center gap-1.5">
                  <Icon icon={Copy01Icon} size={16} />
                  Copy message + diagnostics
                </span>
              </SecondaryButton>
            </div>
            <p className="text-xs text-slate-500">
              Opens your default mail app addressed to {SUPPORT_EMAIL}. Sofia
              does not send support mail from inside the app.
            </p>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Diagnostics
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Included automatically when you open email or copy.
            </p>
            {diagnostics ? (
              <dl className="mt-3 space-y-2 text-sm">
                <Row k="App version" v={diagnostics.appVersion} />
                <Row k="School" v={diagnostics.schoolName} />
                <Row k="User" v={diagnostics.userEmail} />
                <Row k="Role" v={diagnostics.userRole} />
                <Row k="Platform" v={diagnostics.platform} />
              </dl>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Loading…</p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Before you write
            </h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-slate-600">
              <li>Check Documentation for common how-to steps.</li>
              <li>
                For sync issues, note Pending Sync / Sync Failed on Backup &amp;
                Sync.
              </li>
              <li>Never send passwords or private student files by email.</li>
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function InfoCard({
  icon,
  title,
  body,
}: {
  icon: typeof Mail01Icon;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-(--sofia-primary)">
        <Icon icon={icon} size={18} />
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="text-sm">{body}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 pb-1.5">
      <dt className="text-slate-500">{k}</dt>
      <dd className="truncate text-right font-medium text-slate-800">{v}</dd>
    </div>
  );
}
