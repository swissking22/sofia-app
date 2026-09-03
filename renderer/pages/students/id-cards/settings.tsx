import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { IdCardModuleNav } from "../../../components/id-cards/ModuleNav";
import {
  PageAlert,
  PrimaryButton,
  selectClass,
} from "../../../components/students/ui";
import {
  fetchIdCardSettings,
  saveIdCardSettings,
} from "../../../lib/student-id-cards";

export default function IdCardSettingsPage() {
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [settings, setSettings] = React.useState<Record<
    string,
    unknown
  > | null>(null);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchIdCardSettings();
      if (res.ok) setSettings(res.data);
      else setError(res.error);
    })();
  }, []);

  const numbering = (settings?.numbering || {}) as Record<string, unknown>;

  async function save() {
    if (!settings) return;
    const res = await saveIdCardSettings(settings);
    if (!res.ok) setError(res.error);
    else {
      setSettings(res.data);
      setSuccess("Settings saved. They apply to new cards only.");
    }
  }

  if (!settings) {
    return (
      <AppShell
        title="Card settings"
        breadcrumb={["Student Management", "ID Cards", "Settings"]}
        heading="Card settings"
      >
        <IdCardModuleNav />
        {error ? (
          <PageAlert tone="error">{error}</PageAlert>
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Card settings"
      breadcrumb={["Student Management", "ID Cards", "Settings"]}
      heading="Card settings"
      subtitle="Numbering, expiry, and print defaults for this school. Template colours can override branding."
    >
      <IdCardModuleNav />
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}
      <div className="grid max-w-3xl gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Card numbers</h2>
          <p className="text-sm text-slate-500">
            Example: SCH/ID/2026/00001 — unique per school.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Prefix
              <input
                className={`${selectClass} mt-1 w-full`}
                value={String(numbering.prefix || "")}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    numbering: { ...numbering, prefix: e.target.value },
                  })
                }
              />
            </label>
            <label className="text-sm">
              Separator
              <input
                className={`${selectClass} mt-1 w-full`}
                value={String(numbering.separator || "")}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    numbering: { ...numbering, separator: e.target.value },
                  })
                }
              />
            </label>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Expiry</h2>
          <select
            className={`${selectClass} mt-3`}
            value={String(settings.expiry_mode || "academic_year")}
            onChange={(e) =>
              setSettings({ ...settings, expiry_mode: e.target.value })
            }
          >
            <option value="none">No expiry</option>
            <option value="academic_year">End of academic year</option>
            <option value="duration">Fixed duration (months)</option>
            <option value="custom">Custom date</option>
          </select>
          <label className="mt-3 block text-sm">
            Duration (months)
            <input
              type="number"
              className={`${selectClass} mt-1 w-full`}
              value={Number(settings.expiry_months || 12)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  expiry_months: Number(e.target.value),
                })
              }
            />
          </label>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Branding & print</h2>
          <label className="mt-3 block text-sm">
            Motto
            <input
              className={`${selectClass} mt-1 w-full`}
              value={String(settings.motto || "")}
              onChange={(e) =>
                setSettings({ ...settings, motto: e.target.value })
              }
            />
          </label>
          <label className="mt-3 block text-sm">
            Footer
            <input
              className={`${selectClass} mt-1 w-full`}
              value={String(settings.footer_text || "")}
              onChange={(e) =>
                setSettings({ ...settings, footer_text: e.target.value })
              }
            />
          </label>
          <select
            className={`${selectClass} mt-3`}
            value={String(settings.paper_size || "A4")}
            onChange={(e) =>
              setSettings({ ...settings, paper_size: e.target.value })
            }
          >
            <option>A4</option>
            <option>A3</option>
            <option>Letter</option>
          </select>
        </section>
        <PrimaryButton onClick={() => void save()}>Save settings</PrimaryButton>
      </div>
    </AppShell>
  );
}
