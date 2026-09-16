import React from "react";
import {
  formatDisplayDate,
  formatReportScore,
  ordinalPosition,
  type ReportCardPayload,
} from "../../lib/report-card";

type Props = {
  payload: ReportCardPayload;
  generatedAt?: string | null;
};

/**
 * Official A4 Cameroon-style bilingual student report card (print/PDF via browser).
 */
export function OfficialReportCard({ payload, generatedAt }: Props) {
  const t = payload.template;
  const header = t.bilingual_header;
  const fr = header.fr_lines;
  const en = header.en_lines;
  const rowCount = Math.max(fr.length, en.length);
  const contact = [
    payload.school.address,
    payload.school.phone ? `Tel: ${payload.school.phone}` : null,
    payload.school.email,
    payload.school.website,
  ]
    .filter(Boolean)
    .join(" · ");

  const subjects = payload.subjects ?? [];

  return (
    <article className="rc-doc text-slate-900">
      {/* Official bilingual ministry header */}
      <header className="rc-gov-header">
        <div className="rc-gov-col rc-gov-fr">
          {Array.from({ length: rowCount }).map((_, i) => (
            <p key={`fr-${i}`} className={i === 0 ? "rc-gov-strong" : "rc-gov-line"}>
              {fr[i] ?? ""}
            </p>
          ))}
        </div>
        <div className="rc-gov-logo">
          {payload.school.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={payload.school.logo_url} alt="" />
          ) : (
            <div className="rc-logo-fallback" aria-hidden>
              {payload.school.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="rc-gov-col rc-gov-en">
          {Array.from({ length: rowCount }).map((_, i) => (
            <p key={`en-${i}`} className={i === 0 ? "rc-gov-strong" : "rc-gov-line"}>
              {en[i] ?? ""}
            </p>
          ))}
        </div>
      </header>

      {/* School identity */}
      <section className="rc-school-identity">
        <h1 className="rc-school-name">{payload.school.name}</h1>
        {payload.school.motto ? (
          <p className="rc-motto">&ldquo;{payload.school.motto}&rdquo;</p>
        ) : null}
        {contact ? <p className="rc-contact">{contact}</p> : null}
      </section>

      {/* Document title */}
      <section className="rc-title-block">
        <h2 className="rc-title-en">{t.title_en}</h2>
        <p className="rc-title-fr">{t.title_fr}</p>
        <p className="rc-period">
          {[payload.academic.year_name, payload.academic.term_name]
            .filter(Boolean)
            .join(" — ") || "—"}
        </p>
      </section>

      {/* Student details */}
      <section className="rc-student">
        <table>
          <tbody>
            <tr>
              <th>Student Name / Nom</th>
              <td colSpan={3}>{payload.student.name}</td>
            </tr>
            <tr>
              <th>School ID</th>
              <td className="rc-mono">{payload.student.student_code || "—"}</td>
              <th>Date of Birth</th>
              <td>{formatDisplayDate(payload.student.date_of_birth)}</td>
            </tr>
            <tr>
              <th>Class / Form</th>
              <td>{payload.student.class_name || "—"}</td>
              <th>Department</th>
              <td>{payload.student.department || "—"}</td>
            </tr>
            <tr>
              <th>Academic Year</th>
              <td>{payload.academic.year_name || "—"}</td>
              <th>Term / Sequence</th>
              <td>{payload.academic.term_name || "—"}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Academic grid */}
      <section className="rc-results">
        <table>
          <thead>
            <tr>
              <th className="rc-col-subject">Subject</th>
              {t.show_ca ? <th className="rc-col-num">CA /20</th> : null}
              {t.show_exam ? <th className="rc-col-num">Exam /20</th> : null}
              <th className="rc-col-num">Mark /20</th>
              {t.show_coefficient ? <th className="rc-col-num">Coeff</th> : null}
              {t.show_weighted ? <th className="rc-col-num">Weighted</th> : null}
              <th className="rc-col-grade">Grade</th>
              {t.show_gce ? <th className="rc-col-grade">GCE</th> : null}
              {t.show_subject_remark ? (
                <th className="rc-col-remark">Remark</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {subjects.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="rc-empty"
                >
                  No offered subjects recorded for this term.
                </td>
              </tr>
            ) : (
              subjects.map((s, i) => (
                <tr key={`${s.subject_id}-${i}`}>
                  <td className="rc-subject-name">{s.subject_name}</td>
                  {t.show_ca ? (
                    <td className="rc-num">{formatReportScore(s.ca_score)}</td>
                  ) : null}
                  {t.show_exam ? (
                    <td className="rc-num">{formatReportScore(s.exam_score)}</td>
                  ) : null}
                  <td className="rc-num rc-strong">
                    {formatReportScore(s.subject_mark)}
                  </td>
                  {t.show_coefficient ? (
                    <td className="rc-num">{s.coefficient}</td>
                  ) : null}
                  {t.show_weighted ? (
                    <td className="rc-num">
                      {formatReportScore(s.weighted_mark)}
                    </td>
                  ) : null}
                  <td className="rc-center">{s.grade || "—"}</td>
                  {t.show_gce ? (
                    <td className="rc-center">{s.gce_grade || "—"}</td>
                  ) : null}
                  {t.show_subject_remark ? (
                    <td className="rc-remark">{s.remark || "—"}</td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Performance summary */}
      <section className="rc-summary">
        <table>
          <tbody>
            <tr>
              <th>Total Weighted</th>
              <td>
                {formatReportScore(payload.summary.total_weighted_marks)}
                {payload.summary.total_coefficients != null
                  ? ` / ${formatReportScore(payload.summary.total_coefficients)} coeff`
                  : ""}
              </td>
              <th>Average</th>
              <td>
                {formatReportScore(payload.summary.average)}{" "}
                <span className="rc-muted">/ 20</span>
              </td>
            </tr>
            <tr>
              <th>Position</th>
              <td>
                {ordinalPosition(payload.summary.position)}
                {payload.summary.class_size
                  ? ` / ${payload.summary.class_size}`
                  : ""}
              </td>
              {t.show_class_average ? (
                <>
                  <th>Class Average</th>
                  <td>
                    {formatReportScore(payload.summary.class_average)}{" "}
                    <span className="rc-muted">/ 20</span>
                  </td>
                </>
              ) : (
                <>
                  <th>Overall Grade</th>
                  <td>{payload.summary.grade || "—"}</td>
                </>
              )}
            </tr>
            <tr>
              <th>Overall Grade</th>
              <td>
                {payload.summary.grade || "—"}
                {payload.summary.gce_grade
                  ? ` (GCE ${payload.summary.gce_grade})`
                  : ""}
              </td>
              <th>Status</th>
              <td className="rc-strong">{payload.summary.status || "—"}</td>
            </tr>
            {(payload.summary.highest_average != null ||
              payload.summary.lowest_average != null) && (
              <tr>
                <th>Highest Avg</th>
                <td>{formatReportScore(payload.summary.highest_average)}</td>
                <th>Lowest Avg</th>
                <td>{formatReportScore(payload.summary.lowest_average)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Remarks */}
      <section className="rc-remarks">
        <div className="rc-remark-box">
          <p className="rc-remark-label">Class Teacher&apos;s Remark</p>
          <p className="rc-remark-body">
            {payload.summary.remark || "\u00a0"}
          </p>
        </div>
        <div className="rc-remark-box">
          <p className="rc-remark-label">Principal&apos;s Remark</p>
          <p className="rc-remark-body rc-handwrite">&nbsp;</p>
        </div>
      </section>

      {/* Grading scale */}
      {t.show_grading_scale && payload.grading_scale.length > 0 ? (
        <section className="rc-scale">
          <p className="rc-scale-title">Grading Scale</p>
          <div className="rc-scale-grid">
            {payload.grading_scale.map((g) => (
              <span key={g.grade}>
                <strong>{g.grade}</strong> {g.range_label} — {g.remark}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {/* Signatures */}
      {t.show_signatures ? (
        <section className="rc-signatures">
          <div className="rc-sign-col">
            <p className="rc-sign-label">{t.principal_label}</p>
            {payload.school.principal_name ? (
              <p className="rc-sign-name">
                {payload.school.principal_name}
                {payload.school.principal_title
                  ? ` · ${payload.school.principal_title}`
                  : ""}
              </p>
            ) : null}
            <div className="rc-sign-area">
              {payload.school.signature_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={payload.school.signature_url}
                  alt=""
                  className="rc-sign-img"
                />
              ) : null}
              {payload.school.stamp_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={payload.school.stamp_url}
                  alt=""
                  className="rc-stamp-img"
                />
              ) : (
                <span className="rc-stamp-placeholder">Stamp</span>
              )}
            </div>
            <p className="rc-sign-line">Signature &amp; Stamp</p>
            <p className="rc-sign-date">Date: ____________________</p>
          </div>
          <div className="rc-sign-col">
            <p className="rc-sign-label">{t.parent_label}</p>
            <div className="rc-sign-area rc-sign-area-empty" />
            <p className="rc-sign-line">Signature</p>
            <p className="rc-sign-date">Date: ____________________</p>
          </div>
        </section>
      ) : null}

      <footer className="rc-footer">
        {payload.document.footer ? <p>{payload.document.footer}</p> : null}
        {generatedAt ? (
          <p className="rc-generated">
            Generated {new Date(generatedAt).toLocaleString()} · Template v
            {t.version}
          </p>
        ) : null}
      </footer>
    </article>
  );
}
