import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  PrinterIcon,
  File01Icon,
  Tick02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import {
  PageAlert,
  PrimaryButton,
  SecondaryButton,
} from "../../../components/students/ui";
import { Icon } from "../../../components/ui/Icon";
import { formatDisplayDateTime } from "../../../lib/date-format";
import {
  approveAssessmentQuestion,
  fetchAssessmentQuestion,
  openAssessmentQuestionFile,
  rejectAssessmentQuestion,
  type AssessmentQuestionDetail,
} from "../../../lib/assessment-questions";

function statusClass(status: string): string {
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-800";
}

export default function AssessmentQuestionDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [detail, setDetail] = React.useState<AssessmentQuestionDetail | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectionNote, setRejectionNote] = React.useState("");

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    const res = await fetchAssessmentQuestion(id);
    if (res.ok) setDetail(res.data);
    else setError(res.error);
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleApprove() {
    if (!detail?.current_revision) return;
    setBusy(true);
    setError("");
    const res = await approveAssessmentQuestion({
      paper_id: detail.paper.id,
      revision_id: detail.current_revision.id,
    });
    setBusy(false);
    setApproveOpen(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  }

  async function handleReject() {
    if (!detail?.current_revision) return;
    setBusy(true);
    setError("");
    const res = await rejectAssessmentQuestion({
      paper_id: detail.paper.id,
      revision_id: detail.current_revision.id,
      rejection_note: rejectionNote,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setRejectOpen(false);
    setRejectionNote("");
    await load();
  }

  if (loading) {
    return (
      <AppShell
        title="Assessment Questions"
        breadcrumb={["Academic Management", "Assessment Questions"]}
        heading="Question paper"
        backHref="/academic/assessment-questions"
      >
        <p className="text-sm text-slate-500">Loading…</p>
      </AppShell>
    );
  }

  if (!detail) {
    return (
      <AppShell
        title="Assessment Questions"
        breadcrumb={["Academic Management", "Assessment Questions"]}
        heading="Question paper"
        backHref="/academic/assessment-questions"
      >
        <PageAlert tone="error">{error || "Not found."}</PageAlert>
      </AppShell>
    );
  }

  const { paper, current_revision: rev } = detail;

  return (
    <AppShell
      title={paper.title}
      breadcrumb={[
        "Academic Management",
        "Assessment Questions",
        paper.title,
      ]}
      heading={paper.title}
      subtitle={`${paper.class_name} · ${paper.subject_name}`}
      backHref="/academic/assessment-questions"
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 text-sm text-slate-600">
          <p>
            <span className="font-medium text-slate-800">Submitted by:</span>{" "}
            {paper.teacher_name}
          </p>
          <p>
            <span className="font-medium text-slate-800">Submitted:</span>{" "}
            {formatDisplayDateTime(rev?.submitted_at)}
          </p>
          <p className="flex items-center gap-2">
            <span className="font-medium text-slate-800">Status:</span>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(paper.current_status)}`}
            >
              {paper.status_label}
            </span>
            <span className="text-xs text-slate-500">
              · {paper.sync_label} · Revision {paper.current_revision_number}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {detail.can_approve ? (
            <PrimaryButton
              type="button"
              disabled={busy}
              onClick={() => setApproveOpen(true)}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon icon={Tick02Icon} size={16} />
                Approve Question Paper
              </span>
            </PrimaryButton>
          ) : null}
          {detail.can_reject ? (
            <SecondaryButton disabled={busy}
              onClick={() => setRejectOpen(true)}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon icon={Cancel01Icon} size={16} />
                Reject Question Paper
              </span>
            </SecondaryButton>
          ) : null}
          {detail.can_print && rev ? (
            <SecondaryButton onClick={() =>
                void router.push(
                  `/academic/assessment-questions/${paper.id}/print`,
                )
              }
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon icon={PrinterIcon} size={16} />
                Print Question Paper
              </span>
            </SecondaryButton>
          ) : detail.print_unavailable_reason ? (
            <p className="max-w-xs text-xs text-slate-500">
              Printing unavailable — {detail.print_unavailable_reason}
            </p>
          ) : null}
        </div>
      </div>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Submission information
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <Info label="Academic year" value={paper.academic_year_name || "—"} />
          <Info label="Term" value={paper.term_name || "—"} />
          <Info label="Assessment type" value={paper.assessment_type} />
          <Info label="Class" value={paper.class_name} />
          <Info label="Subject" value={paper.subject_name} />
          <Info label="Teacher" value={paper.teacher_name} />
          <Info
            label="Submission date"
            value={formatDisplayDateTime(rev?.submitted_at)}
          />
          <Info
            label="Revision number"
            value={String(paper.current_revision_number)}
          />
          {rev?.rejection_note ? (
            <Info label="Rejection note" value={rev.rejection_note} />
          ) : null}
        </dl>
      </section>

      <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Question paper
          </h2>
          <div className="flex flex-wrap gap-2">
            {rev ? (
              <SecondaryButton onClick={() => void openAssessmentQuestionFile(rev.id)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon icon={File01Icon} size={16} />
                  Open PDF
                </span>
              </SecondaryButton>
            ) : null}
          </div>
        </div>
        <div className="bg-slate-100 p-2">
          {detail.pdf_data_url ? (
            <iframe
              title="Question paper PDF"
              src={detail.pdf_data_url}
              className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white"
            />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-500">
              <p>
                PDF preview is not available on this device yet. Use{" "}
                <strong>Open PDF</strong> after syncing, or sync to download the
                file.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Submission history
        </h2>
        <ul className="space-y-3">
          {detail.revisions.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-slate-100 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  Revision {r.revision_number}
                </span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(r.status)}`}
                >
                  {r.status_label}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Submitted {formatDisplayDateTime(r.submitted_at)}
                {r.reviewed_at
                  ? ` · Reviewed ${formatDisplayDateTime(r.reviewed_at)}`
                  : ""}
                {r.reviewer_email ? ` · ${r.reviewer_email}` : ""}
              </p>
              {r.rejection_note ? (
                <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800">
                  {r.rejection_note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Review history
        </h2>
        {detail.events.length === 0 ? (
          <p className="text-sm text-slate-500">No audit events yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {detail.events.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-2 py-2">
                <span className="font-medium capitalize text-slate-800">
                  {e.action.replace(/_/g, " ")}
                </span>
                <span className="text-slate-500">
                  {formatDisplayDateTime(e.created_at)}
                </span>
                {e.actor_email ? (
                  <span className="text-slate-500">· {e.actor_email}</span>
                ) : null}
                {e.notes ? (
                  <span className="w-full text-xs text-slate-600">{e.notes}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {approveOpen ? (
        <Modal
          title="Approve this question paper?"
          onClose={() => setApproveOpen(false)}
        >
          <p className="mb-4 text-sm text-slate-600">
            Once approved, authorized staff will be able to print the official
            question paper. The approved PDF cannot be silently modified.
          </p>
          <div className="flex justify-end gap-2">
            <SecondaryButton disabled={busy}
              onClick={() => setApproveOpen(false)}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="button"
              disabled={busy}
              onClick={() => void handleApprove()}
            >
              Approve
            </PrimaryButton>
          </div>
        </Modal>
      ) : null}

      {rejectOpen ? (
        <Modal
          title="Reject Question Paper"
          onClose={() => setRejectOpen(false)}
        >
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Reason for rejection
          </label>
          <textarea
            className="mb-2 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={rejectionNote}
            onChange={(e) => setRejectionNote(e.target.value)}
            placeholder="Question 4 is outside the syllabus. Please replace it and resubmit."
          />
          <p className="mb-4 text-xs text-slate-500">
            Required. The teacher will see this note in the mobile app.
          </p>
          <div className="flex justify-end gap-2">
            <SecondaryButton disabled={busy}
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="button"
              disabled={busy || rejectionNote.trim().length < 8}
              onClick={() => void handleReject()}
            >
              Reject
            </PrimaryButton>
          </div>
        </Modal>
      ) : null}

      <p className="text-xs text-slate-500">
        <Link
          href="/academic/assessment-questions"
          className="font-medium text-(--sofia-primary)"
        >
          Back to list
        </Link>
      </p>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-slate-800 capitalize">{value}</dd>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 print:hidden">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="mb-3 text-base font-semibold text-slate-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}
