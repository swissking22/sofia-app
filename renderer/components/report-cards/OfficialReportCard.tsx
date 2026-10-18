import { formatDisplayDateTime } from "../../lib/date-format";
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

function sexLabel(gender: string | null | undefined): string {
  if (!gender) return "—";
  const g = gender.trim().toLowerCase();
  if (g === "male" || g === "m") return "M";
  if (g === "female" || g === "f") return "F";
  return gender;
}

function contactLocation(payload: ReportCardPayload): string {
  return [payload.school.address, payload.school.phone, payload.school.email]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/**
 * Official A4 Cameroon-style term report card (print/PDF via browser).
 */
export function OfficialReportCard({ payload, generatedAt }: Props) {
  const t = payload.template;
  const subjects = payload.subjects ?? [];
  const contact = contactLocation(payload);
  const totalCoeff =
    payload.summary.total_coefficients ??
    subjects.reduce((a, s) => a + (s.coefficient || 0), 0);
  const totalWeighted =
    payload.summary.total_weighted_marks ??
    subjects.reduce((a, s) => a + (s.weighted_mark ?? 0), 0);
  const status = (payload.summary.status || "—").toUpperCase();

  return (
    <article className="rc-doc text-slate-900">
      {/* 3-column header: Ministry+School | Logo | Republic */}
      <header className="rc-gov-header">
        <div className="rc-gov-col rc-gov-left">
          <p className="rc-gov-strong">MINISTRY OF SECONDARY EDUCATION</p>
          <p className="rc-gov-school">{payload.school.name}</p>
          {contact ? <p className="rc-gov-contact">{contact}</p> : null}
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
        <div className="rc-gov-col rc-gov-right">
          <p className="rc-gov-strong">REPUBLIC OF CAMEROON</p>
          <p className="rc-gov-motto">Peace — Work — Fatherland</p>
        </div>
      </header>

      {/* Title block */}
      <section className="rc-title-block">
        <h2 className="rc-title-en">{t.title_en}</h2>
        {t.title_fr ? <p className="rc-title-fr">{t.title_fr}</p> : null}
        <p className="rc-period">
          Academic Year: {payload.academic.year_name || "—"}
        </p>
        <p className="rc-period">Term: {payload.academic.term_name || "—"}</p>
      </section>

      {/* Student details — two columns */}
      <section className="rc-student-row">
        <div className="rc-student-col">
          <p>
            <span className="rc-label">Student name:</span>{" "}
            <strong>{payload.student.name}</strong>
          </p>
          <p>
            <span className="rc-label">Born on:</span>{" "}
            {formatDisplayDate(payload.student.date_of_birth)}
            <span className="rc-sex">
              {" "}
              Sex: {sexLabel(payload.student.gender)}
            </span>
          </p>
          <p>
            <span className="rc-label">Student ID:</span>{" "}
            <span className="rc-mono">
              {payload.student.student_code || "—"}
            </span>
          </p>
        </div>
        <div className="rc-student-col rc-student-col-right">
          <p>
            <span className="rc-label">Class:</span>{" "}
            <strong>{payload.student.class_name || "—"}</strong>
          </p>
          <p>
            <span className="rc-label">No. of students in class:</span>{" "}
            {payload.summary.class_size ?? "—"}
          </p>
        </div>
      </section>

      {/* Academic grid */}
      <section className="rc-results">
        <table>
          <thead>
            <tr>
              <th className="rc-col-subject">Subject / Teacher</th>
              <th className="rc-col-comp">Competences</th>
              <th className="rc-col-mk">Mk/20</th>
              <th className="rc-col-num">Av/20</th>
              <th className="rc-col-num">Coeff</th>
              <th className="rc-col-num">Weighted Mk</th>
              <th className="rc-col-grade">Grade</th>
              <th className="rc-col-pos">Pos.</th>
              <th className="rc-col-remark">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {subjects.length === 0 ? (
              <tr>
                <td colSpan={9} className="rc-empty">
                  No offered subjects recorded for this term.
                </td>
              </tr>
            ) : (
              subjects.map((s, i) => {
                const seq =
                  s.sequence_marks && s.sequence_marks.length > 0
                    ? s.sequence_marks
                    : [
                        { name: "Seq 1", mark: s.ca_score },
                        { name: "Seq 2", mark: null },
                      ];
                return (
                  <tr key={`${s.subject_id}-${i}`}>
                    <td className="rc-subject-cell">
                      <span className="rc-subject-name">{s.subject_name}</span>
                      {s.teacher_name ? (
                        <span className="rc-teacher-name">
                          {s.teacher_name}
                        </span>
                      ) : null}
                    </td>
                    <td className="rc-comp">{s.competences || "—"}</td>
                    <td className="rc-mk-cell">
                      <div className="rc-mk-stack">
                        {seq.map((m, mi) => (
                          <div
                            key={`${s.subject_id}-seq-${mi}`}
                            className="rc-mk-row"
                          >
                            {formatReportScore(m.mark)}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="rc-num rc-strong">
                      {formatReportScore(s.subject_mark)}
                    </td>
                    <td className="rc-num">{s.coefficient}</td>
                    <td className="rc-num">
                      {formatReportScore(s.weighted_mark)}
                    </td>
                    <td className="rc-center">{s.grade || "—"}</td>
                    <td className="rc-center">{s.subject_position ?? "—"}</td>
                    <td className="rc-remark">{s.remark || "—"}</td>
                  </tr>
                );
              })
            )}
            {/* Totals / average / status row */}
            <tr className="rc-totals-row">
              <td colSpan={4} className="rc-totals-label">
                Totals
              </td>
              <td className="rc-num rc-strong">
                {formatReportScore(totalCoeff)}
              </td>
              <td className="rc-num rc-strong">
                {formatReportScore(totalWeighted)}
              </td>
              <td colSpan={2} className="rc-center rc-strong">
                Average: {formatReportScore(payload.summary.average)}/20
              </td>
              <td className="rc-center rc-strong">{status}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Compact performance strip */}
      <section className="rc-compact-summary">
        <span>
          <strong>Class average:</strong>{" "}
          {formatReportScore(payload.summary.class_average)}/20
        </span>
        <span>
          <strong>Student average:</strong>{" "}
          {formatReportScore(payload.summary.average)}/20
        </span>
        <span>
          <strong>Position:</strong> {ordinalPosition(payload.summary.position)}
          {payload.summary.class_size ? ` / ${payload.summary.class_size}` : ""}
        </span>
        <span>
          <strong>Remarks:</strong> {payload.summary.remark || "—"}
        </span>
      </section>

      {/* Principal signature — centred */}
      {t.show_signatures ? (
        <section className="rc-principal-sign">
          <p className="rc-sign-label">{t.principal_label}</p>
          {payload.school.principal_name ? (
            <p className="rc-sign-name">
              {payload.school.principal_name}
              {payload.school.principal_title
                ? ` · ${payload.school.principal_title}`
                : ""}
            </p>
          ) : null}
          <div className="rc-sign-area rc-sign-area-center">
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
        </section>
      ) : null}

      {/* Footer: name, ID, QR */}
      <footer className="rc-footer-bar">
        <div className="rc-footer-meta">
          <p className="rc-footer-name">{payload.student.name}</p>
          <p className="rc-footer-id rc-mono">
            ID: {payload.student.student_code || "—"}
          </p>
          {payload.document.footer ? (
            <p className="rc-footer-note">{payload.document.footer}</p>
          ) : null}
          {generatedAt ? (
            <p className="rc-generated">
              Generated {formatDisplayDateTime(generatedAt)}
            </p>
          ) : null}
        </div>
        <div className="rc-footer-qr">
          {payload.qr_data_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={payload.qr_data_url} alt="Result verification QR" />
          ) : (
            <div className="rc-qr-placeholder">QR</div>
          )}
          <p className="rc-qr-caption">Scan to view results</p>
        </div>
      </footer>
    </article>
  );
}
