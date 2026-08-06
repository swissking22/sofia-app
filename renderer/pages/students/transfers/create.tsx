import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import {
  fieldClass,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
} from "../../../components/students/ui";
import {
  createTransfer,
  fetchStudentList,
  type StudentDto,
} from "../../../lib/student-mgmt";

export default function CreateTransferPage() {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [students, setStudents] = React.useState<StudentDto[]>([]);
  const [studentSearch, setStudentSearch] = React.useState("");
  const [studentId, setStudentId] = React.useState("");
  const [toSchool, setToSchool] = React.useState("");
  const [transferDate, setTransferDate] = React.useState(
    new Date().toISOString().slice(0, 10),
  );
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    void (async () => {
      const res = await fetchStudentList({ status: "active" });
      if (res.ok) setStudents(res.data.students);
    })();
  }, []);

  React.useEffect(() => {
    const q = router.query.student_id;
    if (typeof q === "string" && q) {
      setStudentId(q);
    }
  }, [router.query.student_id]);

  const filteredStudents = React.useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const haystack = [
        s.name,
        s.student_code ?? "",
        s.class_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [students, studentSearch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!studentId) {
      setError("Select a student.");
      return;
    }
    if (!toSchool.trim()) {
      setError("Destination school is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await createTransfer({
        student_id: studentId,
        to_school_name: toSchool.trim(),
        transfer_date: transferDate,
        reason: reason || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.push("/students/transfers");
    } catch {
      setError("Could not create transfer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="New transfer"
      breadcrumb={["Student Management", "Transfers", "New"]}
      heading="Record transfer"
      subtitle="Mark a student as transferred to another school."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="max-w-2xl space-y-5"
      >
        <FormSection
          title="Transfer details"
          description="Student will be marked transferred when saved."
          layout="stack"
        >
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Student <span className="text-red-500">*</span>
            </span>
            <input
              className={`mb-2 ${fieldClass}`}
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search by name, ID, or class…"
            />
            <select
              className={fieldClass}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            >
              <option value="">Select student…</option>
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.student_code ? ` (${s.student_code})` : ""}
                  {s.class_name ? ` — ${s.class_name}` : ""}
                </option>
              ))}
            </select>
            {studentSearch.trim() && filteredStudents.length === 0 ? (
              <p className="mt-1.5 text-xs text-slate-500">
                No students match your search.
              </p>
            ) : null}
          </label>
          <FormField
            label="Destination school"
            required
            value={toSchool}
            onChange={(e) => setToSchool(e.target.value)}
            placeholder="School name"
          />
          <FormField
            label="Transfer date"
            type="date"
            required
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
          />
          <FormField
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional notes"
          />
        </FormSection>

        <div className="flex flex-wrap gap-3">
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : "Complete transfer"}
          </PrimaryButton>
          <SecondaryButton href="/students/transfers">Cancel</SecondaryButton>
        </div>
      </form>
    </AppShell>
  );
}
