import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  File01Icon,
  Tick02Icon,
  Cancel01Icon,
  Folder01Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { KpiCard } from "../../../components/dashboard/KpiCard";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  StudentTable,
  selectClass,
} from "../../../components/students/ui";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import { formatDisplayDateTime } from "../../../lib/date-format";
import {
  fetchAssessmentQuestionsList,
  fetchAssessmentQuestionsMeta,
  fetchAssessmentQuestionsSummary,
  type AssessmentQuestionListRow,
  type AssessmentQuestionStatus,
  type AssessmentQuestionSummary,
  type AssessmentQuestionsMeta,
  type AssessmentQuestionType,
} from "../../../lib/assessment-questions";

function statusClass(status: AssessmentQuestionStatus): string {
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-800";
}

function syncClass(label: string): string {
  if (label === "Synced") return "text-emerald-600";
  if (label === "Sync Failed") return "text-red-600";
  return "text-amber-600";
}

export default function AssessmentQuestionsPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [meta, setMeta] = React.useState<AssessmentQuestionsMeta | null>(null);
  const [summary, setSummary] = React.useState<AssessmentQuestionSummary | null>(
    null,
  );
  const [rows, setRows] = React.useState<AssessmentQuestionListRow[]>([]);

  const [status, setStatus] = React.useState<
    AssessmentQuestionStatus | "all"
  >("pending_review");
  const [yearId, setYearId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [teacherId, setTeacherId] = React.useState("");
  const [assessmentType, setAssessmentType] = React.useState<
    AssessmentQuestionType | "all" | ""
  >("");
  const [query, setQuery] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    const metaRes = await fetchAssessmentQuestionsMeta();
    if (!metaRes.ok) {
      setError(metaRes.error);
      setLoading(false);
      return;
    }
    setMeta(metaRes.data);
    if (!yearId) {
      const current =
        metaRes.data.years.find((y) => y.is_current)?.id ||
        metaRes.data.years[0]?.id ||
        "";
      if (current) setYearId(current);
    }

    const [sumRes, listRes] = await Promise.all([
      fetchAssessmentQuestionsSummary(),
      fetchAssessmentQuestionsList({
        status,
        academic_year_id: yearId || undefined,
        term_id: termId || undefined,
        class_id: classId || undefined,
        subject_id: subjectId || undefined,
        teacher_staff_id: teacherId || undefined,
        assessment_type:
          assessmentType && assessmentType !== "all"
            ? assessmentType
            : undefined,
        query: query || undefined,
      }),
    ]);
    if (sumRes.ok) setSummary(sumRes.data);
    if (listRes.ok) setRows(listRes.data.rows);
    else setError(listRes.error);
    setLoading(false);
  }, [
    status,
    yearId,
    termId,
    classId,
    subjectId,
    teacherId,
    assessmentType,
    query,
  ]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const terms = (meta?.terms ?? []).filter(
    (t) => !yearId || t.academic_year_id === yearId,
  );

  return (
    <AppShell
      title="Assessment Questions"
      breadcrumb={["Academic Management", "Assessment Questions"]}
      heading="Assessment Questions"
      subtitle="Review, approve, or reject question papers submitted by teachers. Print only after approval."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Pending Review"
          value={summary?.pending_review ?? "—"}
          icon={Folder01Icon}
        />
        <KpiCard
          title="Approved"
          value={summary?.approved ?? "—"}
          icon={Tick02Icon}
        />
        <KpiCard
          title="Rejected"
          value={summary?.rejected ?? "—"}
          icon={Cancel01Icon}
        />
        <KpiCard
          title="Total Submissions"
          value={summary?.total ?? "—"}
          icon={File01Icon}
        />
      </div>

      <FilterBar
        filters={
          <>
            <FilterField label="Status">
              <select
                className={selectClass}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as AssessmentQuestionStatus | "all")
                }
              >
                <option value="pending_review">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
            </FilterField>
            <FilterField label="Academic year">
              <select
                className={selectClass}
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
              >
                <option value="">All years</option>
                {(meta?.years ?? []).map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Term">
              <select
                className={selectClass}
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              >
                <option value="">All terms</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Class">
              <select
                className={selectClass}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">All classes</option>
                {(meta?.classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Subject">
              <select
                className={selectClass}
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                <option value="">All subjects</option>
                {(meta?.subjects ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Teacher">
              <select
                className={selectClass}
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
              >
                <option value="">All teachers</option>
                {(meta?.teachers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Assessment type">
              <select
                className={selectClass}
                value={assessmentType}
                onChange={(e) =>
                  setAssessmentType(
                    e.target.value as AssessmentQuestionType | "all" | "",
                  )
                }
              >
                <option value="">All types</option>
                {(meta?.assessment_types ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Search">
              <input
                className={selectClass}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Teacher, assessment, subject, class…"
              />
            </FilterField>
          </>
        }
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <StudentTable
          columns={[
            "Assessment",
            "Class",
            "Subject",
            "Teacher",
            "Submitted",
            "Status",
            "Last Reviewed",
            "Sync",
            "",
          ]}
          loading={false}
        >
          {rows.length === 0 ? (
            <EmptyRow
              colSpan={9}
              message="No question papers match these filters."
            />
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{r.title}</div>
                  <div className="text-xs text-slate-500">
                    Rev {r.current_revision_number}
                  </div>
                </td>
                <td className="px-4 py-3">{r.class_name}</td>
                <td className="px-4 py-3">{r.subject_name}</td>
                <td className="px-4 py-3">{r.teacher_name}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {formatDisplayDateTime(r.submitted_at)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(r.current_status)}`}
                  >
                    {r.status_label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {r.reviewed_at
                    ? formatDisplayDateTime(r.reviewed_at)
                    : "—"}
                </td>
                <td className={`px-4 py-3 text-xs font-medium ${syncClass(r.sync_label)}`}>
                  {r.sync_label}
                </td>
                <td className="px-4 py-3 text-right">
                  <TableActionGroup>
                    <TableIconButton
                      icon={File01Icon}
                      label="Review"
                      tone="primary"
                      onClick={() =>
                        void router.push(
                          `/academic/assessment-questions/${r.id}`,
                        )
                      }
                    />
                  </TableActionGroup>
                </td>
              </tr>
            ))
          )}
        </StudentTable>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Teachers submit PDFs from the mobile app. Approvals and rejections sync
        across desks — status shows{" "}
        <Link
          href="/administration/backup-sync"
          className="font-medium text-(--sofia-primary)"
        >
          Pending Sync
        </Link>{" "}
        until the cloud confirms.
      </p>
    </AppShell>
  );
}
