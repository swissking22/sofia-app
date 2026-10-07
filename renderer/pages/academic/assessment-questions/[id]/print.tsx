import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../../components/layout/AppShell";
import {
  PageAlert,
  PrimaryButton,
  SecondaryButton,
} from "../../../../components/students/ui";
import {
  fetchAssessmentQuestion,
  recordAssessmentQuestionPrint,
  type AssessmentQuestionDetail,
} from "../../../../lib/assessment-questions";

/** Print preview for an approved question paper PDF. */
export default function AssessmentQuestionPrintPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [detail, setDetail] = React.useState<AssessmentQuestionDetail | null>(
    null,
  );

  React.useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await fetchAssessmentQuestion(id);
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      if (!res.data.can_print) {
        setError(
          res.data.print_unavailable_reason || "Printing unavailable.",
        );
        setDetail(res.data);
        setLoading(false);
        return;
      }
      setDetail(res.data);
      setLoading(false);
    })();
  }, [id]);

  async function handlePrint() {
    if (!detail?.current_revision) return;
    await recordAssessmentQuestionPrint({
      paper_id: detail.paper.id,
      revision_id: detail.current_revision.id,
    });
    window.print();
  }

  return (
    <AppShell
      title="Print question paper"
      breadcrumb={[
        "Academic Management",
        "Assessment Questions",
        detail?.paper.title || "Print",
      ]}
      heading={detail?.paper.title || "Print question paper"}
      subtitle="Print preview of the approved PDF"
      backHref={id ? `/academic/assessment-questions/${id}` : "/academic/assessment-questions"}
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : detail?.pdf_data_url && detail.can_print ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2 print:hidden">
            <PrimaryButton type="button" onClick={() => void handlePrint()}>
              Print Question Paper
            </PrimaryButton>
            <SecondaryButton onClick={() =>
                void router.push(`/academic/assessment-questions/${id}`)
              }
            >
              Back to review
            </SecondaryButton>
          </div>
          <iframe
            title="Print preview"
            src={detail.pdf_data_url}
            className="h-[80vh] w-full rounded-lg border border-slate-200 bg-white print:h-screen print:border-0 print:rounded-none"
          />
        </>
      ) : (
        <p className="text-sm text-slate-500">
          Printing unavailable. The paper must be approved and the PDF must be
          available on this device.
        </p>
      )}
    </AppShell>
  );
}
