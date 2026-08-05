import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import {
  createTransfer,
  fetchStudentList,
  type StudentDto,
} from "../../../lib/student-mgmt";

const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function CreateTransferPage() {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [students, setStudents] = React.useState<StudentDto[]>([]);
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
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

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
            <select
              className={fieldClass}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            >
              <option value="">Select student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.student_code ? ` (${s.student_code})` : ""}
                  {s.class_name ? ` — ${s.class_name}` : ""}
                </option>
              ))}
            </select>
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
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Complete transfer"}
          </button>
          <Link
            href="/students/transfers"
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
          >
            Cancel
          </Link>
        </div>
      </form>
    </AppShell>
  );
}
