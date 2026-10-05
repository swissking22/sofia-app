import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import { PageAlert, PrimaryButton } from "../../../components/students/ui";
import { CardSurface } from "../../../components/id-cards/CardSurface";
import { fetchIdCardsPrint } from "../../../lib/student-id-cards";

export default function IdCardPrintPage() {
  const router = useRouter();
  const ids = React.useMemo(() => {
    const raw = router.query.ids;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return (value ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }, [router.query.ids]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [payload, setPayload] = React.useState<
    | Extract<
        Awaited<ReturnType<typeof fetchIdCardsPrint>>,
        { ok: true }
      >["data"]
    | null
  >(null);

  React.useEffect(() => {
    if (!ids.length) {
      setLoading(false);
      return;
    }
    void (async () => {
      const res = await fetchIdCardsPrint(ids, true);
      if (res.ok) setPayload(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, [ids]);

  return (
    <AppShell
      title="Print ID cards"
      breadcrumb={["Student Management", "ID Cards", "Print"]}
      heading="Print ID cards"
      subtitle="Cards are drawn from the template version stored with each record, so reprints match the original design. Use the browser print dialog to save a PDF."
    >
      <div className="mb-4 flex gap-2 print:hidden">
        <PrimaryButton onClick={() => window.print()}>
          Print / Save PDF
        </PrimaryButton>
      </div>
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {!loading && !error && !payload?.cards.length ? (
        <PageAlert tone="error">No cards selected.</PageAlert>
      ) : null}

      <div className="print-sheet">
        {(payload?.cards ?? []).map((card) =>
          card.design ? (
            <div key={card.id} className="card-pair break-inside-avoid">
              <CardSurface design={card.design} side="front" unit="mm" />
              <CardSurface design={card.design} side="back" unit="mm" />
            </div>
          ) : null,
        )}
      </div>
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
          .print-sheet {
            display: block;
          }
          .card-pair {
            display: flex;
            gap: 4mm;
            margin-bottom: 4mm;
          }
        }
        .print-sheet {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .card-pair {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
        }
      `}</style>
    </AppShell>
  );
}
