import React from "react";

/** Global print/layout styles for OfficialReportCard (view + setup preview). */
export function ReportCardStyles() {
  return (
    <style jsx global>{`
      .rc-doc {
        font-family: "Times New Roman", Times, "Liberation Serif", serif;
        font-size: 11pt;
        color: #111;
        line-height: 1.35;
      }
      .rc-gov-header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 12px;
        align-items: start;
        border-bottom: 1.5px solid #111;
        padding-bottom: 10px;
      }
      .rc-gov-col {
        font-size: 8.5pt;
        line-height: 1.25;
      }
      .rc-gov-fr {
        text-align: left;
      }
      .rc-gov-en {
        text-align: right;
      }
      .rc-gov-strong {
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        margin: 0 0 2px;
      }
      .rc-gov-line {
        margin: 0 0 2px;
        font-style: italic;
      }
      .rc-gov-logo {
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .rc-gov-logo img {
        max-width: 64px;
        max-height: 64px;
        object-fit: contain;
      }
      .rc-logo-fallback {
        width: 56px;
        height: 56px;
        border: 1.5px solid #111;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 20pt;
      }
      .rc-school-identity {
        text-align: center;
        margin-top: 10px;
      }
      .rc-school-name {
        margin: 0;
        font-size: 16pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .rc-motto {
        margin: 4px 0 0;
        font-size: 9pt;
        font-style: italic;
      }
      .rc-contact {
        margin: 4px 0 0;
        font-size: 8.5pt;
        color: #333;
      }
      .rc-title-block {
        text-align: center;
        margin: 12px 0 10px;
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
        font-size: 10pt;
        font-style: italic;
      }
      .rc-period {
        margin: 4px 0 0;
        font-size: 10pt;
      }
      .rc-student table,
      .rc-results table,
      .rc-summary table {
        width: 100%;
        border-collapse: collapse;
      }
      .rc-student th,
      .rc-student td,
      .rc-results th,
      .rc-results td,
      .rc-summary th,
      .rc-summary td {
        border: 1px solid #222;
        padding: 4px 6px;
        vertical-align: top;
      }
      .rc-student th,
      .rc-summary th {
        width: 18%;
        text-align: left;
        font-size: 8.5pt;
        font-weight: 700;
        background: #f3f3f3;
      }
      .rc-student td {
        font-size: 10pt;
      }
      .rc-mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 9pt;
      }
      .rc-results {
        margin-top: 10px;
      }
      .rc-results thead th {
        font-size: 8pt;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        background: #f3f3f3;
        text-align: center;
      }
      .rc-col-subject {
        text-align: left !important;
        width: 28%;
      }
      .rc-col-num {
        width: 8%;
      }
      .rc-col-grade {
        width: 7%;
      }
      .rc-col-remark {
        width: 14%;
        text-align: left !important;
      }
      .rc-subject-name {
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .rc-num {
        text-align: right;
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
        font-size: 8.5pt;
      }
      .rc-empty {
        text-align: center;
        padding: 12px !important;
        color: #555;
      }
      .rc-summary {
        margin-top: 10px;
      }
      .rc-muted {
        font-weight: 400;
        color: #555;
        font-size: 8.5pt;
      }
      .rc-remarks {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 10px;
      }
      .rc-remark-box {
        border: 1px solid #222;
        min-height: 52px;
        padding: 6px 8px;
      }
      .rc-remark-label {
        margin: 0;
        font-size: 8pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .rc-remark-body {
        margin: 6px 0 0;
        font-size: 10pt;
        min-height: 28px;
      }
      .rc-handwrite {
        min-height: 36px;
      }
      .rc-scale {
        margin-top: 10px;
        border: 1px solid #222;
        padding: 6px 8px;
      }
      .rc-scale-title {
        margin: 0 0 4px;
        font-size: 8pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .rc-scale-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 14px;
        font-size: 8pt;
      }
      .rc-signatures {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        margin-top: 16px;
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
        margin-top: 8px;
        min-height: 64px;
        border: 1px dashed #666;
        display: flex;
        align-items: center;
        justify-content: space-around;
        gap: 8px;
        padding: 6px;
      }
      .rc-sign-area-empty {
        min-height: 72px;
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
      .rc-footer {
        margin-top: 14px;
        border-top: 1px solid #222;
        padding-top: 8px;
        text-align: center;
        font-size: 8pt;
        color: #444;
      }
      .rc-generated {
        margin: 4px 0 0;
        color: #777;
      }

      @page {
        size: A4 portrait;
        margin: 12mm;
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
        .rc-signatures {
          break-inside: avoid;
        }
      }
    `}</style>
  );
}
