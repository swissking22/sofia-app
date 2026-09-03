import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  DocumentHtml,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
} from "../../../components/documents/ui";
import {
  fetchIssuedDocument,
  logDocumentExport,
} from "../../../lib/documents-mgmt";

export default function DocumentPrintPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [html, setHtml] = React.useState("");
  const [css, setCss] = React.useState("");
  const [title, setTitle] = React.useState("Document");

  React.useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await fetchIssuedDocument(id);
      if (res.ok) {
        setHtml(res.data.document.rendered_html);
        setCss(res.data.css);
        setTitle(res.data.document.document_number);
      } else setError(res.error);
      setLoading(false);
    })();
  }, [id]);

  async function handlePrint() {
    if (id) await logDocumentExport(id);
    window.print();
  }

  return (
    <AppShell
      title={title}
      breadcrumb={["Documents", "Print"]}
      heading={title}
      subtitle="Use Print to paper or Save as PDF. A4, school branding, and verification ID are included in the layout."
    >
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <SecondaryButton onClick={() => router.back()}>Back</SecondaryButton>
        <PrimaryButton onClick={() => void handlePrint()}>
          Print / Download PDF
        </PrimaryButton>
      </div>
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {!loading && html ? <DocumentHtml html={html} css={css} /> : null}
    </AppShell>
  );
}
