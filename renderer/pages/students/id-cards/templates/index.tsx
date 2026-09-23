import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Add01Icon,
  Archive02Icon,
  Copy01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  Tick02Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../../components/layout/AppShell";
import { IdCardModuleNav } from "../../../../components/id-cards/ModuleNav";
import { CardSurface } from "../../../../components/id-cards/CardSurface";
import {
  ConfirmModal,
  FormModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "../../../../components/students/ui";
import {
  TableActionGroup,
  TableIconButton,
} from "../../../../components/ui/TableActions";
import { Icon } from "../../../../components/ui/Icon";
import {
  fetchIdCardTemplates,
  idCardTemplateAction,
  useIdCardTemplate,
  type CardDesign,
} from "../../../../lib/student-id-cards";
import { formatDisplayDateTime } from "../../../../lib/date-format";

type TemplateItem = {
  id: string;
  name: string;
  description: string;
  card_type: string;
  orientation: string;
  status: string;
  is_system?: number;
  category?: string;
  sample_key?: string | null;
  current_version_number: number;
  updated_at: string;
  updated_by_email: string | null;
  design: CardDesign;
};

const CATEGORY_COLORS: Record<
  string,
  { badge: string; border: string; accent: string }
> = {
  Premium: {
    badge: "bg-amber-500/10 text-amber-700 border-amber-300/40",
    border: "border-amber-200/70 hover:border-amber-400/80",
    accent: "text-amber-700",
  },
  Modern: {
    badge: "bg-sky-500/10 text-sky-700 border-sky-300/40",
    border: "border-sky-200/70 hover:border-sky-400/80",
    accent: "text-sky-700",
  },
  Minimal: {
    badge: "bg-slate-700/10 text-slate-800 border-slate-300/50",
    border: "border-slate-300/70 hover:border-slate-500/80",
    accent: "text-slate-800",
  },
  Classic: {
    badge: "bg-indigo-500/10 text-indigo-700 border-indigo-300/40",
    border: "border-indigo-200/70 hover:border-indigo-400/80",
    accent: "text-indigo-700",
  },
};

const TEMPLATE_HIGHLIGHTS: Record<string, string[]> = {
  the_heritage: [
    "Oxford & Ivy League heraldic crest",
    "Deep navy & regal gold accents",
    "Double-sided security background pattern",
    "Authorized signature & verification code",
  ],
  the_academic: [
    "Contemporary international geometry",
    "Rounded portrait frame & electric accents",
    "Dual QR & Code 128 barcode layout",
    "Structured departmental architecture",
  ],
  the_signature: [
    "Swiss executive luxury minimalism",
    "Full-bleed watermark crest on back",
    "High-contrast institutional typography",
    "Clean ultra-precise micro spacing",
  ],
};

export default function IdCardTemplatesPage() {
  const router = useRouter();
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [templates, setTemplates] = React.useState<TemplateItem[]>([]);
  const [activeCategory, setActiveCategory] = React.useState<string>("All");
  const [search, setSearch] = React.useState("");
  const [previewTemplate, setPreviewTemplate] =
    React.useState<TemplateItem | null>(null);
  const [previewSide, setPreviewSide] = React.useState<
    "both" | "front" | "back"
  >("both");
  const [deleteConfirm, setDeleteConfirm] = React.useState<TemplateItem | null>(
    null,
  );

  const load = React.useCallback(async () => {
    const res = await fetchIdCardTemplates();
    if (res.ok) {
      setTemplates(res.data.templates as TemplateItem[]);
    } else {
      setError(res.error);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleUseTemplate(template: TemplateItem) {
    setBusy(true);
    setError("");
    try {
      const res = await useIdCardTemplate(template.id);
      if (res.ok && res.data?.id) {
        setSuccess(`Created copy "${res.data.name}". Opening designer...`);
        await router.push(`/students/id-cards/designer/${res.data.id}`);
      } else {
        setError(res.ok ? "Could not prepare template." : res.error);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to use template.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleCustomizeTemplate(template: TemplateItem) {
    if (template.is_system) {
      // System templates are protected master templates: clicking customize creates a school copy and opens designer
      await handleUseTemplate(template);
    } else {
      // School's own template: direct navigation to designer
      await router.push(`/students/id-cards/designer/${template.id}`);
    }
  }

  async function act(
    id: string,
    action: "duplicate" | "activate" | "archive" | "delete",
  ) {
    setBusy(true);
    setError("");
    const res = await idCardTemplateAction({ id, action });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
    } else {
      setSuccess(
        action === "delete" ? "Draft template deleted." : "Template updated.",
      );
      setDeleteConfirm(null);
      await load();
    }
  }

  // Split system vs custom school templates
  const systemTemplates = templates.filter((t) => Boolean(t.is_system));
  const schoolTemplates = templates.filter((t) => !t.is_system);

  const filteredSystem = systemTemplates.filter((t) => {
    if (activeCategory !== "All" && t.category !== activeCategory) return false;
    if (
      search &&
      !t.name.toLowerCase().includes(search.toLowerCase()) &&
      !t.description.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const filteredSchool = schoolTemplates.filter((t) => {
    if (
      activeCategory !== "All" &&
      activeCategory !== "School Copies" &&
      t.category !== activeCategory
    ) {
      return false;
    }
    if (
      search &&
      !t.name.toLowerCase().includes(search.toLowerCase()) &&
      !t.description.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const categories = ["All", "Premium", "Modern", "Minimal", "School Copies"];

  return (
    <AppShell
      title="Student ID Card Templates"
      breadcrumb={["Student Management", "ID Cards", "Templates"]}
      heading="Student ID Card Templates"
      subtitle="Choose a professionally designed starting point, then customize it for your school."
    >
      <IdCardModuleNav />

      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      {/* Header controls & Categories */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-100/60 p-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                activeCategory === cat
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none transition focus:border-(--sofia-primary) sm:w-60"
          />
          <Link href="/students/id-cards/templates/new">
            <SecondaryButton className="py-2! text-xs! font-semibold">
              <span className="flex items-center gap-1">
                <Icon icon={Add01Icon} size={14} />
                <span>Blank Canvas</span>
              </span>
            </SecondaryButton>
          </Link>
        </div>
      </div>

      {/* Showcase Section: System Signature Templates */}
      {(activeCategory === "All" || activeCategory !== "School Copies") &&
      filteredSystem.length > 0 ? (
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Institutional Master Templates
              </h2>
              <p className="text-xs text-slate-400">
                CR80 credit card standard (85.60 × 53.98 mm) ·
                Resolution-independent · Ready to personalize
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Production Ready
            </span>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            {filteredSystem.map((t) => {
              const catTheme =
                CATEGORY_COLORS[t.category || ""] || CATEGORY_COLORS.Premium;
              const highlights = TEMPLATE_HIGHLIGHTS[t.sample_key || ""] || [];

              return (
                <article
                  key={t.id}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-lg ${catTheme.border}`}
                >
                  {/* Top Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${catTheme.badge}`}
                        >
                          {t.category || "Institutional"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          <svg
                            className="h-2.5 w-2.5 text-slate-400"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                          >
                            <path d="M8 1a3.5 3.5 0 00-3.5 3.5V6H4a2 2 0 00-2 2v6a2 2 0 002 2h8a2 2 0 002-2V8a2 2 0 00-2-2h-.5V4.5A3.5 3.5 0 008 1zm2 5H6V4.5a2 2 0 114 0V6z" />
                          </svg>
                          System Template
                        </span>
                      </div>
                      <span className="text-[11px] font-medium tracking-tight text-slate-400">
                        CR80 · 85.6 × 54 mm
                      </span>
                    </div>

                    <div className="mt-3">
                      <h3 className="text-lg font-bold tracking-tight text-slate-900 group-hover:text-(--sofia-primary)">
                        {t.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-1 italic">
                        &ldquo;{t.description}&rdquo;
                      </p>
                    </div>

                    {/* Side-by-Side FRONT & BACK Live Card Surface */}
                    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                        <span>Front Side</span>
                        <span>Back Side</span>
                      </div>
                      <div className="flex items-center justify-center gap-2 overflow-x-auto py-1">
                        {/* Front scaled thumbnail */}
                        <div className="shrink-0 overflow-hidden rounded-md border border-slate-200/80 shadow-xs transition hover:scale-[1.02]">
                          <div
                            style={{
                              transform: "scale(0.48)",
                              transformOrigin: "top left",
                              width: 165,
                              height: 104,
                            }}
                          >
                            <CardSurface
                              design={t.design}
                              side="front"
                              unit="px"
                            />
                          </div>
                        </div>
                        {/* Back scaled thumbnail */}
                        <div className="shrink-0 overflow-hidden rounded-md border border-slate-200/80 shadow-xs transition hover:scale-[1.02]">
                          <div
                            style={{
                              transform: "scale(0.48)",
                              transformOrigin: "top left",
                              width: 165,
                              height: 104,
                            }}
                          >
                            <CardSurface
                              design={t.design}
                              side="back"
                              unit="px"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Key highlights bullets */}
                    {highlights.length > 0 ? (
                      <ul className="mt-4 space-y-1.5">
                        {highlights.map((h, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-2 text-xs text-slate-600"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-(--sofia-primary) shrink-0" />
                            <span className="line-clamp-1">{h}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  {/* Actions bar: [Use Template] [Preview] [Customize] */}
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleUseTemplate(t)}
                        className="flex-1 cursor-pointer items-center justify-center rounded-xl bg-(--sofia-primary) px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:opacity-90 disabled:opacity-50"
                      >
                        Use Template
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPreviewTemplate(t);
                          setPreviewSide("both");
                        }}
                        className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        title="Inspect full-size front and back cards"
                      >
                        <Icon
                          icon={ViewIcon}
                          size={14}
                          className="text-slate-500"
                        />
                        <span>Preview</span>
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleCustomizeTemplate(t)}
                        className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        title="Copy into designer"
                      >
                        <Icon
                          icon={PencilEdit01Icon}
                          size={14}
                          className="text-slate-500"
                        />
                        <span>Customize</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* School Custom / Cloned Templates Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              {activeCategory === "School Copies"
                ? "Customized School Templates"
                : "School ID Card Library"}
            </h2>
            <p className="text-xs text-slate-400">
              Templates configured and saved for this school institution
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {filteredSchool.length}{" "}
            {filteredSchool.length === 1 ? "template" : "templates"}
          </span>
        </div>

        {filteredSchool.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            <p className="text-sm font-medium text-slate-600">
              No school-customized templates yet.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Click &ldquo;Use Template&rdquo; on any institutional template
              above to personalize it for your school.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredSchool.map((t) => (
              <article
                key={t.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{t.name}</h3>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {t.description || "School customized template"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {t.card_type} · {t.orientation} · Version{" "}
                      {t.current_version_number}
                      {t.updated_by_email
                        ? ` · by ${t.updated_by_email}`
                        : ""}{" "}
                      · Updated {formatDisplayDateTime(t.updated_at)}
                    </p>
                  </div>
                </div>

                {/* Card front & back preview */}
                <div className="mt-3 flex items-center gap-3 overflow-x-auto rounded-xl bg-slate-50 p-2.5">
                  <div className="shrink-0 overflow-hidden rounded-md border border-slate-200 shadow-xs">
                    <div
                      style={{
                        transform: "scale(0.5)",
                        transformOrigin: "top left",
                        width: 172,
                        height: 108,
                      }}
                    >
                      <CardSurface design={t.design} side="front" unit="px" />
                    </div>
                  </div>
                  <div className="shrink-0 overflow-hidden rounded-md border border-slate-200 shadow-xs">
                    <div
                      style={{
                        transform: "scale(0.5)",
                        transformOrigin: "top left",
                        width: 172,
                        height: 108,
                      }}
                    >
                      <CardSurface design={t.design} side="back" unit="px" />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <Link href={`/students/id-cards/designer/${t.id}`}>
                      <PrimaryButton className="py-1.5! text-xs!">
                        Open designer
                      </PrimaryButton>
                    </Link>
                    {t.status === "active" ? (
                      <Link
                        href={`/students/id-cards/generate?template=${t.id}`}
                      >
                        <SecondaryButton className="py-1.5! text-xs!">
                          Generate cards
                        </SecondaryButton>
                      </Link>
                    ) : null}
                    {t.status === "draft" ? (
                      <SecondaryButton
                        className="py-1.5! text-xs! text-red-600 ring-red-200 hover:bg-red-50"
                        disabled={busy}
                        onClick={() => setDeleteConfirm(t)}
                      >
                        Delete draft
                      </SecondaryButton>
                    ) : null}
                  </div>

                  <TableActionGroup align="end">
                    <TableIconButton
                      icon={ViewIcon}
                      label="Inspect card"
                      onClick={() => {
                        setPreviewTemplate(t);
                        setPreviewSide("both");
                      }}
                    />
                    <TableIconButton
                      icon={Copy01Icon}
                      label="Duplicate"
                      onClick={() => void act(t.id, "duplicate")}
                    />
                    {t.status !== "active" ? (
                      <TableIconButton
                        icon={Tick02Icon}
                        label="Set Active"
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
                      label={t.status === "draft" ? "Delete draft" : "Delete"}
                      tone="danger"
                      onClick={() => setDeleteConfirm(t)}
                    />
                  </TableActionGroup>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* High-Resolution Inspection Modal (Front + Back Preview) */}
      {previewTemplate ? (
        <FormModal
          open={Boolean(previewTemplate)}
          size="xl"
          title={previewTemplate.name}
          subtitle={`Physical standard: CR80 · 85.60mm × 53.98mm · ${previewTemplate.category || "Institutional"} Category`}
          onClose={() => setPreviewTemplate(null)}
          footer={
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold">Format:</span>
                <span>CR80 PVC · 300 DPI Vector Accuracy · Offline Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <SecondaryButton onClick={() => setPreviewTemplate(null)}>
                  Close
                </SecondaryButton>
                <PrimaryButton
                  onClick={() => {
                    const target = previewTemplate;
                    setPreviewTemplate(null);
                    void handleUseTemplate(target);
                  }}
                >
                  {previewTemplate.is_system
                    ? "Use This Template & Open Designer"
                    : "Open in Designer"}
                </PrimaryButton>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Side selection toggle */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewSide("both")}
                  className={`rounded-md px-3 py-1 font-semibold transition ${
                    previewSide === "both"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  Front & Back
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewSide("front")}
                  className={`rounded-md px-3 py-1 font-semibold transition ${
                    previewSide === "front"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  Front Only
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewSide("back")}
                  className={`rounded-md px-3 py-1 font-semibold transition ${
                    previewSide === "back"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  Back Only
                </button>
              </div>

              <div className="text-right text-xs text-slate-400">
                <span>Variables populated with realistic sample data</span>
              </div>
            </div>

            {/* High Definition Card Previews */}
            <div className="flex flex-wrap items-center justify-center gap-6 overflow-x-auto rounded-2xl bg-slate-100/70 p-6">
              {(previewSide === "both" || previewSide === "front") && (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Card Front
                  </span>
                  <div className="overflow-hidden rounded-xl border border-slate-300 shadow-xl ring-1 ring-black/5">
                    <CardSurface
                      design={previewTemplate.design}
                      side="front"
                      unit="px"
                    />
                  </div>
                </div>
              )}

              {(previewSide === "both" || previewSide === "back") && (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Card Back
                  </span>
                  <div className="overflow-hidden rounded-xl border border-slate-300 shadow-xl ring-1 ring-black/5">
                    <CardSurface
                      design={previewTemplate.design}
                      side="back"
                      unit="px"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Specs & Customization Details */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs">
              <div>
                <p className="text-slate-400">Orientation</p>
                <p className="font-semibold text-slate-800 capitalize">
                  {previewTemplate.orientation}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Dimensions</p>
                <p className="font-semibold text-slate-800">85.60 × 53.98 mm</p>
              </div>
              <div>
                <p className="text-slate-400">Type / Classification</p>
                <p className="font-semibold text-slate-800 capitalize">
                  {previewTemplate.is_system
                    ? "System Master"
                    : "School Custom"}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Dynamic Bindings</p>
                <p className="font-semibold text-slate-800">
                  Photo, Crest, QR, Barcode
                </p>
              </div>
            </div>
          </div>
        </FormModal>
      ) : null}

      {/* Delete Confirmation Modal */}
      {deleteConfirm ? (
        <ConfirmModal
          open={Boolean(deleteConfirm)}
          title={
            deleteConfirm.status === "draft"
              ? "Delete draft template?"
              : "Delete Template"
          }
          description={
            deleteConfirm.status === "draft"
              ? `Delete "${deleteConfirm.name}"? Any test cards generated from this draft will be removed. This cannot be undone.`
              : `Are you sure you want to delete "${deleteConfirm.name}"? Templates with issued cards must be archived instead. This cannot be undone.`
          }
          confirmLabel={
            deleteConfirm.status === "draft"
              ? "Delete draft"
              : "Delete template"
          }
          danger
          busy={busy}
          onConfirm={() => void act(deleteConfirm.id, "delete")}
          onCancel={() => setDeleteConfirm(null)}
        />
      ) : null}
    </AppShell>
  );
}
