import React from "react";
import Link from "next/link";
import {
  Archive02Icon,
  Copy01Icon,
  Delete02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../../components/layout/AppShell";
import { IdCardModuleNav } from "../../../../components/id-cards/ModuleNav";
import { CardSurface } from "../../../../components/id-cards/CardSurface";
import { PageAlert, PrimaryButton, SecondaryButton } from "../../../../components/students/ui";
import { TableActionGroup, TableIconButton } from "../../../../components/ui/TableActions";
import {
  fetchIdCardTemplates,
  idCardTemplateAction,
} from "../../../../lib/student-id-cards";

export default function IdCardTemplatesPage() {
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [templates, setTemplates] = React.useState<
    Extract<Awaited<ReturnType<typeof fetchIdCardTemplates>>, { ok: true }>["data"]["templates"]
  >([]);

  const load = React.useCallback(async () => {
    const res = await fetchIdCardTemplates();
    if (res.ok) setTemplates(res.data.templates);
    else setError(res.error);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "duplicate" | "activate" | "archive" | "delete") {
    const res = await idCardTemplateAction({ id, action });
    if (!res.ok) setError(res.error);
    else {
      setSuccess("Template updated.");
      await load();
    }
  }

  return (
    <AppShell
      title="Card templates"
      breadcrumb={["Student Management", "ID Cards", "Templates"]}
      heading="Card templates"
      subtitle="Each school designs its own cards. Sample layouts are starting points only."
    >
      <IdCardModuleNav />
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}
      <div className="mb-4">
        <Link href="/students/id-cards/templates/new">
          <PrimaryButton>Create template</PrimaryButton>
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {templates.map((t) => (
          <article key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">{t.name}</h2>
                <p className="text-sm text-slate-500">{t.description || "No description"}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {t.card_type} · {t.orientation} · v{t.current_version_number} · {t.status}
                  {t.updated_by_email ? ` · ${t.updated_by_email}` : ""} ·{" "}
                  {new Date(t.updated_at).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-3 overflow-auto">
              <CardSurface design={t.design} side="front" unit="px" />
              <CardSurface design={t.design} side="back" unit="px" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href={`/students/id-cards/designer/${t.id}`}>
                <PrimaryButton>Open designer</PrimaryButton>
              </Link>
              <Link href={`/students/id-cards/generate?template=${t.id}`}>
                <SecondaryButton>Generate cards</SecondaryButton>
              </Link>
              <TableActionGroup align="start">
                <TableIconButton
                  icon={Copy01Icon}
                  label="Duplicate"
                  onClick={() => void act(t.id, "duplicate")}
                />
                {t.status !== "active" ? (
                  <TableIconButton
                    icon={Tick02Icon}
                    label="Activate"
                    tone="primary"
                    onClick={() => void act(t.id, "activate")}
                  />
                ) : null}
                {t.status !== "archived" ? (
                  <TableIconButton
                    icon={Archive02Icon}
                    label="Archive"
                    tone="warning"
                    onClick={() => void act(t.id, "archive")}
                  />
                ) : null}
                <TableIconButton
                  icon={Delete02Icon}
                  label="Delete"
                  tone="danger"
                  onClick={() => void act(t.id, "delete")}
                />
              </TableActionGroup>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
