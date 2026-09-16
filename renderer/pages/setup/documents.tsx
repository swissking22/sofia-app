import React from "react";
import { useRouter } from "next/router";
import {
  FileUploadField,
  FormField,
  FormSection,
  SetupFooter,
} from "../../components/setup";
import {
  SetupShell,
  useSetupProgress,
} from "../../components/setup/SetupShell";
import {
  fetchDocumentsSetup,
  saveDocumentTemplate,
  TEMPLATE_SHORT_LABELS,
  type DocumentTemplateDto,
  type DocumentTemplateKey,
  type DocumentsSetup,
} from "../../lib/documents";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
} from "../../lib/setup";
import { ReportCardSetupPreview } from "../../components/report-cards/ReportCardSetupPreview";
import { buildReportCardSetupPreviewPayload } from "../../lib/report-card";

const textareaClass =
  "w-full min-h-[72px] resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

interface PendingLogo {
  base64: string;
  mimeType: string;
  preview: string;
}

interface PreviewState {
  schoolName: string;
  template: DocumentTemplateDto | null;
  stampUrl: string | null;
  signatureUrl: string | null;
  logoOverride: string | null;
}

function readFileAsDataUrl(
  file: File,
): Promise<{ dataUrl: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        dataUrl: String(reader.result),
        mime: file.type || "image/png",
      });
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function DocumentsSetupPage() {
  const [preview, setPreview] = React.useState<PreviewState>({
    schoolName: "",
    template: null,
    stampUrl: null,
    signatureUrl: null,
    logoOverride: null,
  });

  return (
    <SetupShell
      stepId="documents"
      aside={<DocumentPreviewPanel data={preview} />}
    >
      <DocumentsSetupForm onPreviewChange={setPreview} />
    </SetupShell>
  );
}

function DocumentPreviewPanel({ data }: { data: PreviewState }) {
  const t = data.template;
  const logoUrl = data.logoOverride ?? t?.logo_url ?? null;

  if (!t) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Preview</h3>
        <p className="mt-1 text-xs text-slate-500">
          Select a template to preview how generated documents will look.
        </p>
      </div>
    );
  }

  if (t.template_key === "report_card") {
    const payload = buildReportCardSetupPreviewPayload({
      schoolName: data.schoolName,
      headerText: t.header_text,
      footerText: t.footer_text,
      logoUrl,
      stampUrl: data.stampUrl,
      signatureUrl: data.signatureUrl,
      signatureLabel: t.signature_label,
      showLogo: t.show_logo,
      showStamp: t.show_stamp,
      showSignature: t.show_signature,
    });

    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Preview</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                t.is_enabled
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {t.is_enabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          <ReportCardSetupPreview payload={payload} />

          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Live preview of the official A4 bilingual report card. Sample
            student data is shown; real cards use results from each term.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Preview</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              t.is_enabled
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {t.is_enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#fafaf8] shadow-inner">
          <div className="min-h-80 p-4">
            {/* Header */}
            <div className="border-b border-slate-200 pb-3 text-center">
              {t.show_logo && logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="mx-auto mb-2 h-12 w-12 object-contain"
                />
              ) : t.show_logo ? (
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-[10px] font-medium text-slate-500">
                  Logo
                </div>
              ) : null}
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
                {data.schoolName || "School Name"}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-(--sofia-primary)">
                {t.header_text || TEMPLATE_SHORT_LABELS[t.template_key]}
              </p>
            </div>

            {/* Body sample */}
            <div className="space-y-2 py-4 text-[10px] leading-relaxed text-slate-600">
              {t.template_key === "admission_letter" ? (
                <>
                  <p>Dear Parent / Guardian,</p>
                  <p>
                    We are pleased to offer admission to{" "}
                    <span className="font-semibold text-slate-800">
                      John Smith
                    </span>{" "}
                    for the forthcoming academic year.
                  </p>
                  <p>Please complete registration by the stated deadline.</p>
                </>
              ) : null}
              {t.template_key === "receipt" ? (
                <>
                  <p>
                    <span className="font-semibold text-slate-800">
                      Receipt #:
                    </span>{" "}
                    RCP-00042
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">
                      Received from:
                    </span>{" "}
                    Jane Doe
                  </p>
                  <div className="rounded border border-slate-200 px-2 py-1.5">
                    <div className="flex justify-between">
                      <span>Tuition</span>
                      <span>50,000 XAF</span>
                    </div>
                    <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 font-semibold text-slate-800">
                      <span>Total</span>
                      <span>50,000 XAF</span>
                    </div>
                  </div>
                </>
              ) : null}
              {t.template_key === "certificate" ? (
                <div className="py-6 text-center">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400">
                    This certifies that
                  </p>
                  <p className="mt-2 font-serif text-base font-semibold text-slate-900">
                    Jane Doe
                  </p>
                  <p className="mt-2 text-[10px] text-slate-600">
                    has successfully completed the requirements of Form 1 for
                    the academic year 2025/2026.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Signatures */}
            {(t.show_signature || t.show_stamp) && (
              <div className="mt-2 flex items-end justify-between gap-3 border-t border-slate-200 pt-3">
                {t.show_signature ? (
                  <div className="min-w-0 flex-1 text-center">
                    {data.signatureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={data.signatureUrl}
                        alt="Signature"
                        className="mx-auto mb-1 h-8 max-w-full object-contain"
                      />
                    ) : (
                      <div className="mx-auto mb-1 h-8 w-20 border-b border-slate-400" />
                    )}
                    <p className="text-[9px] font-medium text-slate-700">
                      {t.signature_label || "Authorized"}
                    </p>
                  </div>
                ) : (
                  <div className="flex-1" />
                )}
                {t.show_stamp ? (
                  <div className="shrink-0">
                    {data.stampUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={data.stampUrl}
                        alt="Stamp"
                        className="h-12 w-12 object-contain opacity-80"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-[8px] text-slate-400">
                        Stamp
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Footer */}
            {t.footer_text ? (
              <p className="mt-3 border-t border-slate-100 pt-2 text-center text-[9px] italic text-slate-400">
                {t.footer_text}
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Controls layout of generated{" "}
          {TEMPLATE_SHORT_LABELS[t.template_key].toLowerCase()} documents. Stamp
          and signature use School Profile assets.
        </p>
      </div>
    </div>
  );
}

function DocumentsSetupForm({
  onPreviewChange,
}: {
  onPreviewChange: (data: PreviewState) => void;
}) {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [draftSaving, setDraftSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [schoolName, setSchoolName] = React.useState("");
  const [stampUrl, setStampUrl] = React.useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = React.useState<string | null>(null);
  const [schoolLogoUrl, setSchoolLogoUrl] = React.useState<string | null>(null);
  const [templates, setTemplates] = React.useState<DocumentTemplateDto[]>([]);
  const [activeKey, setActiveKey] =
    React.useState<DocumentTemplateKey>("report_card");

  const [headerText, setHeaderText] = React.useState("");
  const [footerText, setFooterText] = React.useState("");
  const [signatureLabel, setSignatureLabel] = React.useState("");
  const [showLogo, setShowLogo] = React.useState(true);
  const [showStamp, setShowStamp] = React.useState(true);
  const [showSignature, setShowSignature] = React.useState(true);
  const [isEnabled, setIsEnabled] = React.useState(true);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [hasCustomLogo, setHasCustomLogo] = React.useState(false);
  const [pendingLogo, setPendingLogo] = React.useState<PendingLogo | null>(
    null,
  );
  const [clearLogo, setClearLogo] = React.useState(false);

  const active = templates.find((t) => t.template_key === activeKey) ?? null;

  const effectiveLogoUrl = clearLogo
    ? schoolLogoUrl
    : (pendingLogo?.preview ?? logoPreview);

  const draftTemplate = React.useMemo((): DocumentTemplateDto | null => {
    const base = templates.find((t) => t.template_key === activeKey);
    if (!base) return null;
    return {
      ...base,
      header_text: headerText,
      footer_text: footerText,
      signature_label: signatureLabel,
      show_logo: showLogo,
      show_stamp: showStamp,
      show_signature: showSignature,
      is_enabled: isEnabled,
      logo_url: effectiveLogoUrl,
      has_custom_logo: clearLogo
        ? false
        : Boolean(pendingLogo) || hasCustomLogo,
    };
  }, [
    templates,
    activeKey,
    headerText,
    footerText,
    signatureLabel,
    showLogo,
    showStamp,
    showSignature,
    isEnabled,
    effectiveLogoUrl,
    clearLogo,
    pendingLogo,
    hasCustomLogo,
  ]);

  const logoOverride = pendingLogo?.preview ?? null;

  React.useEffect(() => {
    onPreviewChange({
      schoolName,
      template: draftTemplate,
      stampUrl,
      signatureUrl,
      logoOverride,
    });
  }, [
    schoolName,
    draftTemplate,
    stampUrl,
    signatureUrl,
    logoOverride,
    onPreviewChange,
  ]);

  function applySetup(data: DocumentsSetup, preferKey?: DocumentTemplateKey) {
    setSchoolName(data.schoolName);
    setStampUrl(data.schoolStampUrl);
    setSignatureUrl(data.schoolSignatureUrl);
    setSchoolLogoUrl(data.schoolLogoUrl);
    setTemplates(data.templates);
    const key =
      preferKey && data.templates.some((t) => t.template_key === preferKey)
        ? preferKey
        : (data.templates[0]?.template_key ?? "report_card");
    setActiveKey(key);
    loadTemplateIntoForm(
      data.templates.find((t) => t.template_key === key) ?? data.templates[0],
    );
  }

  function loadTemplateIntoForm(t: DocumentTemplateDto | undefined) {
    if (!t) return;
    setHeaderText(t.header_text);
    setFooterText(t.footer_text);
    setSignatureLabel(t.signature_label);
    setShowLogo(t.show_logo);
    setShowStamp(t.show_stamp);
    setShowSignature(t.show_signature);
    setIsEnabled(t.is_enabled);
    setLogoPreview(t.logo_url);
    setHasCustomLogo(t.has_custom_logo);
    setPendingLogo(null);
    setClearLogo(false);
  }

  React.useEffect(() => {
    void (async () => {
      const res = await fetchDocumentsSetup();
      if (res.ok) applySetup(res.data);
      else setError(res.error);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTemplate(key: DocumentTemplateKey) {
    // Keep unsaved edits only for current template visually; switch loads saved
    const t = templates.find((x) => x.template_key === key);
    setActiveKey(key);
    loadTemplateIntoForm(t);
    setError("");
    setSuccess("");
  }

  async function onLogoFile(file: File) {
    try {
      const { dataUrl, mime } = await readFileAsDataUrl(file);
      setPendingLogo({ base64: dataUrl, mimeType: mime, preview: dataUrl });
      setClearLogo(false);
      setLogoPreview(dataUrl);
    } catch {
      setError("Could not read logo file.");
    }
  }

  function useSchoolLogo() {
    setPendingLogo(null);
    setClearLogo(true);
    setHasCustomLogo(false);
    setLogoPreview(schoolLogoUrl);
  }

  function buildSaveInput() {
    return {
      template_key: activeKey,
      header_text: headerText,
      footer_text: footerText,
      show_logo: showLogo,
      show_stamp: showStamp,
      show_signature: showSignature,
      signature_label: signatureLabel,
      is_enabled: isEnabled,
      logoBase64: pendingLogo?.base64,
      logoMimeType: pendingLogo?.mimeType,
      clearLogo: clearLogo && !pendingLogo,
    };
  }

  async function persist(): Promise<boolean> {
    if (!headerText.trim()) {
      setError("Header text is required.");
      return false;
    }
    const res = await saveDocumentTemplate(buildSaveInput());
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    applySetup(res.data, activeKey);
    return true;
  }

  async function handleSaveOnly() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persist())) return;
      setSuccess("Template saved.");
    } catch {
      setError("Could not save template.");
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
      const draft = await saveSetupDraft("documents");
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
      const done = await completeSetupStep("documents");
      if (!done.ok) {
        setError(done.error);
        return;
      }
      await refreshProgress();
      const next = getNextSetupHref("documents");
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
        Loading document templates…
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
        title="Document templates"
        description="Configure official school documents. Each template controls how generated documents look."
        layout="stack"
      >
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TEMPLATE_SHORT_LABELS) as DocumentTemplateKey[]).map(
            (key) => {
              const t = templates.find((x) => x.template_key === key);
              const selected = activeKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectTemplate(key)}
                  className={`cursor-pointer rounded-xl border px-3.5 py-2 text-left text-sm transition ${
                    selected
                      ? "border-(--sofia-primary)/40 bg-(--sofia-primary)/5 font-semibold text-(--sofia-primary)"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span className="block">{TEMPLATE_SHORT_LABELS[key]}</span>
                  {t && !t.is_enabled ? (
                    <span className="text-[10px] font-medium text-slate-400">
                      Disabled
                    </span>
                  ) : null}
                </button>
              );
            },
          )}
        </div>
      </FormSection>

      {active ? (
        <>
          <FormSection
            title={active.title}
            description="Toggle whether this document type is used, and brand its layout."
            layout="stack"
          >
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  Enable template
                </span>
                <span className="text-xs text-slate-500">
                  Disabled templates are not offered when generating documents.
                </span>
              </span>
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-(--sofia-primary)"
              />
            </label>
          </FormSection>

          <FormSection
            title="Logo"
            description="Override the school logo for this document, or use the School Profile logo."
            layout="stack"
          >
            <FileUploadField
              label="Document logo"
              hint="Optional. Leave empty to use the school logo."
              previewUrl={
                clearLogo
                  ? schoolLogoUrl
                  : (pendingLogo?.preview ?? logoPreview)
              }
              onFile={(file) => void onLogoFile(file)}
            />
            {(hasCustomLogo || pendingLogo) && !clearLogo ? (
              <button
                type="button"
                onClick={useSchoolLogo}
                className="cursor-pointer text-sm font-medium text-(--sofia-primary) hover:underline"
              >
                Use school logo instead
              </button>
            ) : null}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showLogo}
                onChange={(e) => setShowLogo(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-(--sofia-primary)"
              />
              Show logo on document
            </label>
          </FormSection>

          <FormSection title="Header & footer" layout="stack">
            <FormField
              label="Header text"
              required
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              placeholder="e.g. Official Term Report Card"
            />
            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Footer text
              </span>
              <textarea
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                className={textareaClass}
                placeholder="Appears at the bottom of the document"
                rows={3}
              />
            </label>
          </FormSection>

          <FormSection
            title="Signatures & stamp"
            description="Uses signature and stamp images from School Profile when available."
            layout="stack"
          >
            <FormField
              label="Signature label"
              value={signatureLabel}
              onChange={(e) => setSignatureLabel(e.target.value)}
              placeholder="Principal"
            />
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={showSignature}
                  onChange={(e) => setShowSignature(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-(--sofia-primary)"
                />
                Show signature line
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={showStamp}
                  onChange={(e) => setShowStamp(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-(--sofia-primary)"
                />
                Show official stamp
              </label>
            </div>
          </FormSection>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSaveOnly()}
              disabled={saving}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-(--sofia-primary) hover:text-(--sofia-primary) disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Template"}
            </button>
          </div>
        </>
      ) : null}

      <SetupFooter
        stepId="documents"
        onSaveDraft={() => void handleSaveDraft()}
        onContinue={() => void handleContinue()}
        saving={saving}
        draftSaving={draftSaving}
      />
    </div>
  );
}
