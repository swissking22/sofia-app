import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../../components/layout/AppShell";
import { IdCardModuleNav } from "../../../../components/id-cards/ModuleNav";
import { IdCardDesigner } from "../../../../components/id-cards/Designer";
import { ConfirmModal, PageAlert } from "../../../../components/students/ui";
import {
  fetchIdCardMeta,
  fetchIdCardTemplate,
  idCardTemplateAction,
  previewIdCard,
  saveIdCardTemplate,
  type CardDesign,
  type VariableDef,
} from "../../../../lib/student-id-cards";

export default function DesignerPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<"draft" | "active" | "archived">(
    "draft",
  );
  const [design, setDesign] = React.useState<CardDesign | null>(null);
  const [variables, setVariables] = React.useState<VariableDef[]>([]);
  const [students, setStudents] = React.useState<
    Array<{ id: string; name: string }>
  >([]);
  const [bindings, setBindings] = React.useState<Record<string, string>>({});
  const [yearId, setYearId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    if (!id) return;
    void (async () => {
      const meta = await fetchIdCardMeta();
      if (meta.ok) {
        setVariables(meta.data.variables);
        setStudents(
          meta.data.students.map((s) => ({ id: s.id, name: s.name })),
        );
        setYearId(
          meta.data.years.find((y) => y.is_current)?.id ||
            meta.data.years[0]?.id ||
            null,
        );
      }
      const res = await fetchIdCardTemplate(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName(res.data.template.name);
      setStatus(res.data.template.status as "draft" | "active" | "archived");
      setDesign(res.data.design);
      const preview = await previewIdCard({ template_id: id, sample: true });
      if (preview.ok) setBindings(preview.data.bindings);
    })();
  }, [id]);

  async function onPreviewStudent(studentId: string | null) {
    if (!id) return;
    const preview = await previewIdCard({
      template_id: id,
      student_id: studentId,
      academic_year_id: yearId,
      sample: !studentId,
    });
    if (preview.ok) {
      setBindings(preview.data.bindings);
      setDesign((current) => {
        if (!current) return current;
        const resolved = new Map(
          preview.data.design.elements.map((el) => [el.id, el]),
        );
        return {
          ...current,
          elements: current.elements.map((el) => {
            const r = resolved.get(el.id);
            return r
              ? {
                  ...el,
                  qrSvg: r.qrSvg,
                  barcodeSvg: r.barcodeSvg,
                  resolvedImage: r.resolvedImage,
                  resolvedText: r.resolvedText,
                }
              : el;
          }),
        };
      });
    }
  }

  async function save() {
    if (!design || !id) return;
    setBusy(true);
    const res = await saveIdCardTemplate({ id, name, status, design });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else
      setSuccess(
        "Template saved. A new version is kept when cards have already been issued.",
      );
  }

  async function deleteDraft() {
    if (!id) return;
    setBusy(true);
    setError("");
    const res = await idCardTemplateAction({ id, action: "delete" });
    setBusy(false);
    setConfirmDelete(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await router.push("/students/id-cards/templates");
  }

  return (
    <AppShell
      title="Card designer"
      breadcrumb={["Student Management", "ID Cards", "Designer"]}
      heading="Card designer"
      subtitle="Drag fields, change colours, and preview with real students. Front and back are independent."
    >
      <IdCardModuleNav />
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}
      {design ? (
        <IdCardDesigner
          name={name}
          onName={setName}
          design={design}
          onChange={setDesign}
          variables={variables}
          students={students}
          previewBindings={bindings}
          onPreviewStudent={(sid) => void onPreviewStudent(sid)}
          onSave={() => void save()}
          onDeleteDraft={
            status === "draft" ? () => setConfirmDelete(true) : undefined
          }
          busy={busy}
        />
      ) : (
        <p className="text-sm text-slate-500">Loading designer…</p>
      )}
      {confirmDelete ? (
        <ConfirmModal
          open={confirmDelete}
          title="Delete draft template?"
          description={`Delete "${name}"? Any test cards generated from this draft will be removed. This cannot be undone.`}
          confirmLabel="Delete draft"
          danger
          busy={busy}
          onConfirm={() => void deleteDraft()}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </AppShell>
  );
}
