import React from "react";
import {
  Copy01Icon,
  PauseIcon,
  PencilEdit01Icon,
  StarIcon,
  Tick02Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  FormModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StudentTable,
  TableSelectionBar,
  fieldClass,
  selectClass,
} from "../students/ui";
import { TableActionGroup, TableIconButton } from "../ui/TableActions";
import type {
  DocumentFamily,
  DocumentTemplateDto,
  DocumentsMeta,
  GeneratePayload,
} from "../../lib/documents-mgmt";

export {
  EmptyRow,
  FilterBar,
  FilterField,
  FormModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StudentTable,
  TableSelectionBar,
  fieldClass,
  selectClass,
};

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ key: T; label: string }>;
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold ${
            value === t.key
              ? "bg-(--sofia-primary) text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function DocumentHtml({ html, css }: { html: string; css?: string }) {
  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white p-6">
      {css ? <style>{css}</style> : null}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export function VariableList({
  variables,
}: {
  variables: Array<{ key: string; label: string }>;
}) {
  if (!variables.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {variables.map((v) => (
        <code
          key={v.key}
          className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
          title={v.label}
        >
          {`{{${v.key}}}`}
        </code>
      ))}
    </div>
  );
}

export function GenerateDocumentModal({
  open,
  family,
  title,
  meta,
  templates,
  busy,
  onClose,
  onPreview,
  onGenerate,
  extra,
}: {
  open: boolean;
  family: DocumentFamily;
  title: string;
  meta: DocumentsMeta | null;
  templates: DocumentTemplateDto[];
  busy?: boolean;
  onClose: () => void;
  onPreview: (payload: GeneratePayload) => void;
  onGenerate: (payload: GeneratePayload) => void;
  extra?: React.ReactNode;
}) {
  const active = templates.filter((t) => t.is_enabled === 1);
  const [templateId, setTemplateId] = React.useState("");
  const [studentId, setStudentId] = React.useState("");
  const [yearId, setYearId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [customText, setCustomText] = React.useState("");
  const [recipient, setRecipient] = React.useState("");
  const [conditions, setConditions] = React.useState(
    "Admission is subject to payment of fees and completion of registration.",
  );
  const [reportingDate, setReportingDate] = React.useState("");
  const [scope, setScope] = React.useState<"current" | "selected" | "history">(
    "current",
  );

  React.useEffect(() => {
    if (!open) return;
    const def =
      active.find((t) => t.is_default === 1)?.id || active[0]?.id || "";
    setTemplateId(def);
    const year =
      meta?.years.find((y) => y.is_current)?.id || meta?.years[0]?.id || "";
    setYearId(year);
  }, [open, templates, meta]);

  const students = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (meta?.students ?? []).filter((s) => {
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.student_code ?? "").toLowerCase().includes(q)
      );
    });
  }, [meta, query]);

  const payload = (): GeneratePayload => ({
    template_id: templateId,
    student_id: studentId,
    academic_year_id: yearId || null,
    term_id: termId || null,
    reason: reason || null,
    custom_text: customText || null,
    recipient: recipient || null,
    conditions: family === "admission_letter" ? conditions || null : null,
    reporting_date: family === "admission_letter" ? reportingDate || null : null,
    transcript_scope: family === "transcript" ? scope : undefined,
  });

  const ready = Boolean(templateId && studentId);

  return (
    <FormModal
      open={open}
      title={title}
      subtitle="Student and school fields come from existing records."
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <SecondaryButton
            disabled={!ready || busy}
            onClick={() => onPreview(payload())}
          >
            Preview
          </SecondaryButton>
          <PrimaryButton
            disabled={!ready || busy}
            onClick={() => onGenerate(payload())}
          >
            {busy ? "Working…" : "Generate"}
          </PrimaryButton>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FilterField label="Document type" className="sm:col-span-2">
          <select
            className={selectClass}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {active.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Search student">
          <input
            className={fieldClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or student ID"
          />
        </FilterField>
        <FilterField label="Student">
          <select
            className={selectClass}
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">Select…</option>
            {students.slice(0, 80).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.student_code ? `(${s.student_code})` : ""}
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
        {family === "transcript" ? (
          <>
            <FilterField label="Coverage">
              <select
                className={selectClass}
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value as "current" | "selected" | "history")
                }
              >
                <option value="current">Current academic year</option>
                <option value="selected">Selected year / term</option>
                <option value="history">Complete academic history</option>
              </select>
            </FilterField>
            <FilterField label="Term (optional)">
              <select
                className={selectClass}
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              >
                <option value="">All terms</option>
                {(meta?.terms ?? [])
                  .filter((t) => !yearId || t.academic_year_id === yearId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </FilterField>
          </>
        ) : null}
        {family === "certificate" || family === "official" ? (
          <>
            <FilterField label="Reason / description" className="sm:col-span-2">
              <input
                className={fieldClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </FilterField>
            <FilterField label="Additional notes" className="sm:col-span-2">
              <textarea
                className={`${fieldClass} min-h-20`}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
              />
            </FilterField>
          </>
        ) : null}
        {family === "official" ? (
          <FilterField label="Recipient" className="sm:col-span-2">
            <input
              className={fieldClass}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="To whom it may concern"
            />
          </FilterField>
        ) : null}
        {family === "admission_letter" ? (
          <>
            <FilterField label="Reporting date">
              <input
                type="date"
                className={fieldClass}
                value={reportingDate}
                onChange={(e) => setReportingDate(e.target.value)}
              />
            </FilterField>
            <FilterField label="Admission conditions" className="sm:col-span-2">
              <textarea
                className={`${fieldClass} min-h-20`}
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
              />
            </FilterField>
          </>
        ) : null}
        {extra}
      </div>
    </FormModal>
  );
}

export function TemplateList({
  templates,
  canManage,
  busy,
  onEdit,
  onDuplicate,
  onDefault,
  onToggle,
}: {
  templates: DocumentTemplateDto[];
  canManage: boolean;
  busy?: boolean;
  onEdit: (t: DocumentTemplateDto) => void;
  onDuplicate: (id: string) => void;
  onDefault: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  return (
    <StudentTable
      columns={["Name", "Code", "Category", "Status", "Actions"]}
      loading={false}
    >
      {templates.length === 0 ? (
        <EmptyRow colSpan={5} message="No templates yet." />
      ) : (
        templates.map((t) => (
          <tr key={t.id}>
            <td className="px-4 py-3">
              <p className="font-medium text-slate-900">{t.title}</p>
              <p className="text-xs text-slate-500">{t.description}</p>
            </td>
            <td className="px-4 py-3 font-mono text-xs">{t.type_code}</td>
            <td className="px-4 py-3 capitalize">{t.category}</td>
            <td className="px-4 py-3">
              <StatusBadge
                status={t.is_enabled ? "active" : "inactive"}
                label={
                  t.is_default
                    ? "Default"
                    : t.is_enabled
                      ? "Active"
                      : "Inactive"
                }
              />
            </td>
            <td className="px-4 py-3">
              <TableActionGroup>
                <TableIconButton
                  icon={canManage ? PencilEdit01Icon : ViewIcon}
                  label={canManage ? "Edit" : "View"}
                  tone="primary"
                  onClick={() => onEdit(t)}
                />
                {canManage ? (
                  <>
                    <TableIconButton
                      icon={Copy01Icon}
                      label="Duplicate"
                      disabled={busy}
                      onClick={() => onDuplicate(t.id)}
                    />
                    {t.is_default !== 1 && t.is_enabled === 1 ? (
                      <TableIconButton
                        icon={StarIcon}
                        label="Set default"
                        disabled={busy}
                        onClick={() => onDefault(t.id)}
                      />
                    ) : null}
                    <TableIconButton
                      icon={t.is_enabled ? PauseIcon : Tick02Icon}
                      label={t.is_enabled ? "Deactivate" : "Activate"}
                      tone={t.is_enabled ? "warning" : "primary"}
                      disabled={busy}
                      onClick={() => onToggle(t.id, t.is_enabled !== 1)}
                    />
                  </>
                ) : null}
              </TableActionGroup>
            </td>
          </tr>
        ))
      )}
    </StudentTable>
  );
}

export function printHref(id: string) {
  return `/documents/print/${id}`;
}

export function OpenPrintLink({ id }: { id: string }) {
  return (
    <TableIconButton
      icon={ViewIcon}
      label="View"
      tone="primary"
      href={printHref(id)}
    />
  );
}

export function TemplateEditorModal({
  open,
  family,
  template,
  variables,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  family: DocumentFamily;
  template: DocumentTemplateDto | null;
  variables: Array<{ key: string; label: string }>;
  busy?: boolean;
  onClose: () => void;
  onSave: (input: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [typeCode, setTypeCode] = React.useState("");
  const [category, setCategory] = React.useState("administrative");
  const [pattern, setPattern] = React.useState(
    "{SCHOOL_CODE}/{TYPE}/{YEAR}/{SEQUENCE}",
  );
  const [header, setHeader] = React.useState("");
  const [footer, setFooter] = React.useState("");
  const [body, setBody] = React.useState("");
  const [signatoryRole, setSignatoryRole] = React.useState("principal");
  const [signatureLabel, setSignatureLabel] = React.useState("Principal");
  const [isDefault, setIsDefault] = React.useState(false);
  const [requiresApproval, setRequiresApproval] = React.useState(false);
  const [showLogo, setShowLogo] = React.useState(true);
  const [showStamp, setShowStamp] = React.useState(true);
  const [showSignature, setShowSignature] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? "");
    setDescription(template?.description ?? "");
    setTypeCode(template?.type_code ?? "");
    setCategory(template?.category ?? "administrative");
    setPattern(
      template?.number_pattern ?? "{SCHOOL_CODE}/{TYPE}/{YEAR}/{SEQUENCE}",
    );
    setHeader(template?.header_text ?? "");
    setFooter(template?.footer_text ?? "");
    setBody(template?.body_text ?? "");
    setSignatoryRole(template?.signatory_role ?? "principal");
    setSignatureLabel(template?.signature_label ?? "Principal");
    setIsDefault(template?.is_default === 1);
    setRequiresApproval(template?.requires_approval === 1);
    setShowLogo(template ? template.show_logo === 1 : true);
    setShowStamp(template ? template.show_stamp === 1 : true);
    setShowSignature(template ? template.show_signature === 1 : true);
  }, [open, template]);

  return (
    <FormModal
      open={open}
      title={template ? `Edit ${template.title}` : "New document type"}
      subtitle="Only approved {{variables}} are replaced. HTML is sanitized on render."
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            disabled={!title.trim() || busy}
            onClick={() =>
              onSave({
                id: template?.id,
                title,
                description,
                header_text: header,
                footer_text: footer,
                body_text: body,
                document_family: family,
                type_code: typeCode,
                category,
                number_pattern: pattern,
                signatory_role: signatoryRole,
                signature_label: signatureLabel,
                is_default: isDefault,
                requires_approval: requiresApproval,
                show_logo: showLogo,
                show_stamp: showStamp,
                show_signature: showSignature,
                is_enabled: true,
              })
            }
          >
            {busy ? "Saving…" : "Save template"}
          </PrimaryButton>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FilterField label="Name" className="sm:col-span-2">
          <input
            className={fieldClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FilterField>
        <FilterField label="Description" className="sm:col-span-2">
          <input
            className={fieldClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FilterField>
        <FilterField label="Type code">
          <input
            className={fieldClass}
            value={typeCode}
            onChange={(e) => setTypeCode(e.target.value.toUpperCase())}
            placeholder="ADM"
          />
        </FilterField>
        <FilterField label="Category">
          <select
            className={selectClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="academic">Academic</option>
            <option value="administrative">Administrative</option>
            <option value="student">Student</option>
            <option value="finance">Finance</option>
            <option value="other">Other</option>
          </select>
        </FilterField>
        <FilterField label="Number pattern" className="sm:col-span-2">
          <input
            className={fieldClass}
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
          />
        </FilterField>
        <FilterField label="Signatory">
          <select
            className={selectClass}
            value={signatoryRole}
            onChange={(e) => setSignatoryRole(e.target.value)}
          >
            <option value="principal">Principal</option>
            <option value="headteacher">Headteacher</option>
            <option value="registrar">Registrar</option>
            <option value="bursar">Bursar</option>
          </select>
        </FilterField>
        <FilterField label="Signature label">
          <input
            className={fieldClass}
            value={signatureLabel}
            onChange={(e) => setSignatureLabel(e.target.value)}
          />
        </FilterField>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Set as default for this type
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={requiresApproval}
            onChange={(e) => setRequiresApproval(e.target.checked)}
          />
          Require issue after generate
        </label>
        <div className="flex flex-wrap gap-4 sm:col-span-2 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showLogo}
              onChange={(e) => setShowLogo(e.target.checked)}
            />
            Logo
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showStamp}
              onChange={(e) => setShowStamp(e.target.checked)}
            />
            Stamp
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showSignature}
              onChange={(e) => setShowSignature(e.target.checked)}
            />
            Signature
          </label>
        </div>
        <FilterField label="Header" className="sm:col-span-2">
          <textarea
            className={`${fieldClass} min-h-16`}
            value={header}
            onChange={(e) => setHeader(e.target.value)}
          />
        </FilterField>
        <FilterField label="Body (HTML + variables)" className="sm:col-span-2">
          <textarea
            className={`${fieldClass} min-h-40 font-mono text-xs`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </FilterField>
        <FilterField label="Footer" className="sm:col-span-2">
          <textarea
            className={`${fieldClass} min-h-16`}
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
          />
        </FilterField>
        <div className="sm:col-span-2">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Approved variables
          </p>
          <VariableList variables={variables} />
        </div>
      </div>
    </FormModal>
  );
}
