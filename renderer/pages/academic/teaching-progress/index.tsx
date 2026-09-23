import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField } from "../../../components/setup";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  FormModal,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StudentTable,
  TableSelectionBar,
  fieldClass,
  selectClass,
} from "../../../components/students/ui";
import {
  createSyllabus,
  fetchSyllabi,
  fetchSyllabusDashboard,
  fetchTeachingLogs,
  fetchTeachingMeta,
  recordTeachingLog,
} from "../../../lib/teaching-progress";
import { formatDisplayDate } from "../../../lib/date-format";

type TopicDraft = { title: string; objectives: string; subtopics: string };

const LOG_STATUSES = [
  { key: "planned", label: "Planned" },
  { key: "taught", label: "Taught" },
  { key: "partially_covered", label: "Partially covered" },
  { key: "completed", label: "Completed" },
] as const;

export default function TeachingProgressPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [tab, setTab] = React.useState<"progress" | "logbook">("progress");
  const [yearId, setYearId] = React.useState("");
  const [syllabusId, setSyllabusId] = React.useState("");
  const [staffFilter, setStaffFilter] = React.useState("");
  const [classFilter, setClassFilter] = React.useState("");
  const [subjectFilter, setSubjectFilter] = React.useState("");
  const [openSyllabus, setOpenSyllabus] = React.useState(false);
  const [openLog, setOpenLog] = React.useState(false);

  const [meta, setMeta] = React.useState<
    | Extract<
        Awaited<ReturnType<typeof fetchTeachingMeta>>,
        { ok: true }
      >["data"]
    | null
  >(null);
  const [syllabi, setSyllabi] = React.useState<
    Extract<
      Awaited<ReturnType<typeof fetchSyllabi>>,
      { ok: true }
    >["data"]["syllabi"]
  >([]);
  const [dashboard, setDashboard] = React.useState<
    | Extract<
        Awaited<ReturnType<typeof fetchSyllabusDashboard>>,
        { ok: true }
      >["data"]
    | null
  >(null);
  const [logs, setLogs] = React.useState<
    Extract<
      Awaited<ReturnType<typeof fetchTeachingLogs>>,
      { ok: true }
    >["data"]["logs"]
  >([]);

  const [selectedLogIds, setSelectedLogIds] = React.useState<string[]>([]);
  const allLogsSelected =
    logs.length > 0 && selectedLogIds.length === logs.length;
  function toggleLog(id: string) {
    setSelectedLogIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAllLogs() {
    if (allLogsSelected) setSelectedLogIds([]);
    else setSelectedLogIds(logs.map((l) => l.id));
  }
  function exportSelectedLogs() {
    const target = logs.filter((l) => selectedLogIds.includes(l.id));
    if (!target.length) return;
    const csv = [
      ["Date", "Class", "Subject", "Topic", "Status", "Teacher"].join(","),
      ...target.map((l) =>
        [
          `"${formatDisplayDate(l.lesson_date, "")}"`,
          `"${l.class_name || ""}"`,
          `"${l.subject_name || ""}"`,
          `"${l.topic_title || ""}"`,
          `"${l.status}"`,
          `"${l.teacher_name || ""}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teaching-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const [title, setTitle] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [levelId, setLevelId] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [termWeeks, setTermWeeks] = React.useState("12");
  const [topics, setTopics] = React.useState<TopicDraft[]>([
    { title: "", objectives: "", subtopics: "" },
  ]);

  const [logClass, setLogClass] = React.useState("");
  const [logSubject, setLogSubject] = React.useState("");
  const [logTopic, setLogTopic] = React.useState("");
  const [logDate, setLogDate] = React.useState(
    new Date().toISOString().slice(0, 10),
  );
  const [logStatus, setLogStatus] =
    React.useState<(typeof LOG_STATUSES)[number]["key"]>("taught");
  const [logDesc, setLogDesc] = React.useState("");
  const [logRemarks, setLogRemarks] = React.useState("");
  const [logTeacher, setLogTeacher] = React.useState("");

  const canManage = meta?.can_manage ?? false;

  const loadMeta = React.useCallback(async () => {
    const res = await fetchTeachingMeta();
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setMeta(res.data);
    const current =
      yearId ||
      res.data.years.find((y) => y.is_current)?.id ||
      res.data.years[0]?.id ||
      "";
    if (!yearId && current) setYearId(current);
    if (!canManage && res.data.self_staff_id) {
      setStaffFilter(res.data.self_staff_id);
    }
  }, [yearId, canManage]);

  const loadSyllabi = React.useCallback(async () => {
    const res = await fetchSyllabi(yearId || undefined);
    if (res.ok) {
      setSyllabi(res.data.syllabi);
      if (!syllabusId && res.data.syllabi[0]) {
        setSyllabusId(res.data.syllabi[0].id);
      }
    } else setError(res.error);
    setLoading(false);
  }, [yearId, syllabusId]);

  const loadDashboard = React.useCallback(async () => {
    if (!syllabusId) {
      setDashboard(null);
      return;
    }
    const res = await fetchSyllabusDashboard(syllabusId);
    if (res.ok) setDashboard(res.data);
    else setError(res.error);
  }, [syllabusId]);

  const loadLogs = React.useCallback(async () => {
    const res = await fetchTeachingLogs({
      staff_id: staffFilter || undefined,
      class_id: classFilter || undefined,
      subject_id: subjectFilter || undefined,
    });
    if (res.ok) setLogs(res.data.logs);
    else setError(res.error);
  }, [staffFilter, classFilter, subjectFilter]);

  React.useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  React.useEffect(() => {
    void loadSyllabi();
  }, [loadSyllabi]);

  React.useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  React.useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  async function handleSyllabus(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await createSyllabus({
        subject_id: subjectId,
        academic_year_id: yearId,
        academic_level_id: levelId || null,
        class_id: classId || null,
        title: title.trim(),
        term_weeks: Number(termWeeks) || 12,
        topics: topics
          .filter((t) => t.title.trim())
          .map((t) => ({
            title: t.title.trim(),
            objectives: t.objectives.trim() || undefined,
            subtopics: t.subtopics
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Syllabus saved. Progress is calculated from topics.");
      setOpenSyllabus(false);
      await loadSyllabi();
    } finally {
      setBusy(false);
    }
  }

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await recordTeachingLog({
        staff_id: canManage ? logTeacher || meta?.self_staff_id : undefined,
        class_id: logClass,
        subject_id: logSubject,
        topic_id: logTopic || null,
        syllabus_id: syllabusId || null,
        academic_year_id: yearId || null,
        lesson_date: logDate,
        description: logDesc || null,
        status: logStatus,
        remarks: logRemarks || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Lesson recorded. Topic coverage updated automatically.");
      setOpenLog(false);
      await Promise.all([loadLogs(), loadDashboard()]);
    } finally {
      setBusy(false);
    }
  }

  const scheduleLabel =
    dashboard?.schedule === "behind"
      ? "Behind schedule"
      : dashboard?.schedule === "ahead"
        ? "Ahead of schedule"
        : "On track";

  return (
    <AppShell
      title="Teaching Progress"
      breadcrumb={["Academic Management", "Teaching Progress"]}
      heading="Teaching Progress"
      subtitle="Configure syllabi, record lessons, and watch coverage calculate itself from topics marked as covered."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            tab === "progress"
              ? "bg-(--sofia-primary) text-white"
              : "bg-slate-100 text-slate-600"
          }`}
          onClick={() => setTab("progress")}
        >
          Progress
        </button>
        <button
          type="button"
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            tab === "logbook"
              ? "bg-(--sofia-primary) text-white"
              : "bg-slate-100 text-slate-600"
          }`}
          onClick={() => setTab("logbook")}
        >
          Teaching logbook
        </button>
      </div>

      {tab === "progress" ? (
        <>
          <FilterBar
            filters={
              <>
                <FilterField label="Academic year">
                  <select
                    className={selectClass}
                    value={yearId}
                    onChange={(e) => setYearId(e.target.value)}
                  >
                    {(meta?.years ?? []).map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField label="Syllabus">
                  <select
                    className={selectClass}
                    value={syllabusId}
                    onChange={(e) => setSyllabusId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {syllabi.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} — {s.subject_name}
                      </option>
                    ))}
                  </select>
                </FilterField>
              </>
            }
            actions={
              <>
                {canManage ? (
                  <SecondaryButton onClick={() => setOpenSyllabus(true)}>
                    New syllabus
                  </SecondaryButton>
                ) : null}
                <PrimaryButton onClick={() => setOpenLog(true)}>
                  Record lesson
                </PrimaryButton>
              </>
            }
          />

          {dashboard ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-5">
              {[
                ["Topics", String(dashboard.total)],
                ["Completed", String(dashboard.completed)],
                ["In progress", String(dashboard.in_progress)],
                ["Not started", String(dashboard.not_started)],
                ["Actual", `${dashboard.percent}%`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </div>
                  <div className="mt-1 text-lg font-semibold">{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-4 text-sm text-slate-500">
              {loading
                ? "Loading…"
                : "Create a syllabus to start tracking coverage."}
            </p>
          )}

          {dashboard ? (
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">
                  Expected {dashboard.expected}% · Actual {dashboard.percent}%
                </p>
                <StatusBadge
                  status={
                    dashboard.schedule === "behind"
                      ? "overdue"
                      : dashboard.schedule === "ahead"
                        ? "accepted"
                        : "active"
                  }
                  label={scheduleLabel}
                />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-(--sofia-primary)"
                  style={{ width: `${Math.min(100, dashboard.percent)}%` }}
                />
              </div>
            </div>
          ) : null}

          <StudentTable columns={["Topic", "Coverage"]} loading={loading}>
            {!dashboard?.topics.length ? (
              <EmptyRow colSpan={2} message="No topics in this syllabus." />
            ) : (
              dashboard.topics.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <span
                      className={
                        t.parent_id ? "pl-4 text-slate-600" : "font-medium"
                      }
                    >
                      {t.title}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={
                        t.coverage_status === "completed"
                          ? "completed"
                          : t.coverage_status === "in_progress"
                            ? "partially_paid"
                            : "pending"
                      }
                      label={t.coverage_status.replace("_", " ")}
                    />
                  </td>
                </tr>
              ))
            )}
          </StudentTable>
        </>
      ) : (
        <>
          <FilterBar
            filters={
              <>
                {canManage ? (
                  <FilterField label="Teacher">
                    <select
                      className={selectClass}
                      value={staffFilter}
                      onChange={(e) => setStaffFilter(e.target.value)}
                    >
                      <option value="">All teachers</option>
                      {(meta?.teachers ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </FilterField>
                ) : null}
                <FilterField label="Class">
                  <select
                    className={selectClass}
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
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
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                  >
                    <option value="">All subjects</option>
                    {(meta?.subjects ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </FilterField>
              </>
            }
            actions={
              <PrimaryButton onClick={() => setOpenLog(true)}>
                Record lesson
              </PrimaryButton>
            }
          />
          <StudentTable
            columns={[
              <input
                key="select-all-logs"
                type="checkbox"
                checked={allLogsSelected}
                ref={(el) => {
                  if (el)
                    el.indeterminate =
                      selectedLogIds.length > 0 && !allLogsSelected;
                }}
                onChange={toggleAllLogs}
                aria-label="Select all"
              />,
              "Date",
              "Class",
              "Subject",
              "Topic",
              "Status",
              "Teacher",
            ]}
            loading={false}
          >
            {logs.length === 0 ? (
              <EmptyRow colSpan={7} message="No lessons recorded yet." />
            ) : (
              logs.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedLogIds.includes(l.id)}
                      onChange={() => toggleLog(l.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {formatDisplayDate(l.lesson_date)}
                  </td>
                  <td className="px-4 py-3">{l.class_name || "—"}</td>
                  <td className="px-4 py-3">{l.subject_name || "—"}</td>
                  <td className="px-4 py-3">{l.topic_title || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={
                        l.status === "completed"
                          ? "completed"
                          : l.status === "planned"
                            ? "pending"
                            : "partially_paid"
                      }
                      label={String(l.status).replace("_", " ")}
                    />
                  </td>
                  <td className="px-4 py-3">{l.teacher_name || "—"}</td>
                </tr>
              ))
            )}
          </StudentTable>

          <TableSelectionBar
            totalCount={logs.length}
            selectedCount={selectedLogIds.length}
            allSelected={allLogsSelected}
            onToggleAll={toggleAllLogs}
            onClear={() => setSelectedLogIds([])}
            actions={
              <button
                type="button"
                onClick={exportSelectedLogs}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Export selected ({selectedLogIds.length})
              </button>
            }
          />
        </>
      )}

      <FormModal
        open={openSyllabus}
        title="New syllabus"
        subtitle="Topics and comma-separated subtopics. Coverage is counted from leaves."
        onClose={() => setOpenSyllabus(false)}
        size="xl"
        footer={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => setOpenSyllabus(false)}
              className="flex-1"
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form="syllabus-form"
              disabled={busy}
              className="flex-1"
            >
              {busy ? "Saving…" : "Save syllabus"}
            </PrimaryButton>
          </div>
        }
      >
        <form
          id="syllabus-form"
          onSubmit={handleSyllabus}
          className="space-y-1"
        >
          <FormField label="Title" required>
            <input
              className={fieldClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Subject" required>
            <select
              className={selectClass}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {(meta?.subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Level">
            <select
              className={selectClass}
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
            >
              <option value="">Any level</option>
              {(meta?.levels ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Class">
            <select
              className={selectClass}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">Any class</option>
              {(meta?.classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Term weeks">
            <input
              type="number"
              min={1}
              className={fieldClass}
              value={termWeeks}
              onChange={(e) => setTermWeeks(e.target.value)}
            />
          </FormField>
          <div className="space-y-3">
            {topics.map((t, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3">
                <FormField label={`Topic ${i + 1}`}>
                  <input
                    className={fieldClass}
                    value={t.title}
                    onChange={(e) =>
                      setTopics((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, title: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </FormField>
                <FormField label="Learning objectives (optional)">
                  <input
                    className={fieldClass}
                    value={t.objectives}
                    onChange={(e) =>
                      setTopics((prev) =>
                        prev.map((row, idx) =>
                          idx === i
                            ? { ...row, objectives: e.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                </FormField>
                <FormField label="Subtopics (comma-separated)">
                  <input
                    className={fieldClass}
                    value={t.subtopics}
                    onChange={(e) =>
                      setTopics((prev) =>
                        prev.map((row, idx) =>
                          idx === i
                            ? { ...row, subtopics: e.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                </FormField>
              </div>
            ))}
            <SecondaryButton
              onClick={() =>
                setTopics((prev) => [
                  ...prev,
                  { title: "", objectives: "", subtopics: "" },
                ])
              }
            >
              Add topic
            </SecondaryButton>
          </div>
        </form>
      </FormModal>

      <FormModal
        open={openLog}
        title="Record lesson"
        subtitle="Coverage on the syllabus topic advances automatically from the teaching status."
        onClose={() => setOpenLog(false)}
        footer={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => setOpenLog(false)}
              className="flex-1"
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form="log-form"
              disabled={busy}
              className="flex-1"
            >
              {busy ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        }
      >
        <form id="log-form" onSubmit={handleLog} className="space-y-1">
          {canManage ? (
            <FormField label="Teacher">
              <select
                className={selectClass}
                value={logTeacher}
                onChange={(e) => setLogTeacher(e.target.value)}
              >
                <option value="">Me / linked profile</option>
                {(meta?.teachers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
          <FormField label="Date" required>
            <input
              type="date"
              className={fieldClass}
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Class" required>
            <select
              className={selectClass}
              value={logClass}
              onChange={(e) => setLogClass(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {(meta?.classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Subject" required>
            <select
              className={selectClass}
              value={logSubject}
              onChange={(e) => setLogSubject(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {(meta?.subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Topic">
            <select
              className={selectClass}
              value={logTopic}
              onChange={(e) => setLogTopic(e.target.value)}
            >
              <option value="">None</option>
              {(dashboard?.topics ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.parent_id ? "— " : ""}
                  {t.title}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Status">
            <select
              className={selectClass}
              value={logStatus}
              onChange={(e) =>
                setLogStatus(
                  e.target.value as (typeof LOG_STATUSES)[number]["key"],
                )
              }
            >
              {LOG_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Lesson description">
            <textarea
              className={fieldClass}
              value={logDesc}
              onChange={(e) => setLogDesc(e.target.value)}
            />
          </FormField>
          <FormField label="Remarks">
            <textarea
              className={fieldClass}
              value={logRemarks}
              onChange={(e) => setLogRemarks(e.target.value)}
            />
          </FormField>
        </form>
      </FormModal>
    </AppShell>
  );
}
