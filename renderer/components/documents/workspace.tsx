import React from "react";
import Link from "next/link";
import {
  BanIcon,
  CheckmarkCircle02Icon,
  PrinterIcon,
  RefreshIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../layout/AppShell";
import {
  DocumentHtml,
  EmptyRow,
  FilterBar,
  FilterField,
  FormModal,
  GenerateDocumentModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StudentTable,
  TabBar,
  TableSelectionBar,
  TemplateEditorModal,
  TemplateList,
  fieldClass,
  printHref,
  selectClass,
} from "./ui";
import { TableActionGroup, TableIconButton } from "../ui/TableActions";
import { formatDisplayDate } from "../../lib/date-format";
import {
  duplicateDocumentTemplate,
  fetchDocumentTemplates,
  fetchDocumentVariables,
  fetchDocumentsMeta,
  fetchIssuedDocuments,
  generateDocument,
  generateDocumentsBulk,
  issueDocument,
  previewDocument,
  regenerateDocument,
  saveDocumentType,
  setDefaultDocumentTemplate,
  setDocumentTemplateActive,
  voidDocument,
  type DocumentFamily,
  type DocumentTemplateDto,
  type DocumentsMeta,
  type GeneratePayload,
  type IssuedDocumentDto,
} from "../../lib/documents-mgmt";

const COPY: Record<
  DocumentFamily,
  { title: string; subtitle: string; crumb: string; generate: string }
> = {
  admission_letter: {
    title: "Admission Letters",
    subtitle: "Generate and manage official admission letters.",
    crumb: "Admission Letters",
    generate: "Generate Admission Letter",
  },
  certificate: {
    title: "Certificates",
    subtitle: "Issue school certificates from configurable types.",
    crumb: "Certificates",
    generate: "Generate Certificate",
  },
  transcript: {
    title: "Academic Transcripts",
    subtitle: "Generate official academic transcripts from finalized results.",
    crumb: "Transcripts",
    generate: "Generate Transcript",
  },
  receipt: {
    title: "Receipt Templates",
    subtitle:
      "Customize how Finance & Fees receipts look. Payments are still recorded under Finance.",
    crumb: "Receipt Templates",
    generate: "Preview with student",
  },
  official: {
    title: "Official Documents",
    subtitle:
      "Enrollment letters, recommendations, and other school correspondence.",
    crumb: "Official Documents",
    generate: "Generate Document",
  },
  report_card: {
    title: "Report cards",
    subtitle: "Report card templates.",
    crumb: "Report cards",
    generate: "Generate",
  },
};

function fmtDate(value?: string | null) {
  return formatDisplayDate(value);
}

export function DocumentsWorkspace({ family }: { family: DocumentFamily }) {
  const copy = COPY[family];
  const usesTypes =
    family === "certificate" || family === "official" || family === "receipt";
  const [tab, setTab] = React.useState<"issued" | "types">(
    family === "receipt" ? "types" : "issued",
  );
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<DocumentsMeta | null>(null);
  const [templates, setTemplates] = React.useState<DocumentTemplateDto[]>([]);
  const [rows, setRows] = React.useState<IssuedDocumentDto[]>([]);
  const [yearId, setYearId] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [sectionId, setSectionId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [genOpen, setGenOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DocumentTemplateDto | null>(
    null,
  );
  const [variables, setVariables] = React.useState<
    Array<{ key: string; label: string }>
  >([]);
  const [preview, setPreview] = React.useState<{
    html: string;
    warnings: string[];
  } | null>(null);

  const canGenerate = meta?.can_generate ?? false;
  const canManage = meta?.can_manage ?? false;
  const canReceipts = meta?.can_receipts ?? false;
  const manageOk = family === "receipt" ? canReceipts : canManage;

  const load = React.useCallback(async () => {
    setError("");
    const [metaRes, tplRes, listRes, varRes] = await Promise.all([
      fetchDocumentsMeta(),
      fetchDocumentTemplates(family),
      family === "receipt"
        ? Promise.resolve({ ok: true as const, data: { documents: [] } })
        : fetchIssuedDocuments({
            family,
            academic_year_id: yearId || undefined,
            class_id: classId || undefined,
            section_id: sectionId || undefined,
            status: status || undefined,
            from: from || undefined,
            to: to || undefined,
          }),
      fetchDocumentVariables(family),
    ]);
    if (metaRes.ok) setMeta(metaRes.data);
    else setError(metaRes.error);
    if (tplRes.ok) setTemplates(tplRes.data.templates);
    else setError(tplRes.error);
    if (listRes.ok) setRows(listRes.data.documents);
    else if (!listRes.ok) setError(listRes.error);
    if (varRes.ok) setVariables(varRes.data.variables);
    setLoading(false);
  }, [family, yearId, classId, sectionId, status, from, to]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.student_name ?? "").toLowerCase().includes(q) ||
        (r.student_code ?? "").toLowerCase().includes(q) ||
        r.document_number.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const allSelected =
    filtered.length > 0 && selectedIds.length === filtered.length;
  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(filtered.map((r) => r.id));
  }
  async function bulkIssue() {
    const toIssue = filtered.filter(
      (r) => selectedIds.includes(r.id) && r.status === "generated",
    );
    if (!toIssue.length) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      for (const row of toIssue) {
        await issueDocument(row.id);
      }
      setSuccess(`${toIssue.length} document(s) issued.`);
      setSelectedIds([]);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function bulkVoid() {
    const toVoid = filtered.filter(
      (r) =>
        selectedIds.includes(r.id) &&
        r.status !== "voided" &&
        r.status !== "superseded",
    );
    if (!toVoid.length) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      for (const row of toVoid) {
        await voidDocument(row.id);
      }
      setSuccess(`${toVoid.length} document(s) voided.`);
      setSelectedIds([]);
      await load();
    } finally {
      setBusy(false);
    }
  }
  function exportSelected() {
    const target = filtered.filter((r) => selectedIds.includes(r.id));
    if (!target.length) return;
    const csv = [
      ["Document Number", "Student", "Code", "Template", "Status", "Date"].join(","),
      ...target.map((r) =>
        [
          `"${r.document_number}"`,
          `"${r.student_name || ""}"`,
          `"${r.student_code || ""}"`,
          `"${r.template_title || ""}"`,
          `"${r.status}"`,
          `"${fmtDate(r.created_at)}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${family}-documents-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runPreview(payload: GeneratePayload) {
    setBusy(true);
    setError("");
    try {
      const res = await previewDocument(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview({ html: res.data.html, warnings: res.data.warnings });
    } finally {
      setBusy(false);
    }
  }

  async function runGenerate(payload: GeneratePayload) {
    setBusy(true);
    setError("");
    try {
      const res = await generateDocument(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Generated ${res.data.document_number}.`);
      setGenOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveTemplate(input: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await saveDocumentType(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditorOpen(false);
      setEditing(null);
      setSuccess("Template saved.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleAction(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ) {
    setBusy(true);
    setError("");
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error || "Failed.");
        return;
      }
      setSuccess(okMsg);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const defaultTpl = templates.find(
    (t) => t.is_default === 1 && t.is_enabled === 1,
  );

  return (
    <AppShell
      title={copy.title}
      breadcrumb={["Documents", copy.crumb]}
      heading={copy.title}
      subtitle={copy.subtitle}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {family === "receipt" ? (
          <>
            {manageOk ? (
              <PrimaryButton
                onClick={() => {
                  setEditing(null);
                  setEditorOpen(true);
                }}
              >
                New template
              </PrimaryButton>
            ) : null}
            <SecondaryButton onClick={() => setGenOpen(true)}>
              Preview with student
            </SecondaryButton>
          </>
        ) : (
          canGenerate && (
            <>
              {family === "admission_letter" ? (
                <SecondaryButton onClick={() => setBulkOpen(true)}>
                  Bulk generate
                </SecondaryButton>
              ) : null}
              {usesTypes && manageOk ? (
                <SecondaryButton
                  onClick={() => {
                    setEditing(null);
                    setEditorOpen(true);
                  }}
                >
                  New type
                </SecondaryButton>
              ) : null}
              <PrimaryButton onClick={() => setGenOpen(true)}>
                {copy.generate}
              </PrimaryButton>
            </>
          )
        )}
      </div>
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}
      {family === "transcript" ? (
        <PageAlert tone="warning">
          Official transcripts include only published or locked results. Draft
          and unapproved runs are omitted with a notice on the document.
        </PageAlert>
      ) : null}

      {usesTypes ? (
        <TabBar
          tabs={
            family === "receipt"
              ? [{ key: "types" as const, label: "Templates" }]
              : [
                  {
                    key: "issued" as const,
                    label:
                      family === "certificate"
                        ? "Issued certificates"
                        : "Issued documents",
                  },
                  {
                    key: "types" as const,
                    label:
                      family === "certificate"
                        ? "Certificate types"
                        : "Document types",
                  },
                ]
          }
          value={family === "receipt" ? "types" : tab}
          onChange={setTab}
        />
      ) : null}

      {family === "receipt" && defaultTpl ? (
        <p className="mb-4 text-sm text-slate-600">
          Default template: <strong>{defaultTpl.title}</strong>. Finance
          receipts at{" "}
          <Link href="/finance/receipts" className="text-(--sofia-primary)">
            /finance/receipts
          </Link>{" "}
          use this layout.
        </p>
      ) : null}

      {tab === "issued" && family !== "receipt" ? (
        <>
          <FilterBar
            filters={
              <>
                <FilterField label="Search">
                  <input
                    className={fieldClass}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Student or document number"
                  />
                </FilterField>
                <FilterField label="Academic year">
                  <select
                    className={selectClass}
                    value={yearId}
                    onChange={(e) => setYearId(e.target.value)}
                  >
                    <option value="">All years</option>
                    {(meta?.years ?? []).map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField label="Class">
                  <select
                    className={selectClass}
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                  >
                    <option value="">All classes</option>
                    {(meta?.classes ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField label="Department">
                  <select
                    className={selectClass}
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                  >
                    <option value="">All</option>
                    {(meta?.sections ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField label="Status">
                  <select
                    className={selectClass}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="generated">Generated</option>
                    <option value="issued">Issued</option>
                    <option value="voided">Voided</option>
                    <option value="superseded">Superseded</option>
                  </select>
                </FilterField>
                <FilterField label="From">
                  <input
                    type="date"
                    className={fieldClass}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </FilterField>
                <FilterField label="To">
                  <input
                    type="date"
                    className={fieldClass}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </FilterField>
              </>
            }
          />

          <StudentTable
            columns={[
              <input
                key="select-all"
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el)
                    el.indeterminate =
                      selectedIds.length > 0 && !allSelected;
                }}
                onChange={toggleAll}
                aria-label="Select all"
              />,
              ...(family === "admission_letter"
                ? [
                    "Student",
                    "Student ID",
                    "Class",
                    "Academic Year",
                    "Admission Date",
                    "Status",
                    "Generated",
                    "Actions",
                  ]
                : family === "certificate"
                  ? [
                      "Certificate Number",
                      "Student",
                      "Certificate Type",
                      "Academic Year",
                      "Issue Date",
                      "Status",
                      "Actions",
                    ]
                  : family === "transcript"
                    ? [
                        "Student",
                        "Student ID",
                        "Academic Period",
                        "Document Number",
                        "Generated Date",
                        "Status",
                        "Actions",
                      ]
                    : [
                        "Document Number",
                        "Document Type",
                        "Student / Recipient",
                        "Date",
                        "Status",
                        "Generated By",
                        "Actions",
                      ]),
            ]}
            loading={loading}
          >
            {filtered.length === 0 ? (
              <EmptyRow
                colSpan={9}
                message={loading ? "Loading…" : "No documents yet."}
              />
            ) : (
              filtered.map((row) => (
                <IssuedRow
                  key={row.id}
                  family={family}
                  row={row}
                  canGenerate={canGenerate}
                  canManage={manageOk}
                  busy={busy}
                  selected={selectedIds.includes(row.id)}
                  onToggle={() => toggleRow(row.id)}
                  onIssue={() =>
                    void handleAction(
                      () => issueDocument(row.id),
                      "Document issued.",
                    )
                  }
                  onVoid={() =>
                    void handleAction(
                      () => voidDocument(row.id),
                      "Document voided.",
                    )
                  }
                  onRegen={() =>
                    void handleAction(
                      () => regenerateDocument(row.id),
                      "New version generated. Previous copy kept as superseded.",
                    )
                  }
                />
              ))
            )}
          </StudentTable>

          <TableSelectionBar
            totalCount={filtered.length}
            selectedCount={selectedIds.length}
            allSelected={allSelected}
            onToggleAll={toggleAll}
            onClear={() => setSelectedIds([])}
            actions={
              <>
                {canGenerate ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void bulkIssue()}
                    className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    Issue selected
                  </button>
                ) : null}
                {manageOk ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void bulkVoid()}
                    className="cursor-pointer rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    Void selected
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={exportSelected}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Export selected ({selectedIds.length})
                </button>
              </>
            }
          />
        </>
      ) : (
        <TemplateList
          templates={templates}
          canManage={manageOk}
          busy={busy}
          onEdit={(t) => {
            setEditing(t);
            setEditorOpen(true);
          }}
          onDuplicate={(id) =>
            void handleAction(
              () => duplicateDocumentTemplate(id),
              "Template duplicated.",
            )
          }
          onDefault={(id) =>
            void handleAction(
              () => setDefaultDocumentTemplate(id),
              "Default template updated.",
            )
          }
          onToggle={(id, enabled) =>
            void handleAction(
              () => setDocumentTemplateActive(id, enabled),
              enabled ? "Template activated." : "Template deactivated.",
            )
          }
        />
      )}

      <GenerateDocumentModal
        open={genOpen}
        family={family === "receipt" ? "receipt" : family}
        title={copy.generate}
        meta={meta}
        templates={templates}
        busy={busy}
        onClose={() => setGenOpen(false)}
        onPreview={(p) => void runPreview(p)}
        onGenerate={(p) =>
          family === "receipt" ? void runPreview(p) : void runGenerate(p)
        }
      />

      <TemplateEditorModal
        open={editorOpen}
        family={family}
        template={editing}
        variables={variables}
        busy={busy}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSave={(input) => void handleSaveTemplate(input)}
      />

      {family === "admission_letter" ? (
        <BulkModal
          open={bulkOpen}
          meta={meta}
          templates={templates}
          busy={busy}
          onClose={() => setBulkOpen(false)}
          onRun={async (payload) => {
            setBusy(true);
            setError("");
            try {
              const res = await generateDocumentsBulk(payload);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setSuccess(
                `Generated ${res.data.created.length} letter(s)${
                  res.data.errors.length
                    ? `, ${res.data.errors.length} failed`
                    : ""
                }.`,
              );
              setBulkOpen(false);
              await load();
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      <FormModal
        open={Boolean(preview)}
        title="Preview"
        onClose={() => setPreview(null)}
        size="xl"
        footer={
          <div className="flex justify-end">
            <SecondaryButton onClick={() => setPreview(null)}>
              Close
            </SecondaryButton>
          </div>
        }
      >
        {preview?.warnings.map((w) => (
          <PageAlert key={w} tone="warning">
            {w}
          </PageAlert>
        ))}
        {preview ? (
          <DocumentHtml html={preview.html} css={meta?.print_css} />
        ) : null}
      </FormModal>
    </AppShell>
  );
}

function IssuedRow({
  family,
  row,
  canGenerate,
  canManage,
  busy,
  selected,
  onToggle,
  onIssue,
  onVoid,
  onRegen,
}: {
  family: DocumentFamily;
  row: IssuedDocumentDto;
  canGenerate: boolean;
  canManage: boolean;
  busy: boolean;
  selected: boolean;
  onToggle: () => void;
  onIssue: () => void;
  onVoid: () => void;
  onRegen: () => void;
}) {
  const actions = (
    <TableActionGroup>
      <TableIconButton
        icon={ViewIcon}
        label="View"
        tone="primary"
        href={printHref(row.id)}
      />
      <TableIconButton
        icon={PrinterIcon}
        label="Print / PDF"
        href={printHref(row.id)}
      />
      {canGenerate && row.status !== "voided" && row.status !== "superseded" ? (
        <TableIconButton
          icon={RefreshIcon}
          label="Regenerate"
          disabled={busy}
          onClick={onRegen}
        />
      ) : null}
      {canGenerate && row.status === "generated" ? (
        <TableIconButton
          icon={CheckmarkCircle02Icon}
          label="Issue"
          tone="primary"
          disabled={busy}
          onClick={onIssue}
        />
      ) : null}
      {canManage && row.status !== "voided" && row.status !== "superseded" ? (
        <TableIconButton
          icon={BanIcon}
          label="Void"
          tone="danger"
          disabled={busy}
          onClick={onVoid}
        />
      ) : null}
    </TableActionGroup>
  );

  const checkboxCell = (
    <td className="px-4 py-3">
      <input type="checkbox" checked={selected} onChange={onToggle} />
    </td>
  );

  if (family === "admission_letter") {
    return (
      <tr>
        {checkboxCell}
        <td className="px-4 py-3 font-medium">{row.student_name ?? "—"}</td>
        <td className="px-4 py-3 font-mono text-xs">
          {row.student_code ?? "—"}
        </td>
        <td className="px-4 py-3">{row.class_name ?? "—"}</td>
        <td className="px-4 py-3">{row.year_name ?? "—"}</td>
        <td className="px-4 py-3">{fmtDate(row.admission_date)}</td>
        <td className="px-4 py-3">
          <StatusBadge status={row.status} />
        </td>
        <td className="px-4 py-3 text-sm text-slate-600">
          {fmtDate(row.created_at)}
          {row.generated_by_email ? (
            <span className="block text-xs">{row.generated_by_email}</span>
          ) : null}
        </td>
        <td className="px-4 py-3">{actions}</td>
      </tr>
    );
  }

  if (family === "certificate") {
    return (
      <tr>
        {checkboxCell}
        <td className="px-4 py-3 font-mono text-xs">{row.document_number}</td>
        <td className="px-4 py-3">{row.student_name ?? "—"}</td>
        <td className="px-4 py-3">{row.template_title ?? "—"}</td>
        <td className="px-4 py-3">{row.year_name ?? "—"}</td>
        <td className="px-4 py-3">
          {fmtDate(row.issued_at || row.created_at)}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={row.status} />
        </td>
        <td className="px-4 py-3">{actions}</td>
      </tr>
    );
  }

  if (family === "transcript") {
    return (
      <tr>
        {checkboxCell}
        <td className="px-4 py-3 font-medium">{row.student_name ?? "—"}</td>
        <td className="px-4 py-3 font-mono text-xs">
          {row.student_code ?? "—"}
        </td>
        <td className="px-4 py-3">{row.year_name ?? "Full history"}</td>
        <td className="px-4 py-3 font-mono text-xs">{row.document_number}</td>
        <td className="px-4 py-3">{fmtDate(row.created_at)}</td>
        <td className="px-4 py-3">
          <StatusBadge status={row.status} />
        </td>
        <td className="px-4 py-3">{actions}</td>
      </tr>
    );
  }

  return (
    <tr>
      {checkboxCell}
      <td className="px-4 py-3 font-mono text-xs">{row.document_number}</td>
      <td className="px-4 py-3">{row.template_title ?? "—"}</td>
      <td className="px-4 py-3">{row.student_name ?? "—"}</td>
      <td className="px-4 py-3">{fmtDate(row.created_at)}</td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-4 py-3 text-xs">{row.generated_by_email ?? "—"}</td>
      <td className="px-4 py-3">{actions}</td>
    </tr>
  );
}

function BulkModal({
  open,
  meta,
  templates,
  busy,
  onClose,
  onRun,
}: {
  open: boolean;
  meta: DocumentsMeta | null;
  templates: DocumentTemplateDto[];
  busy?: boolean;
  onClose: () => void;
  onRun: (
    payload: Omit<GeneratePayload, "student_id"> & { student_ids: string[] },
  ) => void;
}) {
  const active = templates.filter((t) => t.is_enabled === 1);
  const [templateId, setTemplateId] = React.useState("");
  const [yearId, setYearId] = React.useState("");
  const [selectedClasses, setSelectedClasses] = React.useState<string[]>([]);
  const [selectedStudents, setSelectedStudents] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setTemplateId(active.find((t) => t.is_default)?.id || active[0]?.id || "");
    setYearId(
      meta?.years.find((y) => y.is_current)?.id || meta?.years[0]?.id || "",
    );
  }, [open, templates, meta]);

  const inClasses = (meta?.students ?? []).filter(
    (s) => selectedClasses.length === 0 || selectedClasses.includes(s.class_id),
  );

  function toggleClass(id: string) {
    setSelectedClasses((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleStudent(id: string) {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const ids =
    selectedStudents.length > 0
      ? selectedStudents
      : inClasses
          .filter((s) => selectedClasses.includes(s.class_id))
          .map((s) => s.id);

  return (
    <FormModal
      open={open}
      title="Bulk admission letters"
      subtitle="Each student receives a personalized letter. Nothing is shared as a generic copy."
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            disabled={!templateId || ids.length === 0 || busy}
            onClick={() =>
              onRun({
                template_id: templateId,
                student_ids: ids,
                academic_year_id: yearId || null,
              })
            }
          >
            {busy ? "Working…" : `Generate ${ids.length} letter(s)`}
          </PrimaryButton>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FilterField label="Template" className="sm:col-span-2">
          <select
            className={selectClass}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {active.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Academic year">
          <select
            className={selectClass}
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
          >
            {(meta?.years ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </FilterField>
        <div className="sm:col-span-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Classes
          </p>
          <div className="flex flex-wrap gap-2">
            {(meta?.classes ?? []).map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedClasses.includes(c.id)}
                  onChange={() => toggleClass(c.id)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2 max-h-48 overflow-auto rounded-lg border border-slate-200">
          {(selectedClasses.length ? inClasses : []).slice(0, 200).map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-0"
            >
              <input
                type="checkbox"
                checked={selectedStudents.includes(s.id)}
                onChange={() => toggleStudent(s.id)}
              />
              {s.name} {s.student_code ? `(${s.student_code})` : ""}
            </label>
          ))}
          {selectedClasses.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">
              Select one or more classes, or tick individual students after
              selecting classes.
            </p>
          ) : null}
        </div>
      </div>
    </FormModal>
  );
}
