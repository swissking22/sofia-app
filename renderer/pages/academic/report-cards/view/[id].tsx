import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../../components/layout/AppShell";
import { OfficialReportCard } from "../../../../components/report-cards/OfficialReportCard";
import { ReportCardStyles } from "../../../../components/report-cards/ReportCardStyles";
import { fetchReportCard } from "../../../../lib/academic-mgmt";
import {
  normalizeReportCardPayload,
  type ReportCardPayload,
} from "../../../../lib/report-card";

export default function ReportCardViewPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [payload, setPayload] = React.useState<ReportCardPayload | null>(null);
  const [generatedAt, setGeneratedAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await fetchReportCard(id);
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setPayload(normalizeReportCardPayload(res.data.payload));
      setGeneratedAt(res.data.generated_at);
      setLoading(false);
    })();
  }, [id]);

  return (
    <AppShell
      title="Report card"
      breadcrumb={["Academic Management", "Report Cards", "View"]}
      heading="Report card"
      subtitle="Official A4 bilingual term report — Print or Save as PDF."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white"
        >
          Print / Save as PDF
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading report card…</p>
      ) : !payload ? (
        <p className="text-sm text-slate-500">
          Report card data not available.
        </p>
      ) : (
        <div className="rc-preview mx-auto bg-white px-6 py-6 shadow-sm print:mx-0 print:max-w-none print:px-0 print:py-0 print:shadow-none">
          <OfficialReportCard payload={payload} generatedAt={generatedAt} />
        </div>
      )}

      <ReportCardStyles />
    </AppShell>
  );
}
