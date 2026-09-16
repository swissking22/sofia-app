import React from "react";
import { OfficialReportCard } from "./OfficialReportCard";
import { ReportCardStyles } from "./ReportCardStyles";
import type { ReportCardPayload } from "../../lib/report-card";

const A4_WIDTH_PX = 794;

type Props = {
  payload: ReportCardPayload;
};

/**
 * Scaled live preview of the official report card for Setup → Documents.
 */
export function ReportCardSetupPreview({ payload }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.38);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      setScale(Math.min(1, Math.max(0.28, (width - 8) / A4_WIDTH_PX)));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scaledHeight = Math.ceil(1123 * scale);

  return (
    <>
      <ReportCardStyles />
      <div
        ref={containerRef}
        className="overflow-x-hidden overflow-y-auto rounded-xl border border-slate-200 bg-white"
        style={{ maxHeight: "min(72vh, 640px)" }}
      >
        <div style={{ height: scaledHeight }}>
          <div
            className="origin-top-left bg-white px-6 py-6"
            style={{
              width: A4_WIDTH_PX,
              transform: `scale(${scale})`,
            }}
          >
            <OfficialReportCard payload={payload} />
          </div>
        </div>
      </div>
    </>
  );
}
