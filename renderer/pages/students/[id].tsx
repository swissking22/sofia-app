import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../components/layout/AppShell";
import {
  DOCUMENT_TYPE_OPTIONS,
  fetchStudent,
  fetchStudentDocuments,
  STATUS_LABELS,
  updateStudent,
  type StudentDocumentDto,
  type StudentDto,
} from "../../lib/student-mgmt";

type TabKey = "overview" | "academic" | "documents" | "finance";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "academic", label: "Academic History" },
  { key: "documents", label: "Documents" },
  { key: "finance", label: "Finance" },
];

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-slate-100 py-2.5 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 font-medium text-slate-800">{value || "—"}</dd>
    </div>
  );
}

export default function StudentDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [tab, setTab] = React.useState<TabKey>("overview");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [student, setStudent] = React.useState<StudentDto | null>(null);
  const [docs, setDocs] = React.useState<StudentDocumentDto[]>([]);
  const [statusOpen, setStatusOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [sRes, dRes] = await Promise.all([
      fetchStudent(id),
      fetchStudentDocuments(id),
    ]);
    if (sRes.ok) setStudent(sRes.data);
    else setError(sRes.error);
    if (dRes.ok) setDocs(dRes.data);
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(status: "active" | "alumni" | "transferred") {
    if (!student) return;
    setError("");
    setSuccess("");
    const res = await updateStudent({ id: student.id, status });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStudent(res.data);
    setSuccess(`Status updated to ${STATUS_LABELS[status] ?? status}.`);
    setStatusOpen(false);
  }

  if (loading) {
    return (
      <AppShell
        title="Student"
        breadcrumb={["Student Management", "Students"]}
        heading="Student"
      >
        <p className="text-sm text-slate-500">Loading…</p>
      </AppShell>
    );
  }

  if (!student) {
    return (
      <AppShell
        title="Student"
        breadcrumb={["Student Management", "Students"]}
        heading="Student not found"
      >
        <p className="text-sm text-red-600">{error || "Student not found."}</p>
        <Link
          href="/students"
          className="mt-4 inline-block text-sm font-semibold text-(--sofia-primary)"
        >
          Back to students
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={student.name}
      breadcrumb={["Student Management", "Students", student.name]}
      heading={student.name}
      subtitle={`${student.student_code || "No ID"} · ${student.class_name || "No class"}`}
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`cursor-pointer rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                tab === t.key
                  ? "bg-(--sofia-primary) text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatusOpen(true)}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Status: {STATUS_LABELS[student.status] ?? student.status}
          </button>
          <Link
            href={`/students/documents/upload?student_id=${student.id}`}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Upload document
          </Link>
          <Link
            href="/students"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Back
          </Link>
        </div>
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Personal
            </h3>
            <dl>
              <InfoRow label="Student ID" value={student.student_code} />
              <InfoRow label="Gender" value={student.gender} />
              <InfoRow label="Date of birth" value={student.date_of_birth} />
              <InfoRow label="Phone" value={student.phone} />
              <InfoRow label="Email" value={student.email} />
              <InfoRow label="Address" value={student.address} />
            </dl>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Guardian
            </h3>
            <dl>
              <InfoRow label="Name" value={student.guardian_name} />
              <InfoRow
                label="Relationship"
                value={student.guardian_relationship}
              />
              <InfoRow label="Phone" value={student.guardian_phone} />
              <InfoRow label="Email" value={student.guardian_email} />
            </dl>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Placement
            </h3>
            <dl className="sm:columns-2">
              <InfoRow label="Class" value={student.class_name} />
              <InfoRow label="Level" value={student.level_name} />
              <InfoRow label="Department" value={student.section_name} />
              <InfoRow label="Admission year" value={student.admission_year} />
              <InfoRow label="Admission type" value={student.admission_type} />
              <InfoRow
                label="Status"
                value={STATUS_LABELS[student.status] ?? student.status}
              />
            </dl>
          </section>
        </div>
      ) : null}

      {tab === "academic" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Academic history
          </h3>
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">Year</th>
                <th className="px-2 py-2">Level</th>
                <th className="px-2 py-2">Class</th>
                <th className="px-2 py-2">Department</th>
                <th className="px-2 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-3">{student.admission_year ?? "—"}</td>
                <td className="px-2 py-3">{student.level_name || "—"}</td>
                <td className="px-2 py-3">{student.class_name || "—"}</td>
                <td className="px-2 py-3">{student.section_name || "—"}</td>
                <td className="px-2 py-3 text-slate-500">Current placement</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-400">
            Full term-by-term history will appear here as promotions and
            transfers are recorded.
          </p>
        </section>
      ) : null}

      {tab === "documents" ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No documents yet.{" "}
                    <Link
                      href={`/students/documents/upload?student_id=${student.id}`}
                      className="font-semibold text-(--sofia-primary)"
                    >
                      Upload one
                    </Link>
                  </td>
                </tr>
              ) : (
                docs.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {d.title}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {DOCUMENT_TYPE_OPTIONS.find(
                        (o) => o.key === d.document_type,
                      )?.label ?? d.document_type}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {d.created_at?.slice(0, 10) || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "finance" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <h3 className="text-sm font-semibold text-slate-900">Finance</h3>
          <p className="mt-2 text-sm text-slate-500">
            Fee balances, invoices, and payments will appear here once the
            Finance module is connected.
          </p>
        </section>
      ) : null}

      {statusOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
          <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                Update status
              </h3>
              <p className="mt-1 text-sm text-slate-500">{student.name}</p>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-5">
              {(
                [
                  ["active", "Active"],
                  ["alumni", "Alumni"],
                  ["transferred", "Transferred"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void setStatus(key)}
                  className={`cursor-pointer rounded-xl border px-4 py-3 text-left text-sm font-semibold ${
                    student.status === key
                      ? "border-(--sofia-primary) bg-(--sofia-primary)/5 text-(--sofia-primary)"
                      : "border-slate-200 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={() => setStatusOpen(false)}
                className="w-full cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
