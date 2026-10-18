/** Global print/layout styles for OfficialReportCard (view + setup preview). */
export function ReportCardStyles() {
  return (
    <style jsx global>{`
      .rc-doc {
        font-family: "Times New Roman", Times, "Liberation Serif", serif;
        font-size: 10.5pt;
        color: #111;
        line-height: 1.3;
      }
      .rc-gov-header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 10px;
        align-items: start;
        border-bottom: 1.5px solid #111;
        padding-bottom: 8px;
      }
      .rc-gov-col {
        font-size: 8.5pt;
        line-height: 1.25;
      }
      .rc-gov-left {
        text-align: left;
      }
      .rc-gov-right {
        text-align: right;
      }
      .rc-gov-strong {
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        margin: 0 0 2px;
        font-size: 8.5pt;
      }
      .rc-gov-school {
        margin: 4px 0 2px;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 10pt;
      }
      .rc-gov-contact {
        margin: 0;
        font-size: 8pt;
        color: #333;
      }
      .rc-gov-motto {
        margin: 4px 0 0;
        font-style: italic;
        font-size: 8.5pt;
      }
      .rc-gov-logo {
        width: 72px;
        height: 72px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .rc-gov-logo img {
        max-width: 72px;
        max-height: 72px;
        object-fit: contain;
      }
      .rc-logo-fallback {
        width: 64px;
        height: 64px;
        border: 1.5px solid #111;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 22pt;
      }
      .rc-title-block {
        text-align: center;
        margin: 10px 0 8px;
      }
      .rc-title-en {
        margin: 0;
        font-size: 13pt;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .rc-title-fr {
        margin: 2px 0 0;
        font-size: 9.5pt;
        font-style: italic;
      }
      .rc-period {
        margin: 2px 0 0;
        font-size: 10pt;
      }
      .rc-student-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin: 8px 0 10px;
        font-size: 10pt;
      }
      .rc-student-col p {
        margin: 0 0 3px;
      }
      .rc-student-col-right {
        text-align: right;
      }
      .rc-label {
        font-weight: 600;
      }
      .rc-sex {
        margin-left: 10px;
      }
      .rc-mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 9pt;
      }
      .rc-results {
        margin-top: 4px;
      }
      .rc-results table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .rc-results th,
      .rc-results td {
        border: 1px solid #222;
        padding: 3px 4px;
        vertical-align: middle;
      }
      .rc-results thead th {
        font-size: 7.5pt;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        background: #f3f3f3;
        text-align: center;
        font-weight: 700;
      }
      .rc-col-subject {
        text-align: left !important;
        width: 22%;
      }
      .rc-col-comp {
        width: 12%;
      }
      .rc-col-mk {
        width: 8%;
      }
      .rc-col-num {
        width: 8%;
      }
      .rc-col-grade {
        width: 7%;
      }
      .rc-col-pos {
        width: 6%;
      }
      .rc-col-remark {
        width: 14%;
        text-align: left !important;
      }
      .rc-subject-cell {
        text-align: left;
      }
      .rc-subject-name {
        display: block;
        font-weight: 700;
        font-size: 9pt;
        overflow-wrap: anywhere;
      }
      .rc-teacher-name {
        display: block;
        font-size: 7.5pt;
        font-style: italic;
        color: #333;
      }
      .rc-comp {
        font-size: 8pt;
        text-align: center;
      }
      .rc-mk-cell {
        padding: 0 !important;
      }
      .rc-mk-stack {
        display: flex;
        flex-direction: column;
      }
      .rc-mk-row {
        text-align: center;
        font-variant-numeric: tabular-nums;
        font-size: 9pt;
        padding: 2px 3px;
        line-height: 1.2;
      }
      .rc-mk-row + .rc-mk-row {
        border-top: 1px solid #222;
      }
      .rc-num {
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .rc-center {
        text-align: center;
        font-weight: 600;
      }
      .rc-strong {
        font-weight: 700;
      }
      .rc-remark {
        font-size: 8pt;
        text-align: left;
      }
      .rc-empty {
        text-align: center;
        padding: 12px !important;
        color: #555;
      }
      .rc-totals-row td {
        background: #f7f7f7;
        font-size: 9pt;
      }
      .rc-totals-label {
        text-align: right;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 8pt;
      }
      .rc-compact-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 18px;
        margin-top: 10px;
        padding: 6px 8px;
        border: 1px solid #222;
        font-size: 9pt;
      }
      .rc-principal-sign {
        margin-top: 18px;
        text-align: center;
      }
      .rc-sign-label {
        margin: 0;
        font-size: 9pt;
        font-weight: 700;
        text-transform: uppercase;
      }
      .rc-sign-name {
        margin: 4px 0 0;
        font-size: 9pt;
      }
      .rc-sign-area {
        margin: 8px auto 0;
        min-height: 64px;
        max-width: 280px;
        border: 1px dashed #666;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 6px;
      }
      .rc-sign-area-center {
        justify-content: center;
      }
      .rc-sign-img {
        max-height: 48px;
        max-width: 120px;
        object-fit: contain;
      }
      .rc-stamp-img {
        max-height: 56px;
        max-width: 56px;
        object-fit: contain;
      }
      .rc-stamp-placeholder {
        font-size: 8pt;
        color: #888;
        text-transform: uppercase;
      }
      .rc-sign-line,
      .rc-sign-date {
        margin: 8px 0 0;
        font-size: 9pt;
      }
      .rc-footer-bar {
        margin-top: 16px;
        border-top: 1px solid #222;
        padding-top: 8px;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
      }
      .rc-footer-meta {
        text-align: left;
        font-size: 8.5pt;
        color: #333;
      }
      .rc-footer-name {
        margin: 0;
        font-weight: 700;
        font-size: 10pt;
        color: #111;
      }
      .rc-footer-id {
        margin: 2px 0 0;
      }
      .rc-footer-note {
        margin: 4px 0 0;
        color: #555;
      }
      .rc-generated {
        margin: 4px 0 0;
        color: #777;
        font-size: 7.5pt;
      }
      .rc-footer-qr {
        text-align: center;
        flex-shrink: 0;
      }
      .rc-footer-qr img {
        width: 72px;
        height: 72px;
        display: block;
      }
      .rc-qr-placeholder {
        width: 72px;
        height: 72px;
        border: 1px dashed #888;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8pt;
        color: #888;
      }
      .rc-qr-caption {
        margin: 2px 0 0;
        font-size: 7pt;
        color: #555;
      }

      @page {
        size: A4 portrait;
        margin: 10mm;
      }
      @media print {
        html,
        body,
        #__next {
          background: white !important;
          height: auto !important;
          overflow: visible !important;
        }
        .rc-preview {
          max-width: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .rc-results thead {
          display: table-header-group;
        }
        .rc-gov-header,
        .rc-principal-sign,
        .rc-footer-bar {
          break-inside: avoid;
        }
      }
    `}</style>
  );
}
