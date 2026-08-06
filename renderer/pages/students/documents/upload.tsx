import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import {
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  fieldClass,
  useDebouncedValue,
} from "../../../components/students/ui";
import {
  DOCUMENT_TYPE_OPTIONS,
  fetchStudentList,
  uploadDocument,
  type StudentDto,
} from "../../../lib/student-mgmt";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64 || "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function UploadDocumentPage() {
  const router = useRouter();
  const preselect =
    typeof router.query.student_id === "string" ? router.query.student_id : "";

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [students, setStudents] = React.useState<StudentDto[]>([]);
  const [studentId, setStudentId] = React.useState("");
  const [studentSearch, setStudentSearch] = React.useState("");
  const debouncedStudentSearch = useDebouncedValue(studentSearch, 300);
  const [docType, setDocType] = React.useState("birth_certificate");
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchStudentList({ status: "all" });
      if (res.ok) setStudents(res.data.students);
    })();
  }, []);

  React.useEffect(() => {
    if (preselect) setStudentId(preselect);
  }, [preselect]);

  const filteredStudents = React.useMemo(() => {
    if (!debouncedStudentSearch.trim()) return students;
    const q = debouncedStudentSearch.toLowerCase();
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.student_code || "").toLowerCase().includes(q),
    );
  }, [students, debouncedStudentSearch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!studentId) {
      setError("Select a student.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    setSaving(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await uploadDocument({
        student_id: studentId,
        document_type: docType,
        title: title.trim(),
        file_base64: base64,
        mime_type: file.type || "application/octet-stream",
        original_name: file.name,
        notes: notes || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.push("/students/documents");
    } catch {
      setError("Could not upload document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Upload document"
      breadcrumb={["Student Management", "Documents", "Upload"]}
      heading="Upload document"
      subtitle="Attach a file to a student record with a document type."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="max-w-2xl space-y-5"
      >
        <FormSection title="Document" layout="stack">
          <div className="mb-4">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Student <span className="text-red-500">*</span>
            </span>
            <input
              type="search"
              className={`mb-2 ${fieldClass}`}
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search by name or student ID…"
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
                </option>
              ))}
            </select>
            {debouncedStudentSearch.trim() &&
            filteredStudents.length === 0 ? (
              <p className="mt-1.5 text-xs text-slate-500">
                No students match your search.
              </p>
            ) : null}
          </div>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Type <span className="text-red-500">*</span>
            </span>
            <select
              className={fieldClass}
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {DOCUMENT_TYPE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <FormField
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Birth certificate scan"
          />

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              File <span className="text-red-500">*</span>
            </span>
            <input
              type="file"
              className={fieldClass}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <FormField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormSection>

        <div className="flex flex-wrap gap-3">
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Uploading…" : "Upload"}
          </PrimaryButton>
          <SecondaryButton href="/students/documents">Cancel</SecondaryButton>
        </div>
      </form>
    </AppShell>
  );
}
